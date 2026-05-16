'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Sparkles, LayoutDashboard, Calendar, BookOpen, Package, FileDown, LogOut } from 'lucide-react'
import { toast } from 'sonner'

const NAV = [
  { href: '/admin/dashboard', label: 'Overview', icon: LayoutDashboard, exact: true },
  { href: '/admin/dashboard/bookings', label: 'Bookings', icon: BookOpen },
  { href: '/admin/dashboard/availability', label: 'Availability', icon: Calendar },
  { href: '/admin/dashboard/services', label: 'Services', icon: Package },
  { href: '/admin/dashboard/export', label: 'Export', icon: FileDown },
]

function readCookie(name: string): string {
  if (typeof document === 'undefined') return ''
  const match = document.cookie.split('; ').find((c) => c.startsWith(name + '='))
  return match ? decodeURIComponent(match.split('=').slice(1).join('=')) : ''
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()

  async function logout() {
    try {
      await fetch('/api/admin/logout', {
        method: 'POST',
        headers: { 'x-csrf-token': readCookie('csrf_token') },
      })
    } catch { /* ignore */ }
    toast.success('Signed out.')
    router.replace('/admin')
    router.refresh()
  }

  return (
    <div className="flex min-h-[calc(100vh-5rem)]">
      <aside className="hidden md:flex flex-col w-64 bg-white border-r border-black/5">
        <div className="px-6 py-6 flex items-center gap-2 text-xl font-semibold text-[#2D2D2D]">
          <Sparkles className="w-5 h-5 text-[#C5A880]" /> Admin
        </div>
        <nav className="flex-1 px-3 space-y-1">
          {NAV.map((item) => {
            const active = item.exact ? pathname === item.href : pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                  active ? 'bg-[#8E7CC3] text-white shadow-sm' : 'text-[#5A5A5A] hover:bg-[#FAF9F6]'
                }`}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </Link>
            )
          })}
        </nav>
        <div className="p-3 border-t border-black/5">
          <button onClick={logout} className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-[#5A5A5A] hover:bg-[#FAF9F6]">
            <LogOut className="w-4 h-4" /> Sign out
          </button>
        </div>
      </aside>

      <div className="flex-1 min-w-0">
        <header className="md:hidden flex items-center justify-between px-4 py-3 bg-white border-b border-black/5">
          <div className="flex items-center gap-2 font-semibold text-[#2D2D2D]"><Sparkles className="w-4 h-4 text-[#C5A880]" /> Admin</div>
          <button onClick={logout} className="text-sm text-[#7A7A7A] flex items-center gap-1"><LogOut className="w-4 h-4" /> Sign out</button>
        </header>
        <div className="md:hidden px-2 py-2 bg-white border-b border-black/5 overflow-x-auto">
          <div className="flex gap-1 min-w-max">
            {NAV.map((item) => {
              const active = item.exact ? pathname === item.href : pathname.startsWith(item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap ${
                    active ? 'bg-[#8E7CC3] text-white' : 'text-[#5A5A5A]'
                  }`}
                >
                  {item.label}
                </Link>
              )
            })}
          </div>
        </div>
        <div className="p-4 md:p-8">{children}</div>
      </div>
    </div>
  )
}
