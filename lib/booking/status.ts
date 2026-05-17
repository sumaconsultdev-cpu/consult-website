import { isSlotInPast } from '@/lib/time'

/**
 * Booking-status lifecycle:
 *   'pending'   — payment is in flight; the 10-minute hold is protecting
 *                 the slot via the partial UNIQUE index.
 *   'active'    — payment captured; consultation slot is still in the future.
 *   'completed' — payment captured; consultation slot has elapsed.
 *   'cancelled' — payment failed/expired OR admin cancelled. The slot is
 *                 released; payment_status is preserved as the audit trail.
 *
 * 'completed' is canonically written by the `release_expired_bookings`
 * RPC (every 2 minutes by Vercel cron and opportunistically on availability
 * reads). This helper provides a defensive read-time derivation so admin
 * views never show a slot that has just passed as still 'active'.
 */
export type DisplayBookingStatus = 'pending' | 'active' | 'completed' | 'cancelled' | null

export function deriveBookingStatus(
  raw: string | null | undefined,
  date: string,
  timeSlot: string,
): DisplayBookingStatus {
  if (raw === 'cancelled') return 'cancelled'
  if (raw === 'completed') return 'completed'
  if (raw === 'pending') return 'pending'
  if (raw === 'active') {
    return isSlotInPast(date, (timeSlot ?? '').slice(0, 5)) ? 'completed' : 'active'
  }
  return null
}
