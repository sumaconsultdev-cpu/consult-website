import Link from 'next/link'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AlertCircle, Headset } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { db } from '@/lib/supabase/server'
import { RetryPaymentButton } from '@/components/booking/RetryPaymentButton'

export const metadata: Metadata = { title: 'Payment incomplete', robots: { index: false } }
export const dynamic = 'force-dynamic'

export default async function FailedPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams

  let bookingId: string | null = null
  let retryable = false
  let terminalCopy: string | null = null

  if (id && /^SC-[A-Z0-9]{8}$/.test(id)) {
    const { data } = await db()
      .from('bookings')
      .select('booking_id, payment_status, booking_status, hold_expires_at')
      .eq('booking_id', id)
      .maybeSingle()

    if (data) {
      // Paid bookings should never land here — redirect to /success so the
      // customer doesn't see a confusing "payment incomplete" page.
      if (data.payment_status === 'paid' || data.booking_status === 'active' || data.booking_status === 'completed') {
        redirect(`/booking/success?id=${encodeURIComponent(data.booking_id)}`)
      }

      bookingId = data.booking_id

      // Retryable iff the booking is still in the 'pending' state AND the
      // 10-minute hold hasn't elapsed yet. The retry endpoint re-checks all
      // of this server-side; this is just for the UX (showing the right
      // button copy / explanation).
      const holdOk = !data.hold_expires_at || new Date(data.hold_expires_at).getTime() > Date.now()
      if (data.booking_status === 'pending' && holdOk) {
        retryable = true
      } else if (data.booking_status === 'cancelled') {
        terminalCopy = 'This booking has been cancelled and can no longer be paid.'
      } else {
        terminalCopy = 'The 10-minute payment hold has expired. Please book a new session.'
      }
    }
  }

  return (
    <div className="flex-1 flex items-center justify-center py-24 bg-[#FAF9F6]">
      <div className="container mx-auto px-4 max-w-xl">
        <Card className="border-none shadow-lg text-center overflow-hidden">
          <div className="h-2 bg-[#C5A880] w-full" />
          <CardContent className="p-10 md:p-16 space-y-8">
            <div className="mx-auto w-20 h-20 bg-[#C5A880]/10 rounded-full flex items-center justify-center animate-in zoom-in duration-500">
              <AlertCircle className="w-10 h-10 text-[#C5A880]" />
            </div>

            <div className="space-y-4">
              <h1 className="text-3xl font-serif font-medium text-[#2D2D2D]">Payment Incomplete</h1>
              <p className="text-lg text-[#5A5A5A]">We couldn&apos;t process your payment at this time. No charges were made.</p>
            </div>

            {bookingId && retryable && (
              <p className="text-sm text-[#7A7A7A]">
                Reference: <span className="font-medium text-[#4A4A4A]">{bookingId}</span> — your slot is held for the remaining hold window.
              </p>
            )}
            {bookingId && !retryable && terminalCopy && (
              <p className="text-sm text-[#7A7A7A]">
                Reference: <span className="font-medium text-[#4A4A4A]">{bookingId}</span> — {terminalCopy}
              </p>
            )}

            <div className="bg-[#FAF9F6] p-6 rounded-2xl border border-black/5 text-sm text-[#7A7A7A]">
              {retryable
                ? 'You can resume payment for this booking using the same details — no need to re-enter your information.'
                : 'This could be due to a network issue, insufficient funds, or a bank decline. Please book a new session.'}
            </div>

            <div className="pt-4 flex flex-col sm:flex-row gap-4">
              {retryable && bookingId ? (
                <>
                  <div className="flex-1">
                    <RetryPaymentButton bookingId={bookingId} />
                  </div>
                  <Link href="/book" className="flex-1">
                    <Button size="lg" variant="outline" className="w-full h-14">Start a new booking</Button>
                  </Link>
                </>
              ) : (
                <>
                  <Link href="/book" className="flex-1">
                    <Button size="lg" className="w-full h-14">Book a new session</Button>
                  </Link>
                  <Button size="lg" variant="outline" className="flex-1 h-14 w-full border-[#C5A880] text-[#C5A880] hover:bg-[#C5A880]/5">
                    <Headset className="w-4 h-4 mr-2" /> Support
                  </Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
