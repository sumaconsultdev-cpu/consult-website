import 'server-only'
import type { EmailProvider } from './types'
import { env } from '@/lib/env'
import { log } from '@/lib/logger'

export const resendEmailProvider: EmailProvider = {
  driver: 'resend',
  async send(msg) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${env.resendApiKey()}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          from: env.emailFrom(),
          to: [msg.to],
          subject: msg.subject,
          text: msg.text,
          html: msg.html ?? msg.text,
        }),
      })
      if (!res.ok) {
        log.warn('email.resend.failed', { status: res.status })
        return { ok: false, error: `http_${res.status}` }
      }
      const data = (await res.json()) as { id?: string }
      return { ok: true, id: data.id }
    } catch (e: any) {
      log.warn('email.resend.exception', { message: e?.message })
      return { ok: false, error: 'exception' }
    }
  },
}
