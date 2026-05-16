import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Terms of Service' }

export default function TermsPage() {
  return (
    <div className="py-20 bg-[#FAF9F6]">
      <article className="container mx-auto max-w-3xl px-4 md:px-8 space-y-6 text-[#4A4A4A]">
        <h1 className="text-4xl font-serif font-medium text-[#2D2D2D]">Terms of Service</h1>
        <p className="text-sm text-[#7A7A7A]">Last updated: {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</p>

        <h2 className="text-2xl font-serif font-medium text-[#2D2D2D] pt-4">Nature of services</h2>
        <p>
          Suma Consultation offers personal guidance grounded in Numerology, Vaastu, and related practices. Consultations are intended to support
          personal reflection and decision-making. They are not a substitute for medical, psychological, legal, financial, or other professional advice.
        </p>

        <h2 className="text-2xl font-serif font-medium text-[#2D2D2D] pt-4">Bookings &amp; payments</h2>
        <ul className="list-disc pl-6 space-y-1">
          <li>Bookings must be made at least 24 hours in advance.</li>
          <li>Payment is collected in full at the time of booking via our payment processor.</li>
          <li>A booking is confirmed only after a successful payment has been verified.</li>
        </ul>

        <h2 className="text-2xl font-serif font-medium text-[#2D2D2D] pt-4">Cancellations &amp; refunds</h2>
        <p>The cancellation and refund policy is being finalised and will be published here in a future update.</p>

        <h2 className="text-2xl font-serif font-medium text-[#2D2D2D] pt-4">Acceptable use</h2>
        <p>
          You agree not to misuse this site, attempt to access accounts or systems that are not yours, or interfere with security or rate-limiting
          controls. Violations may result in cancellation of bookings without refund and may be reported to authorities.
        </p>

        <h2 className="text-2xl font-serif font-medium text-[#2D2D2D] pt-4">Liability</h2>
        <p>
          To the maximum extent permitted by law, our liability for any claim arising out of the services is limited to the amount you paid for the
          booking in question.
        </p>

        <h2 className="text-2xl font-serif font-medium text-[#2D2D2D] pt-4">Governing law</h2>
        <p>These terms are governed by the laws of India. Disputes will be subject to the exclusive jurisdiction of the courts at Bengaluru, Karnataka.</p>
      </article>
    </div>
  )
}
