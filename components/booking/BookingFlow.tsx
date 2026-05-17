'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { loadDraft, saveDraft, clearDraft, draftHasContent, type DraftForm } from './draft-storage'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Calendar, Clock, CreditCard, ChevronRight, Loader2, FlaskConical } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import Link from 'next/link'
import { toast } from 'sonner'

type Service = { slug: string; name: string; description: string; pricePaise: number; durationMinutes: number }
type Slot = { time: string; available: boolean }

type CreateResp = {
  ok: true
  booking: { bookingId: string; amountPaise: number; currency: 'INR'; serviceName: string; date: string; timeSlot: string; holdMinutes: number }
  payment: { orderId: string; keyId: string; driver: 'mock' | 'razorpay' }
  customer: { name: string; phone: string; email: string | null }
}

const INR = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })

const EMPTY_FORM: DraftForm = {
  serviceSlug: '',
  date: '',
  timeSlot: '',
  fullName: '',
  phone: '',
  email: '',
  dateOfBirth: '',
  timeOfBirth: '',
  placeOfBirth: '',
  gender: '',
  notes: '',
}

export function BookingFlow() {
  const router = useRouter()
  const [services, setServices] = useState<Service[] | null>(null)
  const [step, setStep] = useState(1)
  const [form, setForm] = useState<DraftForm>(EMPTY_FORM)
  // Tracks whether we've finished the synchronous sessionStorage restore so
  // we don't auto-save the empty initial state over an existing draft.
  const restoredRef = useRef(false)
  const [resumed, setResumed] = useState(false)
  const [slots, setSlots] = useState<Slot[] | null>(null)
  const [slotErr, setSlotErr] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  // Explicit consent — required before the booking can be submitted. We
  // re-check this in `startPayment` as a defence-in-depth measure, in case
  // the disabled state on the button is bypassed via the browser devtools.
  const [consented, setConsented] = useState(false)
  // Mock-checkout dialog state — populated only when PAYMENT_DRIVER=mock so
  // testers can choose between success/failure/abandon outcomes. In real
  // Razorpay mode this is never opened.
  const [mockCheckout, setMockCheckout] = useState<{ data: CreateResp; busy: boolean } | null>(null)

  // Restore the customer's in-progress booking from sessionStorage so a
  // refresh, redirect to /booking/failed, or a retry doesn't drop their
  // service / slot / personal details. Runs ONCE on mount — strictly before
  // any persist effect — so the empty initial state doesn't overwrite an
  // existing draft.
  useEffect(() => {
    const d = loadDraft()
    if (d) {
      if (d.form) setForm({ ...EMPTY_FORM, ...d.form })
      if (typeof d.step === 'number' && d.step >= 1 && d.step <= 3) setStep(d.step)
      if (draftHasContent(d)) setResumed(true)
    }
    restoredRef.current = true
  }, [])

  // Persist on every meaningful change after restore completes. Consent and
  // submitting state are deliberately NOT persisted: consent must be freshly
  // re-affirmed each session, and "submitting" is request-local.
  useEffect(() => {
    if (!restoredRef.current) return
    saveDraft({ step, form })
  }, [step, form])

  function startOver() {
    clearDraft()
    setForm(EMPTY_FORM)
    setStep(1)
    setConsented(false)
    setSlots(null)
    setSlotErr(null)
    setResumed(false)
    toast.info('Draft cleared. Starting fresh.')
  }

  // Load services on mount.
  useEffect(() => {
    fetch('/api/services').then((r) => r.json()).then((d) => {
      if (d.ok) setServices(d.services)
      else toast.error('Could not load services. Please refresh.')
    }).catch(() => toast.error('Network error loading services.'))
  }, [])

  // Re-fetch slots when date changes.
  useEffect(() => {
    if (!form.date) return
    setSlots(null)
    setSlotErr(null)
    const ctrl = new AbortController()
    fetch(`/api/availability?date=${encodeURIComponent(form.date)}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((d) => {
        if (!d.ok) { setSlotErr('Could not load slots.'); return }
        if (d.reason) {
          const msg = d.reason === 'past_date' ? 'That date has passed.'
            : d.reason === 'beyond_horizon' ? 'Bookings for that date are not yet open.'
            : 'No slots offered.'
          setSlotErr(msg)
          setSlots([])
        } else {
          setSlots(d.slots)
        }
      })
      .catch((e) => { if ((e as any).name !== 'AbortError') setSlotErr('Network error.') })
    return () => ctrl.abort()
  }, [form.date])

  const selectedService = useMemo(
    () => services?.find((s) => s.slug === form.serviceSlug) ?? null,
    [services, form.serviceSlug]
  )

  const minDate = useMemo(() => {
    // Customer must book ≥24h in advance — minimum date is tomorrow in local browser tz
    // (server enforces the actual rule, this just hides obviously-disallowed dates).
    const d = new Date()
    d.setDate(d.getDate() + 1)
    return d.toISOString().slice(0, 10)
  }, [])

  function next() {
    if (step < 3) setStep(step + 1)
  }
  function back() {
    if (step > 1) setStep(step - 1)
  }

  const step1Valid = !!form.serviceSlug
  const step2Valid = !!form.date && !!form.timeSlot
  const step3Valid =
    form.fullName.trim().length >= 1 &&
    /^[+0-9 \-()]+$/.test(form.phone) &&
    form.phone.replace(/[^0-9]/g, '').length >= 10

  async function startPayment(e: React.FormEvent) {
    e.preventDefault()
    if (!step3Valid || submitting) return
    if (!consented) {
      // Defence-in-depth: the button is also disabled until consent is given.
      toast.error('Please confirm the consent checkbox before proceeding.')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/booking/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fullName: form.fullName.trim(),
          phone: form.phone,
          email: form.email.trim() || undefined,
          dateOfBirth: form.dateOfBirth || undefined,
          timeOfBirth: form.timeOfBirth || undefined,
          placeOfBirth: form.placeOfBirth.trim() || undefined,
          gender: form.gender || undefined,
          notes: form.notes.trim() || undefined,
          serviceSlug: form.serviceSlug,
          date: form.date,
          timeSlot: form.timeSlot,
        }),
      })
      const data: CreateResp | { ok: false; error: { code: string; message: string } } = await res.json()
      if (!data.ok) {
        if (data.error.code === 'slot_taken') {
          // Refresh slots and bounce back to step 2.
          setStep(2)
          setSlots(null)
          setForm((f) => ({ ...f, timeSlot: '' }))
          fetch(`/api/availability?date=${encodeURIComponent(form.date)}`)
            .then((r) => r.json()).then((d) => d.ok && setSlots(d.slots))
        }
        if (data.error.code === 'pending_exists') {
          // The customer already has a booking awaiting payment — surface
          // the retry UI for it instead of asking them to wait. The message
          // already embeds the SC-XXXXXXXX id for clarity.
          const m = data.error.message.match(/SC-[A-Z0-9]{8}/)
          if (m) {
            toast.message('You already have a pending booking — resuming it.')
            router.push(`/booking/failed?id=${encodeURIComponent(m[0])}`)
            return
          }
        }
        toast.error(data.error.message)
        return
      }

      // Hand off to checkout.
      if (data.payment.driver === 'razorpay') {
        await openRazorpay(data)
      } else {
        await runMockCheckout(data)
      }
    } catch {
      toast.error('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  async function verifyAndRedirect(input: { bookingId: string; orderId: string; paymentId: string; signature: string }) {
    const r = await fetch('/api/booking/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        bookingId: input.bookingId,
        razorpayOrderId: input.orderId,
        razorpayPaymentId: input.paymentId,
        razorpaySignature: input.signature,
      }),
    })
    const j = await r.json()
    if (r.ok && j.ok && j.status === 'paid') {
      router.push(`/booking/success?id=${encodeURIComponent(input.bookingId)}`)
    } else {
      router.push(`/booking/failed?id=${encodeURIComponent(input.bookingId)}`)
    }
  }

  async function openRazorpay(data: CreateResp) {
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
      prefill: { name: data.customer.name, email: data.customer.email ?? '', contact: data.customer.phone },
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
        ondismiss: () => router.push(`/booking/failed?id=${encodeURIComponent(data.booking.bookingId)}`),
      },
      theme: { color: '#8E7CC3' },
    })
    rzp.open()
  }

  async function runMockCheckout(data: CreateResp) {
    // Mock mode: open a small dialog so the tester can pick the outcome.
    // Real Razorpay never hits this path.
    setMockCheckout({ data, busy: false })
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
      if (!r.ok) { toast.error('Mock checkout unavailable.'); setMockCheckout({ data, busy: false }); return }
      const m = await r.json()
      if (!m.ok) { toast.error('Mock checkout failed.'); setMockCheckout({ data, busy: false }); return }
      if (m.failed) {
        // Server already marked the booking as failed — go straight to the
        // failed page; do NOT call /verify (no valid signature to verify).
        router.push(`/booking/failed?id=${encodeURIComponent(data.booking.bookingId)}`)
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

  function abandonMockCheckout() {
    if (!mockCheckout) return
    const { data } = mockCheckout
    setMockCheckout(null)
    // The booking row stays in `pending` state — the customer can resume
    // payment from /booking/failed (which surfaces the Retry button) for
    // the rest of the 10-minute hold. After that the cron RPC marks the
    // row payment=failed + booking=cancelled.
    router.push(`/booking/failed?id=${encodeURIComponent(data.booking.bookingId)}`)
  }

  return (
    <div className="flex-1 py-12 md:py-24 bg-[#FAF9F6]">
      <div className="container mx-auto px-4 md:px-8 max-w-5xl">
        <div className="text-center mb-12">
          <h1 className="text-3xl md:text-5xl font-serif font-medium text-[#2D2D2D] mb-4">Book Your Session</h1>
          <p className="text-[#7A7A7A] text-lg max-w-2xl mx-auto">
            Choose a service and time that works best for you. Let&apos;s begin your journey to harmony.
          </p>
        </div>

        <div className="flex flex-col lg:flex-row gap-8">
          {/* Main Form */}
          <div className="w-full lg:w-2/3 space-y-6">
            {resumed && (
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-xl border border-[#C5A880]/30 bg-[#C5A880]/5 px-4 py-3 text-sm text-[#5A5A5A]">
                <span>
                  We&apos;ve restored your in-progress booking so you can pick up where you left off.
                </span>
                <button
                  type="button"
                  onClick={startOver}
                  className="underline text-[#7A5D2D] hover:text-[#5A4520] shrink-0"
                >
                  Start over
                </button>
              </div>
            )}
            <div className="flex items-center justify-between mb-8 px-4 relative">
              {[
                { num: 1, label: 'Service' },
                { num: 2, label: 'Time' },
                { num: 3, label: 'Details' },
              ].map((s) => (
                <div key={s.num} className="flex flex-col items-center gap-2 relative z-10">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center font-medium transition-colors ${
                      step >= s.num ? 'bg-[#8E7CC3] text-white' : 'bg-white text-[#9A9A9A] border border-black/10'
                    }`}
                  >
                    {s.num}
                  </div>
                  <span className={`text-sm ${step >= s.num ? 'text-[#2D2D2D] font-medium' : 'text-[#9A9A9A]'}`}>{s.label}</span>
                </div>
              ))}
              <div className="absolute left-12 right-12 top-5 h-0.5 bg-black/5 -z-0 hidden sm:block" />
            </div>

            <Card className="border-none shadow-md">
              <CardContent className="p-6 md:p-10">
                {step === 1 && (
                  <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <h2 className="text-2xl font-serif font-medium text-[#2D2D2D] mb-6">Select a Service</h2>
                    {!services ? (
                      <div className="flex items-center gap-3 text-[#7A7A7A]"><Loader2 className="w-5 h-5 animate-spin" /> Loading services…</div>
                    ) : services.length === 0 ? (
                      <p className="text-[#7A7A7A]">No services are available right now. Please check back later.</p>
                    ) : (
                      <div className="space-y-4">
                        {services.map((s) => (
                          <div
                            key={s.slug}
                            className={`p-6 rounded-2xl border-2 cursor-pointer transition-all ${
                              form.serviceSlug === s.slug
                                ? 'border-[#8E7CC3] bg-[#8E7CC3]/5'
                                : 'border-black/5 hover:border-[#8E7CC3]/30 bg-white'
                            }`}
                            onClick={() => setForm({ ...form, serviceSlug: s.slug })}
                          >
                            <div className="flex justify-between items-center">
                              <div>
                                <h3 className="text-lg font-medium text-[#2D2D2D]">{s.name}</h3>
                                <p className="text-[#7A7A7A] mt-1">{s.durationMinutes} min session</p>
                                {s.description && <p className="text-sm text-[#9A9A9A] mt-2 max-w-xl">{s.description}</p>}
                              </div>
                              <div className="text-xl font-medium text-[#C5A880] whitespace-nowrap">
                                {INR.format(s.pricePaise / 100)}
                                <span className="text-sm font-normal text-[#9A9A9A] ml-1">
                                  {s.durationMinutes === 60 ? '/hr' : `/${s.durationMinutes}min`}
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="mt-8 flex justify-end">
                      <Button onClick={next} disabled={!step1Valid} size="lg">
                        Continue to Time <ChevronRight className="ml-2 w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )}

                {step === 2 && (
                  <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div>
                      <h2 className="text-2xl font-serif font-medium text-[#2D2D2D] mb-6 flex items-center gap-2">
                        <Calendar className="w-6 h-6 text-[#C5A880]" /> Select Date
                      </h2>
                      <Input
                        type="date"
                        value={form.date}
                        min={minDate}
                        onChange={(e) => setForm({ ...form, date: e.target.value, timeSlot: '' })}
                        className="w-full md:w-1/2 h-14 text-lg bg-white"
                      />
                      <p className="text-sm text-[#9A9A9A] mt-2">Bookings open at least 24 hours in advance.</p>
                    </div>

                    {form.date && (
                      <div className="animate-in fade-in duration-300">
                        <h2 className="text-2xl font-serif font-medium text-[#2D2D2D] mb-6 flex items-center gap-2 mt-8">
                          <Clock className="w-6 h-6 text-[#C5A880]" /> Select Time
                        </h2>

                        {slotErr ? (
                          <p className="text-[#9A9A9A]">{slotErr}</p>
                        ) : slots === null ? (
                          <div className="flex items-center gap-3 text-[#7A7A7A]">
                            <Loader2 className="w-5 h-5 animate-spin" /> Loading slots…
                          </div>
                        ) : slots.length === 0 ? (
                          <p className="text-[#9A9A9A]">No slots offered on this date.</p>
                        ) : (
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                            {slots.map((slot) => (
                              <button
                                key={slot.time}
                                type="button"
                                disabled={!slot.available}
                                onClick={() => setForm({ ...form, timeSlot: slot.time })}
                                className={`py-3 px-4 rounded-xl border transition-all text-sm font-medium ${
                                  !slot.available
                                    ? 'bg-black/5 border-transparent text-[#9A9A9A] cursor-not-allowed opacity-50'
                                    : form.timeSlot === slot.time
                                    ? 'bg-[#8E7CC3] border-[#8E7CC3] text-white shadow-md transform scale-105'
                                    : 'bg-white border-black/10 text-[#4A4A4A] hover:border-[#8E7CC3]/50 hover:text-[#8E7CC3]'
                                }`}
                              >
                                {formatTime12(slot.time)}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="mt-12 flex justify-between">
                      <Button variant="outline" onClick={back} size="lg">Back</Button>
                      <Button onClick={next} disabled={!step2Valid} size="lg">
                        Continue to Details <ChevronRight className="ml-2 w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )}

                {step === 3 && (
                  <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <h2 className="text-2xl font-serif font-medium text-[#2D2D2D] mb-6">Your Details</h2>
                    <form id="booking-form" onSubmit={startPayment} className="space-y-6">
                      <Field label="Full Name *">
                        <Input value={form.fullName} required maxLength={120} onChange={(e) => setForm({ ...form, fullName: e.target.value })} className="h-14 bg-white" />
                      </Field>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Field label="Phone Number (for WhatsApp) *">
                          <Input value={form.phone} required type="tel" inputMode="tel" placeholder="+91 98765 43210" onChange={(e) => setForm({ ...form, phone: e.target.value })} className="h-14 bg-white" />
                        </Field>
                        <Field label="Email (optional)">
                          <Input value={form.email} type="email" placeholder="you@example.com" onChange={(e) => setForm({ ...form, email: e.target.value })} className="h-14 bg-white" />
                        </Field>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Field label="Date of Birth">
                          <Input value={form.dateOfBirth} type="date" onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })} className="h-14 bg-white" />
                        </Field>
                        <Field label="Time of Birth">
                          <Input value={form.timeOfBirth} type="time" onChange={(e) => setForm({ ...form, timeOfBirth: e.target.value })} className="h-14 bg-white" />
                        </Field>
                        <Field label="Place of Birth">
                          <Input value={form.placeOfBirth} maxLength={200} onChange={(e) => setForm({ ...form, placeOfBirth: e.target.value })} className="h-14 bg-white" />
                        </Field>
                      </div>
                      <p className="text-xs text-[#7A7A7A] -mt-2">
                        Your date, time and place of birth are encrypted before they are saved and only the consultant can view them.
                      </p>
                      <Field label="Gender (optional)">
                        <select
                          value={form.gender}
                          onChange={(e) => setForm({ ...form, gender: e.target.value as any })}
                          className="w-full h-14 rounded-xl border border-black/10 bg-white px-4 text-sm focus:outline-none focus:ring-2 focus:ring-[#8E7CC3]"
                        >
                          <option value="">Prefer not to say</option>
                          <option value="female">Female</option>
                          <option value="male">Male</option>
                          <option value="other">Other</option>
                        </select>
                      </Field>
                      <Field label="What would you like to focus on? (optional)">
                        <textarea
                          value={form.notes}
                          maxLength={2000}
                          onChange={(e) => setForm({ ...form, notes: e.target.value })}
                          className="w-full rounded-xl border border-black/10 bg-white p-4 text-sm focus:outline-none focus:ring-2 focus:ring-[#8E7CC3] resize-none h-32 text-[#4A4A4A]"
                          placeholder="Anything specific you'd like Suma to know in advance?"
                        />
                      </Field>

                      <div className="flex items-start gap-3 p-4 rounded-xl bg-[#FAF9F6] border border-black/5">
                        <Checkbox
                          id="consent"
                          checked={consented}
                          onCheckedChange={(c) => setConsented(c === true)}
                          className="mt-1 shrink-0"
                          aria-describedby="consent-text"
                        />
                        {/*
                          Intentionally NOT a <label htmlFor="consent">. A label
                          re-fires its associated control's click for any click
                          inside it, which means tapping the Privacy Policy link
                          below would silently toggle the checkbox in addition
                          to opening the link. We wire the toggle via a span+role
                          so the link can live alongside the consent copy
                          without any event-bubble interference.
                        */}
                        <div id="consent-text" className="text-sm text-[#4A4A4A] leading-relaxed">
                          <span
                            role="button"
                            tabIndex={-1}
                            onClick={() => setConsented((v) => !v)}
                            className="cursor-pointer select-none"
                          >
                            I consent to Suma Consultation collecting, storing and processing the personal
                            information I have shared above — including my contact details and the date,
                            time and place of birth — for the purpose of providing this consultation.
                            I confirm I have read the{' '}
                          </span>
                          <Link
                            href="/privacy"
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-[#8E7CC3] underline hover:text-[#7A6BB0]"
                          >
                            Privacy Policy
                          </Link>
                          <span
                            role="button"
                            tabIndex={-1}
                            onClick={() => setConsented((v) => !v)}
                            className="cursor-pointer select-none"
                          >
                            .
                          </span>
                        </div>
                      </div>
                    </form>

                    <div className="mt-12 flex flex-col-reverse sm:flex-row justify-between gap-3">
                      <Button variant="outline" onClick={back} size="lg" type="button" className="w-full sm:w-auto">Back</Button>
                      <Button
                        form="booking-form"
                        type="submit"
                        disabled={!step3Valid || submitting || !consented}
                        size="lg"
                        className="w-full sm:w-auto sm:px-8"
                      >
                        {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Securing slot…</> : 'Confirm & Pay'}
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="w-full lg:w-1/3">
            <Card className="border-none shadow-md sticky top-28 bg-white">
              <CardHeader className="bg-[#FAF9F6] rounded-t-3xl border-b border-black/5 pb-6">
                <CardTitle className="text-xl flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-[#C5A880]" /> Booking Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 md:p-8 space-y-6">
                {selectedService ? (
                  <>
                    <div className="space-y-4 pb-6 border-b border-black/5">
                      <Row label="Service" value={selectedService.name} />
                      {form.date && <Row label="Date" value={new Date(form.date).toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' })} />}
                      {form.timeSlot && <Row label="Time" value={formatTime12(form.timeSlot) + ' IST'} />}
                    </div>
                    <div className="flex justify-between items-end pt-2">
                      <span className="text-[#2D2D2D] font-medium text-lg">Total</span>
                      <span className="text-3xl font-serif font-medium text-[#C5A880]">{INR.format(selectedService.pricePaise / 100)}</span>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-8 text-[#9A9A9A]">Select a service to see the summary.</div>
                )}

                <div className="pt-6 bg-[#8E7CC3]/5 -mx-8 -mb-8 p-8 rounded-b-3xl text-sm text-[#7A7A7A] text-center space-y-2">
                  <p>You&apos;ll receive a WhatsApp confirmation immediately after successful payment.</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Mock checkout dialog — only opened when PAYMENT_DRIVER=mock */}
      <Dialog open={!!mockCheckout} onOpenChange={(open) => { if (!open && !mockCheckout?.busy) setMockCheckout(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FlaskConical className="w-4 h-4 text-[#8E7CC3]" /> Mock checkout
            </DialogTitle>
            <DialogDescription>
              Payments are running in <strong>mock mode</strong>. Choose how this booking should resolve so you can see each payment state in the admin dashboard.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm text-[#4A4A4A]">
            <p>
              Booking <span className="font-mono text-xs">{mockCheckout?.data.booking.bookingId}</span> · {' '}
              {mockCheckout ? INR.format(mockCheckout.data.booking.amountPaise / 100) : ''}
            </p>
            <ul className="text-xs text-[#7A7A7A] space-y-1 pl-4 list-disc">
              <li><strong>Pay (success)</strong> — verifies the mock signature → booking marked <code>paid</code>.</li>
              <li><strong>Simulate failure</strong> — server marks the booking <code>failed</code>.</li>
              <li><strong>Dismiss</strong> — booking stays <code>pending</code> for 10 minutes, then auto-expires.</li>
            </ul>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={abandonMockCheckout}
              disabled={mockCheckout?.busy}
            >
              Dismiss
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
    </div>
  )
}

function Field(props: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-[#4A4A4A]">{props.label}</label>
      {props.children}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-[#7A7A7A]">{label}</span>
      <span className="font-medium text-[#2D2D2D] text-right">{value}</span>
    </div>
  )
}

function formatTime12(hhmm: string): string {
  const [h, m] = hhmm.split(':').map((n) => parseInt(n, 10))
  const period = h! >= 12 ? 'PM' : 'AM'
  const hh = ((h! + 11) % 12) + 1
  return `${hh}:${String(m).padStart(2, '0')} ${period}`
}

let _scriptPromise: Promise<void> | null = null
function loadRazorpayScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  if ((window as any).Razorpay) return Promise.resolve()
  if (_scriptPromise) return _scriptPromise
  _scriptPromise = new Promise<void>((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://checkout.razorpay.com/v1/checkout.js'
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('failed to load Razorpay'))
    document.body.appendChild(s)
  })
  return _scriptPromise
}
