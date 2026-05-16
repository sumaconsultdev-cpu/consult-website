import 'server-only'
import { db } from '@/lib/supabase/server'
import { addDaysIST, dayOfWeekIST, isMoreThanHoursAhead, isValidDateString, isValidTimeString, todayIST } from '@/lib/time'
import { log } from '@/lib/logger'

/**
 * Slot computation rules
 * ---------------------------------------------------------------------------
 * Source of truth for what slots EXIST on a given date:
 *   1. If a row in `availability` exists for that date → use its `slots`.
 *   2. Else fall back to `availability_template` by weekday.
 *
 * "Available" = exists AND no active (pending|paid) booking on (date,time).
 *
 * Lead-time rule: customers can only book slots more than 24h ahead.
 * Past dates and the next 24h are read-only on the public API.
 *
 * Booking horizon: 60 days. Beyond that we treat the date as "not yet open".
 */

export const LEAD_HOURS = 24
export const HORIZON_DAYS = 60
export const HOLD_MINUTES = 10

export type SlotView = { time: string; available: boolean }

async function definedSlotsFor(date: string): Promise<string[]> {
  const { data: row } = await db()
    .from('availability')
    .select('slots')
    .eq('date', date)
    .maybeSingle()
  if (row?.slots) return [...row.slots].sort()

  const dow = dayOfWeekIST(date)
  const { data: tpl } = await db()
    .from('availability_template')
    .select('sunday,monday,tuesday,wednesday,thursday,friday,saturday')
    .eq('id', 1)
    .maybeSingle()
  if (!tpl) return []
  const map = [tpl.sunday, tpl.monday, tpl.tuesday, tpl.wednesday, tpl.thursday, tpl.friday, tpl.saturday]
  return [...(map[dow] ?? [])].sort()
}

async function bookedSlotsFor(date: string): Promise<Set<string>> {
  const { data } = await db()
    .from('bookings')
    .select('time_slot')
    .eq('date', date)
    .in('payment_status', ['pending', 'paid'])
  const set = new Set<string>()
  for (const r of data ?? []) set.add((r.time_slot as string).slice(0, 5))
  return set
}

/**
 * Public booking view of slots for a date. Honours lead-time + horizon — the
 * caller (API route) decides what to do with the `error` codes.
 */
export async function publicSlotsFor(date: string): Promise<{ slots: SlotView[]; error?: string }> {
  if (!isValidDateString(date)) return { slots: [], error: 'invalid_date' }

  const today = todayIST()
  if (date < today) return { slots: [], error: 'past_date' }
  if (date > addDaysIST(today, HORIZON_DAYS)) return { slots: [], error: 'beyond_horizon' }

  // Opportunistic cleanup of expired pending bookings (cheap RPC). Errors are
  // non-fatal — the cron is the authoritative cleanup.
  void db().rpc('release_expired_bookings').then(({ error }) => {
    if (error) log.warn('slots.release.failed', { message: error.message })
  })

  const defined = await definedSlotsFor(date)
  const taken = await bookedSlotsFor(date)

  const slots: SlotView[] = defined.map((t) => ({
    time: t.slice(0, 5),
    available: !taken.has(t.slice(0, 5)) && isMoreThanHoursAhead(date, t.slice(0, 5), LEAD_HOURS),
  }))
  return { slots }
}

/**
 * Strict check used inside the booking-create transaction. Returns null if
 * okay, else a machine-readable reason. Doing this immediately before the
 * insert (which itself is protected by a partial UNIQUE index) gives us a
 * fast pre-check + a database-level guarantee.
 */
export async function validateSlotForBooking(date: string, time: string): Promise<string | null> {
  if (!isValidDateString(date)) return 'invalid_date'
  if (!isValidTimeString(time)) return 'invalid_time'

  const today = todayIST()
  if (date < today) return 'past_date'
  if (date > addDaysIST(today, HORIZON_DAYS)) return 'beyond_horizon'
  if (!isMoreThanHoursAhead(date, time, LEAD_HOURS)) return 'too_soon'

  const defined = await definedSlotsFor(date)
  if (!defined.some((s) => s.slice(0, 5) === time)) return 'slot_not_offered'

  const taken = await bookedSlotsFor(date)
  if (taken.has(time)) return 'slot_taken'

  return null
}
