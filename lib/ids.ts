import 'server-only'
import { randomBytes } from 'node:crypto'

/**
 * Human-friendly booking ID: SC-{8 chars, base32 Crockford alphabet}.
 * - 8 chars of 32-symbol alphabet = 40 bits of entropy. The UNIQUE constraint
 *   on `booking_id` is the real safety net; we retry on the (extremely rare)
 *   collision at the call site.
 * - Crockford avoids visually ambiguous chars (no I, L, O, U).
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

export function newBookingId(): string {
  const bytes = randomBytes(8)
  let out = ''
  for (let i = 0; i < 8; i++) out += ALPHABET[bytes[i]! % 32]
  return `SC-${out}`
}

/** URL-safe opaque token (e.g. session ids, recovery codes). */
export function randomToken(byteLen = 32): string {
  return randomBytes(byteLen).toString('base64url')
}

/** Human-readable recovery code: XXXX-XXXX-XXXX (no ambiguous chars). */
export function newRecoveryCode(): string {
  const b = randomBytes(9)
  const chars = Array.from(b).map((x) => ALPHABET[x % 32]).join('')
  return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}`
}
