/**
 * T8 — THE BUILDER'S DRAG MODEL. D235 IS OVERTURNED BY TOR.
 *
 * D235 refused the drag on two grounds: no keyboard equivalent, and no
 * `docs/RESPONSIVE.md` pattern for one. **The arrows and «Flytt til» stay** —
 * they are the keyboard equivalent the refusal said was missing, so the drag is
 * additive rather than a replacement. Removing them would re-earn D235.
 *
 * ── WHAT v8 DRAWS, READ BEFORE BUILDING (T8.0) ────────────────────────────
 *
 * Six elements carry it, and the feedback is FOUR bindings — there is no ghost
 * and no placeholder gap, which is why none is built here:
 *
 *   dragOpacity   `.45` on the row being dragged, else `1`          v8:6918
 *   dropTop       `3px solid --ink` on the row under the pointer,
 *                 else `3px solid transparent` — the insertion
 *                 marker is a TOP BORDER, so the row never moves    v8:6919
 *   dropEndBd     `2px dashed --ink` when the end zone is hovered,
 *                 else `2px dashed --line`                          v8:10716
 *   dropEndBg     `--sbg` when hovered, else transparent            v8:10717
 *
 * `dropTop` being a border rather than a gap is the reason nothing reflows
 * under the pointer: a placeholder that opens a hole moves the very row you are
 * aiming at, and v8 declines to.
 *
 * ── THE TWO KINDS OF DRAG, AND WHY THEY CANNOT SHARE A PAYLOAD ────────────
 *
 * A palette item CREATES (`effectAllowed = "copy"`, payload `kind:type`,
 * v8:6886) and a row MOVES (`effectAllowed = "move"`, payload the row's id,
 * v8:6921). They meet at the same drop targets, so every drop handler asks
 * «is there a newDrag?» FIRST and falls through to the move — v8's own order at
 * 6925-6930 and 10720-10724.
 */
import type { BuildTab } from './build-tabs'

/** What the pointer is currently over: a row's id, the end zone, or nothing. */
export type DragOver = string | '__end' | ''

/** A palette drag in flight. `label` is what the end zone's sentence names. */
export type NewDrag = { kind: 'question' | 'block'; type: string; label: string }

export type FlowDragState = {
  /** The row being dragged, for `dragOpacity`. */
  dragId: string
  /** The target under the pointer, for `dropTop` and the end zone. */
  dragOver: DragOver
  /** Set while a PALETTE item is in flight; null while a row is. */
  newDrag: NewDrag | null
}

export const IDLE: FlowDragState = { dragId: '', dragOver: '', newDrag: null }

/** v8:6918 — `.45` on the row in flight. */
export function dragOpacity(state: FlowDragState, id: string): number {
  return state.dragId === id ? 0.45 : 1
}

/**
 * v8:6919 — the insertion marker, and its condition is the subtle half.
 *
 * `over` is true only when the pointer is on THIS row AND something is actually
 * in flight that is not this row itself (`(dragId && dragId !== q.id) ||
 * !!newDrag`). Without the second clause a row would mark itself as a drop
 * target while being dragged, which is a marker for a move that cannot happen.
 */
export function dropTop(state: FlowDragState, id: string): string {
  const over =
    state.dragOver === id && ((state.dragId !== '' && state.dragId !== id) || state.newDrag !== null)
  return over ? '3px solid var(--ink)' : '3px solid transparent'
}

/** v8:10716-10717 — the end zone's border and fill. */
export function endZoneStyle(state: FlowDragState): { border: string; background: string } {
  const over = state.dragOver === '__end'
  return {
    border: over ? '2px dashed var(--ink)' : '2px dashed var(--line)',
    background: over ? 'var(--sbg)' : 'transparent',
  }
}

/**
 * Where a drop lands. Returns the index to insert at, or null for a move.
 *
 * Stated as a pure function so the same rule serves the drop handler and the
 * keyboard: «insert before the row you are on, or append at the end zone».
 */
export function dropIndex(order: string[], targetId: DragOver): number {
  if (targetId === '__end' || targetId === '') return order.length
  const at = order.indexOf(targetId)
  return at < 0 ? order.length : at
}

/**
 * v8:6905-6911's `moveFlowTo` — splice out, splice in at the target's index.
 *
 * NOT a swap. v8 removes the item first and then inserts at the target's
 * position IN THE SHORTENED ARRAY, so dragging downward lands the row AFTER
 * the target and upward lands it BEFORE. A swap would put the target where the
 * dragged row was, which is a different gesture with the same mouse movement.
 */
export function moveTo(order: string[], fromId: string, toId: string): string[] {
  if (!fromId || !toId || fromId === toId) return order
  const arr = order.slice()
  const fi = arr.indexOf(fromId)
  const ti = arr.indexOf(toId)
  if (fi < 0 || ti < 0) return order
  const [item] = arr.splice(fi, 1)
  arr.splice(ti, 0, item!)
  return arr
}

/** The tab a palette drag belongs to, so a drop can only mean one thing. */
export const PALETTE_TAB: Record<NewDrag['kind'], BuildTab> = {
  question: 'add',
  block: 'content',
}
