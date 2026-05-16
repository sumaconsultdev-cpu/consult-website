import { NextRequest } from 'next/server'
import { ok, fail, safe } from '@/lib/http'
import { currentSession } from '@/lib/auth/session'
import { getOrIssueCsrf } from '@/lib/csrf'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Returns the current admin session state + a CSRF token. The admin SPA calls
 * this on mount to know whether to render the login form or the dashboard.
 */
export const GET = safe(async (_req: NextRequest) => {
  const s = await currentSession()
  if (!s) return fail(401, 'not_authenticated', 'Not authenticated.')
  const csrf = await getOrIssueCsrf()
  return ok({ session: { id: s.id, absoluteExpiresAt: s.absoluteExpiresAt }, csrf })
})
