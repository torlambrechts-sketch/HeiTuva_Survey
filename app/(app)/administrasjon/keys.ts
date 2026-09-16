/**
 * The key sets the Administrasjon screens iterate over.
 *
 * These must NOT live in the `'use client'` panel modules that render them.
 * Every export of a client module becomes a client reference when a server
 * component imports it, so `PRIVACY_KEYS.map(...)` in a page threw and the tab
 * 500'd — the same trap that moved NOTIFY_KEYS out of the Profil actions.
 */

/** Privacy toggles that are actually settable. "Skjul resultater under 5 svar"
 *  is absent on purpose: k=5 is enforced in the database and is not
 *  org-configurable (DECISIONS Q3). */
export const PRIVACY_KEYS = ['ip_logging', 'eu_only', 'auto_delete', 'consent'] as const
export type PrivacyKey = (typeof PRIVACY_KEYS)[number]

/**
 * Keys whose switch reads the opposite way round from the stored column.
 *
 * `organizations.privacy.ip_logging` means what it says: are IP addresses
 * logged. The design's switch is labelled "Ikke lagre IP-adresse", so it is ON
 * precisely when that column is false (the prototype papers over this by
 * storing `ipLogging: true` for "do not log", which reads as its own opposite).
 * Without the translation the screen showed IP logging as off while the column
 * said off, and turning the switch ON would have switched IP logging ON.
 */
const INVERTED: ReadonlySet<string> = new Set<PrivacyKey>(['ip_logging'])

/** Stored column value -> the position the switch should render in. */
export function privacyToDisplay(key: PrivacyKey, stored: boolean): boolean {
  return INVERTED.has(key) ? !stored : stored
}

/** Switch position -> the value to store. */
export function privacyToStored(key: PrivacyKey, on: boolean): boolean {
  return INVERTED.has(key) ? !on : on
}

/* G2 — the option keys MOVED to `lib/org/options.ts`, which carries the one
   place the product READS each of them. Re-exported here so the existing
   imports keep working and there is still exactly one definition.

   The move is the point: this file held a list of keys, and a list of keys
   cannot answer «who reads this?» — the question that turned out to have the
   answer «nothing» for four of the five (D208). */
export { OPTION_KEYS, type OptionKey } from '@/lib/org/options'

export const DSR_TYPES = ['innsyn', 'retting', 'sletting', 'portabilitet'] as const
export type DsrType = (typeof DSR_TYPES)[number]

export const DSR_STATUSES = ['mottatt', 'under_behandling', 'fullfort', 'avvist'] as const
export type DsrStatus = (typeof DSR_STATUSES)[number]

export type DsrRequest = {
  id: string
  type: DsrType
  subject_email: string
  status: DsrStatus
  due_at: string
}
