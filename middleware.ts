import { NextRequest, NextResponse } from 'next/server'

/**
 * Edge middleware: security headers + admin route protection.
 *
 * Rate limiting lives inside individual API routes (lib/rate-limit) so each
 * limiter can use a per-route bucket with appropriate generosity. Middleware
 * here just adds defence-in-depth at the perimeter.
 *
 * Why this middleware does NOT call Supabase: Edge runtime + cold-start
 * latency + the fact that session validation does a DB roundtrip with a
 * per-request `last_seen_at` update. The redirect on `/admin/dashboard/*`
 * below is a UX hint; the API routes themselves enforce auth strictly.
 */

const CSP_DEV = [
  "default-src 'self'",
  // 'unsafe-eval' is needed for Next dev fast-refresh; production CSP below omits it.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://checkout.razorpay.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.razorpay.com https://lumberjack.razorpay.com https://*.upstash.io https://graph.facebook.com",
  "frame-src https://api.razorpay.com https://checkout.razorpay.com",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
].join('; ')

const CSP_PROD = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://checkout.razorpay.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.razorpay.com https://lumberjack.razorpay.com https://*.upstash.io https://graph.facebook.com",
  "frame-src https://api.razorpay.com https://checkout.razorpay.com",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
  'upgrade-insecure-requests',
].join('; ')

function withSecurityHeaders(res: NextResponse): NextResponse {
  const csp = process.env.NODE_ENV === 'production' ? CSP_PROD : CSP_DEV
  res.headers.set('Content-Security-Policy', csp)
  res.headers.set('X-Content-Type-Options', 'nosniff')
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.headers.set('X-Frame-Options', 'DENY')
  res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()')
  if (process.env.NODE_ENV === 'production') {
    res.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload')
  }
  return res
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Soft redirect for unauthenticated admin dashboard pageviews. API routes
  // and login forms remain reachable so the SPA can render its own states.
  if (pathname.startsWith('/admin/dashboard') && !req.cookies.get('admin_session')?.value) {
    const url = req.nextUrl.clone()
    url.pathname = '/admin'
    return withSecurityHeaders(NextResponse.redirect(url))
  }

  return withSecurityHeaders(NextResponse.next())
}

export const config = {
  matcher: [
    // Run on every route EXCEPT the asset paths Next.js owns.
    '/((?!_next/static|_next/image|favicon\\.ico|imports/).*)',
  ],
}
