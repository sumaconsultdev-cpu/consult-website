import { NextRequest } from 'next/server'
import { publicSlotsFor } from '@/lib/booking/slots'
import { ok, fail, safe, callerIp } from '@/lib/http'
import { limit } from '@/lib/rate-limit'
import { AvailabilityQuerySchema } from '@/lib/booking/validation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = safe(async (req: NextRequest) => {
  const ip = callerIp(req.headers)
  const r = await limit('public', ip)
  if (!r.ok) return fail(429, 'rate_limited', 'Too many requests. Please slow down.')

  const url = new URL(req.url)
  const parsed = AvailabilityQuerySchema.safeParse({ date: url.searchParams.get('date') ?? '' })
  if (!parsed.success) return fail(400, 'invalid_input', 'A valid date is required.')

  const { slots, error } = await publicSlotsFor(parsed.data.date)
  if (error) return ok({ slots: [], reason: error })
  return ok({ slots })
})
