/**
 * N6 — THE GEOMETRY DIFF, KEYED ON THE ELEMENT INSTEAD OF ON THE VALUE SET.
 *
 * ── WHAT THE OLD ONE MEASURED, AND WHY IT WAS THE WRONG THING ─────────────
 *
 * `docs/fidelity/bundle-geometry-diff.json` compares, per (screen, property), a
 * sorted MULTISET of literal values. A multiset has no positions. So:
 *
 *   - **A MOVED ELEMENT IS INVISIBLE.** Its declarations leave one place and
 *     arrive in another; the multiset is unchanged and the entry reads clean.
 *   - **WHAT IT GAINS ON ARRIVAL IS ATTRIBUTED TO PROPERTIES IT NEVER TOUCHED.**
 *     A wrapper and a label added around a relocated chip make `font-size`,
 *     `letter-spacing`, `gap`, `margin-top` and `line-height` all read CHANGED,
 *     on a screen where nothing was restyled at all.
 *
 * Measured: **all ten `_shell` entries have `v7_only_values: []`.** Nothing
 * left. Every delta was a count going up — ten «changes» that were two
 * relocations (D251). The old tool could not have said so, because the question
 * «which element is this value on» is not one a value set can answer.
 *
 * ── WHAT THIS ONE MEASURES ────────────────────────────────────────────────
 *
 * Elements, in document order, per screen, ALIGNED between the two bundles by
 * identity, then compared property by property on the aligned pairs. The unit
 * of a finding is «this element's `padding` went 13px -> 14px», which names a
 * thing a person can go and look at.
 *
 * Alignment is an LCS over element SIGNATURES — tag, attribute names, and the
 * element's own text or binding. The signature deliberately excludes `style`,
 * so an element whose only change IS its style still aligns with itself; that
 * is the whole point. An element with no partner is `added` or `removed`, which
 * is a different finding from `changed` and is reported as one.
 *
 * ── THE SIXTEEN SCREENS ARE DERIVED, NOT LISTED ───────────────────────────
 *
 * The bundle's own script defines them — `isDashboard: st.screen==="dashboard"`
 * — so the gate names come out of the file rather than out of a list somebody
 * maintained. The old artefact carries ELEVEN screens; the bundle has SIXTEEN,
 * and five of them (`admin`, `livestage`, `profile`, `respond`, `svdetail`)
 * were absent from it entirely. A derivation is only as wide as the set it
 * iterates, and that one iterated a set nobody re-derived.
 *
 * Usage:
 *   npx tsx scripts/fidelity/geometry-diff.ts \
 *     --from=design-reference-v7/.../HeiTuva.dc.html \
 *     --to=design-reference-v8/.../HeiTuva.dc.html \
 *     --out=docs/fidelity/bundle-geometry-per-element.json
 */
import { readFileSync, writeFileSync } from 'node:fs'

const argOf = (k: string) =>
  process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3)

const FROM = argOf('from') ?? 'design-reference-v7/heituva-survey-app-design/project/HeiTuva.dc.html'
const TO = argOf('to') ?? 'design-reference-v8/heituva-survey-app-design/project/HeiTuva.dc.html'
const OUT = argOf('out') ?? 'docs/fidelity/bundle-geometry-per-element.json'

/** The geometry properties that matter. Same set the old artefact reports on,
 *  so the two numbers are comparable — that comparison is the point of N6. */
const PROPS = new Set([
  'border', 'border-radius', 'font-size', 'font-weight', 'gap', 'height',
  'letter-spacing', 'line-height', 'margin-top', 'padding',
])

type El = {
  screen: string
  tag: string
  /** Strong identity: tag, attribute names, own text AND every style
   *  declaration this tool does not measure. Used for the first alignment. */
  sig: string
  /** Weak identity: tag, attribute names and own text only. Used for the
   *  SECOND pass over what the first could not pair — see `alignScreen`. */
  weak: string
  line: number
  styles: Map<string, string>
}

/** `line after </helmet>` .. `line before </x-dc>` — the markup region rule the
 *  old extractor used, kept so the two tools read the same bytes. */
function markupRegion(lines: string[]): [number, number] {
  const start = lines.findIndex((l) => l.includes('</helmet>')) + 1
  const end = lines.findIndex((l) => l.includes('</x-dc>'))
  return [start, end]
}

/** `isDashboard` -> `dashboard`, read off the bundle's own script. */
function screenGates(src: string): Map<string, string> {
  const out = new Map<string, string>()
  const re = /\b(is[A-Z][A-Za-z]*)\s*:\s*st\.screen\s*===\s*"([a-z]+)"/g
  for (const m of src.matchAll(re)) out.set(m[1]!, m[2]!)
  return out
}

/** Splits a `style="…"` into the declarations this tool MEASURES and the rest,
 *  which become part of the element's identity. */
function parseStyle(raw: string): { measured: Map<string, string>; other: string[] } {
  const measured = new Map<string, string>()
  const other: string[] = []
  for (const decl of raw.split(';')) {
    const i = decl.indexOf(':')
    if (i < 0) continue
    const prop = decl.slice(0, i).trim()
    const val = decl.slice(i + 1).trim()
    if (PROPS.has(prop)) measured.set(prop, val)
    else other.push(`${prop}:${val}`)
  }
  other.sort()
  return { measured, other }
}

/**
 * An element's identity, for alignment.
 *
 * THE MEASURED PROPERTIES ARE EXCLUDED and everything else about the style is
 * INCLUDED, and both halves are load-bearing:
 *
 *  - excluding `padding`, `gap`, `font-size` … is what lets an element whose
 *    only change IS its geometry still align with itself. Without that, a
 *    restyle reports as one removal plus one addition and the property that
 *    changed is never named.
 *  - including `display`, `align-items`, `background`, `position` … is what
 *    makes a bare `<div style="…">` distinguishable from the next one.
 *
 * THE SECOND HALF WAS ADDED AFTER THE FIRST RUN LIED. With the signature as
 * `tag|attrs|text` alone, every unattributed div hashed to `div||`, so the LCS
 * paired elements that merely looked alike. v8 removes the breadcrumb from the
 * `results` screen (v7:5718); every later bare div shifted by one, and the tool
 * reported TEN changed declarations where the truth is one removal and no
 * restyle at all. `send` produced the identical phantom ten.
 *
 * That is the same failure as the artefact this replaces, one level down: a key
 * too coarse to tell two things apart, and a diff that then attributes one
 * thing's values to another. An identity weak enough to collide is not an
 * identity.
 *
 * The cost of the stronger key is stated rather than hidden: if a NON-measured
 * declaration also changed, the element no longer aligns and is reported as a
 * removal plus an addition instead of a change. That is the safer direction —
 * a pair a reader must look at, rather than a number they would believe.
 */
function signature(tag: string, attrs: string, inner: string, other: string[]): string {
  const names = [...attrs.matchAll(/([a-zA-Z-]+)\s*=/g)]
    .map((m) => m[1]!)
    .filter((n) => n !== 'style' && n !== 'style-hover')
    .sort()
    .join(',')
  const text = inner.replace(/\s+/g, ' ').trim().slice(0, 48)
  return `${tag}|${names}|${text}|${other.join(';')}`
}

function elementsOf(path: string): El[] {
  const src = readFileSync(path, 'utf8')
  const lines = src.split('\n')
  const [start, end] = markupRegion(lines)
  const gates = screenGates(src)

  const out: El[] = []
  /** Open `sc-if` gates, innermost last. Only SCREEN gates are pushed; a state
   *  gate (`isQuizMode`, `isCardView`) is not a screen and must not rename the
   *  elements under it. */
  const screenStack: { name: string; depth: number }[] = []
  let depth = 0

  for (let i = start; i < end; i++) {
    const line = lines[i]!
    /* One pass over the line's tags, in order, so nesting and elements are
       tracked together rather than in two passes that can disagree. */
    const tagRe = /<(\/?)([a-zA-Z][\w-]*)([^>]*?)(\/?)>/g
    for (const m of line.matchAll(tagRe)) {
      const closing = m[1] === '/'
      const tag = m[2]!
      const attrs = m[3] ?? ''
      const selfClosing = m[4] === '/' || /^(br|img|input|hr|meta|link|path|circle|rect|line|polyline)$/.test(tag)

      if (closing) {
        depth--
        while (screenStack.length && screenStack[screenStack.length - 1]!.depth > depth) {
          screenStack.pop()
        }
        continue
      }

      if (tag === 'sc-if') {
        const cond = /value="\{\{\s*(is[A-Z][A-Za-z]*)\s*\}\}"/.exec(attrs)
        const screen = cond ? gates.get(cond[1]!) : undefined
        if (!selfClosing) {
          depth++
          if (screen) screenStack.push({ name: screen, depth })
        }
        continue
      }

      const styleM = /\sstyle="([^"]*)"/.exec(attrs)
      if (styleM) {
        const { measured: styles, other } = parseStyle(styleM[1]!)
        if (styles.size) {
          // The element's own text, for the signature: whatever follows this
          // tag on the line, up to the next tag.
          const after = line.slice(m.index! + m[0].length)
          const inner = after.slice(0, after.indexOf('<') < 0 ? after.length : after.indexOf('<'))
          out.push({
            screen: screenStack.length ? screenStack[screenStack.length - 1]!.name : '_shell',
            tag,
            sig: signature(tag, attrs, inner, other),
            weak: signature(tag, attrs, inner, []),
            line: i + 1,
            styles,
          })
        }
      }
      if (!selfClosing) depth++
    }
  }
  return out
}

/** Longest common subsequence over a chosen key — the alignment. Returns pairs
 *  of indices `[a, b]` for elements that correspond. */
function lcs(a: El[], b: El[], key: (e: El) => string): [number, number][] {
  const n = a.length
  const m = b.length
  /* Int32Array rather than nested arrays: the largest screen is a few hundred
     elements, so n*m stays small, but the shell is the one that grows. */
  const dp = new Int32Array((n + 1) * (m + 1))
  const at = (i: number, j: number) => i * (m + 1) + j
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[at(i, j)] =
        key(a[i]!) === key(b[j]!)
          ? dp[at(i + 1, j + 1)]! + 1
          : Math.max(dp[at(i + 1, j)]!, dp[at(i, j + 1)]!)
    }
  }
  const pairs: [number, number][] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (key(a[i]!) === key(b[j]!)) {
      pairs.push([i, j])
      i++
      j++
    } else if (dp[at(i + 1, j)]! >= dp[at(i, j + 1)]!) i++
    else j++
  }
  return pairs
}

const from = elementsOf(FROM)
const to = elementsOf(TO)

const screens = [...new Set([...from, ...to].map((e) => e.screen))].sort()

type Change = {
  property: string
  from: string | null
  to: string | null
  tag: string
  sig: string
  fromLine: number
  toLine: number
  /**
   * WHICH ALIGNMENT PAIRED THESE TWO, and it decides how much the entry is
   * worth. `1` is the strong key — tag, attributes, own text AND every
   * non-measured declaration — so the two elements are the same one beyond
   * reasonable doubt and a differing property is a real restyle. `2` is the
   * weak-key fallback over what pass 1 could not place; it recovers an element
   * that changed a measured AND a non-measured property, and it is the pass
   * that can still mispair two bare `<div style>` neighbours after an
   * insertion. A pass-2 change on an element with no attribute and no own text
   * is a claim to VERIFY, not a finding to act on.
   */
  pass: 1 | 2
}

const report: Record<string, {
  elements: { from: number; to: number }
  changed: Change[]
  added: { tag: string; sig: string; line: number; styles: Record<string, string> }[]
  removed: { tag: string; sig: string; line: number; styles: Record<string, string> }[]
}> = {}

/**
 * TWO PASSES, AND NEITHER ALONE IS CORRECT.
 *
 * Pass 1 aligns on the STRONG signature. Anything it pairs is the same element
 * beyond reasonable doubt, and any measured property that differs is a real
 * restyle.
 *
 * Pass 2 exists because the strong key fails in one direction: an element that
 * changed a measured property AND a non-measured one no longer matches itself,
 * and would be reported as a removal plus an addition — a real change, hidden
 * as a pair of structural ones. `build` produced exactly that: 0 changed with
 * 14 added and 14 removed, which is fourteen elements restyled in two respects
 * each. So the leftovers are re-matched IN ORDER on the WEAK signature (tag,
 * attribute names, own text).
 *
 * Order is what keeps pass 2 from reintroducing the collision pass 1 exists to
 * avoid: leftovers are paired left-to-right within the screen, so a removal at
 * the top cannot pair with an addition at the bottom. Anything still unpaired
 * after both passes is a genuine addition or removal.
 */
function alignScreen(a: El[], b: El[]): [number, number, 1 | 2][] {
  const pairs: [number, number, 1 | 2][] = lcs(a, b, (e) => e.sig).map(
    ([i, j]) => [i, j, 1 as const],
  )
  const usedA = new Set(pairs.map((p) => p[0]))
  const usedB = new Set(pairs.map((p) => p[1]))

  const leftA = a.map((_, i) => i).filter((i) => !usedA.has(i))
  const leftB = b.map((_, i) => i).filter((i) => !usedB.has(i))
  const second = lcs(
    leftA.map((i) => a[i]!),
    leftB.map((i) => b[i]!),
    (e) => e.weak,
  )
  for (const [i, j] of second) pairs.push([leftA[i]!, leftB[j]!, 2])
  pairs.sort((x, y) => x[0] - y[0])
  return pairs
}

for (const screen of screens) {
  const a = from.filter((e) => e.screen === screen)
  const b = to.filter((e) => e.screen === screen)
  const pairs = alignScreen(a, b)
  const matchedA = new Set(pairs.map((p) => p[0]))
  const matchedB = new Set(pairs.map((p) => p[1]))

  const changed: Change[] = []
  for (const [ia, ib, pass] of pairs) {
    const ea = a[ia]!
    const eb = b[ib]!
    for (const prop of new Set([...ea.styles.keys(), ...eb.styles.keys()])) {
      const va = ea.styles.get(prop) ?? null
      const vb = eb.styles.get(prop) ?? null
      if (va !== vb) {
        changed.push({
          property: prop, from: va, to: vb,
          tag: eb.tag, sig: eb.sig, fromLine: ea.line, toLine: eb.line, pass,
        })
      }
    }
  }

  report[screen] = {
    elements: { from: a.length, to: b.length },
    changed,
    added: b.filter((_, i) => !matchedB.has(i)).map((e) => ({
      tag: e.tag, sig: e.sig, line: e.line, styles: Object.fromEntries(e.styles),
    })),
    removed: a.filter((_, i) => !matchedA.has(i)).map((e) => ({
      tag: e.tag, sig: e.sig, line: e.line, styles: Object.fromEntries(e.styles),
    })),
  }
}

writeFileSync(OUT, JSON.stringify({
  _meta: {
    method: 'per ELEMENT. key = (screen gate, aligned element, property). Alignment is an LCS over element signatures; `style` is excluded from the signature so a restyled element still aligns with itself.',
    supersedes: 'docs/fidelity/bundle-geometry-diff.json, which keyed on a sorted multiset of literal values per (screen, property) and therefore could not see a moved element (D251).',
    from: FROM,
    to: TO,
    screensDerivedFrom: 'the bundle\'s own `isX: st.screen==="x"` definitions',
    properties: [...PROPS].sort(),
  },
  screens: report,
}, null, 2) + '\n')

console.log(`\n== geometry, per element — ${FROM.split('/')[0]} -> ${TO.split('/')[0]}\n`)
console.log(`screens  ${screens.length}`)
console.log(`elements ${from.length} -> ${to.length} (carrying at least one measured property)\n`)
console.log('screen'.padEnd(14) + 'changed'.padStart(9) + 'added'.padStart(8) + 'removed'.padStart(9) + '   elements')
for (const s of screens) {
  const r = report[s]!
  console.log(
    s.padEnd(14) +
      String(r.changed.length).padStart(9) +
      String(r.added.length).padStart(8) +
      String(r.removed.length).padStart(9) +
      `   ${r.elements.from} -> ${r.elements.to}`,
  )
}
const total = screens.reduce((n, s) => n + report[s]!.changed.length, 0)
console.log(`\nCHANGED declarations, per element: ${total}`)
console.log(`wrote ${OUT}`)
