/**
 * A RATE IS A PROPERTY OF ONE POPULATION — the F1 rule, extracted so there is
 * one definition of it rather than one per surface.
 *
 * It lived in `lib/tuva/analyst.ts` while svTuva was its only reader. F3's «På
 * tvers» card renders an org-wide participation figure on three more screens,
 * and a second implementation of this rule is precisely how the defect F1
 * closed would come back — so the rule moved here and the analyst imports it.
 *
 * ── THE DEFECT THIS EXISTS TO REFUSE ───────────────────────────────────────
 *
 * The numerator was summed over every row and the denominator over only the
 * rows that had a target, so the ratio divided two different populations by
 * each other: against production — nine surveys, seven with `target` null — it
 * printed **«700 % har svart»**. `Math.min(100, …)` would have printed 100 %
 * and still been false. The guard that existed protected against a denominator
 * of ZERO, which is a different failure and one this project already knew.
 *
 * **AND THE BUNDLE HAS THE SAME DEFECT, WRITTEN DOWN TWICE.** `crossStats`
 * (v6:9131) and `insStats` (v6:8238) both compute
 * `sum(responses) / sum(target || 30)` — a survey with no recipient count is
 * given an INVENTED denominator of thirty. That is the never-fabricate rule
 * broken inside the arithmetic rather than in the copy, and it is not built.
 *
 * ── THE PROPERTY IS ASSERTED FROM OUTSIDE ──────────────────────────────────
 *
 * `rateOf` reduces over the SAME array twice and returns that array's ids with
 * the result, so a later edit that widens one half cannot widen it silently:
 * re-run `rateOf` on the rows the result names and you must get the result
 * back. Restating the arithmetic in a test would agree with the implementation
 * it copied and with nothing else — which is the mistake the `app.k_for` mirror
 * made in the other direction, and which its own test caught.
 */

/** The minimum a row needs to be in a rate. `AnalystSurvey` satisfies it, and
 *  so does the leaner row the «På tvers» card reads. */
export type RateRow = {
  id: string
  /** Replies so far — a count of people, never a rating. */
  responses: number
  /** Recipients, or null when the survey has no recipient count. */
  target: number | null
}

/**
 * A rate and the population it was computed over, inseparably.
 *
 * `ids` is not decoration: it is the claim this module makes about which rows
 * both halves came from, and it is what the property test re-derives against.
 */
export type Measured = {
  ids: string[]
  responses: number
  target: number
  /** Whole percent, capped at 100 — the same cap `rowRate` below applies to
   *  each row of the survey list, so a headline cannot disagree with the rows
   *  it sits above. A link or QR survey can be answered by more people than
   *  were invited. */
  pct: number
}

export const hasTarget = <T extends RateRow>(s: T): s is T & { target: number } =>
  typeof s.target === 'number' && s.target > 0

/** THE ONLY PLACE A RATIO IS FORMED. It can see only the array it is handed. */
export function rateOf(population: RateRow[]): Measured | null {
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

/** One row's own rate, capped exactly as `rateOf` and the list row both cap. */
export const rowRate = (s: RateRow & { target: number }): number =>
  Math.min(1, s.responses / s.target)

/**
 * WHICH PARTICIPATION CLAIM IS TRUE OF THIS RESULT.
 *
 * «66 %» and «66 % i de 2 med mottakertall» are claims about different
 * populations, and which one is honest is a property of the numbers rather than
 * of the layout. A component free to pick the shorter label is free to
 * overstate — which is the same defect as the arithmetic one, one level out.
 *
 * `total` is how many rows were considered at all, so the caller need not
 * decide what «all of them» means twice.
 */
export function participationLabelKey(
  measured: Measured | null,
  total: number,
): 'rateNone' | 'rateSome' | 'rateAll' {
  if (!measured) return 'rateNone'
  return measured.ids.length < total ? 'rateSome' : 'rateAll'
}

/**
 * The participation chip, or NOTHING.
 *
 * Pure, and separate from the component, so the rule can be tested directly
 * rather than by grepping the component's source for a spelling. **`rateNone`
 * is the ABSENCE of a chip** — a «0 %» or a «—» there is a fabricated value in
 * the never-fabricate sense, indistinguishable from a real zero in a
 * screenshot.
 *
 * The caller supplies the translated label rather than a namespace, because
 * this module has no business knowing where the copy lives.
 */
export function participationChip(
  p: { measured: Measured | null; total: number } | undefined,
  label: (key: 'rateAll' | 'rateSome', m: number) => string,
): { value: string; label: string } | null {
  if (!p) return null
  const key = participationLabelKey(p.measured, p.total)
  if (key === 'rateNone' || !p.measured) return null
  return { value: `${p.measured.pct} %`, label: label(key, p.measured.ids.length) }
}
