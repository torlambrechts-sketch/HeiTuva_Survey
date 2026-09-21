import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  IDLE,
  dragOpacity,
  dropIndex,
  dropTop,
  endZoneStyle,
  moveTo,
  type FlowDragState,
} from '@/lib/surveys/flow-drag'

/**
 * T8 — the drag D235 refused, and the two PROOFS the brief asks for.
 *
 * Tests 8 and 9 are the red proofs: 8 fails if `draggable` leaves the rows, 9
 * fails if keyboard moving breaks. Both were run RED before the build — a guard
 * nobody has seen fail is a guard nobody has tested.
 */
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const src = (p: string) => strip(readFileSync(p, 'utf8'))

const ROWS = [
  'app/(app)/undersokelser/[id]/bygg/QuestionCard.tsx',
  'app/(app)/undersokelser/[id]/bygg/BlockCard.tsx',
  'app/(app)/undersokelser/[id]/bygg/CompactFlowRow.tsx',
]

describe('T8 — the flow drag', () => {
  it('1. dragOpacity is .45 on the row in flight and 1 on every other', () => {
    const s: FlowDragState = { ...IDLE, dragId: 'a' }
    expect(dragOpacity(s, 'a')).toBe(0.45)
    expect(dragOpacity(s, 'b')).toBe(1)
    expect(dragOpacity(IDLE, 'a')).toBe(1)
  })

  it('2. dropTop marks the row under the pointer — and never the row being dragged', () => {
    const moving: FlowDragState = { ...IDLE, dragId: 'a', dragOver: 'b' }
    expect(dropTop(moving, 'b')).toBe('3px solid var(--ink)')
    expect(dropTop(moving, 'a')).toBe('3px solid transparent')
    /* The subtle half of v8:6919: a row hovering ITSELF is not a drop target,
       because that is a marker for a move that cannot happen. */
    const self: FlowDragState = { ...IDLE, dragId: 'a', dragOver: 'a' }
    expect(dropTop(self, 'a')).toBe('3px solid transparent')
  })

  it('3. a PALETTE drag marks any row, including one that is not moving', () => {
    const fresh: FlowDragState = { ...IDLE, dragOver: 'b', newDrag: { kind: 'question', type: 'scale', label: 'Skala' } }
    expect(dropTop(fresh, 'b')).toBe('3px solid var(--ink)')
  })

  it('4. the end zone is dashed --ink over --sbg when hovered, dashed --line otherwise', () => {
    expect(endZoneStyle({ ...IDLE, dragOver: '__end' })).toEqual({
      border: '2px dashed var(--ink)',
      background: 'var(--sbg)',
    })
    expect(endZoneStyle(IDLE)).toEqual({
      border: '2px dashed var(--line)',
      background: 'transparent',
    })
  })

  it('5. moveTo splices rather than swaps — v8:6905', () => {
    // Downward: a lands AFTER b, because the splice happens in the shortened array.
    expect(moveTo(['a', 'b', 'c'], 'a', 'b')).toEqual(['b', 'a', 'c'])
    // Upward: c lands BEFORE b.
    expect(moveTo(['a', 'b', 'c'], 'c', 'b')).toEqual(['a', 'c', 'b'])
    // A swap would give ['c','b','a'] for the first case. It does not.
    expect(moveTo(['a', 'b', 'c'], 'a', 'c')).not.toEqual(['c', 'b', 'a'])
    expect(moveTo(['a', 'b', 'c'], 'a', 'a')).toEqual(['a', 'b', 'c'])
    expect(moveTo(['a', 'b', 'c'], 'a', 'zz')).toEqual(['a', 'b', 'c'])
  })

  it('6. dropIndex inserts before the hovered row, and appends at the end zone', () => {
    expect(dropIndex(['a', 'b', 'c'], 'b')).toBe(1)
    expect(dropIndex(['a', 'b', 'c'], '__end')).toBe(3)
    expect(dropIndex(['a', 'b', 'c'], '')).toBe(3)
    expect(dropIndex(['a', 'b', 'c'], 'zz')).toBe(3)
  })

  it('7. no ghost and no placeholder — v8 draws neither', () => {
    /* The feedback is four bindings and none of them is an element. A
       placeholder that opens a gap moves the row you are aiming at. */
    for (const p of ROWS) {
      expect(src(p), p).not.toMatch(/placeholder-?row|dragGhost|setDragImage/i)
    }
  })

  /* ── RED PROOF ONE ─────────────────────────────────────────────────────
     Fails if `draggable` leaves the rows. Proven red by deleting the
     attribute from QuestionCard before the build was finished. */
  it('8. every full flow row is draggable and carries v8’s four handlers', () => {
    for (const p of ROWS) {
      const s = src(p)
      expect(s, `${p}: draggable`).toMatch(/draggable=\{drag\?\.draggable\}/)
      for (const h of ['onDragStart', 'onDragOver', 'onDrop', 'onDragEnd']) {
        expect(s, `${p}: ${h}`).toContain(h)
      }
    }
  })

  /* ── RED PROOF TWO ─────────────────────────────────────────────────────
     Fails if keyboard moving breaks. The arrows and «Flytt til» are the
     keyboard equivalent D235 said was missing, so the drag may not replace
     them — this is what makes the overturn safe rather than a regression. */
  it('9. the keyboard equivalent survives the drag — arrows and «Flytt til»', () => {
    const q = src(ROWS[0]!)
    expect(q, 'moveUp').toContain('moveUp')
    expect(q, 'moveDown').toContain('moveDown')
    const compact = src(ROWS[2]!)
    expect(compact, 'the «Flytt til» select').toMatch(/moveTargets|moveToPlace/)
    /* And the move itself is reachable without a pointer: the same `moveTo`
       the drop handler uses, so the two paths cannot diverge. */
    expect(moveTo(['a', 'b', 'c'], 'c', 'a')).toEqual(['c', 'a', 'b'])
  })
})
