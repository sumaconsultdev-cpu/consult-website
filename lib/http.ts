import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { log } from '@/lib/logger'

/**
 * Uniform JSON helpers. Errors are scrubbed: we never let stack traces or
 * Postgres details bubble to the browser. Internal context goes to the log
 * with a short error code that the operator can grep for.
 */

export function ok<T extends object>(data: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true, ...data }, init)
}

export function fail(status: number, code: string, message: string, fields?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error: { code, message } }, { status, ...(fields ?? {}) })
}

/** Wrap a route handler so any thrown error becomes a 500 with no detail leak. */
export function safe<T extends (...args: any[]) => Promise<Response>>(handler: T): T {
  return (async (...args: any[]) => {
    try {
      return await handler(...args)
    } catch (e: any) {
      if (e instanceof ZodError) {
        return fail(400, 'validation_failed', 'Invalid input', { headers: undefined })
      }
      const code = e?.code ?? 'internal_error'
      log.error('route.unhandled', { code, message: e?.message })
      return fail(500, 'internal_error', 'Something went wrong. Please try again.')
    }
  }) as T
}

/** Best-effort caller IP — Vercel sets x-forwarded-for. */
export function callerIp(headers: Headers): string {
  const xff = headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0]!.trim()
  return headers.get('x-real-ip') ?? '0.0.0.0'
}
