import { NextRequest } from 'next/server'
import { ok, safe, callerIp } from '@/lib/http'
import { destroyCurrentSession } from '@/lib/auth/session'
import { assertCsrf, CsrfError } from '@/lib/csrf'
import { db } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = safe(async (req: NextRequest) => {
  try { await assertCsrf(req.headers) } catch (e) {
    if (e instanceof CsrfError) {
      // Still destroy the cookie locally so the user is logged out.
    } else { throw e }
  }
  await destroyCurrentSession()
  await db().from('audit_log').insert({ actor: 'admin', action: 'admin.logout', ip: callerIp(req.headers) })
  return ok({})
})
