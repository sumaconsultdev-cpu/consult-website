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
      a.download = `suma-export-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.zip`
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
        <h1 className="text-3xl font-serif font-medium text-[#2D2D2D]">Customer Export</h1>
        <p className="text-[#7A7A7A] mt-1">
          Download a password-protected ZIP containing each customer's personal details and their bookings.
        </p>
      </div>

      <Card className="border-none shadow-sm">
        <CardContent className="p-6 md:p-8 space-y-6">
          <div className="flex items-start gap-3 p-4 rounded-xl bg-[#8E7CC3]/5 border border-[#8E7CC3]/20">
            <ShieldCheck className="w-5 h-5 text-[#8E7CC3] shrink-0 mt-0.5" />
            <p className="text-sm text-[#4A4A4A]">
              The ZIP file is locked with AES-256 using your passphrase. Sensitive details are decrypted
              server-side before being written into the archive, so you don't need any extra tooling to
              read them — just open the ZIP with the same passphrase.
              <strong> The passphrase is never stored. If you lose it, the file cannot be opened by anyone.</strong>
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
              {busy ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Building archive…</> : <><FileLock2 className="w-4 h-4 mr-2" /> Generate password-protected ZIP</>}
            </Button>
          </form>

          <div className="text-xs text-[#7A7A7A] space-y-2 border-t border-black/5 pt-4">
            <p className="font-medium text-[#5A5A5A]">Inside the ZIP</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><code className="bg-[#FAF9F6] px-1.5 py-0.5 rounded">customer_details.txt</code> — full name, phone, email, date / time / place of birth, gender and notes for each customer.</li>
              <li><code className="bg-[#FAF9F6] px-1.5 py-0.5 rounded">bookings.txt</code> — bookings grouped per customer with booking ID, date and payment ID only.</li>
            </ul>
            <p className="pt-2 font-medium text-[#5A5A5A]">Opening the ZIP</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>macOS</strong>: install <a className="underline" href="https://www.keka.io/" target="_blank" rel="noreferrer">Keka</a> (free) — the built-in Archive Utility cannot open AES-encrypted ZIPs.</li>
              <li><strong>Windows</strong>: install <a className="underline" href="https://www.7-zip.org/" target="_blank" rel="noreferrer">7-Zip</a> (free).</li>
              <li><strong>Linux</strong>: <code className="bg-[#FAF9F6] px-1.5 py-0.5 rounded">7z x suma-export-*.zip</code>.</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
