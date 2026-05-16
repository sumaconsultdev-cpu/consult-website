import 'server-only'

/**
 * Tiny structured logger. Single JSON line per event so Vercel's log viewer
 * is greppable and any future external sink (Logtail, Axiom, Datadog) can
 * ingest without parsing. Sensitive fields are NOT redacted here — callers
 * must not pass secrets in.
 */

type Level = 'debug' | 'info' | 'warn' | 'error'

function emit(level: Level, msg: string, fields?: Record<string, unknown>) {
  const entry = {
    t: new Date().toISOString(),
    level,
    msg,
    ...(fields ?? {}),
  }
  const line = JSON.stringify(entry)
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

export const log = {
  debug: (msg: string, fields?: Record<string, unknown>) =>
    process.env.NODE_ENV !== 'production' && emit('debug', msg, fields),
  info: (msg: string, fields?: Record<string, unknown>) => emit('info', msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) => emit('warn', msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => emit('error', msg, fields),
}
