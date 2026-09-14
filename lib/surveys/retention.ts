/**
 * Q187 — how long answers are kept, said truthfully.
 *
 * v6 draws «Svarene slettes automatisk etter 24 måneder» twice: on the survey
 * detail's Personvern tab (v6:7291) and, worse, inside the RESPONDENT's own
 * anonymity disclosure (v6:10075). It is false three ways:
 *
 *   1. `organizations.retention_months` is `not null default 12`, not 24.
 *   2. It is per-organisation — `check (retention_months in (0,6,12,24))` — so
 *      no fixed number can be true for every reader.
 *   3. `app.apply_retention()` deletes only when `retention_months > 0` AND
 *      `coalesce((privacy->>'auto_delete')::boolean, true)`. With either off,
 *      nothing is ever deleted, and «etter 24 måneder» is not imprecise but the
 *      opposite of what happens.
 *
 * **The bundle contradicts itself 2075 lines earlier** — v6:8000 interpolates
 * `(st.retention || "12")` correctly — which is the strongest evidence the
 * hard-coded 24 is an error rather than a decision.
 *
 * A respondent told «24 måneder» by a product configured to keep forever has
 * been given a false promise about her own data, by the screen that exists to
 * reassure her. So this returns the NEVER case as its own state rather than as
 * a number, and a caller cannot render a duration without having been handed
 * one.
 */
export type Retention =
  | { kept: 'forever' }
  | { kept: 'months'; months: number }

export function retentionOf(org: {
  retention_months: number | null
  privacy: unknown
}): Retention {
  const months = org.retention_months ?? 0
  const privacy = (org.privacy ?? {}) as Record<string, unknown>
  // The column default is 12 and `auto_delete` defaults to TRUE in the
  // function, so an absent key means deletion is on — matching
  // `coalesce(…, true)` rather than inverting it.
  const autoDelete = privacy.auto_delete === undefined ? true : privacy.auto_delete === true
  if (months <= 0 || !autoDelete) return { kept: 'forever' }
  return { kept: 'months', months }
}

/**
 * A MIRROR of `app.k_for(survey)`, and named as one.
 *
 * The database function is the authority:
 *
 *   case when s.respondent_kind = 'organisation' then 0
 *        else s.k_threshold end
 *
 * **THE FIRST VERSION OF THIS MIRROR HAD `greatest(k_threshold, 3)`, BECAUSE I
 * READ `M:0032` AND NOT `M:0057`.** `k_for_honours_q91` replaced the function
 * and removed the floor — Q91 lets an organisation set a threshold of 2, and a
 * floor of 3 would have silently overridden the promise it made. Two migrations
 * define this function and only the later one is in force; reading *a*
 * definition is not reading *the* definition. The deployed-function test below
 * caught it on its first run.
 *
 * It lives in the `app` schema, so PostgREST cannot call it and a screen that
 * needs the number has to compute it. **That is a second implementation of a
 * security-relevant rule, which is the thing this project refuses elsewhere** —
 * Kommentarer deliberately leaves invariant 4 to RLS for exactly this reason.
 *
 * It is acceptable here only because of what guards it:
 * `tests/db/k-for-mirror.test.ts` calls the REAL function across a matrix of
 * inputs and requires this one to agree. A drift becomes a failing test rather
 * than a screen quietly using the wrong threshold.
 *
 * And it is used only for ADVICE (V6-6's Q72 tip). Nothing gated is computed
 * from it — the gate itself is still the database's.
 */
export function kForMirror(survey: {
  respondent_kind: string | null
  k_threshold: number | null
}): number {
  if (survey.respondent_kind === 'organisation') return 0
  return survey.k_threshold ?? 0
}
