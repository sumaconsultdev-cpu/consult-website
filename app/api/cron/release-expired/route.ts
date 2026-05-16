import { NextRequest } from 'next/server'
import { ok, fail, safe } from '@/lib/http'
import { db } from '@/lib/supabase/server'
import { env } from '@/lib/env'
import { log } from '@/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Vercel Cron entrypoint. Vercel signs cron requests with the `Authorization:
 * Bearer <CRON_SECRET>` header; we reject anything else so this URL is not a
 * back door.
 */
export const GET = safe(async (req: NextRequest) => {
  const expected = env.cronSecret()
  const provided = req.headers.get('authorization')
  if (!expected || provided !== `Bearer ${expected}`) return fail(401, 'unauthorized', 'Unauthorized')

  const { data, error } = await db().rpc('release_expired_bookings')
  if (error) {
    log.error('cron.release.failed', { code: error.code, message: error.message })
    return fail(500, 'db_error', 'Cleanup failed')
  }
  log.info('cron.release.ok', { released: data })
  return ok({ released: data })
})
