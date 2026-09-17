import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DOT_TINT, flowDot, moveTargets } from '@/lib/surveys/flow-row'
import type { MethodNote } from '@/lib/questions/method'
import no from '../../messages/no.json'
import en from '../../messages/en.json'

/**
 * V7-5 — the compact flow row: the dot, the move targets, and the copy.
 *
 * The dot is a colour picked from a severity, which is the shape F3 found with
 * FOUR implementations (`responsePct`, `pctOf`, the inline arithmetic, `rowRate`),
 * three of which agreed by luck. So it has one home and this is the test over
 * that home; the component is not allowed to assemble one.
 */
const note = (position: number, severity: MethodNote['severity'], title = 'x'): MethodNote => ({
  key: `k${position}${severity}`,
  severity,
  title,
  why: '',
  fix: '',
  position,
})

/** Code with comments stripped. CLAUDE.md: a file that documents its own
 *  refusals contains the words it refuses, and `CompactFlowRow`'s doc comment
 *  spells out the grab handle it must not draw. */
const code = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

describe('flowDot — five outcomes over what this product actually knows', () => {
  it('1. a block has no methodology check, so it has no dot', () => {
    expect(flowDot({ kind: 'block' })).toBe('block')
    // Transparent rather than a tint: an empty grey circle reads as «checked,
    // fine», which is a claim nobody made about a content block.
    expect(DOT_TINT.block).toBe('transparent')
  })

  it('2. the anonymity breach is the BLOCKING state, and it outranks a note', () => {
    /* v7's fourth outcome is its own «Blokkert» severity. `method_rules.severity`
       admits two values and `lib/questions/method.ts` says why there is no third
       — advice does not block. What DOES block in this product is the field
       question under anonymity, which `ready_anonymity` already treats as one. */
    expect(flowDot({ kind: 'question', breach: true, position: 0 })).toBe('blocked')
    expect(
      flowDot({ kind: 'question', breach: true, notes: [note(0, 'advarsel')], position: 0 }),
    ).toBe('blocked')
  })

  it('3. advarsel outranks forslag, and forslag outranks clean', () => {
    expect(flowDot({ kind: 'question', notes: [note(0, 'forslag')], position: 0 })).toBe(
      'suggestion',
    )
    expect(
      flowDot({ kind: 'question', notes: [note(0, 'forslag'), note(0, 'advarsel')], position: 0 }),
    ).toBe('warning')
  })

  it('4. a question with nothing against it is CLEAN, not blank', () => {
    expect(flowDot({ kind: 'question', notes: [], position: 0 })).toBe('clean')
    expect(flowDot({ kind: 'question', position: 0 })).toBe('clean')
  })

  it('5. THE POSITION IS THE QUESTION INDEX, NOT THE FLOW SLOT', () => {
    /* The distinction the Builder keeps as `qIndex` versus `slot`, asserted
       here because conflating them puts a note on the wrong row the moment a
       block sits between two questions — and both numbers exist in the same
       loop. A note about question 0 must not light question 1. */
    const notes = [note(0, 'advarsel')]
    expect(flowDot({ kind: 'question', notes, position: 0 })).toBe('warning')
    expect(flowDot({ kind: 'question', notes, position: 1 })).toBe('clean')
  })

  it('6. every outcome paints a TOKEN, and the two shared ones agree with MethodPanel', () => {
    for (const [outcome, tint] of Object.entries(DOT_TINT)) {
      expect(tint === 'transparent' || /^var\(--[a-z0-9]+\)$/.test(tint), `${outcome}=${tint}`).toBe(
        true,
      )
    }
    // Not a restatement: `MethodPanel` already decided which tint means which
    // severity, and a dot with its own palette would be a second answer.
    const panel = readFileSync('app/(app)/undersokelser/[id]/bygg/MethodPanel.tsx', 'utf8')
    expect(panel).toContain("'advarsel' ? 'var(--sbg)' : 'var(--sf2)'")
    expect(DOT_TINT.warning).toBe('var(--sbg)')
    expect(DOT_TINT.suggestion).toBe('var(--sf2)')
  })
})

describe('moveTargets — «Flytt til plass»', () => {
  it('7. offers every slot except the one the row is in', () => {
    expect(moveTargets(4, 0)).toEqual([1, 2, 3])
    expect(moveTargets(4, 2)).toEqual([0, 1, 3])
    expect(moveTargets(4, 3)).toEqual([0, 1, 2])
  })

  it('8. a flow of one has nowhere to move to, so the control has no options', () => {
    expect(moveTargets(1, 0)).toEqual([])
    expect(moveTargets(0, 0)).toEqual([])
  })
})

describe('the compact row ships no claim it cannot keep', () => {
  it('9. THE HINT DROPS v7 S DRAG CLAUSE, in both languages', () => {
    /* v7's `flowDragHint` (v7:10191) is «Dra i håndtaket for å flytte, eller
       bruk piltastene og «Flytt til». Kompakt visning gir overblikk i lange
       undersøkelser.» D235 refuses the drag, so shipping the first sentence
       would be D221's third face — copy asserting a control the code does not
       have. Only the second sentence ships. */
    for (const [lang, set] of [['no', no], ['en', en]] as const) {
      const hint = (set as { builder: Record<string, string> }).builder.flowCompactHint
      expect(hint, `${lang}.builder.flowCompactHint`).toBeTruthy()
      expect(hint, `${lang} must not promise a drag`).not.toMatch(/\bdra\b|\bdrag\b|håndtak|handle/i)
      expect(hint).toMatch(lang === 'no' ? /Kompakt/ : /Compact/)
    }
  })

  it('10. and the row itself draws no grab handle', () => {
    /* Measured over the CODE: the component's doc comment explains at length
       why the handle is absent, and names it. */
    const body = code(readFileSync('app/(app)/undersokelser/[id]/bygg/CompactFlowRow.tsx', 'utf8'))
    expect(body, 'the braille-dots handle is v7 s drag affordance').not.toContain('⠿')
    expect(body).not.toMatch(/draggable|onDragStart|cursor-grab/)
    // What it DOES carry is the reachable half: two arrows and an absolute move.
    expect(body).toMatch(/moveTargets/)
    expect(body).toMatch(/moveUp/)
    expect(body).toMatch(/moveDown/)
  })

  it('11. every key the row and the switch read resolves in both languages', () => {
    /* Q129's shape: a missing key renders as a raw key on screen, and Tor found
       nine of those behind seventeen green gates. Asserted over the SHIPPED
       strings rather than over a registry. */
    const builderKeys = [
      'viewLabel',
      'viewFull',
      'viewCompact',
      'flowCompactHint',
      'compactNoTitle',
      'compactNoText',
      'moveToLabel',
      'moveToPlaceholder',
      'moveToPlace',
    ]
    const methodKeys = ['noneForQuestion', 'blockNoCheck', 'warning', 'suggestion']
    for (const [lang, set] of [['no', no], ['en', en]] as const) {
      const m = set as { builder: Record<string, string>; method: Record<string, string> }
      for (const k of builderKeys) expect(m.builder[k], `${lang}.builder.${k}`).toBeTruthy()
      for (const k of methodKeys) expect(m.method[k], `${lang}.method.${k}`).toBeTruthy()
    }
    // The one with a placeholder has to carry it, or «Plass 3» renders as «Plass».
    expect((no as { builder: Record<string, string> }).builder.moveToPlace).toContain('{n}')
    expect((en as { builder: Record<string, string> }).builder.moveToPlace).toContain('{n}')
  })
})
