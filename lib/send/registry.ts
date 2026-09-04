/**
 * The Send screen's vocabulary, as data.
 *
 * CLAUDE.md's data-not-code rule: adding a channel or a cadence is a row here
 * and a message key, not a new branch in the component. The keys map to the
 * `respondent`/`send` namespaces so nothing on screen is a hard-coded string.
 */

/** Channels the design offers (HeiTuva.dc.html:3843). */
export const CHANNELS = ['email', 'link', 'qr', 'sms'] as const
export type Channel = (typeof CHANNELS)[number]

/**
 * SMS is behind a flag (DECISIONS: Phase 6 "SMS if v1"). The card renders, as
 * the design draws it, but selecting it is refused until the flag is on —
 * showing a channel that silently sends nothing would be worse than showing it
 * as not yet available.
 */
export const FLAGGED_CHANNELS: Partial<Record<Channel, string>> = { sms: 'sms_channel' }

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
