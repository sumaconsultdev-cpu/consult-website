import { NextRequest } from 'next/server'
import { ok, fail, safe, callerIp } from '@/lib/http'
import { requireSession, UnauthorizedError } from '@/lib/auth/session'
import { assertCsrf, CsrfError } from '@/lib/csrf'
import { limit } from '@/lib/rate-limit'
import { db } from '@/lib/supabase/server'
import { AvailabilityUpsertSchema } from '@/lib/booking/validation'
import { dayOfWeekIST, todayIST } from '@/lib/time'
import { log } from '@/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET  /api/admin/availability?date=YYYY-MM-DD
 *   → returns { defined: string[] (HH:MM), bookedSlots: string[] }
 *
 * PUT  /api/admin/availability
 *   body: { date, slots: string[] }
 *   → upserts the per-date row.
 *
 * Rules enforced server-side:
 *   - Cannot edit a date in the past.
 *   - Cannot remove a slot that has an active (pending|paid) booking on it.
 */

export const GET = safe(async (req: NextRequest) => {
  try { await requireSession() } catch (e) { if (e instanceof UnauthorizedError) return fail(401, 'unauthorized', 'Not authenticated.'); throw e }
  const url = new URL(req.url)
  const date = url.searchParams.get('date') ?? ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail(400, 'invalid_input', 'date is required (YYYY-MM-DD).')

  const [{ data: avail }, { data: tpl }, { data: bookings }] = await Promise.all([
    db().from('availability').select('slots').eq('date', date).maybeSingle(),
    db().from('availability_template').select('sunday,monday,tuesday,wednesday,thursday,friday,saturday').eq('id', 1).maybeSingle(),
    db().from('bookings').select('time_slot,payment_status,booking_id,customer_id').eq('date', date).in('payment_status', ['pending', 'paid']),
  ])

  let defined: string[] = []
  if (avail?.slots && Array.isArray(avail.slots)) {
    defined = (avail.slots as string[]).map((s) => s.slice(0, 5)).sort()
  } else if (tpl) {
    const dow = dayOfWeekIST(date)
    const m = [tpl.sunday, tpl.monday, tpl.tuesday, tpl.wednesday, tpl.thursday, tpl.friday, tpl.saturday]
    defined = ((m[dow] ?? []) as string[]).map((s) => s.slice(0, 5)).sort()
  }

  const booked = (bookings ?? []).map((b) => (b.time_slot as string).slice(0, 5))
  return ok({ defined, bookedSlots: booked })
})

export const PUT = safe(async (req: NextRequest) => {
  try { await requireSession() } catch (e) { if (e instanceof UnauthorizedError) return fail(401, 'unauthorized', 'Not authenticated.'); throw e }
  try { await assertCsrf(req.headers) } catch (e) { if (e instanceof CsrfError) return fail(403, 'csrf', 'Invalid CSRF token.'); throw e }
  const rl = await limit('admin-action', callerIp(req.headers))
  if (!rl.ok) return fail(429, 'rate_limited', 'Slow down.')

  let body: unknown
  try { body = await req.json() } catch { return fail(400, 'bad_json', 'Invalid request.') }
  const parsed = AvailabilityUpsertSchema.safeParse(body)
  if (!parsed.success) return fail(400, 'validation_failed', 'Invalid payload.')

  if (parsed.data.date < todayIST()) return fail(400, 'past_date', 'Cannot edit availability for past dates.')

  // Enforce: every booked slot for this date must remain in the new slots list.
  const { data: booked } = await db()
    .from('bookings')
    .select('time_slot')
    .eq('date', parsed.data.date)
    .in('payment_status', ['pending', 'paid'])
  const bookedTimes = new Set((booked ?? []).map((b) => (b.time_slot as string).slice(0, 5)))
  const newSlots = new Set(parsed.data.slots)
  for (const bt of bookedTimes) {
    if (!newSlots.has(bt)) {
      return fail(409, 'has_active_booking', `Cannot remove ${bt} — there is an active booking on that slot.`)
    }
  }

  const sorted = [...new Set(parsed.data.slots)].sort()
  const { error } = await db().from('availability').upsert(
    { date: parsed.data.date, slots: sorted },
    { onConflict: 'date' }
  )
  if (error) {
    log.error('availability.upsert.failed', { code: error.code })
    return fail(500, 'db_error', 'Could not save availability.')
  }
  await db().from('audit_log').insert({
    actor: 'admin',
    action: 'availability.update',
    target: parsed.data.date,
    metadata: { slots: sorted },
  })
  return ok({ defined: sorted, bookedSlots: [...bookedTimes] })
})
