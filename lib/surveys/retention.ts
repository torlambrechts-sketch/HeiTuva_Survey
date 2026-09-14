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
