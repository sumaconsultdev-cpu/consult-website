'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

const KEY = 'suma_cookie_consent_v1'

/**
 * Cookie banner — purely UX/disclosure. The app uses only first-party,
 * essential cookies (session + CSRF), so we follow the soft-consent pattern:
 * a one-time dismissable note linking to the policy.
 */
export function CookieBanner() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    try {
      if (!localStorage.getItem(KEY)) setShow(true)
    } catch { /* SSR / disabled storage */ }
  }, [])

  if (!show) return null

  function accept() {
    try { localStorage.setItem(KEY, '1') } catch { /* ignore */ }
    setShow(false)
  }

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-6 md:bottom-6 md:max-w-md z-50">
      <div className="bg-white border border-black/10 shadow-xl rounded-2xl p-5 flex flex-col gap-3">
        <p className="text-sm text-[#4A4A4A]">
          We use a small number of essential cookies to keep you signed in and to secure form submissions.
          See our <Link href="/privacy" className="underline text-[#8E7CC3]">privacy policy</Link>.
        </p>
        <div className="flex justify-end">
          <Button size="sm" onClick={accept}>Got it</Button>
        </div>
      </div>
    </div>
  )
}
