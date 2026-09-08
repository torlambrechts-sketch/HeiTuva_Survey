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

/**
 * The cadence vocabulary — DECISIONS Q20, and it must stay level with two
 * other places: the `app.cadence` enum (M:0001:20 + M:0043) and
 * `app.cadence_interval` (M:0044).
 *
 * `biannual` is in the enum and deliberately NOT here: Q20 keeps it because a
 * Postgres enum value cannot be dropped without recreating the type, and keeps
 * it out of the product because nothing holds it. A value absent from this
 * list cannot be chosen in the UI, which is where "undocumented" is enforced.
 *
 * NAMING, because the bundle and the schema disagree: the prototype's key for
 * «Hvert år» is `yearly` (:2941); the column has held `annual` since M:0001:20
 * and Q20 chose not to rename it. The label is the bundle's, the value is the
 * schema's.
 */
export const CADENCES = [
  'once', 'weekly', 'biweekly', 'monthly', 'quarterly', 'annual', 'biennial', 'custom',
] as const
export type Cadence = (typeof CADENCES)[number]

export const CADENCE_KEY: Record<Cadence, { label: string; desc: string }> = {
  once: { label: 'cadOnce', desc: 'cadOnceDesc' },
  weekly: { label: 'cadWeekly', desc: 'cadWeeklyDesc' },
  biweekly: { label: 'cadBiweekly', desc: 'cadBiweeklyDesc' },
  monthly: { label: 'cadMonthly', desc: 'cadMonthlyDesc' },
  quarterly: { label: 'cadQuarterly', desc: 'cadQuarterlyDesc' },
  annual: { label: 'cadAnnual', desc: 'cadAnnualDesc' },
  biennial: { label: 'cadBiennial', desc: 'cadBiennialDesc' },
  custom: { label: 'cadCustom', desc: 'cadCustomDesc' },
}

/**
 * Days between rounds — the plan chips' spacing and nothing else.
 *
 * NOT the schedule's next run. That is `app.cadence_interval` (M:0044), which
 * uses real month and year intervals rather than a day count, because 30 days
 * is not a month and 365 is not a year across a leap year. These numbers are
 * for drawing four chips on a screen; the day the two are asked to agree, the
 * database is right.
 *
 * `custom` is 0 here because its spacing comes from the customer's own
 * `every`/`unit`, via `customCadenceDays` below.
 */
export const CADENCE_DAYS: Record<Cadence, number> = {
  once: 0,
  weekly: 7,
  biweekly: 14,
  monthly: 30,
  quarterly: 91,
  annual: 365,
  biennial: 730,
  custom: 0,
}

/** The custom cadence's three settings — the bundle's editor (NEW:2183-2195). */
export const CUSTOM_UNITS = ['days', 'weeks', 'months'] as const
export type CustomUnit = (typeof CUSTOM_UNITS)[number]

/** Monday–Friday, as the selector offers (:2192) and the CHECK enforces. */
export const CUSTOM_WEEKDAYS = [1, 2, 3, 4, 5] as const

export const CUSTOM_UNIT_DAYS: Record<CustomUnit, number> = {
  days: 1,
  weeks: 7,
  months: 30,
}

/** Chip spacing for a custom cadence. Same caveat as CADENCE_DAYS. */
export const customCadenceDays = (every: number, unit: CustomUnit): number =>
  Math.max(1, every) * CUSTOM_UNIT_DAYS[unit]

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
 * The sources that parse without an integration behind them. These three are
 * always available; the three directory syncs are gated by `feature_flags` and
 * resolved per organisation on the server — see `syncSources` below.
 *
 * ── DECISIONS Q62, AND WHY THIS CONSTANT SHRANK ─────────────────────────────
 *
 * It used to read `['csv', 'excel', 'paste']` and it was **the only gate on the
 * three syncs** — a hard-coded client constant standing in for the
 * `feature_flags` mechanism that `DECISIONS.md` Q9, `docs/v2/03-plan.md` and
 * **D44** all describe and that no code performed: `entra_sync`, `google_sync`
 * and `hr_sync` are seeded `false` and were read by nothing. That is D110
 * instance 2 — a gate nobody reads is not a gate — and Q62 says build it rather
 * than assert it.
 *
 * `excel` stays in the list because it genuinely parses CSV and TSV, which is
 * what the control actually accepts. **What it does NOT do is read `.xlsx`**,
 * and Q62's answer to that is a refusal at the file, not a smaller list — see
 * `looksLikeXlsx`.
 */
export const PARSED_SOURCES: readonly ImportSource[] = ['csv', 'excel', 'paste']

/** The three that need an integration, each with the flag that gates it. */
export const SYNC_SOURCE_FLAGS = {
  entra: 'entra_sync',
  google: 'google_sync',
  hr: 'hr_sync',
} as const

/**
 * Is this file an OOXML workbook wearing another name?
 *
 * **DECISIONS Q62, and the reason it sniffs bytes rather than the extension.**
 * `parseRecipients` takes a string, so a real `.xlsx` handed to it is read as
 * text and produces garbage rows **silently** — under a label reading «Excel
 * (.xlsx)» and help text promising «Vi leser første ark». CLAUDE.md's
 * never-fabricate rule decides it: silent garbage from a real file is worse
 * than a refusal, *because the user cannot tell it happened*.
 *
 * An extension check is not enough. A workbook saved as `medlemmer.csv` fails
 * the name test and still is not text, and that is exactly the file a confused
 * user produces. Every OOXML file is a ZIP, so the first four bytes are the
 * honest question: `PK\x03\x04`.
 */
export function looksLikeXlsx(head: Uint8Array): boolean {
  return head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04
}

export const IMPORT_KEY: Record<ImportSource, { label: string; desc: string }> = {
  csv: { label: 'impCsv', desc: 'impCsvDesc' },
  excel: { label: 'impExcel', desc: 'impExcelDesc' },
  entra: { label: 'impEntra', desc: 'impEntraDesc' },
  google: { label: 'impGoogle', desc: 'impGoogleDesc' },
  hr: { label: 'impHr', desc: 'impHrDesc' },
  paste: { label: 'impPaste', desc: 'impPasteDesc' },
}
