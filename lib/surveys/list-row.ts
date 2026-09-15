import { hasTarget, rowRate, type RateRow } from './participation'

/**
 * F4 — what a survey looks like in the list, derived ONCE for all three views.
 *
 * v6 draws the same survey three times — the six-column table (`rowsOn`), the
 * list beside a detail panel (`listOn`) and the card grid (`boxOn`) — and each
 * one reads the same `surveyList` entry (v6:9045). Three components computing
 * their own «is this low», «what does the bar say», «what is the status line»
 * is three chances for the views to disagree about the same row, which the
 * reader would experience as the switcher changing the data.
 *
 * ── THE «Svar» CELL IS A RATIO AND F1 GOVERNS IT ───────────────────────────
 *
 * v6:9058 renders `{{ r.responses }} / {{ r.target }}` with `target: String(s.target || 30)`
 * — the invented denominator, **a fourth time**, now printed in a table cell as
 * though it were the recipient count somebody chose.
 *
 * So `pct` is `null` when there is no denominator, and every view is required to
 * handle that rather than being handed a zero. The cell renders the COUNT; the
 * bar renders an empty track; the card renders no percentage. An empty track
 * beside «6 svar» is the honest shape — it still looks like every other row, and
 * nothing claims a proportion nobody knows. (`SurveyRow` already reached this
 * conclusion for the old list; this is the same decision for the new views,
 * through the same `rowRate`.)
 */
export type ListRowInput = RateRow & {
  title: string
  audience: string | null
  status: string
  questionCount: number
  /** `org_members.name` or its email — resolved by the page, never fabricated.
   *  v6:9055-9057 invents both («Tuva Berg» and an address built from it). */
  ownerName: string | null
  ownerEmail: string | null
  /** The FIRST round's `opens_at`, already formatted by the page (which holds
   *  the locale). Null for a survey that has never been sent. */
  sentLabel: string | null
}

export type ListRow = ListRowInput & {
  /** Whole percent, or null when there is no denominator. NEVER 0 as a
   *  stand-in: a real zero and an unknown must not render alike. */
  pct: number | null
  /** How many invitations are still unanswered, or null for the same reason. */
  missing: number | null
  initials: string | null
}

/** Two letters at most, from a real name. Null when there is no owner, because
 *  a placeholder monogram is a fabricated person. */
export function initialsOf(name: string | null): string | null {
  if (!name) return null
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return null
  return parts
    .slice(0, 2)
    .map((p) => [...p][0]!.toUpperCase())
    .join('')
}

export function listRow(input: ListRowInput): ListRow {
  const measurable = hasTarget(input)
  return {
    ...input,
    pct: measurable ? Math.round(rowRate(input) * 100) : null,
    missing: measurable ? Math.max(0, input.target - input.responses) : null,
    initials: initialsOf(input.ownerName),
  }
}

/**
 * The status dot and pill colours, quoted from v6:9047 and v6:9063. Literal
 * hexes because the bundle uses literal hexes here — the same three the survey
 * status pills already carry in `keys.ts`, which is why this borrows that map
 * rather than restating it.
 */
export const STATUS_DOT: Record<string, string> = {
  aktiv: '#2F5D2A',
  lukket: '#8A4B22',
  utkast: 'var(--mut)',
}

/** The progress bar's fill per status (v6:9073). A draft's bar is the neutral
 *  fill, which is also what a row with no denominator gets. */
export const STATUS_BAR: Record<string, string> = {
  aktiv: 'var(--ac)',
  lukket: 'var(--ac3)',
  utkast: 'var(--sf2)',
}
