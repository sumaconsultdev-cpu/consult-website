import Link from 'next/link'
import type { Metadata } from 'next'
import { AlertCircle, Headset } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { db } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Payment incomplete', robots: { index: false } }
export const dynamic = 'force-dynamic'

export default async function FailedPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams
  let bookingId: string | null = null
  if (id && /^SC-[A-Z0-9]{8}$/.test(id)) {
    const { data } = await db()
      .from('bookings')
      .select('booking_id, payment_status')
      .eq('booking_id', id)
      .maybeSingle()
    // Only echo the booking ref if it's NOT paid — paid bookings should land on /success.
    if (data && data.payment_status !== 'paid') bookingId = data.booking_id
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

            {bookingId && (
              <p className="text-sm text-[#7A7A7A]">
                Reference: <span className="font-medium text-[#4A4A4A]">{bookingId}</span> — held for 10 minutes if you want to retry.
              </p>
            )}

            <div className="bg-[#FAF9F6] p-6 rounded-2xl border border-black/5 text-sm text-[#7A7A7A]">
              This could be due to a network issue, insufficient funds, or a bank decline. Please try again or use a different payment method.
            </div>

            <div className="pt-4 flex flex-col sm:flex-row gap-4">
              <Link href="/book" className="flex-1">
                <Button size="lg" className="w-full h-14">Try Again</Button>
              </Link>
              <Button size="lg" variant="outline" className="flex-1 h-14 w-full border-[#C5A880] text-[#C5A880] hover:bg-[#C5A880]/5">
                <Headset className="w-4 h-4 mr-2" /> Support
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
