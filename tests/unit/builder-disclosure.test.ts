import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/*
  B0 — THE ADVANCED-OPTIONS DISCLOSURE, WHICH NEVER CLOSED.

  `QuestionCard` carried `<details className="mt-[11px] md:open" open>` with a
  `md:hidden` summary and a comment saying the panel is «closed by default»
  below `md`.

  **Three things were wrong at once and none of them was visible to a gate.**
  `open` is a Tailwind VARIANT (`open:bg-x`), never a utility, so `md:open`
  compiled to nothing — `grep` found the string in exactly one file and the
  built CSS contained no `.md\:open`. The `open` ATTRIBUTE beside it was
  unconditional, so the panel was expanded at every width. And the summary,
  hidden at `md` and up, was therefore a control that below `md` did nothing at
  all: tapping it collapsed a panel that the attribute immediately reopened on
  the next render.

  `verify:responsive` could not see it — an expanded panel is not an overflow —
  and no unit test read the file. It was found by reading the class list against
  the Tailwind variant list.

  These tests assert the PROPERTY (the panel's visibility is state-driven below
  md and unconditional at md and up), not the mechanism, so replacing the markup
  again does not require rewriting them — except for the one that names the dead
  class, which exists to keep that exact string from coming back.
*/
const CARD = 'app/(app)/undersokelser/[id]/bygg/QuestionCard.tsx'

/* Comments are stripped: these are about what the code DOES. The header above
   quotes the old markup in prose, and an assertion that read prose would pass
   or fail on how the change was explained (D139). */
const decomment = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '')

const card = decomment(readFileSync(CARD, 'utf8'))

describe('the advanced-options disclosure', () => {
  it('carries no `md:open`, which is not a Tailwind utility in any version', () => {
    expect(card).not.toContain('md:open')
  })

  it('does not use <details>, which cannot express "closed below md, open above"', () => {
    // `open` is an attribute and no media query reaches it. A <details> here can
    // only be open everywhere or closed everywhere; the breakpoint has to live
    // somewhere a media query can see, which is a class on the panel.
    expect(card).not.toContain('<details')
    expect(card).not.toContain('<summary')
  })

  it('drives the panel from state, and the toggle reports it to assistive tech', () => {
    expect(card).toMatch(/useState\(false\)/)
    expect(card).toMatch(/aria-expanded=\{mobileOpen\}/)
    expect(card).toMatch(/setMobileOpen\(\(v\) => !v\)/)
  })

  it('hides the panel below md when closed and shows it unconditionally at md', () => {
    // The two halves of the property, in one class list: `md:flex` is the
    // unconditional half and stops the ternary from applying at md and up.
    expect(card).toMatch(/md:flex/)
    expect(card).toMatch(/mobileOpen \? 'flex' : 'hidden'/)
  })

  it('keeps the toggle a 44px target and hides it at md, as the design has no disclosure', () => {
    // V2:474 gates the advanced block on `q.advanced` alone and draws no
    // disclosure at all — the disclosure is RESPONSIVE.md's addition for narrow
    // viewports, so it must not appear at the width the bundle is drawn at.
    expect(card).toMatch(/touch-44[^"]*md:hidden/)
  })
})
