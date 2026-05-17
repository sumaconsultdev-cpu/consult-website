import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { CheckCircle2, MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { db } from '@/lib/supabase/server'
import { formatDateTimeIST } from '@/lib/time'
import { ClearDraftOnMount } from '@/components/booking/ClearDraftOnMount'

export const metadata: Metadata = { title: 'Booking confirmed', robots: { index: false } }
export const dynamic = 'force-dynamic'

/**
 * Server-rendered confirmation page. We re-read the booking by `id` and
 * SHOW IT ONLY IF it is actually paid — a fake `?id=` query string can't
 * produce a fake confirmation. Anything else 404s.
 */
export default async function SuccessPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams
  if (!id || !/^SC-[A-Z0-9]{8}$/.test(id)) notFound()

  const { data } = await db()
    .from('bookings')
    .select('booking_id, payment_status, date, time_slot, service_name_snapshot, amount_paise')
    .eq('booking_id', id)
    .maybeSingle()

  if (!data || data.payment_status !== 'paid') notFound()

  const datetime = formatDateTimeIST(data.date, (data.time_slot as string).slice(0, 5))

  return (
    <div className="flex-1 flex items-center justify-center py-24 bg-[#FAF9F6]">
      <ClearDraftOnMount />
      <div className="container mx-auto px-4 max-w-xl">
        <Card className="border-none shadow-lg text-center overflow-hidden">
          <div className="h-2 bg-[#8E7CC3] w-full" />
          <CardContent className="p-10 md:p-16 space-y-8">
            <div className="mx-auto w-20 h-20 bg-[#8E7CC3]/10 rounded-full flex items-center justify-center animate-in zoom-in duration-500">
              <CheckCircle2 className="w-10 h-10 text-[#8E7CC3]" />
            </div>

            <div className="space-y-4">
              <h1 className="text-3xl font-serif font-medium text-[#2D2D2D]">Booking Confirmed</h1>
              <p className="text-lg text-[#5A5A5A]">Thank you for your trust. Your session has been successfully booked.</p>
            </div>

            <div className="bg-[#FAF9F6] p-6 rounded-2xl border border-black/5 space-y-2">
              <p className="text-sm text-[#7A7A7A]">Booking Reference</p>
              <p className="text-2xl font-medium tracking-wider text-[#4A4A4A]">{data.booking_id}</p>
              <div className="pt-3 text-sm text-[#5A5A5A]">
                <p>{data.service_name_snapshot}</p>
                <p className="font-medium text-[#2D2D2D] mt-1">{datetime}</p>
              </div>
            </div>

            <div className="flex items-start gap-4 p-4 rounded-2xl bg-green-50 text-left border border-green-100">
              <MessageCircle className="w-6 h-6 text-green-600 shrink-0 mt-0.5" />
              <p className="text-sm text-green-800">
                A confirmation message with your booking details has been sent to your WhatsApp. Suma will reach out to you shortly.
              </p>
            </div>

            <div className="pt-4">
              <Link href="/">
                <Button size="lg" className="w-full h-14">Return Home</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
