'use client'

import { useEffect } from 'react'
import { clearDraft } from './draft-storage'

/**
 * Empty client component that drops the booking-flow draft from
 * sessionStorage when it mounts. Used on /booking/success to ensure the
 * customer's previous draft (PII included) is wiped the moment the booking
 * is confirmed.
 */
export function ClearDraftOnMount() {
  useEffect(() => { clearDraft() }, [])
  return null
}
