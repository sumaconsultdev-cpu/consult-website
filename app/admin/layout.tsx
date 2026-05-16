import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Admin',
  robots: { index: false, follow: false, nocache: true, noimageindex: true },
}

/**
 * Wraps every admin route so we can suppress the public header/footer and
 * keep search engines out (robots meta + middleware redirect for unauthed).
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-[calc(100vh-5rem)] bg-[#FAF9F6]">{children}</div>
}
