import { NextRequest } from 'next/server'
import { ok, fail, safe, callerIp } from '@/lib/http'
import { limit } from '@/lib/rate-limit'
import { db } from '@/lib/supabase/server'
import { paymentProvider } from '@/lib/payment'
import { sendBookingConfirmation } from '@/lib/notify'
import { log } from '@/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Razorpay webhook receiver.
 *
 * Idempotency:
 *   - `webhook_events.event_id` is a unique key. We INSERT first, and any
 *     duplicate (same event delivered twice) is a no-op return.
 *   - Booking status transitions are guarded by `eq('payment_status','pending')`
 *     so a webhook arriving after the client-side verify already promoted to
 *     `paid` short-circuits cleanly.
 *
 * Authenticity:
 *   - Signature is verified against RAZORPAY_WEBHOOK_SECRET before parsing.
 *   - We deliberately read the raw body — JSON.parse must NOT happen before
 *     the signature check (otherwise parser quirks could bypass verification).
 */
export const POST = safe(async (req: NextRequest) => {
  const r = await limit('webhook', callerIp(req.headers))
  if (!r.ok) return fail(429, 'rate_limited', 'Rate limited.')

  const rawBody = await req.text()
  const sig = req.headers.get('x-razorpay-signature')
  const provider = paymentProvider()
  const parsed = provider.parseWebhook({ rawBody, signatureHeader: sig })
  if (!parsed) {
    log.warn('webhook.bad_signature', { hasSig: !!sig })
    return fail(400, 'bad_signature', 'Invalid signature.')
  }

  // Idempotency insert — duplicates short-circuit.
  const { error: insErr } = await db().from('webhook_events').insert({
    event_id: parsed.eventId,
    event_type: parsed.eventType,
    payload: parsed.payload,
  })
  if (insErr) {
    if (insErr.code === '23505') {
      // Duplicate delivery — acknowledge.
      return ok({ duplicate: true })
    }
    log.error('webhook.log.failed', { code: insErr.code })
    // Don't 500 — Razorpay would retry forever. Acknowledge.
    return ok({ logged: false })
  }

  if (!parsed.orderId) return ok({ ignored: true })

  // Locate the booking by order id.
  const { data: booking } = await db()
    .from('bookings')
    .select('id,booking_id,payment_status,date,time_slot,service_name_snapshot,customer_id')
    .eq('razorpay_order_id', parsed.orderId)
    .maybeSingle()
  if (!booking) {
    log.warn('webhook.unknown_order', { orderId: parsed.orderId })
    return ok({ unknown_order: true })
  }

  if (booking.payment_status === 'paid') {
    return ok({ already_paid: true })
  }

  const isCaptured = parsed.eventType === 'payment.captured' || parsed.status === 'captured'
  const isFailed = parsed.eventType === 'payment.failed' || parsed.status === 'failed'

  if (isCaptured) {
    const { data: updated } = await db()
      .from('bookings')
      .update({
        payment_status: 'paid',
        razorpay_payment_id: parsed.paymentId ?? null,
        paid_at: new Date().toISOString(),
        hold_expires_at: null,
      })
      .eq('id', booking.id)
      .in('payment_status', ['pending'])
      .select('id')
      .maybeSingle()

    if (updated) {
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
      })().catch((e) => log.warn('webhook.notify.failed', { message: e?.message }))
    }
    await db().from('webhook_events').update({ processed_at: new Date().toISOString() }).eq('event_id', parsed.eventId)
    return ok({ promoted: true })
  }

  if (isFailed) {
    await db()
      .from('bookings')
      .update({ payment_status: 'failed', hold_expires_at: null })
      .eq('id', booking.id)
      .eq('payment_status', 'pending')
    await db().from('webhook_events').update({ processed_at: new Date().toISOString() }).eq('event_id', parsed.eventId)
    return ok({ marked_failed: true })
  }

  return ok({ ignored_event: parsed.eventType })
})
