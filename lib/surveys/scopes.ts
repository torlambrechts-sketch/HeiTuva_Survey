import { hasTarget, rowRate, type RateRow } from './participation'

/**
 * F4 — the survey list's FIVE scope filters (`svScopes`, v6:8943).
 *
 * ── WHAT THE AUDIT FOUND, AND WHY IT IS TWO FAULTS RATHER THAN ONE ─────────
 *
 * The bundle has TWO rails on this screen and they are different axes: the
 * STATUS filters in the subnav (`v6:8634`, Alle · Aktive · Utkast · Lukket) and
 * these five in the card's head. The app had one rail — three status chips — in
 * the SCOPE rail's position. So the scope filters were missing entirely AND the
 * status filters were rendered where the scope filters belong. F3 moved the
 * status rail into the shell where v6 draws it; this module is the other half.
 *
 * ── «Delt med meg» MEANS WITH ME, WHICH THE DRAWING'S PREDICATE DOES NOT ───
 *
 * v6:7712 is `!!(s.share && s.share.length)` — «this survey has co-editors»,
 * a property of the SURVEY. Read literally it selects every survey anyone
 * shared with anyone, which is not a scope at all and is not what the label
 * says. Ours is `survey_editors` containing the VIEWER, a property of the
 * reader, so the five rails are five different questions about *my* work.
 * Logged as a deviation.
 *
 * ── AND «Lav svarprosent» IS F1's RULE IN A PREDICATE ──────────────────────
 *
 * v6:7710 is `s.responses.length / (s.target || 30) < 0.7` — the invented
 * denominator of thirty, a third time, now deciding which rows a person SEES.
 * A survey with no recipient count would be judged against a number nobody
 * chose, so a row with 20 answers and no target would be «low» or not depending
 * on an arbitrary constant.
 *
 * **A row with no denominator is not «low», it is UNMEASURED**, and it is
 * excluded from this scope rather than guessed at. That is the same decision
 * `rateOf` makes for the headline: a rate is a property of one population, and
 * rows outside it are counted elsewhere rather than folded in.
 */
export const SURVEY_SCOPES = ['alle', 'mine', 'lav', 'gjentar', 'delt'] as const
export type SurveyScope = (typeof SURVEY_SCOPES)[number]

/**
 * `surveys.<key>` in `messages/*.json`. Keyed by the registry so a sixth scope
 * arrives with its label wired or not at all — the derivation F3 applied to
 * both shell rails.
 *
 * **The `sv` prefix is the bundle's own (`svScopes`) and it is load-bearing:**
 * `surveys.scopeAll` ALREADY EXISTS and means «Alle statuser» — F3's band uses
 * it for the STATUS scope line on the same screen. Two different rails, one
 * generic name, and the first draft of this registry silently collided with it.
 * A key named for what it describes rather than for where it sits is a key that
 * will be taken.
 */
export const SCOPE_KEY: Record<SurveyScope, string> = {
  alle: 'svScopeAll',
  mine: 'svScopeMine',
  lav: 'svScopeLow',
  gjentar: 'svScopeRecurring',
  delt: 'svScopeShared',
}

/** v6:7710's threshold, quoted rather than chosen here. */
export const LOW_RATE = 0.7

/**
 * What a row needs to answer all five. Deliberately the FACTS and not the
 * verdicts: a caller cannot pass `isLow: true` and have the rail believe it.
 */
export type ScopeRow = RateRow & {
  status: string
  /** `surveys.created_by`, null for a survey that predates Q96's writers. */
  ownerId: string | null
  /** A `schedules` row whose cadence is not `once`. */
  recurring: boolean
  /** A `survey_editors` row naming the VIEWER — see the header. */
  sharedWithViewer: boolean
}

/**
 * THE ONE PLACE A SCOPE IS DECIDED. Switched over the union so a sixth key is a
 * compile error here rather than a pill that silently selects everything —
 * which is what a `default: return true` would have made it.
 */
export function inScope<T extends ScopeRow>(row: T, scope: SurveyScope, viewerId: string): boolean {
  switch (scope) {
    case 'alle':
      return true
    case 'mine':
      return row.ownerId === viewerId
    case 'lav':
      // Active AND measurable AND under the threshold. A row with no
      // denominator is unmeasured, not low.
      return row.status === 'aktiv' && hasTarget(row) && rowRate(row) < LOW_RATE
    case 'gjentar':
      return row.recurring
    case 'delt':
      return row.sharedWithViewer
  }
}

/** Resolve a URL parameter against the set; anything else is «alle», exactly as
 *  an absent value is. */
export function resolveScope(value: string | null | undefined): SurveyScope {
  return SURVEY_SCOPES.find((s) => s === value?.trim()) ?? 'alle'
}
