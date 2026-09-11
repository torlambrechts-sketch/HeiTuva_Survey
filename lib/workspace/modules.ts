/**
 * W2 · V4:6067-6075 — which Oversikt modules a workspace shows, and the two
 * rows' column templates.
 *
 * PURE, AND OUTSIDE `current.ts`, FOR ONE REASON: `current.ts` is
 * `server-only`, and this arithmetic is the part most worth testing without a
 * server around it. Every combination is reachable here even where the app
 * cannot reach it yet.
 *
 * THE TEMPLATES ARE THE POINT, not the visibility. Switching a module off does
 * not hide a card in place — it CHANGES ITS ROW'S GRID, so the surviving card
 * grows from a column into the full width. That is a layout change at every
 * breakpoint rather than a `display:none`, which is why `verify:responsive`
 * runs early on this phase.
 */

/** The six keys `workspace_modules` ships. Not an enum: the registry is the
 *  authority and adding one must stay a row. This type only says what the
 *  callers below understand today. */
export type ModuleKey = 'action' | 'duties' | 'loop' | 'activity' | 'nps' | 'quiz'

export type WorkspaceShow = {
  action: boolean
  duties: boolean
  loop: boolean
  activity: boolean
  nps: boolean
  quiz: boolean
  /** Row A is «Sløyfen lukket» + «Svaraktivitet»; it exists if either does. */
  rowA: boolean
  rowB: boolean
  rowACols: string
  rowBCols: string
}

/**
 * V4:6069-6075 verbatim, including the asymmetry between the two rows.
 *
 * Row A splits evenly (`1fr 1fr`); row B does NOT — it is
 * `minmax(0,1.6fr) minmax(280px,.9fr)`, because «Krever handling» is a list
 * that wants width and «Lovpålagte frister» is a card with a floor under it.
 * A single surviving card in either row takes `minmax(0,1fr)` and fills it.
 *
 * The 280px floor is the bundle's and it is load-bearing below 1280px: it is
 * what makes the pair wrap rather than crush, which is the behaviour
 * docs/RESPONSIVE.md expects of a two-card row.
 */
export function computeShow(modules: readonly string[]): WorkspaceShow {
  const has = (k: ModuleKey) => modules.includes(k)
  const aN = (has('loop') ? 1 : 0) + (has('activity') ? 1 : 0)
  const bN = (has('action') ? 1 : 0) + (has('duties') ? 1 : 0)
  return {
    action: has('action'),
    duties: has('duties'),
    loop: has('loop'),
    activity: has('activity'),
    nps: has('nps'),
    quiz: has('quiz'),
    rowA: aN > 0,
    rowB: bN > 0,
    rowACols: aN > 1 ? '1fr 1fr' : 'minmax(0,1fr)',
    rowBCols: bN > 1 ? 'minmax(0,1.6fr) minmax(280px,.9fr)' : 'minmax(0,1fr)',
  }
}

/**
 * The Tilpasset workspace's per-device module set, as it arrives from a cookie.
 *
 * A CATCH-ALL WOULD BE WRONG HERE AND THE CONDITIONS ARE NAMED INSTEAD. The
 * value is a JSON array written by us, but a cookie is client-visible and
 * editable, so it can arrive as anything. What this must NOT do is swallow
 * every failure into «show the default» — that would make a hand-edited cookie
 * and a genuine parse bug look identical.
 *
 * So the shape is checked rather than trusted, and the two outcomes are
 * distinct: `null` means «nothing chosen, use the workspace's own set», and an
 * empty array means «chosen nothing», which is the state `wsEmpty` renders.
 * Those are different facts and collapsing them would lose the empty state.
 */
export function parseModuleCookie(raw: string | undefined, known: readonly string[]): string[] | null {
  if (!raw) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    // A cookie that is not JSON is not a module set. Distinguished from `[]`.
    return null
  }
  if (!Array.isArray(parsed)) return null
  if (!parsed.every((v) => typeof v === 'string')) return null
  // Filtered against the REGISTRY rather than against a list here: a key
  // retired by a later migration must stop being shown, and a key invented in
  // a hand-edited cookie must never start being shown.
  const seen = new Set<string>()
  return (parsed as string[]).filter((k) => known.includes(k) && !seen.has(k) && seen.add(k))
}

/**
 * The vocabulary when the registry has not been seeded.
 *
 * IT IS TILPASSET'S OWN SET, WHICH IS ALSO THE COPY THESE SCREENS SHIPPED
 * BEFORE W3 — «Slik ser respondenten det», «Standardspråk for respondenter».
 * So an unseeded database renders exactly what it rendered yesterday rather
 * than a blank, a key, or an invented word. Never fabricate: the fallback is
 * the previous truth, not a guess.
 */
export const DEFAULT_VOCABULARY = {
  person: 'respondent',
  personDef: 'respondenten',
  persons: 'respondenter',
  personsCap: 'Respondenter',
} as const

/**
 * W3 · V4:6684-6688 — sort the template library so the workspace's use cases
 * come first.
 *
 * STABILITY IS LOAD-BEARING, NOT INCIDENTAL. The list arrives already ordered
 * by the library's own editorial sequence (`template_packs.sort_order`, then
 * `created_at`, then title), and this only re-ranks it by lift group. Array
 * sort has been stable by specification since ES2019, so every pack keeps its
 * editorial position WITHIN its group — which is what makes this a lift rather
 * than a reshuffle. Written down because a future reader replacing this with a
 * comparator that is not stable would silently scramble the library and no test
 * of the FIRST card would notice.
 *
 * Keyed on `use_case`, never on a title: Q45 made that a foreign key precisely
 * so ordering could be expressed against a stable key, and a title is editable.
 *
 * An empty `lifts` returns the input order unchanged — Tilpasset lifts nothing,
 * and the library keeps its own sequence.
 */
export function liftOrder<T extends { useCase: string | null }>(
  packs: readonly T[],
  lifts: readonly string[],
): T[] {
  if (lifts.length === 0) return [...packs]
  const rank = (p: T) => {
    const i = p.useCase ? lifts.indexOf(p.useCase) : -1
    return i > -1 ? i : lifts.length
  }
  return [...packs].sort((a, b) => rank(a) - rank(b))
}
