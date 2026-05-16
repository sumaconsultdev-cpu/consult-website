'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

type Service = {
  id?: string
  slug: string
  name: string
  description: string
  price_paise: number
  duration_minutes: number
  active: boolean
  display_order: number
}

function readCookie(name: string): string {
  if (typeof document === 'undefined') return ''
  const match = document.cookie.split('; ').find((c) => c.startsWith(name + '='))
  return match ? decodeURIComponent(match.split('=').slice(1).join('=')) : ''
}

const INR = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })

export function AdminServices() {
  const [services, setServices] = useState<Service[] | null>(null)
  const [saving, setSaving] = useState<string | null>(null)

  useEffect(() => { load() }, [])

  async function load() {
    setServices(null)
    const r = await fetch('/api/admin/services').then((r) => r.json())
    if (r.ok) setServices(r.services)
    else { setServices([]); toast.error(r?.error?.message ?? 'Failed to load.') }
  }

  async function save(s: Service) {
    setSaving(s.slug)
    try {
      const r = await fetch('/api/admin/services', {
        method: 'PUT',
        headers: { 'content-type': 'application/json', 'x-csrf-token': readCookie('csrf_token') },
        body: JSON.stringify({
          id: s.id,
          slug: s.slug,
          name: s.name,
          description: s.description,
          pricePaise: s.price_paise,
          durationMinutes: s.duration_minutes,
          active: s.active,
          displayOrder: s.display_order,
        }),
      })
      const j = await r.json()
      if (!r.ok || !j.ok) {
        toast.error(j?.error?.message ?? 'Save failed.')
      } else {
        toast.success('Service saved.')
        load()
      }
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-serif font-medium text-[#2D2D2D]">Services</h1>
        <p className="text-[#7A7A7A] mt-1">Edit names, prices and visibility. Prices are stored in paise (₹1 = 100 paise).</p>
      </div>

      {services === null ? (
        <div className="flex items-center gap-2 text-[#7A7A7A]"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
      ) : services.length === 0 ? (
        <p className="text-[#7A7A7A]">No services yet.</p>
      ) : (
        <div className="space-y-4">
          {services.map((s, i) => (
            <Card key={s.slug} className="border-none shadow-sm">
              <CardContent className="p-6 grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
                <div className="md:col-span-3 space-y-2">
                  <label className="text-xs uppercase font-medium text-[#7A7A7A]">Slug</label>
                  <Input value={s.slug} readOnly className="h-11 font-mono text-sm bg-[#FAF9F6] cursor-not-allowed" />
                  <p className="text-xs text-[#9A9A9A]">Immutable — change via DB if needed.</p>
                </div>
                <div className="md:col-span-4 space-y-2">
                  <label className="text-xs uppercase font-medium text-[#7A7A7A]">Name</label>
                  <Input value={s.name} onChange={(e) => update(i, { name: e.target.value })} className="h-11" />
                </div>
                <div className="md:col-span-2 space-y-2">
                  <label className="text-xs uppercase font-medium text-[#7A7A7A]">Price (₹)</label>
                  <Input
                    value={Math.round(s.price_paise / 100)}
                    onChange={(e) => {
                      const n = Math.max(0, Math.floor(Number(e.target.value) || 0))
                      update(i, { price_paise: n * 100 })
                    }}
                    type="number"
                    min={0}
                    className="h-11"
                  />
                  <p className="text-xs text-[#9A9A9A]">{INR.format(s.price_paise / 100)}</p>
                </div>
                <div className="md:col-span-1 space-y-2">
                  <label className="text-xs uppercase font-medium text-[#7A7A7A]">Min</label>
                  <Input
                    value={s.duration_minutes}
                    onChange={(e) => update(i, { duration_minutes: Math.max(15, Math.min(240, Number(e.target.value) || 60)) })}
                    type="number"
                    min={15}
                    max={240}
                    className="h-11"
                  />
                </div>
                <div className="md:col-span-1 space-y-2">
                  <label className="text-xs uppercase font-medium text-[#7A7A7A]">Order</label>
                  <Input value={s.display_order} onChange={(e) => update(i, { display_order: Number(e.target.value) || 0 })} type="number" min={0} className="h-11" />
                </div>
                <div className="md:col-span-1 flex items-end gap-2">
                  <label className="flex items-center gap-2 text-xs uppercase font-medium text-[#7A7A7A] pb-3">
                    <input type="checkbox" checked={s.active} onChange={(e) => update(i, { active: e.target.checked })} />
                    Active
                  </label>
                </div>

                <div className="md:col-span-12 space-y-2">
                  <label className="text-xs uppercase font-medium text-[#7A7A7A]">Description</label>
                  <textarea
                    value={s.description}
                    onChange={(e) => update(i, { description: e.target.value })}
                    className="w-full rounded-xl border border-black/10 bg-white p-3 text-sm resize-none h-20 focus:outline-none focus:ring-2 focus:ring-[#8E7CC3]"
                  />
                </div>

                <div className="md:col-span-12 flex justify-end">
                  <Button onClick={() => save(s)} disabled={saving === s.slug}>
                    {saving === s.slug ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…</> : 'Save'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )

  function update(i: number, patch: Partial<Service>) {
    setServices((prev) => {
      if (!prev) return prev
      const next = [...prev]
      next[i] = { ...next[i]!, ...patch }
      return next
    })
  }
}
