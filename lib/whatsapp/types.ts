export type WhatsappMessage = {
  to: string                        // E.164 (+91XXXXXXXXXX)
  /** Template name (Meta requires pre-approved templates outside 24h window). */
  template: string
  /** Variables in template order — the booking_confirmation template uses
   *  [name, service, datetime, bookingId]. */
  variables: string[]
}

export type WhatsappSendResult = {
  ok: boolean
  messageId?: string
  error?: string
}

export interface WhatsappProvider {
  driver: 'mock' | 'meta'
  send(msg: WhatsappMessage): Promise<WhatsappSendResult>
}
