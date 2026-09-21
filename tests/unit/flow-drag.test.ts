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

  /* ── T8.3 · THE HANDLE ────────────────────────────────────────────────
     v8 draws it at three sites (v8:609, 746, 784) and we had it at ONE, as
     `⋮⋮` and `aria-hidden` — D235's treatment, correct while the handle moved
     nothing. The drag exists, so the handle is true at all three. */
  it('10. all three rows draw v8\u2019s handle, and it is the same one', () => {
    for (const p of ROWS) {
      expect(src(p), `${p} has no GrabHandle`).toContain('<GrabHandle')
      /* AND EVERY ONE IS GATED ON THE DRAG. `BlockCard` rendered its handle
         unconditionally — harmless while it was `aria-hidden` and moved
         nothing, D221's third face once labelled «Flytt blokken» with
         `cursor:grab`. T8.3's direct measurement found it on a SENT survey:
         4 handles, 0 draggable elements. A handle on a row that cannot be
         dragged is the exact claim D235 refused. */
      expect(src(p), `${p} draws a handle that is not gated on the drag`).toMatch(
        /drag\?\.draggable \? <GrabHandle/,
      )
    }
    // ONE component, so the three cannot drift into three handles — the
    // four-implementations shape F3 measured, refused up front.
    const h = src('app/(app)/undersokelser/[id]/bygg/GrabHandle.tsx')
    expect(h, 'the glyph is ⠿, not ⋮⋮').toContain('\u283F')
    expect(h).not.toContain('\u22EE')
  })

  it('11. the handle is LABELLED rather than aria-hidden, in both locales', () => {
    // v8:6920 `grabLabel` — «Flytt spørsmålet» / «Flytt blokken». Announcing
    // it was a promise the code could not keep under D235; it can now.
    const h = src('app/(app)/undersokelser/[id]/bygg/GrabHandle.tsx')
    expect(h).toContain('aria-label={label}')
    expect(h).toContain('title={label}')
    expect(h).not.toContain('aria-hidden')
    for (const f of ['messages/no.json', 'messages/en.json']) {
      const b = JSON.parse(readFileSync(f, 'utf8')).builder
      expect(typeof b.grabQuestion, `${f} grabQuestion`).toBe('string')
      expect(typeof b.grabBlock, `${f} grabBlock`).toBe('string')
    }
  })

  it('12. 16px painted takes `touch-44`, and NOT the field variant', () => {
    // A <span> is not a REPLACED element, so the `::after` hit area renders —
    // which is exactly why `touch-44-field` is the wrong one of the two here
    // (it paints an inset ring on a glyph that has no border). globals.css
    // carries both with the reason; taking the wrong one is the mistake C4
    // made on FeedbackList's <select>.
    const h = src('app/(app)/undersokelser/[id]/bygg/GrabHandle.tsx')
    expect(h).toMatch(/className="touch-44 /)
    expect(h).not.toContain('touch-44-field')
    expect(h, 'v8:784 width:16px').toContain('w-4')
  })
})
