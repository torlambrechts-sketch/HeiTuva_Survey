import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * F2 — every screen the drawing renders has a declared counterpart.
 *
 * `scripts/verify/fidelity.ts` throws on an undeclared screen, and that throw
 * only happens when somebody runs it. This is the same property in CI: a
 * handoff that adds a screen fails HERE, in the commit that adds it, rather
 * than being silently left out of the one comparison that looks at the app.
 *
 * Read as SOURCE rather than imported, because importing the script would run
 * its `main()` — it has no export and adding one to satisfy a test is the
 * shape this project refuses elsewhere.
 */
const SRC = readFileSync('scripts/verify/fidelity.ts', 'utf8')

/** The declared pairs, parsed out of the map literal. */
function declaredPairs(): Map<string, string | null> {
  const start = SRC.indexOf('const PAIRS: Record<string, Pair> = {')
  expect(start, 'the PAIRS map was renamed — this test is reading the wrong thing').toBeGreaterThan(0)
  const body = SRC.slice(start, SRC.indexOf('\n}\n', start))
  const out = new Map<string, string | null>()
  for (const m of body.matchAll(/^\s*'?([a-z0-9-]+)'?:\s*\{\s*app:\s*(null|'([^']+)')/gm)) {
    out.set(m[1]!, m[2] === 'null' ? null : m[3]!)
  }
  return out
}

/** The drawing's screens are the FILES the reference harness committed — the
 *  same derivation the script does, so the two cannot disagree about the set. */
function drawnScreens(): string[] {
  const dirs = readdirSync('artifacts').filter((d) => d.startsWith('reference-'))
  const target = dirs.sort().at(-1)!
  return readdirSync(`artifacts/${target}`)
    .filter((f) => f.endsWith('.png'))
    .map((f) => f.slice(0, -4))
    .sort()
}

describe('F2 — the fidelity pairing is complete', () => {
  it('every screen the target bundle renders has a PAIRS entry', () => {
    const pairs = declaredPairs()
    const missing = drawnScreens().filter((s) => !pairs.has(s))
    expect(
      missing,
      `screens in the drawing with no PAIRS entry: ${missing.join(', ')}`,
    ).toEqual([])
  })

  it('no PAIRS entry names a screen the drawing does not have', () => {
    /* The other direction, and it is not symmetry for its own sake: a stale
       entry pointing at a screen a later handoff removed would sit there
       looking like coverage. */
    const drawn = new Set(drawnScreens())
    const stale = [...declaredPairs().keys()].filter((k) => !drawn.has(k))
    expect(stale, `PAIRS entries with no screen in the drawing: ${stale.join(', ')}`).toEqual([])
  })

  it('every null entry says WHICH KIND of nothing it is', () => {
    /* «no app capture» covers two different facts — the state is built and
       nobody declared it, or the screen does not exist — and only the second is
       a gap in the product. An unexplained null would collapse them. */
    const start = SRC.indexOf('const PAIRS: Record<string, Pair> = {')
    const body = SRC.slice(start, SRC.indexOf('\n}\n', start))
    for (const m of body.matchAll(/^\s*'?([a-z0-9-]+)'?:\s*\{\s*app:\s*null([^}]*)\}/gm)) {
      expect(m[2], `PAIRS["${m[1]}"] is null with no note`).toMatch(/note:\s*'[^']{10,}'/)
    }
  })

  it('the script says, in its own output, what it CANNOT establish', () => {
    /* The honesty is load-bearing: a comparison that reports differences
       without naming the decided-not-built list reads as a defect list. And a
       surface the app never built produces no capture at all, which is the
       class the audit was written for and the one thing a picture comparison
       cannot see. Both sentences are asserted rather than trusted to survive an
       edit. */
    expect(SRC).toMatch(/WHAT IT CANNOT/)
    expect(SRC).toMatch(/decided-not-built/)
    expect(SRC).toMatch(/MISSING ROW/)
    for (const refused of ['Feltarbeid', 'uitest', 'nps card']) {
      expect(SRC, `the refused list does not name ${refused}`).toContain(refused)
    }
  })
})
