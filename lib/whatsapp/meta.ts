import 'server-only'
import type { WhatsappProvider, WhatsappMessage, WhatsappSendResult } from './types'
import { env } from '@/lib/env'
import { log } from '@/lib/logger'

/**
 * Meta WhatsApp Cloud API driver.
 *
 * Endpoint : POST https://graph.facebook.com/v25.0/{phone_number_id}/messages
 * Auth     : Bearer {access_token}
 * Body     : template message with positional `body` parameters.
 *
 * Reliability:
 *   - Notification failure must NEVER throw out of here. A successful payment
 *     is already in the DB; a WhatsApp hiccup just means the customer gets
 *     the email fallback (or sees the dashboard later).
 *   - Errors are logged with Meta's structured error payload so the admin
 *     can diagnose template-quality or token issues without us re-reading
 *     the raw 4xx body.
 *
 * Test-mode delivery:
 *   - Meta's sandbox only delivers to phone numbers that have been verified
 *     inside the Business Manager. While onboarding the integration we
 *     route ALL outbound sends to `META_WA_TEST_OVERRIDE_TO` so the entire
 *     post-payment flow can be tested end-to-end without registering every
 *     test customer's phone with Meta. Leaving the override unset in
 *     production restores the natural per-customer addressing.
 */

const API_BASE = 'https://graph.facebook.com/v25.0'

function normaliseToWaFormat(phone: string): string {
  // Meta wants "<country code><number>" with no '+'. The phone is already
  // canonicalised to +91XXXXXXXXXX by the booking validation layer.
  return phone.replace(/^\+/, '')
}

export const metaWhatsappProvider: WhatsappProvider = {
  driver: 'meta',
  async send(msg: WhatsappMessage): Promise<WhatsappSendResult> {
    try {
      const phoneNumberId = env.metaWaPhoneNumberId()
      const accessToken = env.metaWaAccessToken()
      if (!phoneNumberId || !accessToken) {
        log.warn('whatsapp.meta.misconfigured', { hasPhoneId: !!phoneNumberId, hasToken: !!accessToken })
        return { ok: false, error: 'misconfigured' }
      }

      const override = env.metaWaTestOverrideTo()
      const effectiveTo = (!msg.skipOverride && override) ? override : msg.to
      const url = `${API_BASE}/${phoneNumberId}/messages`
      let body: object
      if (msg.type === 'text') {
        body = {
          messaging_product: 'whatsapp',
          to: normaliseToWaFormat(effectiveTo),
          type: 'text',
          text: { body: msg.body },
        }
      } else {
        // hello_world is Meta's standard zero-parameter test template.
        // Sending body components with it causes a param-count mismatch error.
        // All other templates include components when variables are provided.
        // To switch to the approved custom template, update META_WA_TEMPLATE_CONFIRMATION —
        // variables are already collected and passed through; nothing else changes.
        const useComponents = msg.template !== 'hello_world' && msg.variables.length > 0
        body = {
          messaging_product: 'whatsapp',
          to: normaliseToWaFormat(effectiveTo),
          type: 'template',
          template: {
            name: msg.template,
            language: { code: env.metaWaTemplateLanguage() },
            components: useComponents
              ? [{ type: 'body', parameters: msg.variables.map((v) => ({ type: 'text', text: String(v) })) }]
              : [],
          },
        }
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
        // Server-to-server; we don't want Next's fetch cache.
        cache: 'no-store',
      })

      if (!res.ok) {
        let detail: any = null
        try { detail = await res.json() } catch { /* non-JSON body */ }
        log.warn('whatsapp.meta.failed', {
          status: res.status,
          error_code: detail?.error?.code,
          error_subcode: detail?.error?.error_subcode,
          message: detail?.error?.message,
          fbtrace_id: detail?.error?.fbtrace_id,
          override: !!override,
        })
        return { ok: false, error: `http_${res.status}` }
      }
      const data = (await res.json()) as { messages?: { id: string }[] }
      const messageId = data.messages?.[0]?.id
      log.info('whatsapp.meta.sent', { messageId, override: !!override, type: msg.type, template: msg.type === 'template' ? msg.template : undefined })
      return { ok: true, messageId }
    } catch (e: any) {
      log.warn('whatsapp.meta.exception', { message: e?.message })
      return { ok: false, error: 'exception' }
    }
  },
}
