'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Loader2, Search, Eye, Ban, Settings } from 'lucide-react'
import { toast } from 'sonner'

type Booking = {
  id: string
  bookingId: string
  date: string
  timeSlot: string
  paymentStatus: 'pending' | 'paid' | 'expired' | 'failed' | 'cancelled'
  bookingStatus: 'pending' | 'active' | 'completed' | 'cancelled' | null
  amountPaise: number
  service: string
  createdAt: string
  paidAt: string | null
  cancelledAt: string | null
  customer: { name: string; phone: string; email: string | null } | null
}

type BookingDetail = {
  id: string
  bookingId: string
  date: string
  timeSlot: string
  paymentStatus: Booking['paymentStatus']
  bookingStatus: Booking['bookingStatus']
  amountPaise: number
  service: string
  createdAt: string
  paidAt: string | null
  cancelledAt: string | null
  cancellationReason: string | null
  razorpayOrderId: string | null
  razorpayPaymentId: string | null
  customer: { name: string | null; phone: string | null; email: string | null } | null
  details: {
    dob: string | null
    timeOfBirth: string | null
    placeOfBirth: string | null
    gender: string | null
    notes: string | null
  } | null
  detailsError?: string
}

const INR = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
const STATUSES = ['all', 'paid', 'pending', 'expired', 'failed', 'cancelled'] as const

function readCookie(name: string): string {
  if (typeof document === 'undefined') return ''
  const match = document.cookie.split('; ').find((c) => c.startsWith(name + '='))
  return match ? decodeURIComponent(match.split('=').slice(1).join('=')) : ''
}

export function AdminBookings() {
  const [bookings, setBookings] = useState<Booking[] | null>(null)
  const [status, setStatus] = useState<typeof STATUSES[number]>('all')
  const [q, setQ] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  // View drawer
  const [viewing, setViewing] = useState<{ bookingId: string; data: BookingDetail | null; loading: boolean } | null>(null)

  // Cancel dialog
  const [cancelling, setCancelling] = useState<{ bookingId: string; reason: string; submitting: boolean } | null>(null)

  // Abort controllers for the View/Cancel async paths. Stored in refs so we
  // can cancel an in-flight request when the user closes the drawer/dialog
  // or unmounts the page — avoiding "setState on unmounted" warnings and
  // dropped responses landing in a now-irrelevant UI.
  const viewCtrlRef = useRef<AbortController | null>(null)
  const cancelCtrlRef = useRef<AbortController | null>(null)
  useEffect(() => () => {
    viewCtrlRef.current?.abort()
    cancelCtrlRef.current?.abort()
  }, [])

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
  }, [queryString, reloadKey])

  const openView = useCallback(async (bookingId: string) => {
    // Cancel any prior in-flight view request so its response doesn't
    // overwrite the newer drawer state.
    viewCtrlRef.current?.abort()
    const ctrl = new AbortController()
    viewCtrlRef.current = ctrl
    setViewing({ bookingId, data: null, loading: true })
    try {
      const r = await fetch(`/api/admin/bookings/${encodeURIComponent(bookingId)}`, { signal: ctrl.signal })
      const d = await r.json()
      if (ctrl.signal.aborted) return
      if (!r.ok || !d.ok) {
        toast.error(d.error?.message ?? 'Could not load booking.')
        setViewing(null)
        return
      }
      setViewing({ bookingId, data: d.booking as BookingDetail, loading: false })
    } catch (e: any) {
      if (e?.name === 'AbortError') return
      toast.error('Network error. Please try again.')
      setViewing(null)
    }
  }, [])

  const submitCancel = useCallback(async () => {
    if (!cancelling) return
    cancelCtrlRef.current?.abort()
    const ctrl = new AbortController()
    cancelCtrlRef.current = ctrl
    setCancelling((c) => c ? { ...c, submitting: true } : c)
    try {
      const r = await fetch(`/api/admin/bookings/${encodeURIComponent(cancelling.bookingId)}/cancel`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-csrf-token': readCookie('csrf_token') },
        body: JSON.stringify({ reason: cancelling.reason.trim() || undefined }),
        signal: ctrl.signal,
      })
      const d = await r.json()
      if (ctrl.signal.aborted) return
      if (!r.ok || !d.ok) {
        toast.error(d.error?.message ?? 'Could not cancel booking.')
        setCancelling((c) => c ? { ...c, submitting: false } : c)
        return
      }
      toast.success(d.noop ? 'Booking was already cancelled.' : 'Booking cancelled. Slot is now bookable again.')
      setCancelling(null)
      setReloadKey((k) => k + 1)
    } catch (e: any) {
      if (e?.name === 'AbortError') return
      toast.error('Network error. Please try again.')
      setCancelling((c) => c ? { ...c, submitting: false } : c)
    }
  }, [cancelling])

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
                <th className="px-3 lg:px-4 py-3 font-medium">Name</th>
                <th className="px-3 lg:px-4 py-3 font-medium">Phone</th>
                <th className="px-3 lg:px-4 py-3 font-medium">Email</th>
                <th className="px-3 lg:px-4 py-3 font-medium">Date</th>
                <th className="px-3 lg:px-4 py-3 font-medium">Slot</th>
                <th className="px-3 lg:px-4 py-3 font-medium">Payment</th>
                <th className="px-3 lg:px-4 py-3 font-medium">Booking</th>
                <th className="px-3 lg:px-4 py-3 font-medium">Amount</th>
                <th className="px-3 lg:px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5 bg-white">
              {bookings === null ? (
                <tr><td colSpan={9} className="px-6 py-8 text-[#9A9A9A]"><Loader2 className="w-4 h-4 inline animate-spin mr-2" /> Loading…</td></tr>
              ) : bookings.length === 0 ? (
                <tr><td colSpan={9} className="px-6 py-12 text-center text-[#9A9A9A]">No bookings match these filters.</td></tr>
              ) : (
                bookings.map((b) => {
                  // Cancel is only meaningful for bookings that are still
                  // happening or could still be paid. Completed (slot past)
                  // and already-cancelled rows are read-only.
                  const cancelDisabled = b.bookingStatus === 'cancelled' || b.bookingStatus === 'completed'
                  return (
                    <tr key={b.id} className="hover:bg-[#FAF9F6]/50 transition-colors">
                      <td className="px-3 lg:px-4 py-3 text-[#2D2D2D] whitespace-nowrap">{b.customer?.name ?? '—'}</td>
                      <td className="px-3 lg:px-4 py-3 text-[#5A5A5A] font-mono text-xs whitespace-nowrap">{b.customer?.phone ?? '—'}</td>
                      <td className="px-3 lg:px-4 py-3 text-[#5A5A5A] text-xs max-w-[14rem] truncate" title={b.customer?.email ?? ''}>{b.customer?.email ?? '—'}</td>
                      <td className="px-3 lg:px-4 py-3 text-[#5A5A5A] whitespace-nowrap">{b.date}</td>
                      <td className="px-3 lg:px-4 py-3 text-[#5A5A5A] whitespace-nowrap">{b.timeSlot}</td>
                      <td className="px-3 lg:px-4 py-3"><PaymentPill status={b.paymentStatus} /></td>
                      <td className="px-3 lg:px-4 py-3"><BookingPill status={b.bookingStatus} /></td>
                      <td className="px-3 lg:px-4 py-3 text-[#5A5A5A] font-medium whitespace-nowrap">{INR.format(b.amountPaise / 100)}</td>
                      <td className="px-4 py-4">
                        <div className="flex items-center justify-end">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                size="sm"
                                variant="outline"
                                aria-label={`Actions for ${b.bookingId}`}
                                className="border-[#C5A880]/40 text-[#7A5D2D] hover:bg-[#C5A880]/10 hover:text-[#7A5D2D]"
                              >
                                <Settings className="w-3.5 h-3.5 mr-1.5" /> Actions
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              <DropdownMenuItem
                                onSelect={() => {
                                  // Defer to let Radix finish closing the
                                  // dropdown before mounting the Sheet —
                                  // otherwise the focus trap fights itself.
                                  setTimeout(() => openView(b.bookingId), 0)
                                }}
                                className="cursor-pointer"
                              >
                                <Eye className="w-3.5 h-3.5 mr-2" /> View details
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                disabled={cancelDisabled}
                                onSelect={() => {
                                  setTimeout(() => setCancelling({ bookingId: b.bookingId, reason: '', submitting: false }), 0)
                                }}
                                className="cursor-pointer text-red-600 focus:text-red-600"
                              >
                                <Ban className="w-3.5 h-3.5 mr-2" /> Cancel booking
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* View drawer */}
      <Sheet
        open={!!viewing}
        onOpenChange={(open) => {
          if (!open) {
            viewCtrlRef.current?.abort()
            setViewing(null)
          }
        }}
      >
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Customer Details</SheetTitle>
            <SheetDescription>
              {viewing?.bookingId ? <span className="font-mono text-xs">{viewing.bookingId}</span> : null}
            </SheetDescription>
          </SheetHeader>
          <div className="p-4 space-y-6">
            {viewing?.loading || !viewing?.data ? (
              <div className="text-[#9A9A9A] text-sm"><Loader2 className="w-4 h-4 inline animate-spin mr-2" /> Loading…</div>
            ) : (
              <DetailContent d={viewing.data} />
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Cancel dialog */}
      <Dialog
        open={!!cancelling}
        onOpenChange={(open) => {
          if (!open && !cancelling?.submitting) {
            cancelCtrlRef.current?.abort()
            setCancelling(null)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel this booking?</DialogTitle>
            <DialogDescription>
              The slot will be released and made available for new bookings. Payment history is preserved.
              {cancelling?.bookingId && (
                <span className="block mt-2 font-mono text-xs text-[#7A7A7A]">{cancelling.bookingId}</span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-xs text-[#7A7A7A]">Reason (optional)</label>
            <Textarea
              value={cancelling?.reason ?? ''}
              onChange={(e) => setCancelling((c) => c ? { ...c, reason: e.target.value } : c)}
              placeholder="e.g. Customer requested over WhatsApp"
              maxLength={500}
              rows={3}
            />
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setCancelling(null)}
              disabled={cancelling?.submitting}
            >
              Keep booking
            </Button>
            <Button
              variant="destructive"
              onClick={submitCancel}
              disabled={cancelling?.submitting}
            >
              {cancelling?.submitting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              Cancel booking
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function DetailContent({ d }: { d: BookingDetail }) {
  return (
    <>
      <Section title="Booking">
        <Row label="Booking ID"><span className="font-mono text-xs">{d.bookingId}</span></Row>
        <Row label="Service">{d.service}</Row>
        <Row label="Date">{d.date}</Row>
        <Row label="Slot">{d.timeSlot}</Row>
        <Row label="Amount">{INR.format(d.amountPaise / 100)}</Row>
        <Row label="Payment"><PaymentPill status={d.paymentStatus} /></Row>
        <Row label="Booking status"><BookingPill status={d.bookingStatus} /></Row>
        {d.cancelledAt && <Row label="Cancelled at">{formatTs(d.cancelledAt)}</Row>}
        {d.cancellationReason && <Row label="Reason">{d.cancellationReason}</Row>}
      </Section>

      <Section title="Customer">
        <Row label="Name">{d.customer?.name ?? '—'}</Row>
        <Row label="Phone"><span className="font-mono text-xs">{d.customer?.phone ?? '—'}</span></Row>
        <Row label="Email">{d.customer?.email ?? '—'}</Row>
      </Section>

      <Section title="Personal details">
        {d.detailsError ? (
          <p className="text-xs text-red-600">
            Could not decrypt this booking's personal details. The encryption key may have been rotated.
          </p>
        ) : d.details ? (
          <>
            <Row label="Date of birth">{d.details.dob ?? '—'}</Row>
            <Row label="Time of birth">{d.details.timeOfBirth ?? '—'}</Row>
            <Row label="Place of birth">{d.details.placeOfBirth ?? '—'}</Row>
            <Row label="Gender">{d.details.gender ?? '—'}</Row>
            <Row label="Notes" stack>
              <span className="whitespace-pre-wrap text-[#2D2D2D]">{d.details.notes ?? '—'}</span>
            </Row>
          </>
        ) : (
          <p className="text-xs text-[#9A9A9A]">No personal details were provided with this booking.</p>
        )}
      </Section>

      <Section title="Payment">
        <Row label="Order ID"><span className="font-mono text-xs break-all">{d.razorpayOrderId ?? '—'}</span></Row>
        <Row label="Payment ID"><span className="font-mono text-xs break-all">{d.razorpayPaymentId ?? '—'}</span></Row>
        <Row label="Paid at">{d.paidAt ? formatTs(d.paidAt) : '—'}</Row>
        <Row label="Created at">{formatTs(d.createdAt)}</Row>
      </Section>
    </>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs uppercase tracking-wide text-[#9A9A9A] font-medium">{title}</h3>
      <dl className="space-y-2">{children}</dl>
    </section>
  )
}

function Row({ label, children, stack }: { label: string; children: React.ReactNode; stack?: boolean }) {
  return (
    <div className={stack ? 'flex flex-col gap-1' : 'flex items-start justify-between gap-3'}>
      <dt className="text-xs text-[#7A7A7A] shrink-0">{label}</dt>
      <dd className="text-sm text-[#2D2D2D] text-right break-words">{children}</dd>
    </div>
  )
}

function formatTs(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
  } catch { return iso }
}

function PaymentPill({ status }: { status: Booking['paymentStatus'] }) {
  const cls =
    status === 'paid' ? 'bg-green-100 text-green-700' :
    status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
    status === 'expired' ? 'bg-slate-100 text-slate-600' :
    status === 'cancelled' ? 'bg-slate-100 text-slate-600' :
    'bg-red-100 text-red-700'
  return <span className={`px-2.5 py-1 rounded-full text-xs font-medium capitalize ${cls}`}>{status}</span>
}

function BookingPill({ status }: { status: Booking['bookingStatus'] }) {
  if (!status) {
    // Defensive: row is in an unknown state — most likely a legacy row from
    // before the booking_status migration. Don't pretend we know.
    return <span className="text-xs text-[#9A9A9A]">—</span>
  }
  const cls =
    status === 'pending'   ? 'bg-amber-100 text-amber-700' :
    status === 'active'    ? 'bg-emerald-100 text-emerald-700' :
    status === 'completed' ? 'bg-sky-100 text-sky-700' :
    /* cancelled */          'bg-slate-200 text-slate-700'
  return <span className={`px-2.5 py-1 rounded-full text-xs font-medium capitalize ${cls}`}>{status}</span>
}
