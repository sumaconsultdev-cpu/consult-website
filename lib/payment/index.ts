import 'server-only'
import { env } from '@/lib/env'
import type { PaymentProvider } from './types'
import { razorpayProvider } from './razorpay'
import { mockProvider } from './mock'

let _provider: PaymentProvider | null = null

export function paymentProvider(): PaymentProvider {
  if (_provider) return _provider
  _provider = env.paymentDriver() === 'razorpay' ? razorpayProvider : mockProvider
  return _provider
}

export type { PaymentProvider } from './types'
