import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function NotFound() {
  return (
    <div className="flex-1 flex items-center justify-center py-24 bg-[#FAF9F6]">
      <div className="text-center max-w-md">
        <h1 className="text-5xl font-serif font-medium text-[#2D2D2D] mb-4">404</h1>
        <p className="text-[#7A7A7A] text-lg mb-8">The page you were looking for isn&apos;t here.</p>
        <Link href="/">
          <Button size="lg">Return Home</Button>
        </Link>
      </div>
    </div>
  )
}
