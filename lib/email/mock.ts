import 'server-only'
import type { EmailProvider } from './types'
import { log } from '@/lib/logger'

export const mockEmailProvider: EmailProvider = {
  driver: 'mock',
  async send(msg) {
    log.info('email.mock.send', { to: msg.to, subject: msg.subject })
    return { ok: true, id: 'mock_' + Date.now() }
  },
}
