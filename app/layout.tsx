import type { Metadata, Viewport } from 'next'
import './globals.css'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { CookieBanner } from '@/components/cookie-banner'
import { Toaster } from '@/components/ui/sonner'

export const metadata: Metadata = {
  title: { default: 'Suma Consultation — Numerology & Vaastu', template: '%s · Suma Consultation' },
  description:
    'Personalised numerology, Vaastu and holistic spiritual guidance to bring clarity and harmony into your life.',
  metadataBase: new URL(process.env.APP_BASE_URL || 'http://localhost:3000'),
  openGraph: {
    title: 'Suma Consultation',
    description: 'Personalised numerology, Vaastu and holistic spiritual guidance.',
    type: 'website',
    locale: 'en_IN',
  },
  robots: { index: true, follow: true },
  icons: { icon: '/favicon.ico' },
}

export const viewport: Viewport = {
  themeColor: '#FAF9F6',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#FAF9F6] text-[#4A4A4A] font-sans flex flex-col selection:bg-[#8E7CC3] selection:text-white">
        <SiteHeader />
        <main className="flex-1 flex flex-col">{children}</main>
        <SiteFooter />
        <CookieBanner />
        <Toaster richColors closeButton />
      </body>
    </html>
  )
}
