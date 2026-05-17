import { NextRequest } from 'next/server'
import { fail, safe, callerIp } from '@/lib/http'
import { requireSession, UnauthorizedError } from '@/lib/auth/session'
import { assertCsrf, CsrfError } from '@/lib/csrf'
import { limit } from '@/lib/rate-limit'
import { db } from '@/lib/supabase/server'
import { buildPasswordZip, type ExportCustomer } from '@/lib/export/encrypt'
import { decryptJson } from '@/lib/auth/crypto'
import { log } from '@/lib/logger'
import { z } from 'zod'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const Schema = z.object({
  passphrase: z.string().min(12).max(256),
})

/**
 * Builds a password-protected ZIP archive containing two human-readable text
 * files: customer_details.txt and bookings.txt. The supplied passphrase is
 * the ZIP password — the admin opens the file with any AES-aware ZIP tool
 * (Keka on macOS, 7-Zip on Windows) and is prompted for the same passphrase.
 *
 * The passphrase is held in memory for the duration of the request only and
 * never persisted. Sensitive PII is decrypted server-side from each
 * booking's encrypted_payload column before being formatted into text — the
 * encrypted blobs themselves never leave the database.
 */
export const POST = safe(async (req: NextRequest) => {
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

  let body: unknown
  try { body = await req.json() } catch { return fail(400, 'bad_json', 'Invalid request.') }
  const parsed = Schema.safeParse(body)
  if (!parsed.success) return fail(400, 'validation_failed', 'Passphrase must be at least 12 characters.')

  const [{ data: customers, error: e1 }, { data: bookings, error: e2 }] = await Promise.all([
    db().from('customers').select('id, full_name, phone, email').order('full_name', { ascending: true }),
    db()
      .from('bookings')
      .select('booking_id, customer_id, date, razorpay_payment_id, encrypted_payload, booking_status, created_at')
      .neq('booking_status', 'cancelled')
      .order('created_at', { ascending: false }),
  ])
  if (e1 || e2) {
    log.error('admin.export.db', { e1: e1?.code, e2: e2?.code })
    return fail(500, 'db_error', 'Could not assemble export.')
  }

  // Group bookings by customer; for the PII bundle, prefer the most recent
  // booking that has a decryptable encrypted_payload.
  const decryptErrors: string[] = []
  const rows: ExportCustomer[] = (customers ?? []).map((c: any) => {
    const bks = (bookings ?? []).filter((b: any) => b.customer_id === c.id)
    let pii: any = null
    for (const b of bks) {
      if (!b.encrypted_payload) continue
      try {
        pii = decryptJson<any>(b.encrypted_payload)
        break
      } catch (e: any) {
        decryptErrors.push(b.booking_id)
        log.warn('admin.export.decrypt_failed', { bookingId: b.booking_id, msg: e?.message })
      }
    }
    // Sort each customer's bookings chronologically (oldest first) inside the export.
    const sortedBks = [...bks].sort((a: any, b: any) => String(a.date).localeCompare(String(b.date)))
    return {
      name: c.full_name,
      phone: c.phone,
      email: c.email ?? null,
      dob: pii?.dob ?? null,
      timeOfBirth: pii?.timeOfBirth ?? null,
      placeOfBirth: pii?.placeOfBirth ?? null,
      gender: pii?.gender ?? null,
      notes: pii?.notes ?? null,
      bookings: sortedBks.map((b: any) => ({
        bookingId: b.booking_id,
        date: b.date,
        paymentId: b.razorpay_payment_id ?? null,
      })),
    }
  })

  const now = new Date()
  const generatedLocal = now.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'long',
    timeStyle: 'short',
  }) + ' IST'

  const archive = await buildPasswordZip(rows, parsed.data.passphrase, generatedLocal)

  await db().from('audit_log').insert({
    actor: 'admin',
    action: 'export.run',
    metadata: {
      customers: rows.length,
      bookings: rows.reduce((a, r) => a + r.bookings.length, 0),
      decrypt_errors: decryptErrors.length,
    },
    ip: callerIp(req.headers),
  })

  const stamp = now.toISOString().replace(/[:T]/g, '-').slice(0, 19)
  const filename = `suma-export-${stamp}.zip`
  return new Response(new Uint8Array(archive), {
    status: 200,
    headers: {
      'content-type': 'application/zip',
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'no-store',
    },
  })
})
