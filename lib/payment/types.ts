/**
 * Provider-neutral payment interface. The booking flow imports `paymentProvider()`
 * from `lib/payment` and never touches Razorpay directly — that keeps the
 * provider swappable and lets the mock driver run end-to-end before any real
 * Razorpay keys exist.
 *
 * Amounts are integer paise (₹1 = 100 paise) end-to-end. Razorpay's API uses
 * the same unit so no conversion is necessary.
 */

export type CreateOrderInput = {
  amountPaise: number
  currency: 'INR'
  receipt: string
  notes?: Record<string, string>
}

export type CreatedOrder = {
  orderId: string
  amountPaise: number
  currency: 'INR'
  keyId: string                       // public client key (safe to ship)
  /** Hint to the client whether this is a real or mock order. */
  driver: 'mock' | 'razorpay'
}

export type VerifyInput = {
  orderId: string
  paymentId: string
  signature: string
}

export type WebhookVerifyInput = {
  rawBody: string
  signatureHeader: string | null
}

export type WebhookParsed = {
  eventId: string
  eventType: string
  paymentId?: string
  orderId?: string
  status?: string
  payload: unknown
}

export interface PaymentProvider {
  driver: 'mock' | 'razorpay'
  createOrder(input: CreateOrderInput): Promise<CreatedOrder>
  /** Verify the front-end-supplied signature. */
  verifyClientSignature(input: VerifyInput): boolean
  /** Verify webhook signature and parse out the payload. */
  parseWebhook(input: WebhookVerifyInput): WebhookParsed | null
}
