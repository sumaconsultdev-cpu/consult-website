import { NextRequest } from 'next/server'
import { ok, fail, safe, callerIp } from '@/lib/http'
import { limit } from '@/lib/rate-limit'
import { db } from '@/lib/supabase/server'
import { BookingVerifySchema } from '@/lib/booking/validation'
import { paymentProvider } from '@/lib/payment'
import { sendBookingConfirmation } from '@/lib/notify'
import { log } from '@/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Verify the Razorpay handshake from the client and promote the booking to
 * `paid`. This is the FAST PATH — the webhook is the SLOW/AUTHORITATIVE path,
 * and both are written to be idempotent (the second one is a no-op).
 *
 * Trust model:
 *   - We do not believe the client's word for anything. The signature is
 *     HMAC-verified against our key_secret.
 *   - The amount is locked at create-time on the bookings row; we don't take
 *     it from the request.
 *   - We require the order_id we recorded on the booking to match.
 */
export const POST = safe(async (req: NextRequest) => {
  const r = await limit('booking', callerIp(req.headers))
  if (!r.ok) return fail(429, 'rate_limited', 'Too many requests.')

  let body: unknown
  try { body = await req.json() } catch { return fail(400, 'bad_json', 'Invalid request body.') }
  const parsed = BookingVerifySchema.safeParse(body)
  if (!parsed.success) return fail(400, 'validation_failed', 'Invalid verification payload.')
  const v = parsed.data

  const { data: booking, error: bErr } = await db()
    .from('bookings')
    .select('id,booking_id,payment_status,razorpay_order_id,date,time_slot,amount_paise,service_name_snapshot,customer_id')
    .eq('booking_id', v.bookingId)
    .maybeSingle()
  if (bErr || !booking) return fail(404, 'not_found', 'Booking not found.')

  // Idempotent re-verify is OK if already paid.
  if (booking.payment_status === 'paid') {
    return ok({ bookingId: booking.booking_id, status: 'paid' })
  }
  if (booking.payment_status !== 'pending') {
    return fail(409, 'not_pending', 'This booking is no longer awaiting payment.')
  }
  if (booking.razorpay_order_id !== v.razorpayOrderId) {
    log.warn('verify.order_mismatch', { bookingId: v.bookingId })
    return fail(400, 'order_mismatch', 'Payment does not match this booking.')
  }

  const provider = paymentProvider()
  const okSig = provider.verifyClientSignature({
    orderId: v.razorpayOrderId,
    paymentId: v.razorpayPaymentId,
    signature: v.razorpaySignature,
  })
  if (!okSig) {
    log.warn('verify.bad_signature', { bookingId: v.bookingId })
    return fail(400, 'bad_signature', 'Payment verification failed.')
  }

  const { data: updated, error: upErr } = await db()
    .from('bookings')
    .update({
      payment_status: 'paid',
      razorpay_payment_id: v.razorpayPaymentId,
      razorpay_signature: v.razorpaySignature,
      paid_at: new Date().toISOString(),
      hold_expires_at: null,
    })
    .eq('id', booking.id)
    .eq('payment_status', 'pending')           // optimistic-concurrency guard
    .select('id')
    .maybeSingle()
  if (upErr || !updated) {
    log.error('verify.update.failed', { code: upErr?.code })
    return fail(500, 'db_error', 'Could not finalise your booking.')
  }

  // Fire-and-forget notifications.
  ;(async () => {
    const { data: cust } = await db()
      .from('customers')
      .select('full_name,phone,email')
      .eq('id', booking.customer_id)
      .maybeSingle()
    if (cust) {
      await sendBookingConfirmation({
        bookingId: booking.booking_id,
        customerName: cust.full_name,
        customerPhone: cust.phone,
        customerEmail: cust.email,
        serviceName: booking.service_name_snapshot,
        date: booking.date,
        timeSlot: (booking.time_slot as string).slice(0, 5),
      })
    }
  })().catch((e) => log.warn('verify.notify.failed', { message: e?.message }))

  return ok({ bookingId: booking.booking_id, status: 'paid' })
})
