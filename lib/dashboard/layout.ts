/**
 * The dashboard layout model — DECISIONS Q25 (ownership), Q51 (contents),
 * Q46 (the filters live in the card).
 *
 * ONE DEFINITION OF THE LAYOUT, read by the screen, the card, the panel
 * controls and the server actions. The V1-3 lesson applied before it can bite:
 * a rule about a layout that exists in four places is a rule that will
 * disagree with itself in four places.
 *
 * WHAT A LAYOUT IS (Q51): an ordered list of panel keys, each with a width, and
 * a filter set of period + group + surveys. Identifiers only. There is no `n`,
 * no `avg` and no `k` here and none may be added — the database refuses them
 * (`dashboard_layouts_panels_shape`, `_filters_shape`) and the reason is in
 * migration 0046: a layout that could hold a computed thing would be a stored
 * query outliving the promise it was composed under. Something that needs to
 * freeze a number is a `result_snapshot`.
 *
 * THREE KINDS OF SAVED LAYOUT, and they are not interchangeable:
 *   - the WORKING layout   `user_id = me`, title WORKING_TITLE — what reappears
 *                          «neste gang» (NEW:1026). One per member.
 *   - an ORGANISATION preset `user_id null` — shared, named, written by editors.
 *   - a SHIPPED preset     `dashboard_presets` — the six the product ships.
 */

/** A panel key is a `report_section_types` row with `on_dashboard` — never a
 *  string this file decides. The registry is the vocabulary (Q51). */
export type PanelHeight = 'lav' | 'normal' | 'hoy'
export type Period = 'q' | 'h' | 'y'

/**
 * A panel: its identity, its LAYOUT (span, height, row break) and its own
 * SCOPE OVERRIDES (src, per, grp) — G1.
 *
 * v8 keys six maps by panel key at the dashboard level (`d.size`, `d.h`,
 * `d.br`, `d.src`, `d.per`, `d.grp`). These live on the entry instead, and
 * M:0137 states the reason in full: v8's `patchDash` never prunes those maps
 * when a panel is removed, so six orphans accumulate per removal and come back
 * carrying a scope somebody set months ago. On the entry an orphan cannot be
 * expressed.
 *
 * Every override is OPTIONAL and `undefined` means «inherit the dashboard's».
 * There is no «alle» sentinel: absent already means all, and two spellings of
 * one state is how a value goes stale on one of them.
 */
export type PanelEntry = {
  key: string
  wide: boolean
  /** 1..6, the stored INTENT. Clamped to the live column count at render. */
  span?: number
  h?: PanelHeight
  /** Start a new row — v8's `br`, which renders as `1 / span N`. */
  br?: boolean
  /** ONE survey id. Overrides the dashboard's whole survey selection. */
  src?: string
  per?: Period
  grp?: string
}

export type LayoutFilters = {
  period: Period
  group_id: string | null
  survey_ids: string[]
}

/** The grid's column count. v8 offers exactly two (v8:8947). */
export type Cols = 4 | 6
export const COLS_DEFAULT: Cols = 6
export const readCols = (stored: unknown): Cols => (stored === 4 ? 4 : COLS_DEFAULT)

/** v8:7108's three heights, each from its own entry in that object literal. */
export const PANEL_MIN_H: Record<PanelHeight, string> = {
  lav: '150px',
  normal: '230px',
  hoy: '340px',
}

/**
 * The span a panel actually gets, which is NOT necessarily the one stored.
 *
 * v8's `panelSpan` (v8:7237-7244) clamps with `Math.min(cols, stored)`, and
 * the clamp is why the stored value is the unclamped INTENT: a panel set to 6
 * and viewed at 4 columns narrows to 4, and switching back to 6 restores it.
 * Clamping on WRITE would make 6 -> 4 -> 6 lossy.
 *
 * With no stored span the panel falls back to `wide`, which is the model F1
 * built and every existing row carries: wide = the full width, otherwise half,
 * rounded up so 6 columns give 3 and 4 give 2.
 */
export function spanOf(entry: PanelEntry, cols: Cols): number {
  if (typeof entry.span === 'number' && Number.isFinite(entry.span)) {
    return Math.max(1, Math.min(cols, Math.round(entry.span)))
  }
  return entry.wide ? cols : Math.max(1, Math.round(cols / 2))
}

/**
 * A panel's effective scope: its own overrides over the dashboard's filters.
 *
 * THE WHOLE POINT OF THIS FUNCTION IS THAT THERE IS ONLY ONE OF IT. A per-panel
 * filter narrows the population a panel is computed over, so the k gate matters
 * MORE here, not less — and the way that is guaranteed is that this returns the
 * same `{ surveys, group, period }` shape every reader already takes, and every
 * reader still goes through the SECURITY DEFINER RPCs that call `app.k_for`.
 * Nothing about narrowing happens outside the database's gate.
 */
export type PanelScope = { survey_ids: string[]; group_id: string | null; period: Period }

export function scopeFor(entry: PanelEntry, filters: LayoutFilters): PanelScope {
  return {
    // `src` names ONE survey and replaces the selection rather than
    // intersecting it — that is what v8's single-select draws.
    survey_ids: entry.src ? [entry.src] : filters.survey_ids,
    group_id: entry.grp ?? filters.group_id,
    period: entry.per ?? filters.period,
  }
}

/** A stable identity for a scope, so panels sharing one are fetched ONCE.
 *  Most dashboards override nothing, and then this collapses to a single key
 *  and the page does exactly the work it did before G1. */
export const scopeKey = (s: PanelScope) =>
  JSON.stringify([[...s.survey_ids].sort(), s.group_id, s.period])

/** The distinct scopes a layout needs, in first-appearance order. */
export function distinctScopes(panels: PanelEntry[], filters: LayoutFilters): PanelScope[] {
  const out: PanelScope[] = []
  const seen = new Set<string>()
  for (const p of panels) {
    const scope = scopeFor(p, filters)
    const k = scopeKey(scope)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(scope)
  }
  return out
}

/** The title of the member's own working row. A constant rather than a magic
 *  string in four files; it is user-visible only if a member ever lists their
 *  own rows, which no screen does today. */
export const WORKING_TITLE = 'Mitt oppsett'

/** The bundle gives the heatmap (and the deferred stream panel) full width by
 *  default: `wideDefault = (k === "heatmap" || k === "stream")` (NEW:3673).
 *  `stream` has no registry row here (Q26), so one key remains. */
export const WIDE_BY_DEFAULT = new Set(['heatmap'])

export const defaultWide = (key: string) => WIDE_BY_DEFAULT.has(key)

/** Panels are grouped in the picker by the question their reader is asking —
 *  the bundle's ARCHE_LABEL (NEW:2954). The archetype of a key is derived from
 *  the registry, not stored: `per_virksomhet` is the register, `duties` is the
 *  duty group, everything else on the dashboard is an aggregate over people. */
export type Archetype = 'agg' | 'reg' | 'duty'

export function archetypeOf(key: string): Archetype {
  if (key === 'per_virksomhet') return 'reg'
  if (key === 'duties') return 'duty'
  return 'agg'
}

/** Move a panel one place. Returns the SAME array when the move is impossible,
 *  so a caller can compare by identity to decide whether to persist. */
export function movePanel(panels: PanelEntry[], key: string, dir: -1 | 1): PanelEntry[] {
  const i = panels.findIndex((p) => p.key === key)
  const j = i + dir
  if (i < 0 || j < 0 || j >= panels.length) return panels
  const next = panels.slice()
  const [moved] = next.splice(i, 1)
  next.splice(j, 0, moved!)
  return next
}

export function toggleWidth(panels: PanelEntry[], key: string): PanelEntry[] {
  if (!panels.some((p) => p.key === key)) return panels
  return panels.map((p) => (p.key === key ? { ...p, wide: !p.wide } : p))
}

export function removePanel(panels: PanelEntry[], key: string): PanelEntry[] {
  if (!panels.some((p) => p.key === key)) return panels
  return panels.filter((p) => p.key !== key)
}

/** Adding is idempotent: the picker draws an already-added panel as «Lagt til
 *  ✓» with a non-pointer cursor (NEW:3669), so a second add is a no-op rather
 *  than a duplicate. A duplicated key would render the same panel twice and
 *  give both cards the same move target. */
export function addPanel(panels: PanelEntry[], key: string): PanelEntry[] {
  if (panels.some((p) => p.key === key)) return panels
  return [...panels, { key, wide: defaultWide(key) }]
}

/**
 * Reads a stored `panels` payload into the model, dropping anything the
 * dashboard no longer offers.
 *
 * WHY DROPPING IS RIGHT AND REFUSING IS NOT: the database refuses an unoffered
 * key at WRITE time, so a stored layout can only contain one if the registry
 * CHANGED after it was saved — a panel retired, or `on_dashboard` turned off.
 * Refusing to render the whole layout would punish the member for an
 * administrator's change; rendering the panel would draw a card with no
 * renderer. Dropping the entry leaves every other panel exactly where it was.
 *
 * The same reasoning as the report editor's section filter, and the same shape.
 */
export function readPanels(stored: unknown, offered: readonly string[]): PanelEntry[] {
  if (!Array.isArray(stored)) return []
  const allowed = new Set(offered)
  const seen = new Set<string>()
  const out: PanelEntry[] = []
  for (const raw of stored) {
    if (typeof raw !== 'object' || raw === null) continue
    const key = (raw as { key?: unknown }).key
    if (typeof key !== 'string' || !allowed.has(key) || seen.has(key)) continue
    seen.add(key)
    const r = raw as Record<string, unknown>
    const entry: PanelEntry = { key, wide: r.wide === true }
    // Each optional value is admitted only in the shape the CHECK permits, so
    // a row that somehow holds something else reads as «inherit» rather than
    // as a value the writer cannot write back.
    if (typeof r.span === 'number' && r.span >= 1 && r.span <= 6) entry.span = Math.round(r.span)
    if (r.h === 'lav' || r.h === 'normal' || r.h === 'hoy') entry.h = r.h
    if (r.br === true) entry.br = true
    if (typeof r.src === 'string' && r.src.length > 0) entry.src = r.src
    if (r.per === 'q' || r.per === 'h' || r.per === 'y') entry.per = r.per
    if (typeof r.grp === 'string' && r.grp.length > 0) entry.grp = r.grp
    out.push(entry)
  }
  return out
}

/** Set one panel's layout or scope value. `undefined` CLEARS the override, and
 *  clearing is what «inherit» is — there is no sentinel to write. */
export function patchPanel(
  panels: PanelEntry[],
  key: string,
  patch: Partial<Omit<PanelEntry, 'key'>>,
): PanelEntry[] {
  if (!panels.some((p) => p.key === key)) return panels
  return panels.map((p) => {
    if (p.key !== key) return p
    const next: PanelEntry = { ...p }
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) delete (next as Record<string, unknown>)[k]
      else (next as Record<string, unknown>)[k] = v
    }
    return next
  })
}

/** The complement of readPanels for the filter payload. Unknown keys are
 *  dropped rather than carried, because the CHECK refuses them on write and a
 *  value that cannot be written back is a value that cannot be edited. */
export function readFilters(stored: unknown): LayoutFilters {
  const o = (typeof stored === 'object' && stored !== null ? stored : {}) as Record<string, unknown>
  const period = o.period
  const group = o.group_id
  const surveys = o.survey_ids
  return {
    period: period === 'q' || period === 'h' ? period : 'y',
    group_id: typeof group === 'string' && group.length > 0 ? group : null,
    survey_ids: Array.isArray(surveys) ? surveys.filter((s): s is string => typeof s === 'string') : [],
  }
}

/**
 * Q51, the half a CHECK constraint cannot deliver.
 *
 * An organisation preset may not carry a group filter, because a preset saved
 * with one and picked by a leser sends `p_group` to `get_quotes` and is refused
 * (M:0032:658) — a correct refusal presenting as a broken panel. The database
 * enforces it (`dashboard_layouts_preset_no_group`).
 *
 * Tor's addition: SAY SO AT THE POINT OF SAVING. An administrator who saves a
 * shared preset while a group filter is active must be told the group will not
 * travel, or they will assume it did and be confused later. The CHECK alone
 * turns a correct refusal into a silent surprise.
 *
 * Returns the filters as they will actually be stored, and whether anything was
 * dropped — so the caller can show the reason rather than only the result.
 */
export function filtersForPreset(filters: LayoutFilters): {
  stored: LayoutFilters
  groupDropped: boolean
} {
  if (filters.group_id === null) return { stored: filters, groupDropped: false }
  return { stored: { ...filters, group_id: null }, groupDropped: true }
}
