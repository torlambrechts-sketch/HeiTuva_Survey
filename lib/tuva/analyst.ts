/**
 * V6-6 — svTuva, the analyst on the Undersøkelser list (`svTuva*`, v6:9030).
 *
 * ── IT READS PARTICIPATION, AND PARTICIPATION ONLY (Q184) ──────────────────
 *
 * Q28 decided this before v6 existed: **the threshold hides svar-derived
 * values, not counts of people.** Averages, distributions, themes, quotes and
 * per-group breakdowns are gated; how many were invited and how many replied
 * are not. So this needs no bypass and adds no new data path — everything it
 * reads is what `/undersokelser` already renders in each row, from
 * `survey_response_counts`.
 *
 * **That is also the thing most likely to go wrong later**, so it is worth
 * stating as a boundary rather than a fact about today: the inputs are counts.
 * The moment an input becomes a rating, a theme or a quote, this stops being
 * participation and needs the gate.
 *
 * ── F1-1: A RATE IS A PROPERTY OF ONE POPULATION ───────────────────────────
 *
 * The defect this file was rewritten for: the numerator was summed over every
 * row in the list and the denominator over only the rows that had a target, so
 * the ratio divided two different populations by each other. Against
 * production — nine surveys, seven with `target` null — it printed
 * **«700 % har svart»**, and the same split made `lowest` report a 1/1 survey
 * as the lowest while the two with real participation (7 and 5 replies) were
 * dropped for want of a denominator rather than ranked.
 *
 * **A clamp would have been the wrong fix.** `Math.min(100, …)` prints 100 %
 * and is still false — the guard that existed (`totalTarget > 0`) protects
 * against a denominator of ZERO, which is the failure this project already
 * knew, and says nothing about a denominator drawn from a SUBSET of the rows
 * the numerator came from.
 *
 * So there is exactly one place in this module where a ratio is formed,
 * `rateOf`, and it can only see the array it is handed. It returns the rows it
 * used along with the two halves, so the property is **asserted from the
 * outside** rather than trusted: re-run `rateOf` on the rows the result names
 * and you must get the result back. `tests/unit/tuva-analyst.test.ts` does
 * exactly that, over production's own shape.
 *
 * Three populations are named rather than assumed, because naming them is what
 * makes the mismatch visible:
 *   · `activeCount`  — active surveys in the filter the reader can see.
 *   · `measured`     — the active surveys that HAVE a recipient count. The rate
 *                      and `lowest` both come from here and from nowhere else.
 *   · `unmeasuredCount` — active surveys with no recipient count. They are in
 *                      neither half, and the copy says so: «66 %» and «66 % av
 *                      de vi kan måle» are different claims.
 *
 * ── THE THIRD TIP IS Q72'S TRIGGER, OR IT IS NOT BUILT (Q185) ──────────────
 *
 * The bundle's third tip is «Jeg kan lage tiltak av funnene» — and «funnene» is
 * content. Tor: that sentence is the seam where an analyst stops describing
 * participation and starts describing replies.
 *
 * So a task proposal fires on Q72's condition and no other: **this survey has an
 * audience group that will never receive its own results** — a group whose SIZE
 * is below `app.k_for(survey)`, which is a count of people and expressly
 * permitted by Q28. The task carries no group name, no question, no rating and
 * no survey-level derived value.
 */
export type AnalystSurvey = {
  id: string
  title: string
  status: string
  /** Replies so far — a count of people, never a rating. */
  responses: number
  /** Recipients, or null when the survey has no recipient count. */
  target: number | null
  /** The sizes of the audience groups this survey went to. Sizes only — no
   *  names, because Q72's task carries none and nothing else here needs one. */
  groupSizes: number[]
  /** `app.k_for(survey)` for this survey. */
  k: number
}

export type AnalystTip =
  | { kind: 'low_response'; surveyId: string; title: string; missing: number }
  | { kind: 'draft'; surveyId: string; title: string }
  | { kind: 'below_threshold_group'; surveyId: string; title: string }

/**
 * A rate and the population it was computed over, inseparably.
 *
 * `ids` is not decoration: it is the claim the module makes about which rows
 * both halves came from, and it is what the property test re-derives against.
 */
export type Measured = {
  ids: string[]
  responses: number
  target: number
  /** Whole percent, capped at 100 — the same treatment `responsePct` gives
   *  every row of this list, so the headline cannot disagree with the rows it
   *  sits above. A link or QR survey can be answered by more people than were
   *  invited. */
  pct: number
}

export type Analyst = {
  /** Active surveys in the filter the reader can see. */
  activeCount: number
  /** null when no active survey has a recipient count — then there is no rate
   *  at all, rather than a 0 % derived from an unknown denominator. */
  measured: Measured | null
  /** Active surveys with no recipient count: in neither half of the rate. */
  unmeasuredCount: number
  /** The lowest of the MEASURED population, never of all active surveys. */
  lowest: { title: string; pct: number } | null
  tips: AnalystTip[]
}

const hasTarget = (s: AnalystSurvey): s is AnalystSurvey & { target: number } =>
  typeof s.target === 'number' && s.target > 0

/**
 * THE ONLY PLACE A RATIO IS FORMED IN THIS MODULE.
 *
 * It reduces over the SAME array twice and returns that array's ids with the
 * result, so a later edit that widens one half cannot widen it silently — the
 * returned `ids` stop describing what was actually summed, and the property
 * test says so.
 */
export function rateOf(population: AnalystSurvey[]): Measured | null {
  const rows = population.filter(hasTarget)
  if (rows.length === 0) return null
  const responses = rows.reduce((a, s) => a + s.responses, 0)
  const target = rows.reduce((a, s) => a + s.target, 0)
  return {
    ids: rows.map((s) => s.id),
    responses,
    target,
    pct: Math.min(100, Math.round((responses / target) * 100)),
  }
}

/** One survey's own rate, capped exactly as `rateOf` and the row both cap. */
const rowRate = (s: AnalystSurvey & { target: number }): number =>
  Math.min(1, s.responses / s.target)

/**
 * `surveys` is whatever the list is currently showing, so the sentence matches
 * the filter the reader can see. A headline computed over everything while the
 * screen shows a subset is a true number about the wrong thing — which is the
 * same mistake as the one F1-1 fixed, one level out.
 */
export function analyse(surveys: AnalystSurvey[]): Analyst {
  const active = surveys.filter((s) => s.status === 'aktiv')

  /* The rate's population is stated once and used for both halves AND for
     `lowest`. Everything downstream reads `population`; nothing reaches back
     into `surveys`. */
  const population = active.filter(hasTarget)
  const measured = rateOf(population)

  const ranked = population
    .slice()
    .sort((a, b) => rowRate(a) - rowRate(b) || a.title.localeCompare(b.title, 'nb'))
  const low = ranked[0] ?? null

  const tips: AnalystTip[] = []
  if (low) {
    tips.push({
      kind: 'low_response',
      surveyId: low.id,
      title: low.title,
      missing: Math.max(0, low.target - low.responses),
    })
  }
  const draft = surveys.find((s) => s.status === 'utkast')
  if (draft) tips.push({ kind: 'draft', surveyId: draft.id, title: draft.title })

  /*
    Q72/Q185. Fires on a GROUP SIZE below the survey's own k — «this survey has
    a group that will never receive its own results». Not on a finding, not on a
    rating, and it names no group.
  */
  const blind = surveys.find((s) => s.groupSizes.some((n) => n > 0 && n < s.k))
  if (blind) {
    tips.push({ kind: 'below_threshold_group', surveyId: blind.id, title: blind.title })
  }

  return {
    activeCount: active.length,
    measured,
    unmeasuredCount: active.length - population.length,
    lowest: low ? { title: low.title, pct: Math.round(rowRate(low) * 100) } : null,
    tips: tips.slice(0, 3),
  }
}

/**
 * WHICH CLAIM IS TRUE OF THIS RESULT — decided here, not in the component.
 *
 * «{pct} % har svart» and «{pct} % har svart i de {m} med mottakertall» are
 * different claims about different populations, and which one is honest is a
 * property of the numbers rather than of the layout. A component free to pick
 * the shorter sentence is a component free to overstate, which is exactly the
 * defect F1-1 exists to close — one level out, in the copy.
 */
export function headlineKey(a: Analyst): 'headlineNone' | 'headlineSome' | 'headlineAll' {
  if (!a.measured) return 'headlineNone'
  return a.unmeasuredCount > 0 ? 'headlineSome' : 'headlineAll'
}

/** Same rule for the second sentence: «lowest» of what. */
export function lowestKey(a: Analyst): 'lowest' | 'lowestOfMeasured' {
  return a.unmeasuredCount > 0 ? 'lowestOfMeasured' : 'lowest'
}
