import { NextRequest } from 'next/server'
import { createHmac } from 'node:crypto'
import { ok, fail, safe } from '@/lib/http'
import { env } from '@/lib/env'
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
 */
const Schema = z.object({ orderId: z.string().min(1).max(80) })

export const POST = safe(async (req: NextRequest) => {
  if (env.paymentDriver() !== 'mock') {
    return fail(404, 'not_found', 'Not found')
  }
  let body: unknown
  try { body = await req.json() } catch { return fail(400, 'bad_json', 'Invalid request.') }
  const parsed = Schema.safeParse(body)
  if (!parsed.success) return fail(400, 'validation_failed', 'Invalid input.')

  const paymentId = 'pay_mock_' + Math.random().toString(36).slice(2, 10)
  const signature = createHmac('sha256', `mock|${env.appSecret()}`)
    .update(`${parsed.data.orderId}|${paymentId}`)
    .digest('hex')

  return ok({ paymentId, signature })
})
