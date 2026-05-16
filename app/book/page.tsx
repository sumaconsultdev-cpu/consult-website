import type { Metadata } from 'next'
import { BookingFlow } from '@/components/booking/BookingFlow'

export const metadata: Metadata = {
  title: 'Book a Consultation',
  description: 'Choose a service, pick a date and time, and book your spiritual consultation with Suma.',
}

export default function BookPage() {
  return <BookingFlow />
}
