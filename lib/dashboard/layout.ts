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
export type PanelEntry = { key: string; wide: boolean }

export type LayoutFilters = {
  period: 'q' | 'h' | 'y'
  group_id: string | null
  survey_ids: string[]
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
    out.push({ key, wide: (raw as { wide?: unknown }).wide === true })
  }
  return out
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
