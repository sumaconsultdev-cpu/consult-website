import 'server-only'
import Razorpay from 'razorpay'
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { PaymentProvider, CreateOrderInput, CreatedOrder, VerifyInput, WebhookVerifyInput, WebhookParsed } from './types'
import { env } from '@/lib/env'

/**
 * Razorpay driver. Activated when PAYMENT_DRIVER=razorpay AND the three
 * secrets are present.
 *
 * Verification math:
 *   client signature  = HMAC-SHA256( key_secret, `${order_id}|${payment_id}` )
 *   webhook signature = HMAC-SHA256( webhook_secret, raw_body )
 * Both are compared with `timingSafeEqual`.
 */

let _rzp: Razorpay | null = null
function client(): Razorpay {
  if (_rzp) return _rzp
  _rzp = new Razorpay({ key_id: env.razorpayKeyId(), key_secret: env.razorpayKeySecret() })
  return _rzp
}

function hmac(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex')
}

function constantTimeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  try {
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'))
  } catch {
    return false
  }
}

export const razorpayProvider: PaymentProvider = {
  driver: 'razorpay',

  async createOrder(input: CreateOrderInput): Promise<CreatedOrder> {
    const order = await client().orders.create({
      amount: input.amountPaise,
      currency: input.currency,
      receipt: input.receipt,
      payment_capture: true,                 // auto-capture on authorisation
      notes: input.notes,
    })
    return {
      orderId: order.id,
      amountPaise: typeof order.amount === 'string' ? parseInt(order.amount, 10) : order.amount,
      currency: 'INR',
      keyId: env.razorpayKeyId(),
      driver: 'razorpay',
    }
  },

  verifyClientSignature({ orderId, paymentId, signature }: VerifyInput): boolean {
    const expected = hmac(env.razorpayKeySecret(), `${orderId}|${paymentId}`)
    return constantTimeEqualHex(expected, signature.toLowerCase())
  },

  parseWebhook({ rawBody, signatureHeader }: WebhookVerifyInput): WebhookParsed | null {
    if (!signatureHeader) return null
    const expected = hmac(env.razorpayWebhookSecret(), rawBody)
    if (!constantTimeEqualHex(expected, signatureHeader.toLowerCase())) return null
    let parsed: any
    try { parsed = JSON.parse(rawBody) } catch { return null }
    const eventType = parsed?.event ?? 'unknown'
    const payment = parsed?.payload?.payment?.entity
    const order = parsed?.payload?.order?.entity
    // Razorpay reuses signature+body as a natural unique key for idempotency.
    const eventId = `${eventType}:${payment?.id ?? order?.id ?? 'noid'}:${signatureHeader.slice(0, 24)}`
    return {
      eventId,
      eventType,
      paymentId: payment?.id,
      orderId: payment?.order_id ?? order?.id,
      status: payment?.status ?? order?.status,
      payload: parsed,
    }
  },
}
