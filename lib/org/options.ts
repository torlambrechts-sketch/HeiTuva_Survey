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
  'weekly_digest',
  'allow_self_serve',
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
    enforcedAt: null,
    why: 'reminders-unread',
  },
  {
    key: 'klarsprak',
    // Off computes no quality flags in the Builder. It governs `qualityFlags`
    // and NOT `policyWarnings`: the latter carry the threshold and anonymity
    // warnings, and CLAUDE.md forbids making a security warning
    // org-configurable. The boundary is asserted in the test.
    enforcedAt: 'app/(app)/undersokelser/[id]/bygg/page.tsx:klarsprakOn',
  },
  { key: 'weekly_digest', enforcedAt: null, why: 'digest-unbuilt' },
  { key: 'allow_self_serve', enforcedAt: null, why: 'selfserve-unbuilt' },
  { key: 'sso', enforcedAt: 'lib/auth/session.ts:ssoRequired' },
  { key: 'brand_mail', enforcedAt: null, why: 'brandmail-unread' },
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
  weekly_digest: true,
  allow_self_serve: false,
  sso: false,
  brand_mail: true,
}
