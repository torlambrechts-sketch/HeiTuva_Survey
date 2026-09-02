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

/** Option toggles that are actually settable. `sso` is absent: it ships in
 *  Phase 6 (DECISIONS Q5) and the action refuses the key. */
export const OPTION_KEYS = ['reminders', 'weekly_digest', 'allow_self_serve', 'brand_mail'] as const
export type OptionKey = (typeof OPTION_KEYS)[number]

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
