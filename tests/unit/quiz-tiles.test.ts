import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * V2-10, Q83 / D125 — **every quiz tile carries readable text.**
 *
 * The bundle's `--qz1` (`#F26B21`) measured **2.99:1** against `--sf`, and the
 * markup at V2:3401-3405 puts the option LABEL on the tile at 15px bold — normal
 * text under WCAG, so the requirement is 4.5:1 and not the 3:1 that would apply
 * to a decorative icon. Tor's decision was to darken it; `--qz1` is the only
 * token in this project that is not the drawn hex.
 *
 * **THE ASSERTION IS THE PROPERTY, NOT THE FOUR HEXES.** Pinning the values
 * would pass a fifth tile that fails, which is exactly the shape CLAUDE.md's
 * «an enumeration mistaken for a property» section names. So the ratios are
 * RECOMPUTED from `globals.css`: a future edit that reintroduces a low-contrast
 * tile fails here rather than shipping to the respondent surface.
 */
const CSS = readFileSync('app/globals.css', 'utf8')

/** WCAG 2.1 relative luminance. */
function luminance(hex: string): number {
  const chan = (h: string) => {
    const c = parseInt(h, 16) / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  }
  return (
    0.2126 * chan(hex.slice(1, 3)) + 0.7152 * chan(hex.slice(3, 5)) + 0.0722 * chan(hex.slice(5, 7))
  )
}

function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)]
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

/** Read a custom property's value out of the stylesheet. */
function token(name: string): string {
  const m = new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})`).exec(CSS)
  expect(m, `--${name} is defined in globals.css`).not.toBeNull()
  return m![1]!.toUpperCase()
}

describe('(Q83/D125) the quiz tiles carry readable text', () => {
  const sf = token('sf')

  it('there are four tile tokens to check — an empty sweep is not a pass', () => {
    const found = [...CSS.matchAll(/--qz(\d+):/g)].map((m) => m[1])
    expect(found, 'the sweep found the tiles it is about').toEqual(['1', '2', '3', '4'])
  })

  it('EVERY tile clears 4.5:1 against --sf — the label on it is normal text', () => {
    const failing: string[] = []
    for (const n of [1, 2, 3, 4]) {
      const hex = token(`qz${n}`)
      const ratio = contrast(hex, sf)
      if (ratio < 4.5) failing.push(`--qz${n} ${hex} = ${ratio.toFixed(2)}:1`)
    }
    expect(
      failing,
      'a tile below 4.5:1 puts unreadable text on the respondent surface. The label sits ON ' +
        'the tile (V2:3401-3405) at 15px bold, which is normal text: 4.5:1, not 3:1.',
    ).toEqual([])
  })

  it('`--qz1` is the darkened one, and the other three are the drawn hexes', () => {
    // The one deliberate departure, pinned so it cannot drift back silently in
    // either direction: a re-import from the bundle would restore #F26B21 and
    // fail the test above, and this says why the value differs at all.
    expect(token('qz1'), 'darkened per Tor 2026-09-09 (D125); the drawn #F26B21 is 2.99:1')
      .toBe('#C14B0B')
    expect([token('qz2'), token('qz3'), token('qz4')], 'unchanged from V2:4084-4089')
      .toEqual(['#2F6FB0', '#2F7D4F', '#B0343C'])
  })

  it('and the darkening kept the drawn hue — it is the same orange, not a new colour', () => {
    // Only lightness moved: hsl(21.2, 88.9%) 53.9% -> 40.0%. Asserted so a later
    // «fix» that satisfies the contrast rule by picking an unrelated colour
    // fails, since that would be a restyle rather than an accessibility repair.
    const hue = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number]
      const mx = Math.max(r, g, b)
      const d = mx - Math.min(r, g, b)
      if (d === 0) return 0
      const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4
      return (h * 60 + 360) % 360
    }
    expect(Math.abs(hue(token('qz1')) - hue('#F26B21')), 'same hue as drawn, within a degree')
      .toBeLessThan(1)
  })
})
