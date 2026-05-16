import { NextRequest } from 'next/server'
import { ok, fail, safe, callerIp } from '@/lib/http'
import { limit } from '@/lib/rate-limit'
import { db } from '@/lib/supabase/server'
import { verifyPassword } from '@/lib/auth/password'
import { decryptString } from '@/lib/auth/crypto'
import { verifyTotp } from '@/lib/auth/totp'
import { checkThrottle, recordAttempt } from '@/lib/auth/throttle'
import { createSession } from '@/lib/auth/session'
import { issueCsrf } from '@/lib/csrf'
import { z } from 'zod'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const Schema = z.object({
  password: z.string().min(1).max(256),
  totpCode: z.string().regex(/^\d{6}$/),
})

/**
 * Login flow — single step (password + TOTP submitted together). On success a
 * new session cookie is set and a CSRF token is issued for subsequent
 * mutating admin requests.
 *
 * Failures are deliberately vague ("incorrect credentials") — we never reveal
 * whether the password or the TOTP code was the wrong part.
 */
export const POST = safe(async (req: NextRequest) => {
  const ip = callerIp(req.headers)
  const rl = await limit('admin-login', ip)
  if (!rl.ok) return fail(429, 'rate_limited', 'Too many attempts. Please wait and try again.')

  const t = await checkThrottle(ip)
  if (!t.allowed) {
    return fail(429, 'locked', `Too many failed attempts. Try again in ${Math.ceil(t.remainingMs / 60_000)} minutes.`)
  }

  let body: unknown
  try { body = await req.json() } catch { return fail(400, 'bad_json', 'Invalid request.') }
  const parsed = Schema.safeParse(body)
  if (!parsed.success) {
    await recordAttempt(ip, false)
    return fail(400, 'validation_failed', 'Invalid input.')
  }

  const { data: admin } = await db()
    .from('admin_user')
    .select('password_hash,totp_secret_enc,totp_confirmed')
    .eq('id', 1)
    .maybeSingle()
  if (!admin?.password_hash || !admin?.totp_secret_enc || !admin?.totp_confirmed) {
    return fail(403, 'not_configured', 'Admin is not configured yet.')
  }

  const okPwd = await verifyPassword(parsed.data.password, admin.password_hash)
  let okTotp = false
  if (okPwd) {
    try {
      const secret = decryptString(admin.totp_secret_enc, 'totp')
      okTotp = verifyTotp(secret, parsed.data.totpCode)
    } catch {
      okTotp = false
    }
  }

  if (!okPwd || !okTotp) {
    await recordAttempt(ip, false)
    return fail(401, 'bad_credentials', 'Incorrect credentials.')
  }

  await recordAttempt(ip, true)
  await createSession(ip, req.headers.get('user-agent'))
  await issueCsrf()
  await db().from('audit_log').insert({ actor: 'admin', action: 'admin.login.success', ip })
  return ok({})
})
