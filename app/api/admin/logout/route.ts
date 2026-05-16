import { NextRequest } from 'next/server'
import { ok, safe, callerIp } from '@/lib/http'
import { currentSession, destroyCurrentSession } from '@/lib/auth/session'
import { assertCsrf, CsrfError } from '@/lib/csrf'
import { db } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Idempotent logout. Always 200 — repeat calls or stale cookies just
 * no-op rather than leaking session state. The CSRF check still protects
 * against a same-origin attacker forcing logout via a malicious page.
 *
 * Audit-log entry only on an actual session destruction so we don't pollute
 * the log with unauthenticated-noise.
 */
export const POST = safe(async (req: NextRequest) => {
  try { await assertCsrf(req.headers) } catch (e) {
    if (!(e instanceof CsrfError)) throw e
    // CSRF fails → silently clear cookie and return ok (no detail leak).
    await destroyCurrentSession()
    return ok({})
  }

  const session = await currentSession()
  await destroyCurrentSession()
  if (session) {
    await db().from('audit_log').insert({
      actor: 'admin',
      action: 'admin.logout',
      target: session.id,
      ip: callerIp(req.headers),
    })
  }
  return ok({})
})
