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

/**
 * THE RETENTION PERIODS THIS PRODUCT OFFERS, as one registry.
 *
 * ── WHY THIS MOVED HERE: THERE WERE THREE OF THEM ─────────────────────────
 *
 * Measured 2026-09-15, before this constant existed:
 *
 *   PrivacyPanel.tsx:17   `const RETENTIONS = [6, 12, 24, 0] as const`
 *   actions.ts:199        `.refine((n) => [0, 6, 12, 24].includes(n))`
 *   M:0002               `check (retention_months in (0, 6, 12, 24))`
 *
 * Three statements of one rule, agreeing by luck rather than by construction —
 * the same shape F3 found in the row response rate, which had four definitions
 * and one of them dead. The public privacy notice was about to become a FOURTH,
 * and it is the one a data subject relies on.
 *
 * The database's CHECK is the authority; these two mirror it, and
 * `tests/db/retention-registry.test.ts` reads the constraint back out of
 * `pg_constraint` and requires them to agree. A value added to the column
 * without being added here fails that test rather than silently making the
 * notice incomplete.
 *
 * `ORDER` is the offering order the control renders — «ingen automatisk
 * sletting» last, because it is the exception — and `RETENTION_MONTHS` is the
 * DURATIONS alone, which is what a sentence about «etter så lenge» may name. A
 * notice that listed 0 among the months would be saying «0 måneder», which is
 * not what 0 means.
 */
export const RETENTION_MONTHS = [6, 12, 24] as const

/** `retention_months = 0` — kept until somebody deletes them. Not a duration,
 *  which is why it is not in the list above. */
export const RETENTION_NEVER = 0

/** The offering order of the control in Administrasjon → Personvern. */
export const RETENTION_ORDER = [...RETENTION_MONTHS, RETENTION_NEVER] as const

/** `organizations.retention_months` is `not null default 12` (M:0002). The
 *  public notice states this as the DEFAULT and never as the value, because it
 *  is a document for every organisation and only one of them is on the default. */
export const RETENTION_DEFAULT = 12

/** Every value the column accepts. The Zod boundary and the control both read
 *  it, so neither can offer a value the CHECK refuses. */
export function isRetention(n: number): boolean {
  return (RETENTION_ORDER as readonly number[]).includes(n)
}
