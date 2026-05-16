import { NextRequest } from 'next/server'
import { ok, fail, safe, callerIp } from '@/lib/http'
import { limit } from '@/lib/rate-limit'
import { db } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Public service catalog. Inactive services are filtered out. Snapshot data
 * (name, price, duration) is what the UI shows for booking — the booking
 * route re-fetches by slug to pin the price server-side, so a tampered client
 * cannot underpay.
 */
export const GET = safe(async (req: NextRequest) => {
  const r = await limit('public', callerIp(req.headers))
  if (!r.ok) return fail(429, 'rate_limited', 'Too many requests. Please slow down.')

  const { data, error } = await db()
    .from('services')
    .select('slug,name,description,price_paise,duration_minutes,display_order')
    .eq('active', true)
    .order('display_order')

  if (error) return fail(500, 'db_error', 'Could not load services.')
  return ok({
    services: (data ?? []).map((s) => ({
      slug: s.slug,
      name: s.name,
      description: s.description,
      pricePaise: s.price_paise,
      durationMinutes: s.duration_minutes,
    })),
  })
})
