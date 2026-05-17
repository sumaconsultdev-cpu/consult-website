import { NextRequest } from 'next/server'
import { ok, fail, safe, callerIp } from '@/lib/http'
import { limit } from '@/lib/rate-limit'
import { db } from '@/lib/supabase/server'
import { paymentProvider } from '@/lib/payment'
import { getRetryPayload, putRetryPayload, type RetryPayload } from '@/lib/booking/retry-cache'
import { HOLD_MINUTES } from '@/lib/booking/slots'
import { env } from '@/lib/env'
import { log } from '@/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/booking/retry?id=SC-XXXXXXXX
 *
 * Returns the minimal payload needed to re-open the Razorpay (or mock)
 * checkout for a still-pending booking, without forcing the customer to
 * re-fill the booking form. Used by /booking/failed → "Try Again".
 *
 * Trust + privacy:
 *   - Only echoes booking metadata (amount, service, slot) and the
 *     pre-existing Razorpay order id. NO customer PII is returned — that
 *     stays in the booking row (encrypted) and is handed straight to
 *     Razorpay via the order's notes at create-time.
 *   - Rate-limited per IP using the same 'booking' bucket as /create.
 *   - 410 Gone if the booking is no longer eligible for retry (paid,
 *     cancelled, completed, or hold expired).
 *   - Redis is consulted first for low-latency reads; on cache miss we
 *     rebuild from the booking row so the endpoint is resilient to
 *     transient cache outages.
 */
export const GET = safe(async (req: NextRequest) => {
  const r = await limit('booking', callerIp(req.headers))
  if (!r.ok) return fail(429, 'rate_limited', 'Too many requests. Please try again shortly.')

  const url = new URL(req.url)
  const id = url.searchParams.get('id') ?? ''
  if (!/^SC-[A-Z0-9]{8}$/.test(id)) {
    return fail(400, 'invalid_input', 'Invalid booking reference.')
  }

  const { data: booking, error } = await db()
    .from('bookings')
    .select('booking_id, payment_status, booking_status, hold_expires_at, razorpay_order_id, amount_paise, service_name_snapshot, date, time_slot')
    .eq('booking_id', id)
    .maybeSingle()
  if (error) {
    log.error('retry.db', { code: error.code })
    return fail(500, 'db_error', 'Could not load booking.')
  }
  if (!booking) return fail(404, 'not_found', 'Booking not found.')

  // Already-paid → tell the client to go straight to the success page.
  if (booking.payment_status === 'paid' || booking.booking_status === 'active' || booking.booking_status === 'completed') {
    return fail(409, 'already_paid', 'This booking is already paid.')
  }
  if (booking.booking_status === 'cancelled') {
    return fail(410, 'cancelled', 'This booking has been cancelled and can no longer be paid.')
  }
  // Hold-expired pending → cron will turn it into cancelled on the next pass,
  // but in the meantime treat it as not retryable.
  if (booking.hold_expires_at && new Date(booking.hold_expires_at).getTime() < Date.now()) {
    return fail(410, 'expired', 'The 10-minute payment hold has expired. Please book a new session.')
  }
  if (booking.booking_status !== 'pending') {
    return fail(410, 'not_retryable', 'This booking cannot be retried.')
  }
  if (!booking.razorpay_order_id) {
    // Defensive — every booking gets an order id stamped right after insert.
    return fail(500, 'order_missing', 'No payment order is attached to this booking.')
  }

  // Fast path: cache. Slow path: rebuild from DB + repopulate.
  let payload: RetryPayload | null = await getRetryPayload(id)
  if (!payload) {
    const provider = paymentProvider()
    payload = {
      bookingId: booking.booking_id,
      amountPaise: booking.amount_paise,
      currency: 'INR',
      serviceName: booking.service_name_snapshot,
      date: booking.date,
      timeSlot: (booking.time_slot as string).slice(0, 5),
      holdMinutes: HOLD_MINUTES,
      orderId: booking.razorpay_order_id,
      keyId: provider.driver === 'razorpay' ? env.razorpayKeyId() : 'rzp_mock_public',
      driver: provider.driver,
    }
    // Best-effort re-cache so subsequent retries within the hold are fast.
    void putRetryPayload(payload)
  }

  return ok({
    booking: {
      bookingId: payload.bookingId,
      amountPaise: payload.amountPaise,
      currency: payload.currency,
      serviceName: payload.serviceName,
      date: payload.date,
      timeSlot: payload.timeSlot,
      holdMinutes: payload.holdMinutes,
    },
    payment: {
      orderId: payload.orderId,
      keyId: payload.keyId,
      driver: payload.driver,
    },
  })
})
