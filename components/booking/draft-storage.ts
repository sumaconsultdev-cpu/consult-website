/**
 * Per-tab draft storage for the booking flow.
 *
 *   - Backed by sessionStorage so the draft survives an accidental refresh,
 *     a redirect to /booking/failed, and a retry — but does NOT outlive the
 *     tab being closed.
 *   - Sensitive PII (DOB, time/place of birth, notes) lives in the same
 *     storage, which is same-origin and scoped to the tab. The booking
 *     never re-confirms consent from the cached value — `consented` is
 *     intentionally NOT persisted so the customer re-affirms before each
 *     submission, satisfying DPDP/GDPR-style fresh-consent expectations.
 *   - 30-minute hard TTL so a stale draft never silently auto-resumes
 *     hours later from a forgotten tab.
 *   - On any storage failure (private mode, quota, etc.) the helpers
 *     no-op and the flow continues as if there were no draft.
 */

const STORAGE_KEY = 'suma:booking-draft'
const TTL_MS = 30 * 60 * 1000

export type DraftForm = {
  serviceSlug: string
  date: string
  timeSlot: string
  fullName: string
  phone: string
  email: string
  dateOfBirth: string
  timeOfBirth: string
  placeOfBirth: string
  gender: '' | 'male' | 'female' | 'other' | 'prefer_not_to_say'
  notes: string
}

export type Draft = {
  step: number
  form: DraftForm
  savedAt: number
}

export function loadDraft(): Draft | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const d = JSON.parse(raw) as Draft
    if (!d || typeof d.savedAt !== 'number') return null
    if (Date.now() - d.savedAt > TTL_MS) {
      // Stale — drop it so the next mount sees a clean slate.
      window.sessionStorage.removeItem(STORAGE_KEY)
      return null
    }
    return d
  } catch {
    return null
  }
}

export function saveDraft(d: Omit<Draft, 'savedAt'>): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...d, savedAt: Date.now() }))
  } catch {
    /* private mode / quota — silently ignore */
  }
}

export function clearDraft(): void {
  if (typeof window === 'undefined') return
  try { window.sessionStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
}

/** True when the draft has anything meaningful worth resuming. */
export function draftHasContent(d: Draft | null): boolean {
  if (!d) return false
  const f = d.form
  return Boolean(
    f.serviceSlug || f.date || f.timeSlot ||
    f.fullName || f.phone || f.email ||
    f.dateOfBirth || f.timeOfBirth || f.placeOfBirth ||
    f.gender || f.notes,
  )
}
