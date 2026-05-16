import 'server-only'
import bcrypt from 'bcryptjs'

const BCRYPT_COST = 12

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST)
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  // bcrypt.compare itself is constant-time over the chosen hash.
  if (!hash) return false
  try {
    return await bcrypt.compare(plain, hash)
  } catch {
    return false
  }
}

/**
 * Password policy: minimum 12 chars, must include at least one letter and one
 * non-letter (digit or symbol). Maximum 128 to defend against bcrypt-specific
 * DoS via giant inputs. No "must contain uppercase + special" theatre — length
 * is what matters, NIST agrees, the user is the admin and there's no support team.
 */
export function passwordPolicyError(plain: string): string | null {
  if (typeof plain !== 'string') return 'Password is required.'
  if (plain.length < 12) return 'Password must be at least 12 characters.'
  if (plain.length > 128) return 'Password is too long (max 128 characters).'
  const hasLetter = /[a-zA-Z]/.test(plain)
  const hasOther = /[^a-zA-Z]/.test(plain)
  if (!hasLetter || !hasOther) return 'Password must contain letters and at least one digit or symbol.'
  return null
}
