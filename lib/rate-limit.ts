import 'server-only'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { env } from '@/lib/env'
import { log } from '@/lib/logger'

/**
 * Per-IP / per-key rate limiting via Upstash Redis.
 *
 * Graceful degradation: if Upstash creds are not configured (e.g., during
 * local dev or first deploy), every request is allowed but a WARN is logged.
 * The middleware never blocks because the rate-limit infra is missing.
 */

const url = env.upstashUrl()
const token = env.upstashToken()
const redis = url && token ? new Redis({ url, token }) : null

if (!redis && env.isProd()) {
  log.warn('rate-limit.disabled', { reason: 'UPSTASH_* env vars missing in production' })
}

type LimitName = 'public' | 'booking' | 'admin-login' | 'webhook' | 'admin-action'

const limiters: Record<LimitName, Ratelimit | null> = redis
  ? {
      // 100 req / minute / IP across the site
      'public':        new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(100, '1 m'), prefix: 'rl:pub'  }),
      // 10 booking creates / 10 min / IP — protects Razorpay + DB
      'booking':       new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(10,  '10 m'), prefix: 'rl:bk'  }),
      // 5 login attempts / 15 min / IP — slowdown on top of DB attempt log
      'admin-login':   new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(5,   '15 m'), prefix: 'rl:al'  }),
      // 60 webhook deliveries / minute — Razorpay retries shouldn't get capped, but flood from a forged sender should
      'webhook':       new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(60,  '1 m'),  prefix: 'rl:wh'  }),
      // 30 admin actions / minute / session
      'admin-action':  new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(30,  '1 m'),  prefix: 'rl:aa'  }),
    }
  : {
      'public': null, 'booking': null, 'admin-login': null, 'webhook': null, 'admin-action': null,
    }

export async function limit(name: LimitName, key: string): Promise<{ ok: boolean; remaining: number; resetMs: number }> {
  // Hard bypass for local development. `env.rateLimitDisabled()` refuses
  // to honour the flag when NODE_ENV === 'production' so a stray
  // RATE_LIMIT_DISABLED=true in a production env file cannot weaken the
  // service. See lib/env.ts.
  if (env.rateLimitDisabled()) return { ok: true, remaining: -1, resetMs: 0 }
  const l = limiters[name]
  if (!l) return { ok: true, remaining: -1, resetMs: 0 }
  const r = await l.limit(key)
  return { ok: r.success, remaining: r.remaining, resetMs: r.reset - Date.now() }
}
