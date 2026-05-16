export type EmailMessage = {
  to: string
  subject: string
  text: string
  html?: string
}
export type EmailResult = { ok: boolean; id?: string; error?: string }
export interface EmailProvider {
  driver: 'mock' | 'resend'
  send(msg: EmailMessage): Promise<EmailResult>
}
