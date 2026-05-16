import { NextRequest } from 'next/server'
import { ok, fail, safe } from '@/lib/http'
import { requireSession, UnauthorizedError } from '@/lib/auth/session'
import { db } from '@/lib/supabase/server'
import { addDaysIST, todayIST } from '@/lib/time'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Lightweight analytics: counts + revenue over windowed and lifetime totals.
 * Computed in JS over a single fetch — kept simple, no heavy charting library.
 */
export const GET = safe(async (_req: NextRequest) => {
  try { await requireSession() } catch (e) { if (e instanceof UnauthorizedError) return fail(401, 'unauthorized', 'Not authenticated.'); throw e }

  const today = todayIST()
  const last30From = addDaysIST(today, -30)

  const [{ data: lifetime, error: e1 }, { data: window, error: e2 }, { data: upcoming, error: e3 }] = await Promise.all([
    db().from('bookings').select('payment_status,amount_paise'),
    db().from('bookings').select('payment_status,amount_paise,created_at').gte('created_at', `${last30From}T00:00:00Z`),
    db().from('bookings').select('id').eq('payment_status', 'paid').gte('date', today),
  ])
  if (e1 || e2 || e3) return fail(500, 'db_error', 'Could not load analytics.')

  function summarise(rows: { payment_status: string; amount_paise: number }[]) {
    let total = 0, paid = 0, pending = 0, failed = 0, cancelled = 0, expired = 0
    let revenuePaise = 0
    for (const r of rows) {
      total++
      switch (r.payment_status) {
        case 'paid':       paid++;       revenuePaise += r.amount_paise; break
        case 'pending':    pending++;    break
        case 'failed':     failed++;     break
        case 'cancelled':  cancelled++;  break
        case 'expired':    expired++;    break
      }
    }
    return { total, paid, pending, failed, cancelled, expired, revenuePaise }
  }

  return ok({
    lifetime: summarise(lifetime ?? []),
    last30Days: summarise(window ?? []),
    upcomingPaid: (upcoming ?? []).length,
  })
})
