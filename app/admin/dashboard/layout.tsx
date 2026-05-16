import { redirect } from 'next/navigation'
import { currentSession } from '@/lib/auth/session'
import { getOrIssueCsrf } from '@/lib/csrf'
import { AdminShell } from '@/components/admin/AdminShell'

export const dynamic = 'force-dynamic'

/**
 * Server-side gate on every dashboard route. If the session is invalid we
 * bounce to /admin (the login page). Otherwise we mint/refresh the CSRF token
 * once at the layout level so child client components can read it from the
 * cookie without an extra round-trip.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const s = await currentSession()
  if (!s) redirect('/admin')
  await getOrIssueCsrf()
  return <AdminShell>{children}</AdminShell>
}
