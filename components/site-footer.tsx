import Link from 'next/link'
import { Sparkles } from 'lucide-react'

export function SiteFooter() {
  return (
    <footer className="bg-white border-t border-black/5 py-12 mt-auto">
      <div className="container mx-auto px-4 md:px-8">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2 text-xl font-semibold text-[#4A4A4A]">
            <Sparkles className="w-5 h-5 text-[#C5A880]" />
            Suma Consultation
          </div>
          <div className="flex flex-wrap justify-center gap-6 text-sm text-[#7A7A7A]">
            <Link href="/#contact" className="hover:text-[#C5A880] transition-colors">Contact</Link>
            <Link href="/privacy" className="hover:text-[#C5A880] transition-colors">Privacy Policy</Link>
            <Link href="/terms" className="hover:text-[#C5A880] transition-colors">Terms</Link>
            <a href="#" className="hover:text-[#C5A880] transition-colors">Instagram</a>
            <a href="#" className="hover:text-[#C5A880] transition-colors">WhatsApp</a>
          </div>
        </div>
        <div className="mt-8 text-center text-sm text-[#9A9A9A]">
          &copy; {new Date().getFullYear()} Suma Consultation. All rights reserved.
        </div>
      </div>
    </footer>
  )
}
