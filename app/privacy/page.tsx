import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Privacy Policy' }

export default function PrivacyPage() {
  return (
    <div className="py-20 bg-[#FAF9F6]">
      <article className="container mx-auto max-w-3xl px-4 md:px-8 space-y-6 text-[#4A4A4A]">
        <h1 className="text-4xl font-serif font-medium text-[#2D2D2D]">Privacy Policy</h1>
        <p className="text-sm text-[#7A7A7A]">Last updated: {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</p>

        <p>
          Suma Consultation (&ldquo;we&rdquo;, &ldquo;us&rdquo;) collects the personal details you share when booking a session so that we can provide the
          consultation and contact you about it. This page describes what we collect, why, and your rights.
        </p>

        <h2 className="text-2xl font-serif font-medium text-[#2D2D2D] pt-4">Information we collect</h2>
        <ul className="list-disc pl-6 space-y-1">
          <li>Identity &amp; contact: name, phone number, email (if provided).</li>
          <li>Booking details: chosen service, date, time, any notes you add.</li>
          <li>Astrological inputs (optional): date of birth, time of birth, place of birth, gender — used for the consultation only.</li>
          <li>Payment metadata: the order/payment identifiers from our payment processor. We do NOT store your card details.</li>
          <li>Technical: IP address and basic request metadata used for security and rate-limiting.</li>
        </ul>

        <h2 className="text-2xl font-serif font-medium text-[#2D2D2D] pt-4">How we use it</h2>
        <ul className="list-disc pl-6 space-y-1">
          <li>To deliver the consultation you book.</li>
          <li>To send WhatsApp / email confirmations about your booking.</li>
          <li>To prevent fraud and abuse.</li>
        </ul>

        <h2 className="text-2xl font-serif font-medium text-[#2D2D2D] pt-4">Sharing</h2>
        <p>
          We share necessary data only with: our payment processor (Razorpay) to complete the transaction; our communications providers (Meta WhatsApp,
          our email provider) to send confirmations; our infrastructure providers (Supabase, Vercel, Upstash, Cloudflare) under contract. We never sell
          your data.
        </p>

        <h2 className="text-2xl font-serif font-medium text-[#2D2D2D] pt-4">Retention</h2>
        <p>
          Booking records and customer details are retained for up to 18 months for tax, accounting, and continuity of care, after which they are
          archived in encrypted form and removed from the live database. Anonymised aggregate analytics may be retained longer.
        </p>

        <h2 className="text-2xl font-serif font-medium text-[#2D2D2D] pt-4">Your rights (DPDP Act, 2023 — India)</h2>
        <ul className="list-disc pl-6 space-y-1">
          <li>Right to access a copy of your personal data we hold.</li>
          <li>Right to correction of inaccurate data.</li>
          <li>Right to erasure where lawful.</li>
          <li>Right to grievance redressal — please contact us using the details below.</li>
        </ul>

        <h2 className="text-2xl font-serif font-medium text-[#2D2D2D] pt-4">Contact</h2>
        <p>If you have questions or wish to exercise any right above, please reach out via WhatsApp from the contact section on the homepage.</p>
      </article>
    </div>
  )
}
