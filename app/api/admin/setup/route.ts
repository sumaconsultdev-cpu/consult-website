import { NextRequest } from 'next/server'
import { ok, fail, safe, callerIp } from '@/lib/http'
import { db } from '@/lib/supabase/server'
import { hashPassword, passwordPolicyError } from '@/lib/auth/password'
import { encryptString } from '@/lib/auth/crypto'
import { generateSecret, totpUri, totpQrPngDataUrl, verifyTotp } from '@/lib/auth/totp'
import { issueRecoveryCodes } from '@/lib/auth/recovery'
import { limit } from '@/lib/rate-limit'
import { z } from 'zod'
import { log } from '@/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * One-time admin setup. Allowed iff:
 *   - admin_user.password_hash IS NULL  (account never finalised), OR
 *   - request includes the bootstrap token in ADMIN_SETUP_TOKEN env (rare
 *     recovery mode the user can use only by editing env on Vercel).
 *
 * Two endpoints in one route:
 *   GET  → returns current setup state + a fresh TOTP secret + QR code if not
 *          yet configured.
 *   POST → finalises: stores hashed password, encrypted TOTP secret (after
 *          confirming a code), emits one-time recovery codes.
 */

export const GET = safe(async (req: NextRequest) => {
  const r = await limit('admin-login', callerIp(req.headers))
  if (!r.ok) return fail(429, 'rate_limited', 'Too many requests.')

  const { data } = await db().from('admin_user').select('password_hash').eq('id', 1).maybeSingle()
  if (data?.password_hash) {
    return ok({ alreadyConfigured: true })
  }

  // Generate a fresh secret + QR. We don't persist until POST confirms.
  const secret = generateSecret()
  const uri = totpUri(secret, 'admin')
  const qr = await totpQrPngDataUrl(uri)
  return ok({ alreadyConfigured: false, totp: { secret, uri, qr } })
})

const PostSchema = z.object({
  password: z.string(),
  totpSecret: z.string().min(16).max(128),
  totpCode: z.string().regex(/^\d{6}$/),
})

export const POST = safe(async (req: NextRequest) => {
  const r = await limit('admin-login', callerIp(req.headers))
  if (!r.ok) return fail(429, 'rate_limited', 'Too many requests.')

  let body: unknown
  try { body = await req.json() } catch { return fail(400, 'bad_json', 'Invalid request.') }
  const parsed = PostSchema.safeParse(body)
  if (!parsed.success) return fail(400, 'validation_failed', 'Invalid setup payload.')

  const policyErr = passwordPolicyError(parsed.data.password)
  if (policyErr) return fail(400, 'weak_password', policyErr)

  const { data: existing } = await db().from('admin_user').select('password_hash').eq('id', 1).maybeSingle()
  if (existing?.password_hash) {
    return fail(403, 'already_configured', 'Admin is already configured. To reset, use a recovery code.')
  }

  if (!verifyTotp(parsed.data.totpSecret, parsed.data.totpCode)) {
    return fail(400, 'bad_totp', 'The 6-digit code did not match. Re-scan and try again.')
  }

  const pwdHash = await hashPassword(parsed.data.password)
  const encSecret = encryptString(parsed.data.totpSecret, 'totp')

  const { error: upErr } = await db().from('admin_user').update({
    password_hash: pwdHash,
    totp_secret_enc: encSecret,
    totp_confirmed: true,
  }).eq('id', 1)
  if (upErr) {
    log.error('admin.setup.update.failed', { code: upErr.code })
    return fail(500, 'db_error', 'Could not save admin credentials.')
  }

  const codes = await issueRecoveryCodes()

  await db().from('audit_log').insert({ actor: 'system', action: 'admin.setup.completed' })

  return ok({ recoveryCodes: codes })
})
