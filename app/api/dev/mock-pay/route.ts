import { NextRequest } from 'next/server'
import { createHmac } from 'node:crypto'
import { ok, fail, safe } from '@/lib/http'
import { env } from '@/lib/env'
import { db } from '@/lib/supabase/server'
import { log } from '@/lib/logger'
import { z } from 'zod'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Dev-only stand-in for the Razorpay checkout iframe.
 *
 * It mints a "payment_id" and produces the matching HMAC signature that
 * `lib/payment/mock` expects on the verify endpoint. This route is the ONLY
 * way the system can ever produce a valid mock signature — so the moment the
 * real `PAYMENT_DRIVER=razorpay` is set, this endpoint refuses to operate.
 *
 * Outcome:
 *   - `success` (default) — returns signature; client calls /verify and the
 *     booking transitions to `paid`.
 *   - `fail` — server marks the booking's payment_status as `failed` directly
 *     and returns `{ failed: true }`. The client should NOT call /verify in
 *     this case; it routes straight to /booking/failed. This mirrors what
 *     Razorpay would do via a `payment.failed` webhook in production.
 */
const Schema = z.object({
  orderId: z.string().min(1).max(80),
  outcome: z.enum(['success', 'fail']).default('success'),
})

export const POST = safe(async (req: NextRequest) => {
  if (env.paymentDriver() !== 'mock') {
    return fail(404, 'not_found', 'Not found')
  }
  let body: unknown
  try { body = await req.json() } catch { return fail(400, 'bad_json', 'Invalid request.') }
  const parsed = Schema.safeParse(body)
  if (!parsed.success) return fail(400, 'validation_failed', 'Invalid input.')

  if (parsed.data.outcome === 'fail') {
    // Simulate a Razorpay `payment.failed` outcome. Set payment_status='failed'
    // AND flip booking_status to 'cancelled' so the slot is released
    // atomically. Guarded by both prior states so a stray retry cannot
    // demote a paid or completed row.
    const { data: updated, error } = await db()
      .from('bookings')
      .update({
        payment_status: 'failed',
        booking_status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        hold_expires_at: null,
      })
      .eq('razorpay_order_id', parsed.data.orderId)
      .eq('payment_status', 'pending')
      .eq('booking_status', 'pending')
      .select('booking_id')
      .maybeSingle()
    if (error) {
      log.error('mock-pay.fail.update', { code: error.code })
      return fail(500, 'db_error', 'Could not simulate failure.')
    }
    return ok({ failed: true, bookingId: updated?.booking_id ?? null })
  }

  const paymentId = 'pay_mock_' + Math.random().toString(36).slice(2, 10)
  const signature = createHmac('sha256', `mock|${env.appSecret()}`)
    .update(`${parsed.data.orderId}|${paymentId}`)
    .digest('hex')

  return ok({ paymentId, signature })
})
