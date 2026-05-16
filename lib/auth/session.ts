import 'server-only'
import { cookies } from 'next/headers'
import { db } from '@/lib/supabase/server'
import { randomToken } from '@/lib/ids'
import { sha256Hex } from '@/lib/auth/crypto'
import { env } from '@/lib/env'
import { log } from '@/lib/logger'

/**
 * Admin sessions.
 *  - Cookie holds a random 32-byte token, never a JWT (no client-side data).
 *  - DB stores sha256(token) so a DB leak can't reuse sessions directly.
 *  - Idle timeout 30 min, absolute timeout 8 hours.
 *  - Sliding window: `last_seen_at` is bumped on use, but `expires_at` is fixed
 *    at session-create time (the absolute cap).
 *  - On password change / 2FA reset we mark all sessions revoked.
 */

const COOKIE = 'admin_session'
const IDLE_MS = 30 * 60_000
const ABSOLUTE_MS = 8 * 60 * 60_000

export type Session = { id: string; absoluteExpiresAt: number; lastSeenAt: number }

export async function createSession(ip: string, userAgent: string | null): Promise<string> {
  const token = randomToken(32)
  const hash = sha256Hex(token)
  const now = new Date()
  const absExp = new Date(now.getTime() + ABSOLUTE_MS)

  const { error } = await db().from('admin_sessions').insert({
    session_token_hash: hash,
    created_at: now.toISOString(),
    last_seen_at: now.toISOString(),
    expires_at: absExp.toISOString(),
    ip,
    user_agent: userAgent ?? null,
  })
  if (error) throw new Error('session.create failed')

  const jar = await cookies()
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.isProd(),
    path: '/',
    maxAge: ABSOLUTE_MS / 1000,
  })
  return token
}

export async function destroyCurrentSession(): Promise<void> {
  const jar = await cookies()
  const token = jar.get(COOKIE)?.value
  if (token) {
    await db().from('admin_sessions').update({ revoked: true }).eq('session_token_hash', sha256Hex(token))
  }
  jar.delete(COOKIE)
}

export async function revokeAllSessions(): Promise<void> {
  await db().from('admin_sessions').update({ revoked: true }).eq('revoked', false)
}

/**
 * Read + validate the current session. Returns null if invalid/expired.
 * On success, bumps `last_seen_at`.
 */
export async function currentSession(): Promise<Session | null> {
  const jar = await cookies()
  const token = jar.get(COOKIE)?.value
  if (!token) return null
  const hash = sha256Hex(token)

  const { data, error } = await db()
    .from('admin_sessions')
    .select('id,last_seen_at,expires_at,revoked')
    .eq('session_token_hash', hash)
    .maybeSingle()

  if (error || !data || data.revoked) return null

  const lastSeen = new Date(data.last_seen_at).getTime()
  const absExp = new Date(data.expires_at).getTime()
  const now = Date.now()

  if (now >= absExp) {
    log.info('session.expired_absolute', { id: data.id })
    return null
  }
  if (now - lastSeen >= IDLE_MS) {
    log.info('session.expired_idle', { id: data.id })
    await db().from('admin_sessions').update({ revoked: true }).eq('id', data.id)
    return null
  }

  // Bump last_seen_at — best-effort, don't block on errors.
  void db().from('admin_sessions').update({ last_seen_at: new Date().toISOString() }).eq('id', data.id)

  return { id: data.id, absoluteExpiresAt: absExp, lastSeenAt: now }
}

/** Hard guard. Throws (turned into 401 by the route) when no valid session. */
export async function requireSession(): Promise<Session> {
  const s = await currentSession()
  if (!s) throw new UnauthorizedError('not_authenticated')
  return s
}

export class UnauthorizedError extends Error {
  constructor(msg: string) { super(msg); this.name = 'UnauthorizedError' }
}
