import { NextRequest } from 'next/server'
import { ok, fail, safe, callerIp } from '@/lib/http'
import { requireSession, UnauthorizedError } from '@/lib/auth/session'
import { assertCsrf, CsrfError } from '@/lib/csrf'
import { limit } from '@/lib/rate-limit'
import { db } from '@/lib/supabase/server'
import { BookingCancelSchema } from '@/lib/booking/validation'
import { dropRetryPayload } from '@/lib/booking/retry-cache'
import { isSlotInPast } from '@/lib/time'
import { log } from '@/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Admin booking cancel.
 *
 *   POST /api/admin/bookings/:id/cancel
 *     body: { reason?: string }
 *
 * Sets booking_status='cancelled' and stamps cancelled_at + reason. The
 * partial UNIQUE index on (date, time_slot) excludes cancelled rows so the
 * slot becomes immediately bookable again. payment_status is preserved as-is
 * — a cancelled 'paid' booking still has 'paid' so the audit trail of the
 * money is intact and a refund flow (separate) can act on it later.
 *
 * Idempotent: a second cancel of the same booking returns 200 with a
 * no-op flag instead of erroring.
 */
export const POST = safe(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  try { await requireSession() } catch (e) {
    if (e instanceof UnauthorizedError) return fail(401, 'unauthorized', 'Not authenticated.')
    throw e
  }
  try { await assertCsrf(req.headers) } catch (e) {
    if (e instanceof CsrfError) return fail(403, 'csrf', 'Invalid CSRF token.')
    throw e
  }
  const rl = await limit('admin-action', callerIp(req.headers))
  if (!rl.ok) return fail(429, 'rate_limited', 'Slow down.')

  const { id: bookingId } = await ctx.params
  if (!/^SC-[A-Z0-9]{8}$/.test(bookingId)) {
    return fail(400, 'invalid_input', 'Invalid booking id.')
  }

  // Body is optional — reason may be empty. Tolerate empty/no body.
  let body: unknown = {}
  try {
    const text = await req.text()
    if (text.trim().length > 0) body = JSON.parse(text)
  } catch { return fail(400, 'bad_json', 'Invalid request body.') }
  const parsed = BookingCancelSchema.safeParse(body)
  if (!parsed.success) return fail(400, 'validation_failed', 'Invalid input.')
  const reason = parsed.data.reason ?? null

  // Read current state. Need booking_status to decide idempotent behaviour.
  const { data: existing, error: readErr } = await db()
    .from('bookings')
    .select('id, booking_id, booking_status, payment_status, date, time_slot')
    .eq('booking_id', bookingId)
    .maybeSingle()
  if (readErr) {
    log.error('admin.booking.cancel.read', { code: readErr.code })
    return fail(500, 'db_error', 'Could not read booking.')
  }
  if (!existing) return fail(404, 'not_found', 'Booking not found.')

  if (existing.booking_status === 'cancelled') {
    return ok({ bookingId, status: 'cancelled', noop: true })
  }
  // Completed bookings (slot already elapsed) cannot be cancelled — the
  // consultation either happened or didn't, and either way it's no longer
  // a "cancel" semantically.
  if (existing.booking_status === 'completed' ||
      (existing.booking_status === 'active' && isSlotInPast(existing.date, (existing.time_slot ?? '').slice(0, 5)))) {
    return fail(409, 'already_completed', 'This booking has already taken place and cannot be cancelled.')
  }

  // Optimistic update — only transition rows whose booking_status is still
  // 'pending' (payment in flight) or 'active' (paid + future slot). A
  // concurrent cancel races to the same value, so whichever loses the race
  // becomes a no-op (handled below).
  const now = new Date().toISOString()
  const { data: updated, error: updErr } = await db()
    .from('bookings')
    .update({
      booking_status: 'cancelled',
      cancelled_at: now,
      cancellation_reason: reason,
      hold_expires_at: null,
    })
    .eq('id', existing.id)
    .in('booking_status', ['pending', 'active'])
    .select('id')
    .maybeSingle()
  if (updErr) {
    log.error('admin.booking.cancel.update', { code: updErr.code })
    return fail(500, 'db_error', 'Could not cancel booking.')
  }
  if (!updated) {
    // Lost the race — another request already cancelled it. Treat as no-op.
    return ok({ bookingId, status: 'cancelled', noop: true })
  }

  // Drop the retry cache if any — a cancelled booking should not be
  // resumable. Fire-and-forget; cache miss is harmless.
  void dropRetryPayload(bookingId)

  await db().from('audit_log').insert({
    actor: 'admin',
    action: 'booking.cancel',
    target: bookingId,
    metadata: {
      reason,
      previous_payment_status: existing.payment_status,
      date: existing.date,
      time_slot: existing.time_slot,
    },
    ip: callerIp(req.headers),
  })

  log.info('admin.booking.cancelled', { bookingId, paymentStatus: existing.payment_status })

  return ok({ bookingId, status: 'cancelled', noop: false })
})
