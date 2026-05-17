'use client'

import { useEffect, useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Check, Clock, Loader2, Lock, RotateCcw, XCircle } from 'lucide-react'
import { toast } from 'sonner'

function readCookie(name: string): string {
  if (typeof document === 'undefined') return ''
  const match = document.cookie.split('; ').find((c) => c.startsWith(name + '='))
  return match ? decodeURIComponent(match.split('=').slice(1).join('=')) : ''
}

function todayIST(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'
type Source = 'custom' | 'template'

export function AdminAvailability() {
  const [date, setDate] = useState(todayIST())
  const [defined, setDefined] = useState<string[]>([])
  const [booked, setBooked] = useState<string[]>([])
  const [source, setSource] = useState<Source>('template')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [newSlot, setNewSlot] = useState('')
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setLoading(true)
    setSaveStatus('idle')
    const ctrl = new AbortController()
    fetch(`/api/admin/availability?date=${date}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((d) => {
        if (ctrl.signal.aborted) return
        if (d.ok) {
          setDefined(d.defined)
          setBooked(d.bookedSlots)
          setSource(d.source ?? 'template')
        } else {
          toast.error(d?.error?.message ?? 'Could not load.')
        }
      })
      .catch((e: unknown) => {
        if ((e as { name?: string })?.name !== 'AbortError') toast.error('Network error.')
      })
      .finally(() => { if (!ctrl.signal.aborted) setLoading(false) })
    return () => ctrl.abort()
  }, [date])

  function flashSaved() {
    setSaveStatus('saved')
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    savedTimerRef.current = setTimeout(() => setSaveStatus('idle'), 2000)
  }

  async function persistSlots(slots: string[]) {
    if (saving) return
    setSaving(true)
    setSaveStatus('saving')
    try {
      const r = await fetch('/api/admin/availability', {
        method: 'PUT',
        headers: { 'content-type': 'application/json', 'x-csrf-token': readCookie('csrf_token') },
        body: JSON.stringify({ date, slots }),
      })
      const j = await r.json()
      if (!r.ok || !j.ok) {
        toast.error(j?.error?.message ?? 'Save failed.')
        setSaveStatus('error')
        return
      }
      setDefined(j.defined)
      setBooked(j.bookedSlots)
      setSource('custom')
      flashSaved()
    } catch {
      toast.error('Network error.')
      setSaveStatus('error')
    } finally {
      setSaving(false)
    }
  }

  function addSlot() {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(newSlot)) {
      toast.error('Use HH:MM (24-hour).')
      return
    }
    if (defined.includes(newSlot)) {
      toast.message('That slot is already in the list.')
      return
    }
    const next = [...defined, newSlot].sort()
    setDefined(next)
    setNewSlot('')
    persistSlots(next)
  }

  function removeSlot(t: string) {
    if (booked.includes(t)) {
      toast.error(`Cannot remove ${t} — there is an active booking on that slot.`)
      return
    }
    const next = defined.filter((s) => s !== t)
    setDefined(next)
    persistSlots(next)
  }

  async function resetToDefaults() {
    if (saving) return
    setSaving(true)
    setSaveStatus('saving')
    try {
      const r = await fetch('/api/admin/availability', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json', 'x-csrf-token': readCookie('csrf_token') },
        body: JSON.stringify({ date }),
      })
      const j = await r.json()
      if (!r.ok || !j.ok) {
        toast.error(j?.error?.message ?? 'Reset failed.')
        setSaveStatus('error')
        return
      }
      setDefined(j.defined)
      setBooked(j.bookedSlots)
      setSource('template')
      flashSaved()
    } catch {
      toast.error('Network error.')
      setSaveStatus('error')
    } finally {
      setSaving(false)
    }
  }

  const isPast = date < todayIST()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-serif font-medium text-[#2D2D2D]">Availability</h1>
        <p className="text-[#7A7A7A] mt-1">Manage the slots customers can book. Changes are saved automatically.</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        <Card className="border-none shadow-sm lg:w-1/3 h-fit">
          <CardHeader className="bg-white border-b border-black/5">
            <CardTitle className="text-xl">Select Date</CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-3">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full h-12" />
            <p className="text-sm text-[#7A7A7A]">If no custom slots are saved for a date, the default weekly template applies (10:00, 11:00, 12:00, 15:00, 16:00, 17:00).</p>
            {isPast && <p className="text-sm text-amber-600 flex items-center gap-1"><Lock className="w-4 h-4" /> Past dates cannot be edited.</p>}
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm lg:w-2/3">
          <CardHeader className="bg-white border-b border-black/5 flex flex-row items-center justify-between py-5">
            <div className="flex items-center gap-3">
              <CardTitle className="text-xl">
                Slots for {new Date(date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}
              </CardTitle>
              {!loading && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  source === 'custom'
                    ? 'bg-purple-100 text-purple-700'
                    : 'bg-gray-100 text-gray-500'
                }`}>
                  {source === 'custom' ? 'Custom' : 'Template default'}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {saveStatus === 'saving' && (
                <span className="flex items-center gap-1 text-xs text-[#7A7A7A]">
                  <Loader2 className="w-3 h-3 animate-spin" /> Saving…
                </span>
              )}
              {saveStatus === 'saved' && (
                <span className="flex items-center gap-1 text-xs text-green-600">
                  <Check className="w-3 h-3" /> Saved
                </span>
              )}
              {saveStatus === 'error' && (
                <span className="text-xs text-red-500">Save failed</span>
              )}
              {source === 'custom' && !isPast && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={resetToDefaults}
                  disabled={saving}
                  className="text-[#7A7A7A] hover:text-[#2D2D2D] text-xs"
                  title="Remove custom slots and revert to default weekly template"
                >
                  <RotateCcw className="w-3 h-3 mr-1" /> Reset to defaults
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            <div className="flex gap-3">
              <Input
                type="time"
                value={newSlot}
                onChange={(e) => setNewSlot(e.target.value)}
                className="max-w-[180px]"
                disabled={isPast || saving}
              />
              <Button onClick={addSlot} disabled={isPast || saving}>Add slot</Button>
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
                        type="button"
                        onClick={() => removeSlot(t)}
                        disabled={isBooked || isPast || saving}
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-red-500 hover:bg-red-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        title={isBooked ? 'Cannot remove — has an active booking' : 'Remove'}
                        aria-label={`Remove slot ${t}`}
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
