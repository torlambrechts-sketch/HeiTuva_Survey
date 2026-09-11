import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/*
  THE BROWSER ICON IS THE LOGO, NOT A DRAWING OF IT.

  `components/Logo.tsx` carries the instruction «Logo mark copied verbatim from
  /design-reference (header, ~line 140). Do not redraw it.» The favicon is a
  second copy of the same geometry in a second file, which is exactly the
  arrangement where two things drift and nobody notices — a favicon is looked at
  by users constantly and by developers almost never.

  So the geometry is asserted equal rather than trusted. If either file is
  edited, this fails.

  ── WHAT DELIBERATELY DIFFERS, AND WHY IT IS NOT A REDRAW ──────────────────

  **The viewBox.** The mark occupies x 3→29, y 3→28.35 of a 32-unit box
  (measured by rendering and trimming, not by reading the arc commands), so it
  fills 81% of the tile. At the 16px a browser tab actually paints, 19% of
  nothing is worse than nothing. `icon.svg` re-frames to `2 1.68 28 28` — the
  same mark, centred, with one unit of margin. Framing is not redrawing: every
  coordinate is untouched.

  **The colours.** A standalone SVG has no CSS custom properties, so `var(--ac)`
  would render as nothing at all. The literals are not looked up from the token
  list — THE BUNDLE ITSELF WRITES THEM as the fallback half of
  `fill="var(--ac,#F5C64A)"` (L:142-145), which is the same source the tokens
  came from.

  No bundle draws a favicon — `grep -c favicon` is 0 in all three — so the
  framing is genuinely unspecified and CLAUDE.md's rule for that applies: the
  minimal consistent option, logged. D152.
*/
const ICON = 'app/icon.svg'
const LOGO = 'components/Logo.tsx'

const icon = readFileSync(ICON, 'utf8')
const logo = readFileSync(LOGO, 'utf8')

/** The one path's `d`, and the three bars as ordered tuples. */
const geometry = (src: string) => ({
  path: /d="([^"]+)"/.exec(src)?.[1],
  bars: [
    ...src.matchAll(
      /x="([\d.]+)"[\s\S]{0,80}?y="([\d.]+)"[\s\S]{0,80}?width="([\d.]+)"[\s\S]{0,80}?height="([\d.]+)"[\s\S]{0,80}?rx="([\d.]+)"/g,
    ),
  ].map((m) => m.slice(1, 6).join(',')),
})

describe('the browser icon is the logo', () => {
  it('carries the same bubble path, character for character', () => {
    const a = geometry(icon)
    const b = geometry(logo)
    expect(a.path).toBeTruthy()
    expect(a.path).toBe(b.path)
  })

  it('carries the same three bars, in the same order', () => {
    const a = geometry(icon)
    const b = geometry(logo)
    expect(a.bars).toHaveLength(3)
    expect(a.bars).toEqual(b.bars)
  })

  it('is ascending, which is the whole motif', () => {
    // Three bars of growing height: the mark means «results», and a favicon
    // that lost the order would still pass an equality check against a Logo
    // that had lost it too.
    const heights = geometry(icon).bars.map((b) => Number(b.split(',')[3]))
    expect(heights).toEqual([...heights].sort((x, y) => x - y))
    expect(new Set(heights).size).toBe(3)
  })

  it('resolves the tokens to the hexes the BUNDLE writes as its own fallbacks', () => {
    // Not looked up from CLAUDE.md's token list — read out of the drawing, so
    // the icon and the bundle cannot disagree about what amber is.
    const bundle = readFileSync(
      'design-reference/heituva-survey-app-design/project/HeiTuva.dc.html',
      'utf8',
    )
    expect(bundle).toContain('var(--ac,#F5C64A)')
    expect(bundle).toContain('var(--ink,#191510)')
    expect(icon).toContain('#F5C64A')
    expect(icon).toContain('#191510')
    // And no unresolved variable survived: it would render as nothing.
    expect(icon).not.toContain('var(--')
  })

  it('re-frames rather than redraws, and fills the tile it is painted in', () => {
    const vb = /viewBox="([^"]+)"/.exec(icon)![1]!.split(/\s+/).map(Number)
    expect(vb).not.toEqual([0, 0, 32, 32])
    const [, , w, h] = vb as [number, number, number, number]
    expect(w).toBe(h) // square, or a tab strip will letterbox it
    // The mark is 26 x 25.35, measured. Anything looser than 30 units of
    // viewBox puts it under 87% of the tile, which is where 16px stops reading.
    expect(w).toBeLessThan(30)
    expect(26 / w).toBeGreaterThan(0.87)
  })

  it('is reachable by Next’s file convention, so nothing has to remember a <link>', () => {
    // app/icon.svg and app/apple-icon.png are generated into <head> by the
    // framework. A metadata.icons entry would be a second place to be wrong.
    expect(() => readFileSync('app/apple-icon.png')).not.toThrow()
    expect(readFileSync('app/layout.tsx', 'utf8')).not.toContain('icons:')
  })
})
