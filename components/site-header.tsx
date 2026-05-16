'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Sparkles, Menu, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function SiteHeader() {
  const [open, setOpen] = useState(false)

  return (
    <header className="sticky top-0 z-50 w-full border-b border-black/5 bg-white/80 backdrop-blur-md">
      <div className="container mx-auto px-4 md:px-8 h-20 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-[#4A4A4A]">
          <Sparkles className="w-6 h-6 text-[#C5A880]" />
          Suma
        </Link>

        <nav className="hidden md:flex items-center gap-8">
          <Link href="/" className="text-sm font-medium text-[#7A7A7A] hover:text-[#C5A880] transition-colors">Home</Link>
          <Link href="/#about" className="text-sm font-medium text-[#7A7A7A] hover:text-[#C5A880] transition-colors">About</Link>
          <Link href="/#services" className="text-sm font-medium text-[#7A7A7A] hover:text-[#C5A880] transition-colors">Services</Link>
          <Link href="/#blog" className="text-sm font-medium text-[#7A7A7A] hover:text-[#C5A880] transition-colors">Insights</Link>
        </nav>

        <div className="hidden md:block">
          <Link href="/book">
            <Button>Book Consultation</Button>
          </Link>
        </div>

        <button
          className="md:hidden p-2 text-[#4A4A4A]"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? 'Close menu' : 'Open menu'}
        >
          {open ? <X /> : <Menu />}
        </button>
      </div>

      {open && (
        <div className="md:hidden absolute top-20 left-0 w-full bg-white border-b border-black/5 p-4 flex flex-col gap-4 shadow-lg">
          <Link href="/" className="p-2 text-[#7A7A7A] hover:bg-[#FAF9F6] rounded-xl" onClick={() => setOpen(false)}>Home</Link>
          <Link href="/#about" className="p-2 text-[#7A7A7A] hover:bg-[#FAF9F6] rounded-xl" onClick={() => setOpen(false)}>About</Link>
          <Link href="/#services" className="p-2 text-[#7A7A7A] hover:bg-[#FAF9F6] rounded-xl" onClick={() => setOpen(false)}>Services</Link>
          <Link href="/#blog" className="p-2 text-[#7A7A7A] hover:bg-[#FAF9F6] rounded-xl" onClick={() => setOpen(false)}>Insights</Link>
          <Link href="/book" onClick={() => setOpen(false)}>
            <Button className="w-full">Book Consultation</Button>
          </Link>
        </div>
      )}
    </header>
  )
}
