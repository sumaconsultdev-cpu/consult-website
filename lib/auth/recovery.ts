import 'server-only'
import { db } from '@/lib/supabase/server'
import { newRecoveryCode } from '@/lib/ids'
import { sha256Hex } from '@/lib/auth/crypto'

/**
 * Recovery codes (single-use). Generated at admin setup and shown ONCE — the
 * DB only ever stores sha256(code). Used to disable 2FA and reset the password
 * when the authenticator device is lost.
 *
 * 10 codes by default. Each is consumed atomically: a code is marked used
 * BEFORE acting on it; if the action then fails, the code stays consumed.
 * That's the safer direction (no replay) at the cost of one wasted code in a
 * failure mode the user will likely not see.
 */
const CODE_COUNT = 10

export async function issueRecoveryCodes(): Promise<string[]> {
  await db().from('admin_recovery_codes').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  const codes = Array.from({ length: CODE_COUNT }, () => newRecoveryCode())
  const rows = codes.map((c) => ({ code_hash: sha256Hex(c) }))
  const { error } = await db().from('admin_recovery_codes').insert(rows)
  if (error) throw new Error('recovery.issue failed')
  return codes
}

/**
 * Try to consume a recovery code. Returns true if it was previously valid &
 * unused, AFTER marking it used. False otherwise.
 */
export async function consumeRecoveryCode(rawCode: string): Promise<boolean> {
  const cleaned = rawCode.trim().toUpperCase()
  if (!/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(cleaned)) return false
  const hash = sha256Hex(cleaned)
  const { data, error } = await db()
    .from('admin_recovery_codes')
    .update({ used: true, used_at: new Date().toISOString() })
    .eq('code_hash', hash)
    .eq('used', false)
    .select('id')
    .maybeSingle()
  if (error) return false
  return Boolean(data)
}

export async function remainingRecoveryCodeCount(): Promise<number> {
  const { count } = await db()
    .from('admin_recovery_codes')
    .select('id', { count: 'exact', head: true })
    .eq('used', false)
  return count ?? 0
}
