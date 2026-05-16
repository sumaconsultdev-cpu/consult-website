import 'server-only'
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'
import { env } from '@/lib/env'

/**
 * Double-submit CSRF tokens. The browser stores `csrf_token` in a JS-readable
 * cookie; mutating requests must mirror it back in the `x-csrf-token` header.
 * Same-origin attackers can't read cookies of other origins, so an attacker
 * page can't forge a matching header even if cookies are sent along.
 *
 * Tokens are HMAC-bound to APP_SECRET so a leaked cookie alone can't generate
 * valid tokens for other users.
 */

const COOKIE = 'csrf_token'
const HEADER = 'x-csrf-token'

function sign(value: string): string {
  return createHmac('sha256', env.appSecret()).update(value).digest('base64url')
}

function format(value: string, sig: string): string {
  return `${value}.${sig}`
}

export async function issueCsrf(): Promise<string> {
  const value = randomBytes(24).toString('base64url')
  const token = format(value, sign(value))
  const jar = await cookies()
  jar.set(COOKIE, token, {
    httpOnly: false,           // must be readable by client JS for double-submit
    sameSite: 'lax',
    secure: env.isProd(),
    path: '/',
    maxAge: 60 * 60 * 8,       // 8h
  })
  return token
}

export async function getOrIssueCsrf(): Promise<string> {
  const jar = await cookies()
  const existing = jar.get(COOKIE)?.value
  if (existing && verifyToken(existing)) return existing
  return issueCsrf()
}

function verifyToken(token: string): boolean {
  const idx = token.lastIndexOf('.')
  if (idx <= 0) return false
  const value = token.slice(0, idx)
  const sig = token.slice(idx + 1)
  const expected = sign(value)
  try {
    return timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  } catch {
    return false
  }
}

/**
 * Throws if the request lacks a matching CSRF token. Call at the top of every
 * mutating route handler that consumes a user session/cookies.
 */
export async function assertCsrf(headers: Headers): Promise<void> {
  const jar = await cookies()
  const cookieToken = jar.get(COOKIE)?.value
  const headerToken = headers.get(HEADER)
  if (!cookieToken || !headerToken) throw new CsrfError('missing token')
  if (cookieToken !== headerToken) throw new CsrfError('token mismatch')
  if (!verifyToken(cookieToken)) throw new CsrfError('invalid token')
}

export class CsrfError extends Error {
  constructor(msg: string) { super(msg); this.name = 'CsrfError' }
}
