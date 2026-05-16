import 'server-only'
import { whatsappProvider } from '@/lib/whatsapp'
import { emailProvider } from '@/lib/email'
import { env } from '@/lib/env'
import { formatDateTimeIST } from '@/lib/time'
import { log } from '@/lib/logger'

type BookingNotify = {
  bookingId: string
  customerName: string
  customerPhone: string
  customerEmail: string | null
  serviceName: string
  date: string
  timeSlot: string
}

/**
 * Send the post-payment confirmation to (1) the customer and (2) the admin.
 * Notification failure NEVER throws — the booking is already paid and the
 * admin will see it in the dashboard regardless. WhatsApp failures are logged
 * and an email fallback is attempted for the customer if Resend is configured.
 */
export async function sendBookingConfirmation(b: BookingNotify): Promise<void> {
  const datetime = formatDateTimeIST(b.date, b.timeSlot)
  const wa = whatsappProvider()
  const em = emailProvider()

  // Customer WhatsApp
  const custWa = await wa.send({
    to: b.customerPhone,
    template: env.metaWaTemplate(),
    variables: [b.customerName, b.serviceName, datetime, b.bookingId],
  })

  // Admin WhatsApp (best-effort, only if configured)
  const adminWa = env.adminWhatsappNumber()
  if (adminWa) {
    await wa.send({
      to: adminWa,
      template: env.metaWaTemplate(),
      variables: [`Admin: new booking from ${b.customerName}`, b.serviceName, datetime, b.bookingId],
    })
  }

  // Email fallback for customer if WhatsApp failed AND we have email + provider
  if (!custWa.ok && b.customerEmail) {
    const subj = `Your Suma Consultation is confirmed — ${b.bookingId}`
    const text = `Hi ${b.customerName},

Your ${b.serviceName} session is confirmed for ${datetime}.
Booking reference: ${b.bookingId}

If you have any questions, reply to this email or message us on WhatsApp.

Warmly,
Suma`
    await em.send({ to: b.customerEmail, subject: subj, text })
  }

  // Admin email mirror — always, if configured
  const adminEmail = env.adminEmail()
  if (adminEmail) {
    await em.send({
      to: adminEmail,
      subject: `New booking ${b.bookingId} — ${b.customerName}`,
      text: `Customer: ${b.customerName} (${b.customerPhone})
Service: ${b.serviceName}
When: ${datetime}
Booking: ${b.bookingId}`,
    })
  }

  log.info('notify.sent', { bookingId: b.bookingId, waOk: custWa.ok })
}
