import { NextRequest } from 'next/server'
import { fail, safe, callerIp } from '@/lib/http'
import { requireSession, UnauthorizedError } from '@/lib/auth/session'
import { assertCsrf, CsrfError } from '@/lib/csrf'
import { limit } from '@/lib/rate-limit'
import { db } from '@/lib/supabase/server'
import { buildEncryptedArchive } from '@/lib/export/encrypt'
import { z } from 'zod'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const Schema = z.object({
  passphrase: z.string().min(12).max(256),
})

/**
 * Builds an encrypted ZIP archive of customers/bookings/services and streams
 * it as a binary download. The passphrase is supplied per-request and is
 * never persisted — it lives in memory for the duration of the request only.
 */
export const POST = safe(async (req: NextRequest) => {
  try { await requireSession() } catch (e) { if (e instanceof UnauthorizedError) return fail(401, 'unauthorized', 'Not authenticated.'); throw e }
  try { await assertCsrf(req.headers) } catch (e) { if (e instanceof CsrfError) return fail(403, 'csrf', 'Invalid CSRF token.'); throw e }
  const rl = await limit('admin-action', callerIp(req.headers))
  if (!rl.ok) return fail(429, 'rate_limited', 'Slow down.')

  let body: unknown
  try { body = await req.json() } catch { return fail(400, 'bad_json', 'Invalid request.') }
  const parsed = Schema.safeParse(body)
  if (!parsed.success) return fail(400, 'validation_failed', 'Passphrase must be at least 12 characters.')

  const [{ data: customers, error: e1 }, { data: bookings, error: e2 }, { data: services, error: e3 }] = await Promise.all([
    db().from('customers').select('*'),
    db().from('bookings').select('*'),
    db().from('services').select('*'),
  ])
  if (e1 || e2 || e3) return fail(500, 'db_error', 'Could not assemble export.')

  const generatedAt = new Date().toISOString()
  const archive = await buildEncryptedArchive(
    {
      customers: customers ?? [],
      bookings: bookings ?? [],
      services: services ?? [],
      generatedAt,
    },
    parsed.data.passphrase
  )

  await db().from('audit_log').insert({
    actor: 'admin',
    action: 'export.run',
    metadata: { customers: (customers ?? []).length, bookings: (bookings ?? []).length },
    ip: callerIp(req.headers),
  })

  const filename = `suma-export-${generatedAt.replace(/[:T]/g, '-').slice(0, 19)}.enc`
  return new Response(new Uint8Array(archive), {
    status: 200,
    headers: {
      'content-type': 'application/octet-stream',
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'no-store',
    },
  })
})
