import 'server-only'
import type { EmailProvider } from './types'
import { resendEmailProvider } from './resend'
import { mockEmailProvider } from './mock'
import { env } from '@/lib/env'

let _p: EmailProvider | null = null
export function emailProvider(): EmailProvider {
  if (_p) return _p
  _p = env.emailDriver() === 'resend' ? resendEmailProvider : mockEmailProvider
  return _p
}
export type { EmailProvider, EmailMessage } from './types'
