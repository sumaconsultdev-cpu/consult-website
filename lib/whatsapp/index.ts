import 'server-only'
import type { WhatsappProvider } from './types'
import { metaWhatsappProvider } from './meta'
import { mockWhatsappProvider } from './mock'
import { env } from '@/lib/env'

let _p: WhatsappProvider | null = null
export function whatsappProvider(): WhatsappProvider {
  if (_p) return _p
  _p = env.whatsappDriver() === 'meta' ? metaWhatsappProvider : mockWhatsappProvider
  return _p
}
export type { WhatsappProvider, WhatsappMessage } from './types'
