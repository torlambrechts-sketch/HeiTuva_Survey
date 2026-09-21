import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LIVE_FEATURES } from '@/lib/surveys/live-features'

/*
  T7 · v8:881-897 — «LIVE-INNSTILLINGER», WHICH SHIPS WITH NO SWITCHES.

  Tor's rule for this phase: **no toggle without a value it actually writes.**
  v8 draws ten of them over `st.liveOn || DEFAULT_LIVE`; measured, the product
  has no per-survey live storage at all, so all ten would be D208's second
  face — a control that saves nothing — with D221's third face on top of it,
  because each one carries a sentence describing what it does.

  These tests are the measurement rather than a restatement of it. The list is
  derived from the BUNDLE, each claim resolves against the file it names, and
  the «no switches» property is asserted over LivePanel's source so that
  adding one without adding storage fails here.
*/
const BUNDLE = 'design-reference-v8/heituva-survey-app-design/project/HeiTuva.dc.html'
const PANEL = 'app/(app)/undersokelser/[id]/bygg/LivePanel.tsx'
const BUILDER = 'app/(app)/undersokelser/[id]/bygg/Builder.tsx'

const decomment = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/^\s*\/\/.*$/gm, '')

const read = (p: string) => readFileSync(p, 'utf8')

/** v8:10252-10262 — the array literal, read off the drawing rather than typed. */
function bundleLiveKeys(): string[] {
  const src = read(BUNDLE)
  const start = src.indexOf('liveToggles: [')
  expect(start).toBeGreaterThan(0)
  const end = src.indexOf('].map(', start)
  expect(end).toBeGreaterThan(start)
  return [...src.slice(start, end).matchAll(/\["([a-zA-Z]+)","/g)].map((m) => m[1] as string)
}

describe('live features (v8:881-897)', () => {
  it('1 — the registry is v8’s ten keys, in v8’s order', () => {
    const drawn = bundleLiveKeys()
    expect(drawn).toHaveLength(10)
    expect(LIVE_FEATURES.map((f) => f.key)).toEqual(drawn)
  })

  it('2 — every label key resolves in BOTH locales, and so does every desc', () => {
    // A key assembled at render time that misses renders as a raw key. These
    // are spelled out in the registry precisely so this test can open them.
    for (const file of ['messages/no.json', 'messages/en.json']) {
      const b = JSON.parse(read(file)).builder as Record<string, string>
      for (const f of LIVE_FEATURES) {
        expect(typeof b[f.labelKey], `${file} ${f.labelKey}`).toBe('string')
        if (f.descKey) expect(typeof b[f.descKey], `${file} ${f.descKey}`).toBe('string')
      }
      for (const k of ['liveTitle', 'liveAlwaysOn', 'liveNotBuilt']) {
        expect(typeof b[k], `${file} ${k}`).toBe('string')
      }
    }
  })

  it('3 — an `always` entry describes itself; an `absent` one does not', () => {
    // v8's desc sentences state what a feature DOES. Printing one beside
    // «ikke bygget» would describe behaviour nobody can reach.
    for (const f of LIVE_FEATURES) {
      if (f.state === 'always') expect(f.descKey, f.key).not.toBeNull()
      else expect(f.descKey, f.key).toBeNull()
    }
    expect(LIVE_FEATURES.filter((f) => f.state === 'always')).toHaveLength(5)
    expect(LIVE_FEATURES.filter((f) => f.state === 'absent')).toHaveLength(5)
  })

  it('4 — every `file:symbol` claim OPENS, rather than being asserted', () => {
    // The registry says the live stage does these. A comment saying so is a
    // claim nobody re-derives; this reads the file.
    for (const f of LIVE_FEATURES) {
      if (!f.evidence) continue
      const idx = f.evidence.lastIndexOf(':')
      const path = f.evidence.slice(0, idx)
      const symbol = f.evidence.slice(idx + 1)
      expect(() => statSync(path), f.evidence).not.toThrow()
      expect(read(path).includes(symbol), `${f.evidence} not found`).toBe(true)
    }
  })

  it('5 — a null-evidence key is named NOWHERE in the product', () => {
    // «Nothing implements this» is the claim; the way to hold it is to look.
    const files: string[] = []
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name)
        if (e.isDirectory()) walk(p)
        else if (/\.tsx?$/.test(e.name)) files.push(p)
      }
    }
    walk('app')
    walk('lib')
    const REGISTRY = 'lib/surveys/live-features.ts'
    for (const f of LIVE_FEATURES) {
      if (f.evidence !== null) continue
      // As a live OPTION would be named — a quoted key or an object
      // property — rather than as a bare word. `temp` is an ordinary local
      // variable name, and a sweep that flags one of those is a false positive
      // in unrelated code, which is worse than the silence it replaces.
      const named = new RegExp(`['"\`]${f.key}['"\`]|\\b${f.key}\\s*:`)
      const hits = files.filter((p) => p !== REGISTRY && named.test(decomment(read(p))))
      expect(hits, `${f.key} is claimed absent but appears in ${hits.join(', ')}`).toEqual([])
    }
  })

  it('6 — the panel has NO switch, because nothing would store its state', () => {
    // RED PROOF: adding `role="switch"` or an onClick to LivePanel.tsx fails
    // this. That is the point — the day a live option gets a column, this test
    // is what has to be changed deliberately rather than drifted past.
    const panel = decomment(read(PANEL))
    expect(panel).not.toMatch(/role="switch"/)
    expect(panel).not.toMatch(/onClick/)
    expect(panel).not.toMatch(/aria-checked/)
  })

  it('7 — the guard sentence is `live.guard`, not a second copy under builder', () => {
    // One string, one truth. A builder copy of it is two sentences that drift.
    const builder = decomment(read(BUILDER))
    expect(builder).toMatch(/guard:\s*tLive\('guard'\)/)
    const no = JSON.parse(read('messages/no.json'))
    expect(typeof no.live.guard).toBe('string')
    expect(no.builder.liveGuard).toBeUndefined()
  })

  it('8 — the card is shown only in live mode', () => {
    // Settings FOR the mode. In standard mode it would govern nothing, which
    // is the argument QuizPanel's own gate makes.
    const builder = decomment(read(BUILDER))
    expect(builder).toMatch(/tab === 'general' && runMode === 'live' \? \(\s*<LivePanel/)
  })
})
