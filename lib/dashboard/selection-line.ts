import type { LayoutFilters } from './layout'

/**
 * T5.1 — «Utvalg», the meta strip's selection line (v8:9019 `docFilterLine`).
 *
 *     const p = { q:"Siste runde", h:"Siste to runder", y:"Alle runder" }[st.repPeriod || "q"]
 *     const g = (st.repGroup || "alle") === "alle" ? "alle grupper" : st.repGroup
 *     return p + " · " + g
 *
 * Period and group, joined by the bundle's separator. NOTHING NEW IS WRITTEN
 * for it: `periodLast`, `periodTwo` and `periodAll` are already v8's three
 * strings verbatim, and `allGroups` is already «alle grupper». This returns
 * message KEYS rather than text so the caller resolves them in the reader's
 * language — the group NAME is the only part that is data, and it comes from
 * the row rather than from a message.
 *
 * Pure, so the mapping is unit-testable: the period is a three-value enum and
 * a wrong arm would silently mislabel every panel on the screen as covering a
 * span it does not.
 */
export type SelectionLine = {
  periodKey: 'periodLast' | 'periodTwo' | 'periodAll'
  /** The group's own name, or null when the selection is every group. */
  groupName: string | null
}

const PERIOD = {
  q: 'periodLast',
  h: 'periodTwo',
  y: 'periodAll',
} as const

export function selectionLine(
  filters: LayoutFilters,
  groups: { id: string; name: string }[],
): SelectionLine {
  // A `group_id` that names no group the viewer can see is treated as no
  // filter rather than as a missing name: RLS decides which groups resolve,
  // so a stale id in a saved layout must not render an empty segment or, worse,
  // leak that an id it cannot resolve exists.
  const group = filters.group_id ? (groups.find((g) => g.id === filters.group_id) ?? null) : null
  return { periodKey: PERIOD[filters.period], groupName: group?.name ?? null }
}
