'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Loader2, ShieldCheck, FileLock2 } from 'lucide-react'
import { toast } from 'sonner'

function readCookie(name: string): string {
  if (typeof document === 'undefined') return ''
  const match = document.cookie.split('; ').find((c) => c.startsWith(name + '='))
  return match ? decodeURIComponent(match.split('=').slice(1).join('=')) : ''
}

export function AdminExport() {
  const [pass, setPass] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)

  async function run(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    if (pass.length < 12) { toast.error('Passphrase must be at least 12 characters.'); return }
    if (pass !== confirm) { toast.error('Passphrases do not match.'); return }
    setBusy(true)
    try {
      const r = await fetch('/api/admin/export', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-csrf-token': readCookie('csrf_token') },
        body: JSON.stringify({ passphrase: pass }),
      })
      if (!r.ok) {
        const j = await r.json().catch(() => null)
        toast.error(j?.error?.message ?? 'Export failed.')
        return
      }
      const blob = await r.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `suma-export-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.enc`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      setPass(''); setConfirm('')
      toast.success('Export downloaded. Keep your passphrase safe.')
    } catch {
      toast.error('Network error.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-3xl font-serif font-medium text-[#2D2D2D]">Encrypted Export</h1>
        <p className="text-[#7A7A7A] mt-1">Download a passphrase-encrypted archive of all customers, bookings and services for offline archival.</p>
      </div>

      <Card className="border-none shadow-sm">
        <CardContent className="p-6 md:p-8 space-y-6">
          <div className="flex items-start gap-3 p-4 rounded-xl bg-[#8E7CC3]/5 border border-[#8E7CC3]/20">
            <ShieldCheck className="w-5 h-5 text-[#8E7CC3] shrink-0 mt-0.5" />
            <p className="text-sm text-[#4A4A4A]">
              The archive is encrypted with AES-256-GCM using a key derived from your passphrase via scrypt. The passphrase is <strong>never stored</strong>.
              If you lose it, the file cannot be decrypted by anyone (including us).
            </p>
          </div>

          <form onSubmit={run} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-[#4A4A4A]">Passphrase (min 12 characters)</label>
              <Input type="password" value={pass} onChange={(e) => setPass(e.target.value)} className="h-12 bg-white" autoComplete="off" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-[#4A4A4A]">Confirm passphrase</label>
              <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="h-12 bg-white" autoComplete="off" />
            </div>
            <Button type="submit" size="lg" className="w-full md:w-auto" disabled={busy}>
              {busy ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Building archive…</> : <><FileLock2 className="w-4 h-4 mr-2" /> Generate encrypted export</>}
            </Button>
          </form>

          <div className="text-xs text-[#7A7A7A] space-y-1 border-t border-black/5 pt-4">
            <p>To decrypt offline:</p>
            <pre className="bg-[#FAF9F6] px-3 py-2 rounded-md overflow-x-auto"><code>node db/decrypt-export.mjs path/to/file.enc &lt;your-passphrase&gt;</code></pre>
            <p>This produces a regular .zip with customers.csv, bookings.csv, services.csv, manifest.json, and bundle.json.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
