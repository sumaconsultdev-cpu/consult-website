'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, Loader2, ShieldCheck, KeyRound, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'

type TotpBundle = { secret: string; uri: string; qr: string }

export function AdminSetup() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [totp, setTotp] = useState<TotpBundle | null>(null)
  const [alreadyDone, setAlreadyDone] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null)

  useEffect(() => {
    fetch('/api/admin/setup')
      .then((r) => r.json())
      .then((d) => {
        if (!d.ok) { toast.error('Could not start setup.'); return }
        if (d.alreadyConfigured) setAlreadyDone(true)
        else setTotp(d.totp)
      })
      .finally(() => setLoading(false))
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy || !totp) return
    if (password.length < 12) { toast.error('Password must be at least 12 characters.'); return }
    if (password !== confirm) { toast.error('Passwords do not match.'); return }
    if (!/^\d{6}$/.test(code)) { toast.error('Enter the 6-digit code from your authenticator.'); return }
    setBusy(true)
    try {
      const r = await fetch('/api/admin/setup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password, totpSecret: totp.secret, totpCode: code }),
      })
      const j = await r.json()
      if (!r.ok || !j.ok) {
        toast.error(j?.error?.message ?? 'Setup failed.')
        return
      }
      setRecoveryCodes(j.recoveryCodes)
    } catch {
      toast.error('Network error.')
    } finally {
      setBusy(false)
    }
  }

  function downloadCodes() {
    if (!recoveryCodes) return
    const text = [
      'Suma Admin — Recovery Codes',
      `Generated: ${new Date().toISOString()}`,
      '',
      ...recoveryCodes.map((c, i) => `${String(i + 1).padStart(2, '0')}.  ${c}`),
      '',
      'Each code is single-use. Store this file somewhere safe and offline.',
    ].join('\n')
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'suma-admin-recovery-codes.txt'
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="w-6 h-6 animate-spin text-[#8E7CC3]" />
      </div>
    )
  }

  if (alreadyDone) {
    return (
      <div className="flex items-center justify-center py-20 px-4">
        <Card className="w-full max-w-md border-none shadow-lg">
          <CardHeader className="text-center pt-8">
            <CardTitle className="text-2xl font-serif">Admin already configured</CardTitle>
          </CardHeader>
          <CardContent className="text-center pb-8 space-y-4">
            <p className="text-[#7A7A7A]">Use the login page to sign in.</p>
            <Button onClick={() => router.replace('/admin')}>Go to Sign-In</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (recoveryCodes) {
    return (
      <div className="flex items-center justify-center py-12 px-4">
        <Card className="w-full max-w-2xl border-none shadow-lg">
          <CardHeader className="pt-8 pb-4 flex flex-col items-center gap-2">
            <ShieldCheck className="w-8 h-8 text-[#8E7CC3]" />
            <CardTitle className="text-2xl font-serif">Save your recovery codes</CardTitle>
          </CardHeader>
          <CardContent className="pb-8 space-y-6">
            <p className="text-sm text-[#7A7A7A]">
              Store these codes somewhere safe and offline (password manager, printed copy). Each code is single-use and lets you recover access if you
              lose your authenticator device. <strong>They will not be shown again.</strong>
            </p>
            <div className="grid grid-cols-2 gap-3 font-mono text-sm bg-[#FAF9F6] p-4 rounded-xl border border-black/5">
              {recoveryCodes.map((c, i) => (
                <div key={c} className="flex gap-2">
                  <span className="text-[#9A9A9A]">{String(i + 1).padStart(2, '0')}.</span>
                  <span className="text-[#2D2D2D] tracking-wider">{c}</span>
                </div>
              ))}
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <Button onClick={downloadCodes} variant="outline" className="sm:w-1/2"><Download className="w-4 h-4 mr-2" /> Download as .txt</Button>
              <Button onClick={() => router.replace('/admin')} className="sm:w-1/2">Continue to Sign-In</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-center py-12 px-4">
      <Card className="w-full max-w-2xl border-none shadow-lg">
        <CardHeader className="pt-8 pb-4 flex flex-col items-center gap-2">
          <Sparkles className="w-8 h-8 text-[#C5A880]" />
          <CardTitle className="text-2xl font-serif text-center">Set up your admin account</CardTitle>
        </CardHeader>
        <CardContent className="pb-8 space-y-6">
          <p className="text-sm text-[#7A7A7A] text-center max-w-md mx-auto">
            One-time setup. Choose a strong password and pair your authenticator app — you&apos;ll need both at every sign-in.
          </p>

          <form onSubmit={submit} className="space-y-6">
            <div className="grid md:grid-cols-2 gap-6 items-start">
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-[#4A4A4A]">Password (min 12 characters)</label>
                  <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="h-12 bg-white" autoComplete="new-password" required />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-[#4A4A4A]">Confirm password</label>
                  <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="h-12 bg-white" autoComplete="new-password" required />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-[#4A4A4A]">6-digit code</label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ''))}
                    autoComplete="one-time-code"
                    required
                    className="h-12 bg-white tracking-widest text-center text-lg"
                  />
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium text-[#4A4A4A]"><KeyRound className="w-4 h-4 text-[#C5A880]" /> Scan with your authenticator</div>
                {totp && (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={totp.qr} alt="TOTP QR" className="rounded-xl border border-black/5 bg-white p-2" width={240} height={240} />
                    <details className="text-xs text-[#7A7A7A]">
                      <summary className="cursor-pointer">Can&apos;t scan? Use this secret</summary>
                      <code className="block mt-2 font-mono break-all bg-[#FAF9F6] p-2 rounded-md border border-black/5">{totp.secret}</code>
                    </details>
                  </>
                )}
              </div>
            </div>

            <Button type="submit" size="lg" className="w-full h-12" disabled={busy}>
              {busy ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Setting up…</> : 'Complete setup'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
