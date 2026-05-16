import 'server-only'
import type { WhatsappProvider, WhatsappMessage, WhatsappSendResult } from './types'
import { env } from '@/lib/env'
import { log } from '@/lib/logger'

/**
 * Meta WhatsApp Cloud API driver.
 *
 * Endpoint: POST https://graph.facebook.com/v20.0/{phone_number_id}/messages
 * Auth:     Bearer {access_token}
 * Body:     template message with named parameters.
 *
 * The driver returns ok=false on transport/HTTP failure but never throws —
 * notification failure must never roll back a successful payment.
 */

const API_BASE = 'https://graph.facebook.com/v20.0'

export const metaWhatsappProvider: WhatsappProvider = {
  driver: 'meta',
  async send(msg: WhatsappMessage): Promise<WhatsappSendResult> {
    try {
      const url = `${API_BASE}/${env.metaWaPhoneNumberId()}/messages`
      const body = {
        messaging_product: 'whatsapp',
        to: msg.to.replace(/^\+/, ''),
        type: 'template',
        template: {
          name: msg.template,
          language: { code: 'en' },
          components: msg.variables.length
            ? [{ type: 'body', parameters: msg.variables.map((v) => ({ type: 'text', text: v })) }]
            : [],
        },
      }
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${env.metaWaAccessToken()}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const text = await res.text()
        log.warn('whatsapp.meta.failed', { status: res.status, body: text.slice(0, 300) })
        return { ok: false, error: `http_${res.status}` }
      }
      const data = (await res.json()) as { messages?: { id: string }[] }
      return { ok: true, messageId: data.messages?.[0]?.id }
    } catch (e: any) {
      log.warn('whatsapp.meta.exception', { message: e?.message })
      return { ok: false, error: 'exception' }
    }
  },
}
