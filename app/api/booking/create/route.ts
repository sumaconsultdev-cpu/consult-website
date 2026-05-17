import { NextRequest } from 'next/server'
import { ok, fail, safe, callerIp } from '@/lib/http'
import { limit } from '@/lib/rate-limit'
import { db } from '@/lib/supabase/server'
import { BookingCreateSchema } from '@/lib/booking/validation'
import { HOLD_MINUTES, validateSlotForBooking } from '@/lib/booking/slots'
import { newBookingId } from '@/lib/ids'
import { paymentProvider } from '@/lib/payment'
import { encryptJson } from '@/lib/auth/crypto'
import { putRetryPayload } from '@/lib/booking/retry-cache'
import { log } from '@/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Create a pending booking + Razorpay order.
 *
 * Guarantees:
 *  - Server pins the amount from `services.price_paise` (cannot underpay).
 *  - The unique partial index on (date, time_slot) where status in (pending,paid)
 *    is the final defence against races. We try insert + catch unique-violation.
 *  - One pending booking per phone enforced via a pre-check (defensive; admin
 *    can override by cancelling the stale row from dashboard).
 *
 * Returns the Razorpay order envelope the client needs to invoke checkout.
 */
export const POST = safe(async (req: NextRequest) => {
  const ip = callerIp(req.headers)
  const r = await limit('booking', ip)
  if (!r.ok) return fail(429, 'rate_limited', 'Too many requests. Please try again in a few minutes.')

  let body: unknown
  try { body = await req.json() } catch { return fail(400, 'bad_json', 'Invalid request body.') }
  const parsed = BookingCreateSchema.safeParse(body)
  if (!parsed.success) {
    return fail(400, 'validation_failed', 'Please check the form and try again.')
  }
  const input = parsed.data

  // Pin service + price server-side.
  const { data: service, error: svcErr } = await db()
    .from('services')
    .select('id,name,price_paise,active')
    .eq('slug', input.serviceSlug)
    .maybeSingle()
  if (svcErr) return fail(500, 'db_error', 'Could not load service.')
  if (!service || !service.active) return fail(404, 'service_not_found', 'That service is no longer available.')

  // Upsert customer by phone. Only non-sensitive identity fields here —
  // sensitive PII (DOB, time/place of birth, gender, notes) is encrypted
  // per-booking into bookings.encrypted_payload below.
  const { data: customer, error: custErr } = await db()
    .from('customers')
    .upsert(
      {
        full_name: input.fullName,
        phone: input.phone,
        email: input.email ?? null,
      },
      { onConflict: 'phone' }
    )
    .select('id,full_name,email,phone')
    .single()
  if (custErr || !customer) {
    log.warn('booking.customer.upsert.failed', { code: custErr?.code })
    return fail(500, 'db_error', 'Could not save your details.')
  }

  // One in-flight pending per phone — fail fast and surface the existing
  // booking_id so the client can deep-link to /booking/failed?id=<id> for
  // retry. Runs BEFORE the slot check so a customer revisiting their own
  // pending slot gets the retry path rather than a misleading "slot_taken".
  const { data: existing } = await db()
    .from('bookings')
    .select('booking_id')
    .eq('customer_id', customer.id)
    .eq('booking_status', 'pending')
    .limit(1)
    .maybeSingle()
  if (existing) {
    return fail(409, 'pending_exists', `You already have a booking awaiting payment (${existing.booking_id}). Please complete it or wait for it to expire.`)
  }

  // Slot eligibility check (lead time / horizon / already-taken). The
  // partial UNIQUE index is the final defence; this just produces a nicer
  // error message before we attempt to insert.
  const slotErr = await validateSlotForBooking(input.date, input.timeSlot)
  if (slotErr) {
    return fail(409, slotErr, slotErrMessage(slotErr))
  }

  // Encrypt sensitive PII for this specific booking. Decryption key is
  // HKDF-derived from APP_SECRET with purpose='booking-pii' — only the
  // server can read this back.
  const encryptedPayload = encryptJson({
    dob: input.dateOfBirth ?? null,
    timeOfBirth: input.timeOfBirth ?? null,
    placeOfBirth: input.placeOfBirth ?? null,
    gender: input.gender ?? null,
    notes: input.notes ?? null,
  })

  // Generate booking_id with up to 3 retries on (very unlikely) collision.
  let bookingId = ''
  let inserted: any = null
  for (let attempt = 0; attempt < 3 && !inserted; attempt++) {
    bookingId = newBookingId()
    const holdUntil = new Date(Date.now() + HOLD_MINUTES * 60_000).toISOString()
    // booking_status='pending' is the explicit initial state. The partial
    // UNIQUE index on (date, time_slot) WHERE booking_status IN
    // ('pending','active') holds the slot for this row. /verify and the
    // webhook transition booking_status to 'active' on payment success; the
    // cron RPC transitions it to 'cancelled' if the 10-minute hold lapses.
    const { data, error } = await db().from('bookings').insert({
      booking_id: bookingId,
      customer_id: customer.id,
      service_id: service.id,
      service_name_snapshot: service.name,
      amount_paise: service.price_paise,
      date: input.date,
      time_slot: input.timeSlot,
      payment_status: 'pending',
      booking_status: 'pending',
      hold_expires_at: holdUntil,
      encrypted_payload: encryptedPayload,
    }).select('id,booking_id').single()
    if (!error) { inserted = data; break }
    // 23505 = unique violation. If it's the slot constraint → race lost.
    // If it's the booking_id → retry.
    if (error.code === '23505') {
      if ((error.message ?? '').includes('bookings_active_slot_uniq') ||
          (error.details ?? '').includes('bookings_active_slot_uniq')) {
        return fail(409, 'slot_taken', 'That time was just booked by someone else. Please pick another.')
      }
      // unique on booking_id — retry
      continue
    }
    log.error('booking.insert.failed', { code: error.code, msg: error.message })
    return fail(500, 'db_error', 'Could not create your booking.')
  }
  if (!inserted) return fail(500, 'db_error', 'Could not create your booking. Please try again.')

  // Create payment order.
  const provider = paymentProvider()
  const order = await provider.createOrder({
    amountPaise: service.price_paise,
    currency: 'INR',
    receipt: bookingId,
    notes: { booking_id: bookingId, customer_phone: customer.phone },
  })

  // Stamp order id on the booking row.
  await db().from('bookings')
    .update({ razorpay_order_id: order.orderId })
    .eq('id', inserted.id)

  // Cache the minimal "re-open checkout" payload in Redis for the duration
  // of the hold. This lets /booking/failed offer a Try-Again button that
  // reopens the same Razorpay order without re-entering the form. PII is
  // deliberately omitted — Razorpay already has it via order notes.
  await putRetryPayload({
    bookingId,
    amountPaise: service.price_paise,
    currency: 'INR',
    serviceName: service.name,
    date: input.date,
    timeSlot: input.timeSlot,
    holdMinutes: HOLD_MINUTES,
    orderId: order.orderId,
    keyId: order.keyId,
    driver: order.driver,
  })

  log.info('booking.created', { bookingId, slot: `${input.date} ${input.timeSlot}` })

  return ok({
    booking: {
      bookingId,
      amountPaise: service.price_paise,
      currency: 'INR',
      serviceName: service.name,
      date: input.date,
      timeSlot: input.timeSlot,
      holdMinutes: HOLD_MINUTES,
    },
    payment: {
      orderId: order.orderId,
      keyId: order.keyId,
      driver: order.driver,
    },
    customer: {
      name: customer.full_name,
      phone: customer.phone,
      email: customer.email,
    },
  })
})

function slotErrMessage(code: string): string {
  switch (code) {
    case 'past_date':       return 'That date has already passed.'
    case 'beyond_horizon':  return 'Bookings for that date are not yet open.'
    case 'too_soon':        return 'Please book at least 24 hours in advance.'
    case 'slot_not_offered':return 'That time is not available for booking.'
    case 'slot_taken':      return 'That time has just been booked. Please pick another.'
    default:                return 'That time is no longer available.'
  }
}
