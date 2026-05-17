import 'server-only'
import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from 'node:crypto'
import { env } from '@/lib/env'

/**
 * AES-256-GCM symmetric crypto for at-rest secrets (the TOTP seed).
 *
 * The key is derived via HKDF-SHA256 from APP_SECRET with a per-purpose info
 * label so reusing APP_SECRET elsewhere can't produce key collisions.
 * Format on the wire: base64url( iv(12) | ciphertext | tag(16) ).
 */
function keyFor(purpose: string): Buffer {
  const ikm = Buffer.from(env.appSecret(), 'utf8')
  const salt = Buffer.alloc(0)
  const info = Buffer.from(`suma|${purpose}`, 'utf8')
  return Buffer.from(hkdfSync('sha256', ikm, salt, info, 32))
}

export function encryptString(plaintext: string, purpose = 'totp'): string {
  const key = keyFor(purpose)
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, enc, tag]).toString('base64url')
}

export function decryptString(payload: string, purpose = 'totp'): string {
  const buf = Buffer.from(payload, 'base64url')
  const iv = buf.subarray(0, 12)
  const tag = buf.subarray(buf.length - 16)
  const enc = buf.subarray(12, buf.length - 16)
  const key = keyFor(purpose)
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  const out = Buffer.concat([decipher.update(enc), decipher.final()])
  return out.toString('utf8')
}

/** SHA-256 hex digest of a value — used to store session/recovery tokens at rest. */
export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

/**
 * JSON-aware wrappers used to store sensitive booking PII (DOB, time/place of
 * birth, notes) at rest. The wire format is identical to `encryptString` —
 * any payload that wasn't a string at encrypt-time is the caller's mistake.
 *
 * `purpose='booking-pii'` ensures HKDF derives a different key than the TOTP
 * seed encryption, so a key recovered for one purpose cannot be used to
 * decrypt the other.
 */
export function encryptJson(obj: unknown, purpose = 'booking-pii'): string {
  return encryptString(JSON.stringify(obj), purpose)
}

export function decryptJson<T = unknown>(payload: string, purpose = 'booking-pii'): T {
  return JSON.parse(decryptString(payload, purpose)) as T
}
