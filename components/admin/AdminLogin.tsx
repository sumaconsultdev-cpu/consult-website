'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'

export function AdminLogin() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    try {
      const r = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password, totpCode: code }),
      })
      const j = await r.json()
      if (!r.ok || !j.ok) {
        toast.error(j?.error?.message ?? 'Login failed.')
        return
      }
      router.push('/admin/dashboard')
      router.refresh()
    } catch {
      toast.error('Network error.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center justify-center py-20 px-4">
      <Card className="w-full max-w-md border-none shadow-lg">
        <CardHeader className="flex flex-col items-center gap-2 pt-8 pb-4">
          <Sparkles className="w-8 h-8 text-[#C5A880]" />
          <CardTitle className="text-2xl font-serif text-[#2D2D2D]">Admin Sign-In</CardTitle>
        </CardHeader>
        <CardContent className="pb-8">
          <form onSubmit={submit} className="space-y-5">
            <div className="space-y-2">
              <label className="text-sm font-medium text-[#4A4A4A]">Password</label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                className="h-12 bg-white"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-[#4A4A4A]">2FA code (6 digits)</label>
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
            <Button type="submit" size="lg" className="w-full h-12" disabled={busy || password.length < 4 || code.length !== 6}>
              {busy ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Signing in…</> : 'Sign in'}
            </Button>
            <p className="text-xs text-[#9A9A9A] text-center pt-2">
              Lost your authenticator? Use a recovery code (admin-only flow — coming soon).
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
