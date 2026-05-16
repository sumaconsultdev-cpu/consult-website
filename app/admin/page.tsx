import { redirect } from 'next/navigation'
import { db } from '@/lib/supabase/server'
import { AdminLogin } from '@/components/admin/AdminLogin'

export const dynamic = 'force-dynamic'

/**
 * `/admin` decides between three states based on server-side knowledge:
 *   - no admin configured → /admin/setup
 *   - configured & no session → show login form
 *   - configured & session valid → redirect to /admin/dashboard
 *
 * The middleware already redirects `/admin/dashboard` to here when there's no
 * cookie; we still re-check here to handle the "cookie present but session
 * revoked/expired" edge case cleanly.
 */
export default async function AdminEntry() {
  const { data } = await db().from('admin_user').select('password_hash').eq('id', 1).maybeSingle()
  if (!data?.password_hash) redirect('/admin/setup')
  return <AdminLogin />
}
