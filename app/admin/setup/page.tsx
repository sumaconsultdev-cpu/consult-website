import { redirect } from 'next/navigation'
import { db } from '@/lib/supabase/server'
import { AdminSetup } from '@/components/admin/AdminSetup'

export const dynamic = 'force-dynamic'

/**
 * Setup page is only reachable while the admin row has NO password_hash.
 * Once configured, this page redirects to /admin (login).
 */
export default async function AdminSetupPage() {
  const { data } = await db().from('admin_user').select('password_hash').eq('id', 1).maybeSingle()
  if (data?.password_hash) redirect('/admin')
  return <AdminSetup />
}
