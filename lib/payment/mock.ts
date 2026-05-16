import 'server-only'
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { PaymentProvider, CreateOrderInput, CreatedOrder, VerifyInput, WebhookVerifyInput, WebhookParsed } from './types'
import { env } from '@/lib/env'

/**
 * Mock payment provider. Mirrors Razorpay's contract so the UI, webhook and
 * verification paths exercise the full real flow end-to-end without making
 * any external network calls.
 *
 * The mock signs orders with APP_SECRET. The frontend's mock checkout (see
 * components/booking/MockCheckout.tsx) reproduces the same HMAC so the
 * client-side verify path runs identically to live mode.
 */

function hmac(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex')
}
function constantTimeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  try { return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex')) } catch { return false }
}

const MOCK_KEY_SECRET = () => `mock|${env.appSecret()}`

export const mockProvider: PaymentProvider = {
  driver: 'mock',

  async createOrder(input: CreateOrderInput): Promise<CreatedOrder> {
    const orderId = 'order_' + randomBytes(8).toString('hex')
    return {
      orderId,
      amountPaise: input.amountPaise,
      currency: input.currency,
      keyId: 'rzp_mock_public',
      driver: 'mock',
    }
  },

  verifyClientSignature({ orderId, paymentId, signature }: VerifyInput): boolean {
    const expected = hmac(MOCK_KEY_SECRET(), `${orderId}|${paymentId}`)
    return constantTimeEqualHex(expected, signature.toLowerCase())
  },

  parseWebhook({ rawBody, signatureHeader }: WebhookVerifyInput): WebhookParsed | null {
    if (!signatureHeader) return null
    const expected = hmac(MOCK_KEY_SECRET(), rawBody)
    if (!constantTimeEqualHex(expected, signatureHeader.toLowerCase())) return null
    let parsed: any
    try { parsed = JSON.parse(rawBody) } catch { return null }
    return {
      eventId: parsed.event_id ?? `mock:${Date.now()}`,
      eventType: parsed.event ?? 'payment.captured',
      paymentId: parsed.payment_id,
      orderId: parsed.order_id,
      status: parsed.status ?? 'captured',
      payload: parsed,
    }
  },
}
