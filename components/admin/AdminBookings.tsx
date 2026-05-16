'use client'

import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Calendar as CalendarIcon, Clock, Loader2, Search } from 'lucide-react'

type Booking = {
  id: string
  bookingId: string
  date: string
  timeSlot: string
  paymentStatus: 'pending' | 'paid' | 'expired' | 'failed' | 'cancelled'
  amountPaise: number
  service: string
  createdAt: string
  paidAt: string | null
  customer: { name: string; phone: string; email: string | null } | null
}

const INR = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
const STATUSES = ['all', 'paid', 'pending', 'expired', 'failed', 'cancelled'] as const

export function AdminBookings() {
  const [bookings, setBookings] = useState<Booking[] | null>(null)
  const [status, setStatus] = useState<typeof STATUSES[number]>('all')
  const [q, setQ] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const queryString = useMemo(() => {
    const p = new URLSearchParams()
    p.set('status', status)
    if (q) p.set('q', q)
    if (from) p.set('from', from)
    if (to) p.set('to', to)
    return p.toString()
  }, [status, q, from, to])

  useEffect(() => {
    setBookings(null)
    const ctrl = new AbortController()
    fetch('/api/admin/bookings?' + queryString, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((d) => { if (d.ok) setBookings(d.bookings); else setBookings([]) })
      .catch((e) => { if ((e as any).name !== 'AbortError') setBookings([]) })
    return () => ctrl.abort()
  }, [queryString])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-serif font-medium text-[#2D2D2D]">Bookings</h1>
        <p className="text-[#7A7A7A] mt-1">Last 30 days by default. Filter or search to drill in.</p>
      </div>

      <Card className="border-none shadow-sm">
        <CardContent className="p-4 md:p-6 grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="md:col-span-2 relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#9A9A9A]" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, phone, email, or booking ID" className="pl-9 h-11" />
          </div>
          <Input value={from} onChange={(e) => setFrom(e.target.value)} type="date" className="h-11" />
          <Input value={to} onChange={(e) => setTo(e.target.value)} type="date" className="h-11" />
          <div className="md:col-span-4 flex gap-2 flex-wrap">
            {STATUSES.map((s) => (
              <button
                key={s}
                onClick={() => setStatus(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize ${
                  status === s ? 'bg-[#8E7CC3] text-white' : 'bg-[#FAF9F6] text-[#5A5A5A] hover:bg-black/5'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="border-none shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-[#FAF9F6] text-[#7A7A7A] uppercase text-xs">
              <tr>
                <th className="px-6 py-4 font-medium">Booking</th>
                <th className="px-6 py-4 font-medium">Customer</th>
                <th className="px-6 py-4 font-medium">Service</th>
                <th className="px-6 py-4 font-medium">Date & Time</th>
                <th className="px-6 py-4 font-medium">Amount</th>
                <th className="px-6 py-4 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5 bg-white">
              {bookings === null ? (
                <tr><td colSpan={6} className="px-6 py-8 text-[#9A9A9A]"><Loader2 className="w-4 h-4 inline animate-spin mr-2" /> Loading…</td></tr>
              ) : bookings.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-12 text-center text-[#9A9A9A]">No bookings match these filters.</td></tr>
              ) : (
                bookings.map((b) => (
                  <tr key={b.id} className="hover:bg-[#FAF9F6]/50 transition-colors">
                    <td className="px-6 py-4 font-mono text-xs text-[#2D2D2D]">{b.bookingId}</td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-[#2D2D2D]">{b.customer?.name ?? '—'}</div>
                      <div className="text-xs text-[#7A7A7A]">{b.customer?.phone}</div>
                      {b.customer?.email && <div className="text-xs text-[#9A9A9A]">{b.customer.email}</div>}
                    </td>
                    <td className="px-6 py-4 text-[#5A5A5A]">{b.service}</td>
                    <td className="px-6 py-4 text-[#5A5A5A]">
                      <div className="flex items-center gap-1"><CalendarIcon className="w-3.5 h-3.5 text-[#C5A880]" /> {b.date}</div>
                      <div className="flex items-center gap-1 text-xs mt-1 text-[#7A7A7A]"><Clock className="w-3.5 h-3.5" /> {b.timeSlot}</div>
                    </td>
                    <td className="px-6 py-4 text-[#5A5A5A] font-medium">{INR.format(b.amountPaise / 100)}</td>
                    <td className="px-6 py-4">
                      <StatusPill status={b.paymentStatus} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

function StatusPill({ status }: { status: Booking['paymentStatus'] }) {
  const cls =
    status === 'paid' ? 'bg-green-100 text-green-700' :
    status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
    status === 'expired' ? 'bg-slate-100 text-slate-600' :
    status === 'cancelled' ? 'bg-slate-100 text-slate-600' :
    'bg-red-100 text-red-700'
  return <span className={`px-3 py-1 rounded-full text-xs font-medium capitalize ${cls}`}>{status}</span>
}
