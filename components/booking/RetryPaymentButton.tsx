'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { CreditCard, Loader2, FlaskConical } from 'lucide-react'
import { toast } from 'sonner'

/**
 * Drops the customer back into a Razorpay (or mock) checkout for an
 * existing pending booking. Fetches /api/booking/retry to obtain the
 * order id + amount + driver, then opens the appropriate UI.
 *
 * Server-side trust model:
 *   - The retry endpoint only returns a payload for bookings that are
 *     genuinely pending and within their 10-minute hold; everything else
 *     comes back as 4xx and we surface the message verbatim.
 *   - We never trust the client for amount or order id; both are pulled
 *     from the booking row server-side.
 */
type RetryResp = {
  ok: true
  booking: {
    bookingId: string
    amountPaise: number
    currency: 'INR'
    serviceName: string
    date: string
    timeSlot: string
    holdMinutes: number
  }
  payment: {
    orderId: string
    keyId: string
    driver: 'mock' | 'razorpay'
  }
}

const INR = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })

function loadRazorpayScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') return reject(new Error('SSR'))
    const w = window as any
    if (w.Razorpay) return resolve()
    const s = document.createElement('script')
    s.src = 'https://checkout.razorpay.com/v1/checkout.js'
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('script_load_failed'))
    document.body.appendChild(s)
  })
}

export function RetryPaymentButton({ bookingId }: { bookingId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [mockCheckout, setMockCheckout] = useState<{ data: RetryResp; busy: boolean } | null>(null)

  async function verifyAndRedirect(p: { bookingId: string; orderId: string; paymentId: string; signature: string }) {
    const r = await fetch('/api/booking/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        bookingId: p.bookingId,
        razorpayOrderId: p.orderId,
        razorpayPaymentId: p.paymentId,
        razorpaySignature: p.signature,
      }),
    })
    const j = await r.json()
    if (r.ok && j.ok && j.status === 'paid') {
      router.push(`/booking/success?id=${encodeURIComponent(p.bookingId)}`)
    } else {
      toast.error(j?.error?.message ?? 'Payment verification failed.')
    }
  }

  async function onRetry() {
    if (busy) return
    setBusy(true)
    try {
      const r = await fetch(`/api/booking/retry?id=${encodeURIComponent(bookingId)}`)
      const data = await r.json() as RetryResp | { ok: false; error: { code: string; message: string } }
      if (!r.ok || !('ok' in data) || !data.ok) {
        const code = (data as any)?.error?.code
        const message = (data as any)?.error?.message ?? 'Could not retry payment.'
        if (code === 'already_paid') {
          router.push(`/booking/success?id=${encodeURIComponent(bookingId)}`)
          return
        }
        toast.error(message)
        return
      }
      if (data.payment.driver === 'razorpay') {
        await openRazorpay(data)
      } else {
        setMockCheckout({ data, busy: false })
      }
    } catch {
      toast.error('Network error. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  async function openRazorpay(data: RetryResp) {
    await loadRazorpayScript()
    const w = window as any
    if (!w.Razorpay) { toast.error('Could not load payment SDK.'); return }
    const rzp = new w.Razorpay({
      key: data.payment.keyId,
      amount: data.booking.amountPaise,
      currency: data.booking.currency,
      name: 'Suma Consultation',
      description: data.booking.serviceName,
      order_id: data.payment.orderId,
      notes: { booking_id: data.booking.bookingId },
      handler: async (response: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => {
        await verifyAndRedirect({
          bookingId: data.booking.bookingId,
          orderId: response.razorpay_order_id,
          paymentId: response.razorpay_payment_id,
          signature: response.razorpay_signature,
        })
      },
      modal: {
        ondismiss: () => toast.info('Checkout closed — your booking is still held for the remaining hold window.'),
      },
      theme: { color: '#8E7CC3' },
    })
    rzp.open()
  }

  async function completeMockCheckout(outcome: 'success' | 'fail') {
    if (!mockCheckout) return
    const { data } = mockCheckout
    setMockCheckout({ data, busy: true })
    try {
      const r = await fetch('/api/dev/mock-pay', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ orderId: data.payment.orderId, outcome }),
      })
      const m = await r.json()
      if (!r.ok || !m.ok) {
        toast.error(m?.error?.message ?? 'Mock checkout failed.')
        setMockCheckout({ data, busy: false })
        return
      }
      if (m.failed) {
        toast.error('Payment marked as failed.')
        setMockCheckout(null)
        router.refresh()
        return
      }
      await verifyAndRedirect({
        bookingId: data.booking.bookingId,
        orderId: data.payment.orderId,
        paymentId: m.paymentId,
        signature: m.signature,
      })
    } catch {
      toast.error('Network error.')
      setMockCheckout({ data, busy: false })
    }
  }

  return (
    <>
      <Button
        size="lg"
        className="w-full h-14"
        onClick={onRetry}
        disabled={busy}
        aria-label="Retry payment"
      >
        {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CreditCard className="w-4 h-4 mr-2" />}
        {busy ? 'Opening checkout…' : 'Retry payment'}
      </Button>

      {/* Mock-mode checkout dialog. Real Razorpay opens its own iframe. */}
      <Dialog open={!!mockCheckout} onOpenChange={(open) => { if (!open && !mockCheckout?.busy) setMockCheckout(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FlaskConical className="w-4 h-4 text-[#8E7CC3]" /> Mock checkout
            </DialogTitle>
            <DialogDescription>
              Payments are running in <strong>mock mode</strong>. Choose how this retry should resolve.
            </DialogDescription>
          </DialogHeader>
          <div className="text-sm text-[#4A4A4A]">
            Booking <span className="font-mono text-xs">{mockCheckout?.data.booking.bookingId}</span>{' · '}
            {mockCheckout ? INR.format(mockCheckout.data.booking.amountPaise / 100) : ''}
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => setMockCheckout(null)}
              disabled={mockCheckout?.busy}
            >
              Close
            </Button>
            <Button
              variant="outline"
              className="w-full sm:w-auto border-red-300 text-red-700 hover:bg-red-50 hover:text-red-700"
              onClick={() => completeMockCheckout('fail')}
              disabled={mockCheckout?.busy}
            >
              Simulate failure
            </Button>
            <Button
              className="w-full sm:w-auto"
              onClick={() => completeMockCheckout('success')}
              disabled={mockCheckout?.busy}
            >
              {mockCheckout?.busy ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              Pay (success)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
