import 'server-only'
import type { WhatsappProvider, WhatsappMessage, WhatsappSendResult } from './types'
import { log } from '@/lib/logger'

export const mockWhatsappProvider: WhatsappProvider = {
  driver: 'mock',
  async send(msg: WhatsappMessage): Promise<WhatsappSendResult> {
    log.info('whatsapp.mock.send', { to: msg.to, template: msg.template, variables: msg.variables })
    return { ok: true, messageId: 'mock_' + Date.now() }
  },
}
