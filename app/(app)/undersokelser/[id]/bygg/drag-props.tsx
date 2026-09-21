import type React from 'react'

/**
 * T8 — the drag props every flow row takes.
 *
 * ONE shape for the three row kinds v8 makes draggable (v8:607 the question
 * card, 744 the block card, 783 the compact row), so a fourth cannot invent its
 * own. Optional throughout: a row handed nothing is simply not draggable, which
 * is what the preview and any read-only rendering want — and is why this is a
 * prop bag rather than a hook the row calls itself.
 */
export type FlowDragProps = {
  draggable?: true
  onDragStart?: (e: React.DragEvent) => void
  onDragOver?: (e: React.DragEvent) => void
  onDrop?: (e: React.DragEvent) => void
  onDragEnd?: () => void
  /** v8:6918 — `.45` while this row is the one in flight. */
  dragOpacity?: number
  /** v8:6919 — `3px solid --ink` while it is the drop target. */
  dropTop?: string
}
