import { NextRequest } from 'next/server'
import { ok, fail, safe, callerIp } from '@/lib/http'
import { requireSession, UnauthorizedError } from '@/lib/auth/session'
import { assertCsrf, CsrfError } from '@/lib/csrf'
import { limit } from '@/lib/rate-limit'
import { db } from '@/lib/supabase/server'
import { ServiceUpsertSchema } from '@/lib/booking/validation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = safe(async () => {
  try { await requireSession() } catch (e) { if (e instanceof UnauthorizedError) return fail(401, 'unauthorized', 'Not authenticated.'); throw e }
  const { data, error } = await db().from('services').select('*').order('display_order')
  if (error) return fail(500, 'db_error', 'Could not load services.')
  return ok({ services: data ?? [] })
})

export const PUT = safe(async (req: NextRequest) => {
  try { await requireSession() } catch (e) { if (e instanceof UnauthorizedError) return fail(401, 'unauthorized', 'Not authenticated.'); throw e }
  try { await assertCsrf(req.headers) } catch (e) { if (e instanceof CsrfError) return fail(403, 'csrf', 'Invalid CSRF token.'); throw e }
  const rl = await limit('admin-action', callerIp(req.headers))
  if (!rl.ok) return fail(429, 'rate_limited', 'Slow down.')

  let body: unknown
  try { body = await req.json() } catch { return fail(400, 'bad_json', 'Invalid request.') }
  const parsed = ServiceUpsertSchema.safeParse(body)
  if (!parsed.success) return fail(400, 'validation_failed', 'Invalid payload.')

  const row = {
    ...(parsed.data.id ? { id: parsed.data.id } : {}),
    slug: parsed.data.slug,
    name: parsed.data.name,
    description: parsed.data.description,
    price_paise: parsed.data.pricePaise,
    duration_minutes: parsed.data.durationMinutes,
    active: parsed.data.active,
    display_order: parsed.data.displayOrder,
  }
  const { data, error } = await db().from('services').upsert(row, { onConflict: 'slug' }).select('*').single()
  if (error) return fail(500, 'db_error', 'Could not save service.')
  await db().from('audit_log').insert({ actor: 'admin', action: 'service.upsert', target: data.slug })
  return ok({ service: data })
})
