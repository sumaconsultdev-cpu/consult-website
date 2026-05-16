import { NextRequest } from 'next/server'
import { ok, fail, safe } from '@/lib/http'
import { requireSession, UnauthorizedError } from '@/lib/auth/session'
import { db } from '@/lib/supabase/server'
import { addDaysIST, todayIST } from '@/lib/time'
import { z } from 'zod'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const QuerySchema = z.object({
  status: z.enum(['all', 'pending', 'paid', 'expired', 'failed', 'cancelled']).default('all'),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  q: z.string().trim().max(80).optional(),
})

/**
 * Admin booking list. Defaults to last 30 days (per spec). Supports text
 * search across name/phone/booking_id and status filter.
 */
export const GET = safe(async (req: NextRequest) => {
  try { await requireSession() } catch (e) { if (e instanceof UnauthorizedError) return fail(401, 'unauthorized', 'Not authenticated.'); throw e }

  const url = new URL(req.url)
  const parsed = QuerySchema.safeParse({
    status: url.searchParams.get('status') ?? 'all',
    from: url.searchParams.get('from') ?? undefined,
    to: url.searchParams.get('to') ?? undefined,
    q: url.searchParams.get('q') ?? undefined,
  })
  if (!parsed.success) return fail(400, 'validation_failed', 'Invalid filter.')

  const today = todayIST()
  const from = parsed.data.from ?? addDaysIST(today, -30)
  const to = parsed.data.to ?? addDaysIST(today, 90)

  let query = db()
    .from('bookings')
    .select(`
      id, booking_id, date, time_slot, payment_status, amount_paise,
      service_name_snapshot, created_at, paid_at,
      customer:customers (full_name, phone, email)
    `)
    .gte('date', from)
    .lte('date', to)
    .order('date', { ascending: false })
    .order('time_slot', { ascending: false })
    .limit(500)

  if (parsed.data.status !== 'all') query = query.eq('payment_status', parsed.data.status)

  const { data, error } = await query
  if (error) return fail(500, 'db_error', 'Could not load bookings.')

  let rows = data ?? []
  const q = parsed.data.q?.toLowerCase()
  if (q) {
    rows = rows.filter((r: any) => {
      const cust = r.customer
      return (
        r.booking_id.toLowerCase().includes(q) ||
        (cust?.full_name ?? '').toLowerCase().includes(q) ||
        (cust?.phone ?? '').toLowerCase().includes(q) ||
        (cust?.email ?? '').toLowerCase().includes(q)
      )
    })
  }

  return ok({
    bookings: rows.map((r: any) => ({
      id: r.id,
      bookingId: r.booking_id,
      date: r.date,
      timeSlot: (r.time_slot as string).slice(0, 5),
      paymentStatus: r.payment_status,
      amountPaise: r.amount_paise,
      service: r.service_name_snapshot,
      createdAt: r.created_at,
      paidAt: r.paid_at,
      customer: r.customer ? { name: r.customer.full_name, phone: r.customer.phone, email: r.customer.email } : null,
    })),
  })
})
