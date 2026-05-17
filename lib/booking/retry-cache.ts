import 'server-only'
import { Redis } from '@upstash/redis'
import { env } from '@/lib/env'
import { log } from '@/lib/logger'

/**
 * Short-lived Redis cache that lets a customer who closed the checkout window
 * resume payment without re-entering form data. The cache holds only the
 * data needed to re-open the Razorpay (or mock) checkout — never PII.
 *
 * Key:    retry:{booking_id}
 * Value:  JSON-encoded `RetryPayload`
 * TTL:    10 minutes (matches the booking hold), in seconds
 *
 * Graceful degradation: if Upstash is unconfigured, every call no-ops and
 * the retry endpoint falls back to rebuilding the payload from the DB row.
 */

const TTL_SECONDS = 10 * 60

export type RetryPayload = {
  bookingId: string
  amountPaise: number
  currency: 'INR'
  serviceName: string
  date: string
  timeSlot: string
  holdMinutes: number
  orderId: string
  keyId: string
  driver: 'mock' | 'razorpay'
}

let _client: Redis | null | undefined
function client(): Redis | null {
  if (_client !== undefined) return _client
  const url = env.upstashUrl()
  const token = env.upstashToken()
  _client = url && token ? new Redis({ url, token }) : null
  if (!_client && env.isProd()) {
    log.warn('retry-cache.disabled', { reason: 'UPSTASH_* env vars missing in production' })
  }
  return _client
}

function key(bookingId: string): string {
  return `retry:${bookingId}`
}

export async function putRetryPayload(payload: RetryPayload): Promise<void> {
  const c = client()
  if (!c) return
  try {
    await c.set(key(payload.bookingId), JSON.stringify(payload), { ex: TTL_SECONDS })
  } catch (e: any) {
    // Cache failures must never break the booking flow — log and move on.
    log.warn('retry-cache.put.failed', { bookingId: payload.bookingId, message: e?.message })
  }
}

export async function getRetryPayload(bookingId: string): Promise<RetryPayload | null> {
  const c = client()
  if (!c) return null
  try {
    const raw = await c.get<string | RetryPayload>(key(bookingId))
    if (!raw) return null
    // Upstash auto-parses JSON on read for some clients; tolerate both shapes.
    if (typeof raw === 'string') return JSON.parse(raw) as RetryPayload
    return raw as RetryPayload
  } catch (e: any) {
    log.warn('retry-cache.get.failed', { bookingId, message: e?.message })
    return null
  }
}

export async function dropRetryPayload(bookingId: string): Promise<void> {
  const c = client()
  if (!c) return
  try { await c.del(key(bookingId)) } catch { /* ignore */ }
}
