import { formatInTimeZone, toZonedTime, fromZonedTime } from 'date-fns-tz'
import { addDays, format, parse } from 'date-fns'

/**
 * All public-facing date/time math runs in Asia/Kolkata (IST, UTC+05:30, no DST).
 * The DB stores `date` and `time` columns which are timezone-agnostic — we
 * treat them as IST wall-clock everywhere on read/write.
 */

export const IST = 'Asia/Kolkata'

/** Today's date in IST as `YYYY-MM-DD`. */
export function todayIST(now: Date = new Date()): string {
  return formatInTimeZone(now, IST, 'yyyy-MM-dd')
}

/** Current wall-clock HH:MM in IST. */
export function nowTimeIST(now: Date = new Date()): string {
  return formatInTimeZone(now, IST, 'HH:mm')
}

/** Validate `YYYY-MM-DD`. */
export function isValidDateString(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'))
}

/** Validate `HH:MM` (00-23 : 00-59). */
export function isValidTimeString(s: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s)
}

/** Day-of-week (0=Sunday) for an IST date string. */
export function dayOfWeekIST(dateStr: string): number {
  // Anchor at IST noon so we sidestep any tz arithmetic ambiguity.
  const ist = parse(dateStr + ' 12:00', 'yyyy-MM-dd HH:mm', new Date())
  const asUtc = fromZonedTime(ist, IST)
  return toZonedTime(asUtc, IST).getDay()
}

/**
 * Return true if `date + time` (interpreted in IST) is more than `minHours`
 * hours after now. Used to enforce the 24-hour lead-time rule.
 */
export function isMoreThanHoursAhead(dateStr: string, timeStr: string, minHours: number): boolean {
  const ist = parse(`${dateStr} ${timeStr}`, 'yyyy-MM-dd HH:mm', new Date())
  const utc = fromZonedTime(ist, IST)
  const diffMs = utc.getTime() - Date.now()
  return diffMs >= minHours * 60 * 60 * 1000
}

/** Add N days to an IST date string (`YYYY-MM-DD`). */
export function addDaysIST(dateStr: string, days: number): string {
  const ist = parse(dateStr, 'yyyy-MM-dd', new Date())
  return format(addDays(ist, days), 'yyyy-MM-dd')
}

/** Pretty-format an IST date/time tuple for messages and UI. */
export function formatDateTimeIST(dateStr: string, timeStr: string): string {
  const ist = parse(`${dateStr} ${timeStr}`, 'yyyy-MM-dd HH:mm', new Date())
  const utc = fromZonedTime(ist, IST)
  return formatInTimeZone(utc, IST, "EEE, d LLL yyyy 'at' h:mm a 'IST'")
}
