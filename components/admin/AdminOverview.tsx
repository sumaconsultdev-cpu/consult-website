'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Users, IndianRupee, CalendarCheck, Loader2, AlertCircle } from 'lucide-react'

type Summary = { total: number; paid: number; pending: number; failed: number; cancelled: number; expired: number; revenuePaise: number }
type Resp = { ok: true; lifetime: Summary; last30Days: Summary; upcomingPaid: number } | { ok: false; error: { message: string } }

const INR = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })

export function AdminOverview() {
  const [data, setData] = useState<Resp | null>(null)

  useEffect(() => {
    fetch('/api/admin/analytics').then((r) => r.json()).then(setData).catch(() => setData({ ok: false, error: { message: 'Network error' } } as Resp))
  }, [])

  if (!data) {
    return <div className="flex items-center gap-2 text-[#7A7A7A]"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
  }
  if (!data.ok) {
    return <div className="flex items-center gap-2 text-red-600"><AlertCircle className="w-4 h-4" /> {data.error.message}</div>
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-serif font-medium text-[#2D2D2D]">Overview</h1>
        <p className="text-[#7A7A7A] mt-1">Welcome back. Here&apos;s where things stand.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Stat icon={CalendarCheck} label="Upcoming Confirmed" value={String(data.upcomingPaid)} />
        <Stat icon={Users} label="Bookings (last 30 days)" value={String(data.last30Days.total)} sub={`${data.last30Days.paid} paid · ${data.last30Days.pending} pending`} />
        <Stat icon={IndianRupee} label="Revenue (last 30 days)" value={INR.format(data.last30Days.revenuePaise / 100)} sub={`Lifetime: ${INR.format(data.lifetime.revenuePaise / 100)}`} />
      </div>

      <Card className="border-none shadow-sm">
        <CardContent className="p-6 md:p-8">
          <h2 className="text-lg font-medium text-[#2D2D2D] mb-4">Last 30 days breakdown</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
            <Pill label="Paid" value={data.last30Days.paid} tone="green" />
            <Pill label="Pending" value={data.last30Days.pending} tone="amber" />
            <Pill label="Failed" value={data.last30Days.failed} tone="red" />
            <Pill label="Cancelled" value={data.last30Days.cancelled} tone="slate" />
            <Pill label="Expired" value={data.last30Days.expired} tone="slate" />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function Stat({ icon: Icon, label, value, sub }: { icon: any; label: string; value: string; sub?: string }) {
  return (
    <Card className="border-none shadow-sm">
      <CardContent className="p-6 flex items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-[#8E7CC3]/10 flex items-center justify-center text-[#8E7CC3]">
          <Icon className="w-6 h-6" />
        </div>
        <div>
          <p className="text-sm font-medium text-[#7A7A7A]">{label}</p>
          <p className="text-2xl font-serif font-medium text-[#2D2D2D]">{value}</p>
          {sub && <p className="text-xs text-[#9A9A9A] mt-1">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  )
}

function Pill({ label, value, tone }: { label: string; value: number; tone: 'green' | 'amber' | 'red' | 'slate' }) {
  const styles =
    tone === 'green' ? 'bg-green-50 text-green-700' :
    tone === 'amber' ? 'bg-yellow-50 text-yellow-700' :
    tone === 'red' ? 'bg-red-50 text-red-700' :
                     'bg-slate-50 text-slate-700'
  return (
    <div className={`rounded-xl px-4 py-3 flex flex-col ${styles}`}>
      <span className="text-xs uppercase font-medium opacity-70">{label}</span>
      <span className="text-xl font-medium mt-1">{value}</span>
    </div>
  )
}
