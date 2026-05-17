import { NextRequest } from 'next/server'
import { ok, fail, safe, callerIp } from '@/lib/http'
import { requireSession, UnauthorizedError } from '@/lib/auth/session'
import { db } from '@/lib/supabase/server'
import { decryptJson } from '@/lib/auth/crypto'
import { deriveBookingStatus } from '@/lib/booking/status'
import { log } from '@/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type DetailsShape = {
  dob: string | null
  timeOfBirth: string | null
  placeOfBirth: string | null
  gender: string | null
  notes: string | null
}

/**
 * Admin booking-detail endpoint.
 *
 *   GET /api/admin/bookings/:id
 *     where :id is the SC-XXXXXXXX booking id shown to the admin.
 *
 * Returns the booking row plus the decrypted sensitive PII bundle. The
 * encrypted blob itself is NEVER returned to the browser. If decryption
 * fails (e.g. APP_SECRET rotated since the booking was created), we surface
 * `detailsError: 'decrypt_failed'` so the UI can show a graceful message
 * instead of guessing at empty fields.
 *
 * Legacy fallback: pre-migration bookings have no encrypted_payload. In that
 * case we read the deprecated plaintext columns on `customers` so the
 * historical view is preserved. New bookings never populate those columns.
 */
export const GET = safe(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  try { await requireSession() } catch (e) {
    if (e instanceof UnauthorizedError) return fail(401, 'unauthorized', 'Not authenticated.')
    throw e
  }

  const { id: bookingId } = await ctx.params
  if (!/^SC-[A-Z0-9]{8}$/.test(bookingId)) {
    return fail(400, 'invalid_input', 'Invalid booking id.')
  }

  const { data, error } = await db()
    .from('bookings')
    .select(`
      id, booking_id, date, time_slot,
      payment_status, booking_status, amount_paise,
      service_name_snapshot, encrypted_payload, cancellation_reason,
      razorpay_order_id, razorpay_payment_id,
      created_at, paid_at, cancelled_at,
      customer:customers (full_name, phone, email,
                          date_of_birth, time_of_birth, place_of_birth, gender, notes)
    `)
    .eq('booking_id', bookingId)
    .maybeSingle()

  if (error) {
    log.error('admin.booking.detail.db', { code: error.code })
    return fail(500, 'db_error', 'Could not load booking.')
  }
  if (!data) return fail(404, 'not_found', 'Booking not found.')

  // Decrypt the per-booking PII payload. On failure, fall back to plaintext
  // legacy columns; if both are absent, return nulls.
  let details: DetailsShape | null = null
  let detailsError: string | undefined
  const customer: any = data.customer ?? {}

  if (data.encrypted_payload) {
    try {
      const dec = decryptJson<Partial<DetailsShape>>(data.encrypted_payload)
      details = {
        dob: dec.dob ?? null,
        timeOfBirth: dec.timeOfBirth ?? null,
        placeOfBirth: dec.placeOfBirth ?? null,
        gender: dec.gender ?? null,
        notes: dec.notes ?? null,
      }
    } catch (e: any) {
      log.warn('admin.booking.detail.decrypt_failed', { bookingId, msg: e?.message })
      detailsError = 'decrypt_failed'
    }
  } else if (customer && (customer.date_of_birth || customer.time_of_birth || customer.place_of_birth || customer.notes || customer.gender)) {
    // Legacy fallback for pre-encryption bookings.
    details = {
      dob: customer.date_of_birth ?? null,
      timeOfBirth: customer.time_of_birth ?? null,
      placeOfBirth: customer.place_of_birth ?? null,
      gender: customer.gender ?? null,
      notes: customer.notes ?? null,
    }
  }

  // Audit the access — viewing PII is auditable per spec.
  await db().from('audit_log').insert({
    actor: 'admin',
    action: 'booking.view.details',
    target: bookingId,
    metadata: { source: details ? (data.encrypted_payload ? 'encrypted' : 'legacy') : 'none' },
    ip: callerIp(req.headers),
  })

  return ok({
    booking: {
      id: data.id,
      bookingId: data.booking_id,
      date: data.date,
      timeSlot: (data.time_slot as string).slice(0, 5),
      paymentStatus: data.payment_status,
      bookingStatus: deriveBookingStatus(data.booking_status, data.date, data.time_slot as string),
      amountPaise: data.amount_paise,
      service: data.service_name_snapshot,
      createdAt: data.created_at,
      paidAt: data.paid_at,
      cancelledAt: data.cancelled_at,
      cancellationReason: data.cancellation_reason ?? null,
      razorpayOrderId: data.razorpay_order_id ?? null,
      razorpayPaymentId: data.razorpay_payment_id ?? null,
      customer: customer ? {
        name: customer.full_name ?? null,
        phone: customer.phone ?? null,
        email: customer.email ?? null,
      } : null,
      details,
      ...(detailsError ? { detailsError } : {}),
    },
  })
})
