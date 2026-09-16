/**
 * THE «Alternativer» REGISTRY — every switch, and the ONE place the product
 * reads it.
 *
 * ══ WHY THIS FILE EXISTS, AND IT IS NOT THE REASON G2 WAS ASKED FOR ════════
 *
 * G2's brief was v6's four new toggles — Tuva, quiz, live, klarspråk — under
 * one rule: «a switch whose state nothing STORES is not a setting.» Measured
 * against the panel that already ships, the same rule has a twin nobody had
 * needed to state, because in a DRAWING storage is the visible gap:
 *
 *   **A switch whose state nothing READS is not a setting either — and it is
 *   the worse half, because it survives every test that checks the value
 *   round-trips.**
 *
 * Measured 2026-09-16, and the command is the evidence:
 *
 *   grep -rn "select('options" --include=*.ts app/ lib/
 *     app/(app)/administrasjon/actions.ts:330   ← the panel's own write
 *     lib/auth/session.ts:94                    ← ssoRequired
 *   (plus app/(app)/administrasjon/valg/page.tsx:27, the panel's own read)
 *
 * `organizations.options` is read in THREE places. Two of them are the settings
 * screen reading and writing itself. **Exactly one key — `sso` — changes what
 * the product does.** `reminders`, `weekly_digest`, `allow_self_serve` and
 * `brand_mail` have been stored, audited, round-tripped and shown as ON since
 * `M:0002`, and the product behaves identically either way. The catalogue says
 * the same: no function in `app` or `public` names any of the four.
 *
 * ══ SO THE REGISTRY CARRIES THE ENFORCEMENT POINT, NOT JUST THE KEY ════════
 *
 * `enforcedAt` is a `file:symbol` a reader can open, or `null` with the reason.
 * That is the difference between a list of keys and a statement about the
 * product: a key cannot be added here without answering «who reads this?», and
 * `tests/unit/org-options.test.ts` sweeps the SOURCE for each declared reader
 * rather than trusting the string — CLAUDE.md's «a grant is a fact about the
 * catalogue and must be read back from the catalogue», aimed at a setting.
 *
 * The four unenforced rows are NOT deleted here. Two of them (`weekly_digest`,
 * `allow_self_serve`) govern features that do not exist at all, and removing a
 * shipped control is a product decision rather than a fix — it is reported for
 * one. What this file does instead is make the gap visible in code and on the
 * screen, which is the same treatment a refused panel gets.
 */

export const OPTION_KEYS = [
  /* v6:8008's five, in its order, then the four this product shipped before
     v6 rewrote the row set. v2-v5 all draw the SAME five and v6 replaces every
     one of them — a whole-panel substitution, not an edit (D207). */
  'tuva',
  'quiz',
  'live',
  'reminders',
  'klarsprak',
  /* `weekly_digest` and `allow_self_serve` STOOD HERE and are gone (G3, D211,
     Tor's decision). Both governed features that do not exist — there is no
     digest and no approval flow — and «a switch over nothing is worse than no
     switch: it promises a capability.»

     Removing them from THIS list is the whole removal: `setOption`'s Zod enum
     is `z.enum(OPTION_KEYS)`, `optionsOf` builds its object from it, and the
     panel's `ROW_ORDER` is it. The key becomes unwritable, unread and
     unrendered in one edit.

     THE STORED VALUES STAY, and `M:0126` says why at length — the short form
     is that `audit_events` holds every `option.change` anyone made to them, and
     such a row is interpretable only while the key it names is still visible in
     the column. */
  'sso',
  'brand_mail',
] as const
export type OptionKey = (typeof OPTION_KEYS)[number]

export type OptionRow = {
  key: OptionKey
  /**
   * Where the product READS this key — a path and the symbol, so a reader can
   * open it — or `null` when nothing does, with `why` saying so.
   */
  enforcedAt: string | null
  /** Stated only when `enforcedAt` is null: why there is no reader. */
  why?: string
  /**
   * True when turning the switch OFF can be REFUSED because something is
   * currently using the feature. Without this, «off» would leave existing
   * surveys running in a mode the organisation has just disallowed — a feature
   * that is off and still reachable by URL, which is a switch that describes
   * rather than controls.
   */
  guardsExisting?: boolean
}

export const OPTION_ROWS: readonly OptionRow[] = [
  {
    key: 'tuva',
    // Off renders no analyst and no placement switch. Tuva reads participation
    // counts and writes nothing, so nothing is stranded and no URL reaches it
    // separately: it is a panel on a screen, not a route.
    enforcedAt: 'app/(app)/undersokelser/page.tsx:tuvaOn',
  },
  {
    key: 'quiz',
    // Off refuses the mode at the WRITE (app.guard_run_mode_allowed, M:0124),
    // so psql cannot reach it either; the Builder's radio is disabled and says
    // why; and turning it off is refused while any survey is in quiz mode.
    enforcedAt: 'supabase/migrations/20260916000124:app.guard_run_mode_allowed',
    guardsExisting: true,
  },
  {
    key: 'live',
    enforcedAt: 'supabase/migrations/20260916000124:app.guard_run_mode_allowed',
    guardsExisting: true,
  },
  {
    key: 'reminders',
    // G3 — WIRED. `app.enqueue_reminders` (M:0126) reads it: an organisation
    // with it off produces no reminders at all, while `reminder_after_days`
    // still decides WHEN for everyone else. A master switch and a schedule.
    enforcedAt: 'supabase/migrations/20260916000126:app.enqueue_reminders',
  },
  {
    key: 'klarsprak',
    // Off computes no quality flags in the Builder. It governs `qualityFlags`
    // and NOT `policyWarnings`: the latter carry the threshold and anonymity
    // warnings, and CLAUDE.md forbids making a security warning
    // org-configurable. The boundary is asserted in the test.
    enforcedAt: 'app/(app)/undersokelser/[id]/bygg/page.tsx:klarsprakOn',
  },
  { key: 'sso', enforcedAt: 'lib/auth/session.ts:ssoRequired' },
  {
    key: 'brand_mail',
    // G3 — NOT WIRED, and the reason is not «nobody got round to it».
    // Tor's split put this with `reminders` as a feature that exists: «the logo
    // in the invitation template». Measured, there is no such template.
    // `invitationMessage` (lib/mail/copy.ts:73) returns `{ subject, text }` and
    // `MailMessage.html` is never set — the only place a message is built is
    // `supabase/functions/mail-worker/index.ts:190`. The invitation is PLAIN
    // TEXT, so there is no HTML for a logo to sit in.
    //
    // The logos themselves exist (`logo_light`, `logo_dark`, `logo_icon`,
    // Q58/V2-2). The gap is the mail body. So «wire it» is not a wiring: it is
    // «build an HTML invitation», a new respondent-facing surface, and that is
    // Tor's decision rather than a phase's.
    enforcedAt: null,
    why: 'brandmail-no-html',
  },
] as const

const BY_KEY = new Map(OPTION_ROWS.map((r) => [r.key, r]))

export function optionRow(key: OptionKey): OptionRow {
  const row = BY_KEY.get(key)
  if (!row) throw new Error(`no registry row for option ${key}`)
  return row
}

/** The keys the product actually honours. Derived, never listed twice. */
export const ENFORCED_KEYS = OPTION_ROWS.filter((r) => r.enforcedAt !== null).map((r) => r.key)

/**
 * The run modes an organisation may use.
 *
 * ONE function rather than two reads, because the two keys are the same rule
 * with a different name, and F3's lesson applies: a rule with one name may
 * still have four implementations. `standard` is not optional and is not in
 * `options` at all — a survey must be runnable.
 */
export type RunMode = 'standard' | 'live' | 'quiz'

export function runModeAllowed(mode: RunMode, options: Record<string, unknown>): boolean {
  if (mode === 'standard') return true
  return options[mode] === true
}

/** Reads the column the way the settings screen does: absent means OFF. */
export function optionsOf(raw: unknown): Record<OptionKey, boolean> {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return Object.fromEntries(OPTION_KEYS.map((k) => [k, r[k] === true])) as Record<OptionKey, boolean>
}

/**
 * The column default, mirrored — `M:0124`'s `jsonb_build_object(...)` exactly.
 *
 * For fixtures that write the WHOLE object. The product never does: `setOption`
 * spreads onto what is stored, so one switch cannot drop the other eight. A
 * test that replaced the column was how that difference became visible, and it
 * is worth a name rather than a literal in two files.
 */
export const OPTION_DEFAULTS: Record<OptionKey, boolean> = {
  tuva: true,
  quiz: true,
  live: true,
  klarsprak: true,
  reminders: true,
  sso: false,
  brand_mail: true,
}

/**
 * The keys a probe may toggle freely, derived rather than listed.
 *
 * G3's fix pass: `verify:roundtrip` drove «Ukentlig sammendrag på e-post» by
 * name, and Q215 removed that row — so a gate that had passed for phases
 * started timing out on a control that no longer exists. The repair is not a
 * second hard-coded label, which would orphan the same way at the next removal.
 *
 * Excluded: `sso`, which has its own three round-trip cases and a break-glass
 * refusal, and any row with `guardsExisting`, which the database may REFUSE to
 * turn off while a survey is in that mode — a refused write is the correct
 * behaviour and would read as a broken probe.
 */
export const FREELY_TOGGLEABLE_KEYS: readonly OptionKey[] = OPTION_ROWS.filter(
  (r) => r.key !== 'sso' && !r.guardsExisting,
).map((r) => r.key)

/** `reminders` -> `oReminders`, the panel's own label-key convention. */
export function optionLabelKey(key: OptionKey): string {
  return `o${key.replace(/(^|_)(\w)/g, (_m, _s, c: string) => c.toUpperCase())}`
}
