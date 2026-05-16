import 'server-only'
import { db } from '@/lib/supabase/server'

/**
 * Database-backed login throttle with exponential backoff.
 *
 * Why DB, not just Upstash:
 *   - the throttle must survive an Upstash outage (security > availability here)
 *   - the audit log of attempts is useful evidence on its own
 *
 * Upstash rate-limit (lib/rate-limit.ts) sits in front as the fast path; this
 * is the durable second layer.
 *
 * Backoff schedule per identifier (lookback = 1h):
 *   <5 failures   → no lockout
 *   5–7 failures  → 15-minute lockout from latest failure
 *   8–11          → 1 hour
 *   12+           → 6 hours
 */

const LOOKBACK_MIN = 60

type ThrottleState = { allowed: boolean; remainingMs: number; failures: number }

export async function checkThrottle(identifier: string): Promise<ThrottleState> {
  const sinceIso = new Date(Date.now() - LOOKBACK_MIN * 60_000).toISOString()
  const { data, error } = await db()
    .from('admin_login_attempts')
    .select('succeeded, at')
    .eq('identifier', identifier)
    .gte('at', sinceIso)
    .order('at', { ascending: false })
    .limit(20)

  if (error) {
    // Fail closed on DB errors — block rather than allow.
    return { allowed: false, remainingMs: 60_000, failures: 0 }
  }

  // Count consecutive failures since the last success (or all if no success).
  let failures = 0
  let latestFailureAt: number | null = null
  for (const row of data ?? []) {
    if (row.succeeded) break
    failures++
    const t = new Date(row.at).getTime()
    if (latestFailureAt === null || t > latestFailureAt) latestFailureAt = t
  }

  if (failures < 5 || latestFailureAt === null) {
    return { allowed: true, remainingMs: 0, failures }
  }

  const lockoutMs =
    failures >= 12 ? 6 * 60 * 60_000 :
    failures >= 8  ? 60 * 60_000     :
                     15 * 60_000
  const unlockAt = latestFailureAt + lockoutMs
  const remainingMs = unlockAt - Date.now()
  return { allowed: remainingMs <= 0, remainingMs: Math.max(0, remainingMs), failures }
}

export async function recordAttempt(identifier: string, succeeded: boolean): Promise<void> {
  await db().from('admin_login_attempts').insert({ identifier, succeeded })
}
