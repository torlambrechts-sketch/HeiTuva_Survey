import type { FlagKey } from '@/lib/flags'
import type { Database } from '@/types/database'

/**
 * The Send screen's vocabulary, as data.
 *
 * CLAUDE.md's data-not-code rule: adding a channel or a cadence is a row here
 * and a message key, not a new branch in the component. The keys map to the
 * `respondent`/`send` namespaces so nothing on screen is a hard-coded string.
 */

/**
 * The channel union comes from the DATABASE, not from the array below.
 *
 * It used to be `(typeof CHANNELS)[number]` — a hand-written list that the
 * generated types could not contradict. So a migration adding a value to
 * `app.channel` left this file quietly one behind, and nothing failed until an
 * insert did. Deriving it means `CHANNEL_KEY` below stops compiling the moment
 * the enum grows, which is exactly when someone should be made to look.
 *
 * `app` is not an exposed schema, so the enum has no entry under `Enums`; it
 * surfaces inline on the column that carries it.
 */
export type Channel = Database['public']['Tables']['survey_invitations']['Row']['channel']

/** Channels the design offers (HeiTuva.dc.html:3843), in the order it draws
 *  them. `satisfies` catches a value here that the database does not have; the
 *  exhaustive `CHANNEL_KEY` below catches one the database has and this lacks. */
export const CHANNELS = ['email', 'link', 'qr', 'sms'] as const satisfies readonly Channel[]

/**
 * Which channels are gated, and by which `feature_flags` key.
 *
 * SMS is behind a flag (DECISIONS: Phase 6 "SMS if v1"). The card renders, as
 * the design draws it, but selecting it is refused until the flag is on —
 * showing a channel that silently sends nothing would be worse than showing it
 * as not yet available.
 *
 * This is the whole rule. The Send screen reads it rather than naming a
 * channel, so gating a new channel is a row here plus a flag row, never a new
 * branch in the component — and a flag key that does not exist stops
 * compiling, because the value type is the flag union itself.
 */
export const FLAGGED_CHANNELS: Partial<Record<Channel, FlagKey>> = { sms: 'sms_channel' }

/** The flags the Send screen must resolve before it can render the cards.
 *  Derived, so a channel gated here is resolved there without either file
 *  naming the other's contents. */
export const CHANNEL_FLAG_KEYS: readonly FlagKey[] = [
  ...new Set(CHANNELS.map((c) => FLAGGED_CHANNELS[c]).filter((k): k is FlagKey => k !== undefined)),
]

export const CHANNEL_KEY: Record<Channel, { label: string; desc: string }> = {
  email: { label: 'chEmail', desc: 'chEmailDesc' },
  link: { label: 'chLink', desc: 'chLinkDesc' },
  qr: { label: 'chQr', desc: 'chQrDesc' },
  sms: { label: 'chSms', desc: 'chSmsDesc' },
}

/** Matches `app.cadence` in migration 0001. */
export const CADENCES = ['once', 'weekly', 'biweekly', 'monthly', 'quarterly'] as const
export type Cadence = (typeof CADENCES)[number]

export const CADENCE_KEY: Record<Cadence, { label: string; desc: string }> = {
  once: { label: 'cadOnce', desc: 'cadOnceDesc' },
  weekly: { label: 'cadWeekly', desc: 'cadWeeklyDesc' },
  biweekly: { label: 'cadBiweekly', desc: 'cadBiweeklyDesc' },
  monthly: { label: 'cadMonthly', desc: 'cadMonthlyDesc' },
  quarterly: { label: 'cadQuarterly', desc: 'cadQuarterlyDesc' },
}

/** Days between rounds, used for the plan chips and the schedule's next run. */
export const CADENCE_DAYS: Record<Cadence, number> = {
  once: 0,
  weekly: 7,
  biweekly: 14,
  monthly: 30,
  quarterly: 91,
}

/** Matches `app.anonymity_mode`. */
export const ANONYMITY_MODES = ['anonymous', 'named', 'optional'] as const
export type AnonymityMode = (typeof ANONYMITY_MODES)[number]

export const ANONYMITY_KEY: Record<AnonymityMode, { label: string; desc: string }> = {
  anonymous: { label: 'anonAnonymous', desc: 'anonAnonymousDesc' },
  named: { label: 'anonNamed', desc: 'anonNamedDesc' },
  optional: { label: 'anonOptional', desc: 'anonOptionalDesc' },
}

/** The number-of-rounds choices the design offers; 0 means "until I stop it". */
export const RUN_COUNTS = [4, 8, 12, 26, 0] as const

/** Reminder cadence, constrained by the CHECK on `schedules.reminder_after_days`. */
export const REMINDER_DAYS = [2, 5, 0] as const

/** Import sources (HeiTuva.dc.html:4009). */
export const IMPORT_SOURCES = ['csv', 'excel', 'entra', 'google', 'hr', 'paste'] as const
export type ImportSource = (typeof IMPORT_SOURCES)[number]

/**
 * Which sources actually import today. CSV, Excel and paste are parsing
 * problems and are built; the three directory syncs are integrations with their
 * own auth flows, scheduled for Phase 6 alongside Entra SSO. Their cards render
 * — the design draws six — and explain themselves rather than failing silently.
 */
export const IMPLEMENTED_SOURCES: readonly ImportSource[] = ['csv', 'excel', 'paste']

export const IMPORT_KEY: Record<ImportSource, { label: string; desc: string }> = {
  csv: { label: 'impCsv', desc: 'impCsvDesc' },
  excel: { label: 'impExcel', desc: 'impExcelDesc' },
  entra: { label: 'impEntra', desc: 'impEntraDesc' },
  google: { label: 'impGoogle', desc: 'impGoogleDesc' },
  hr: { label: 'impHr', desc: 'impHrDesc' },
  paste: { label: 'impPaste', desc: 'impPasteDesc' },
}
