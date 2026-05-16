'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Clock, XCircle, Loader2, Lock } from 'lucide-react'
import { toast } from 'sonner'

function readCookie(name: string): string {
  if (typeof document === 'undefined') return ''
  const match = document.cookie.split('; ').find((c) => c.startsWith(name + '='))
  return match ? decodeURIComponent(match.split('=').slice(1).join('=')) : ''
}

function todayIST(): string {
  // Browser-side approximation — server enforces the actual rule.
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

export function AdminAvailability() {
  const [date, setDate] = useState(todayIST())
  const [defined, setDefined] = useState<string[]>([])
  const [booked, setBooked] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [newSlot, setNewSlot] = useState('')

  useEffect(() => {
    setLoading(true)
    fetch(`/api/admin/availability?date=${date}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) { setDefined(d.defined); setBooked(d.bookedSlots) }
        else toast.error(d?.error?.message ?? 'Could not load.')
      })
      .finally(() => setLoading(false))
  }, [date])

  function addSlot() {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(newSlot)) {
      toast.error('Use HH:MM (24-hour).')
      return
    }
    if (defined.includes(newSlot)) {
      toast.message('That slot is already in the list.')
      return
    }
    setDefined([...defined, newSlot].sort())
    setNewSlot('')
  }

  function removeSlot(t: string) {
    if (booked.includes(t)) {
      toast.error(`Cannot remove ${t} — there is an active booking on that slot.`)
      return
    }
    setDefined(defined.filter((s) => s !== t))
  }

  async function save() {
    if (saving) return
    setSaving(true)
    try {
      const r = await fetch('/api/admin/availability', {
        method: 'PUT',
        headers: { 'content-type': 'application/json', 'x-csrf-token': readCookie('csrf_token') },
        body: JSON.stringify({ date, slots: defined }),
      })
      const j = await r.json()
      if (!r.ok || !j.ok) {
        toast.error(j?.error?.message ?? 'Save failed.')
        return
      }
      toast.success('Availability saved.')
      setDefined(j.defined)
      setBooked(j.bookedSlots)
    } catch {
      toast.error('Network error.')
    } finally {
      setSaving(false)
    }
  }

  const isPast = date < todayIST()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-serif font-medium text-[#2D2D2D]">Availability</h1>
        <p className="text-[#7A7A7A] mt-1">Manage the slots customers can book. Booked slots are protected automatically.</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        <Card className="border-none shadow-sm lg:w-1/3 h-fit">
          <CardHeader className="bg-white border-b border-black/5">
            <CardTitle className="text-xl">Select Date</CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-3">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full h-12" />
            <p className="text-sm text-[#7A7A7A]">If no per-date slots are saved, the system uses the default weekly template (10:00, 11:00, 12:00, 15:00, 16:00, 17:00).</p>
            {isPast && <p className="text-sm text-amber-600 flex items-center gap-1"><Lock className="w-4 h-4" /> Past dates cannot be edited.</p>}
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm lg:w-2/3">
          <CardHeader className="bg-white border-b border-black/5 flex flex-row items-center justify-between py-5">
            <CardTitle className="text-xl">
              Slots for {new Date(date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}
            </CardTitle>
            <Button onClick={save} disabled={saving || isPast}>
              {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…</> : 'Save changes'}
            </Button>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            <div className="flex gap-3">
              <Input type="time" value={newSlot} onChange={(e) => setNewSlot(e.target.value)} className="max-w-[180px]" />
              <Button onClick={addSlot} disabled={isPast}>Add slot</Button>
            </div>

            <div className="space-y-3">
              {loading ? (
                <div className="flex items-center gap-2 text-[#7A7A7A]"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
              ) : defined.length === 0 ? (
                <p className="text-[#7A7A7A] text-center py-6">No slots configured. Customers will see no availability on this date.</p>
              ) : (
                defined.map((t) => {
                  const isBooked = booked.includes(t)
                  return (
                    <div key={t} className="flex items-center justify-between p-4 rounded-xl border border-black/5 bg-[#FAF9F6]">
                      <div className="flex items-center gap-3">
                        <Clock className="w-5 h-5 text-[#8E7CC3]" />
                        <span className="font-medium text-[#2D2D2D]">{t}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${isBooked ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                          {isBooked ? 'Booked' : 'Available'}
                        </span>
                      </div>
                      <button
                        onClick={() => removeSlot(t)}
                        disabled={isBooked || isPast}
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-red-500 hover:bg-red-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        title={isBooked ? 'Cannot remove — has an active booking' : 'Remove'}
                      >
                        <XCircle className="w-5 h-5" />
                      </button>
                    </div>
                  )
                })
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
