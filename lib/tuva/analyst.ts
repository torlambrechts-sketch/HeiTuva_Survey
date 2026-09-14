/**
 * V6-6 — svTuva, the analyst on the Undersøkelser list (`svTuva*`, v6:9030).
 *
 * ── IT READS PARTICIPATION, AND PARTICIPATION ONLY (Q184) ──────────────────
 *
 * Q28 decided this before v6 existed: **the threshold hides svar-derived
 * values, not counts of people.** Averages, distributions, themes, quotes and
 * per-group breakdowns are gated; how many were invited and how many answered
 * are not. So this needs no bypass and adds no new data path — everything it
 * reads is what `/undersokelser` already renders in each row, from
 * `survey_response_counts`.
 *
 * **That is also the thing most likely to go wrong later**, so it is worth
 * stating as a boundary rather than a fact about today: the inputs are counts.
 * The moment an input becomes a score, a theme or a quote, this stops being
 * participation and needs the gate.
 *
 * ── THE THIRD TIP IS Q72'S TRIGGER, OR IT IS NOT BUILT (Q185) ──────────────
 *
 * The bundle's third tip is «Jeg kan lage tiltak av funnene» — and «funnene» is
 * content. Tor: that sentence is the seam where an analyst stops describing
 * participation and starts describing answers.
 *
 * So a task proposal fires on Q72's condition and no other: **this survey has an
 * audience group that will never receive its own results** — a group whose SIZE
 * is below `app.k_for(survey)`, which is a count of people and expressly
 * permitted by Q28. The task carries no group name, no question, no score and no
 * survey-level derived value.
 */
export type AnalystSurvey = {
  id: string
  title: string
  status: string
  /** Responses so far — a count of people, never a score. */
  responses: number
  /** Recipients, or null when the survey has not been sent. */
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

export type Analyst = {
  activeCount: number
  /** Whole percent across the filtered set, or null when nothing was sent. */
  pct: number | null
  /** The active survey with the lowest response rate, when there is one. */
  lowest: { title: string; pct: number } | null
  tips: AnalystTip[]
}

const rate = (s: AnalystSurvey): number | null =>
  s.target && s.target > 0 ? s.responses / s.target : null

/**
 * `surveys` is whatever the list is currently showing, so the sentence matches
 * the filter the reader can see. A headline computed over everything while the
 * screen shows a subset is a true number about the wrong thing.
 */
export function analyse(surveys: AnalystSurvey[]): Analyst {
  const active = surveys.filter((s) => s.status === 'aktiv')

  const totalTarget = surveys.reduce((a, s) => a + (s.target ?? 0), 0)
  const totalResponses = surveys.reduce((a, s) => a + s.responses, 0)
  // No denominator means no percentage. A 0 % derived from an unknown
  // denominator is a fabricated value (CLAUDE.md: never fabricate data).
  const pct = totalTarget > 0 ? Math.round((totalResponses / totalTarget) * 100) : null

  const rated = active
    .map((s) => ({ s, r: rate(s) }))
    .filter((x): x is { s: AnalystSurvey; r: number } => x.r !== null)
    .sort((a, b) => a.r - b.r || a.s.title.localeCompare(b.s.title, 'nb'))
  const low = rated[0] ?? null

  const tips: AnalystTip[] = []
  if (low) {
    tips.push({
      kind: 'low_response',
      surveyId: low.s.id,
      title: low.s.title,
      missing: Math.max(0, (low.s.target ?? 0) - low.s.responses),
    })
  }
  const draft = surveys.find((s) => s.status === 'utkast')
  if (draft) tips.push({ kind: 'draft', surveyId: draft.id, title: draft.title })

  /*
    Q72/Q185. Fires on a GROUP SIZE below the survey's own k — «this survey has
    a group that will never receive its own results». Not on a finding, not on a
    score, and it names no group.
  */
  const blind = surveys.find((s) => s.groupSizes.some((n) => n > 0 && n < s.k))
  if (blind) {
    tips.push({ kind: 'below_threshold_group', surveyId: blind.id, title: blind.title })
  }

  return {
    activeCount: active.length,
    pct,
    lowest: low ? { title: low.s.title, pct: Math.round(low.r * 100) } : null,
    tips: tips.slice(0, 3),
  }
}
