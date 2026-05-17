export type WhatsappTemplateMessage = {
  to: string                         // E.164 (+91XXXXXXXXXX)
  type: 'template'
  /** Template name (Meta requires pre-approved templates outside 24h window). */
  template: string
  /** Variables in positional order matching the Meta template's {{n}}
   *  placeholders. The booking-confirmation template uses
   *  [name, datetime, service, bookingId] → {{1}}=name, {{2}}=datetime,
   *  {{3}}=service, {{4}}=bookingId. Keep `lib/notify.ts` in sync. */
  variables: string[]
  /** When true, META_WA_TEST_OVERRIDE_TO is ignored and the message goes
   *  directly to `to`. Use for admin sends that must reach a real number. */
  skipOverride?: boolean
}

export type WhatsappTextMessage = {
  to: string                         // E.164 (+91XXXXXXXXXX)
  type: 'text'
  /** Plain text body. Meta only delivers this within a 24-hour customer
   *  service window (i.e. the recipient must have messaged the business
   *  number first). Use templates for business-initiated conversations. */
  body: string
  /** When true, META_WA_TEST_OVERRIDE_TO is ignored and the message goes
   *  directly to `to`. Use for admin sends that must reach a real number. */
  skipOverride?: boolean
}

export type WhatsappMessage = WhatsappTemplateMessage | WhatsappTextMessage

export type WhatsappSendResult = {
  ok: boolean
  messageId?: string
  error?: string
}

export interface WhatsappProvider {
  driver: 'mock' | 'meta'
  send(msg: WhatsappMessage): Promise<WhatsappSendResult>
}
