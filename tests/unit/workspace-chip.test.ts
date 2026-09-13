import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import no from '../../messages/no.json'
import en from '../../messages/en.json'
import { TYPE_TITLE_KEY, WORKLIST_TYPES } from '../../lib/worklist/rows'

/**
 * W1 — the three things this phase owes, written as tests over the shipped
 * strings and the source, so a later phase that undoes one fails here.
 */

describe('W1 · Q119 — the tooltip promises two clauses, not three', () => {
  /**
   * The bundle writes «Arbeidsflate — velger hvilke moduler Oversikt viser,
   * sorterer maler og setter standardvalg for nye undersøkelser».
   *
   * The third clause is not built. Q17 makes a statutory pack's policy a LOCK
   * and a workspace a PREFERENCE, and a preference cannot override a lock — so
   * the clause was never true, and the fix is to drop it rather than to
   * sequence two writers of the same columns.
   */
  it.each([
    ['no', no.nav.workspaceTitle],
    ['en', en.nav.workspaceTitle],
  ])('%s: says nothing about defaults for new surveys', (_lang, title) => {
    expect(title.length).toBeGreaterThan(0)
    expect(title).not.toMatch(/standardvalg|standard valg|default/i)
    expect(title).not.toMatch(/nye undersøkelser|new surveys/i)
  })

  it('no: names the two things it DOES do', () => {
    expect(no.nav.workspaceTitle).toMatch(/moduler/i)
    expect(no.nav.workspaceTitle).toMatch(/maler/i)
  })

  it('NOTHING in the shipped copy promises the third clause', () => {
    const all = JSON.stringify({ no, en })
    expect(all.length).toBeGreaterThan(1000)
    const offenders = Object.entries(no.nav).filter(([, v]) =>
      typeof v === 'string' ? /standardvalg for nye/i.test(v) : false,
    )
    expect(offenders).toEqual([])
  })
})

describe('Q171 — the nav label is «Handlinger», and still true of both halves', () => {
  /**
   * v4:5095 shortened it to «Oppgaver». NOT adopted (Q123): the surface is tasks
   * AND feedback in one list, so «Oppgaver» is untrue of half its content, and
   * shortening it solved a space problem by promising less than the page does.
   *
   * Tor renamed it «Handlinger» on 2026-09-13, which is SHORT AND STILL TRUE —
   * it covers a statutory task and a comment from an employee equally, which is
   * precisely what «Oppgaver» could not. So Q123's REASONING stands and is what
   * this test now checks; only the string it happened to be attached to moved.
   *
   * The assertion is therefore the property: the label must not be the name of
   * one half of the list. «Oppgaver» and «Tilbakemeldinger» are both heading
   * values now (TYPE_TITLE_KEY) and neither may become the label of the whole.
   */
  it('no: the label is «Handlinger»', () => {
    expect(no.nav.tasks).toBe('Handlinger')
  })

  it('and is not the name of either half', () => {
    expect(no.nav.tasks).not.toBe(no.tasks.wlTitleTasks)
    expect(no.nav.tasks).not.toBe(no.tasks.wlTitleFeedback)
  })

  it('the nav item, the page title, the breadcrumb and the footer link agree', () => {
    // Four places name this surface. They drifted apart once already — C4 shipped
    // copy v4 then reverted — so the agreement is asserted rather than assumed.
    expect(no.nav.tasks).toBe(no.tasks.title)
    expect(no.nav.tasks).toBe(no.tasks.wlCrumbHere)
    expect(no.nav.tasks).toBe(no.footer.linkTasks)
  })

  it('the heading follows the type filter, in both languages', () => {
    // «Handlinger» under «Alt», «Tilbakemeldinger» under «Tilbakemeldinger».
    expect(no.tasks.wlTitleAll).toBe('Handlinger')
    expect(no.tasks.wlTitleFeedback).toBe(no.tasks.tfFeedback)
    expect(no.tasks.wlTitleTasks).toBe(no.tasks.tfTasks)
    expect(en.tasks.wlTitleAll).toBe('Actions')
    expect(en.tasks.wlTitleFeedback).toBe(en.tasks.tfFeedback)
    expect(en.tasks.wlTitleTasks).toBe(en.tasks.tfTasks)
  })

  it('every WorklistType has a heading, so a fourth cannot arrive without one', () => {
    for (const type of WORKLIST_TYPES) {
      const key = TYPE_TITLE_KEY[type]
      expect(key, type).toBeTruthy()
      expect((no.tasks as Record<string, string>)[key], `no.tasks.${key}`).toBeTruthy()
      expect((en.tasks as Record<string, string>)[key], `en.tasks.${key}`).toBeTruthy()
    }
  })
})

describe('W1 · the chip takes the utility named for its case', () => {
  /**
   * C4's FeedbackList select measured 189×36 because it was given `touch-44`,
   * whose hit area is an `::after` — and a <select> is a REPLACED element, on
   * which ::after renders nothing at all. The utility for this exact case sits
   * immediately below it in globals.css.
   *
   * A spelling you must recall at the moment of writing is what that form of
   * rule cannot protect; this is the measurement that does not depend on
   * recall.
   */
  const src = readFileSync('components/WorkspaceChip.tsx', 'utf8')

  /**
   * ASSERTED OVER EVERY className IN THE FILE rather than over a slice around
   * the <select>. The first draft did `src.slice(indexOf('<select'), …)` and
   * caught the JSDoc above the element, which mentions both `<select>` and
   * `touch-44` in prose — so it measured a comment. That is the same defect
   * W0's write test had one commit earlier: a slice keyed on a string that
   * occurs more than once.
   *
   * The property does not need to find the element: NO class list in this
   * component may use the bare utility, whichever element grows one next.
   */
  it('no className here uses bare touch-44 — the replaced-element case takes -field', () => {
    const classLists = [...src.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)].map(
      (m) => m[1] ?? m[2] ?? '',
    )
    // NON-VACUITY: a regex that matched nothing would pass this trivially.
    expect(classLists.length, 'the component has class lists').toBeGreaterThan(2)
    // TOKENS, NOT WORD BOUNDARIES. The first attempt used /\btouch-44\b/ and
    // matched INSIDE `touch-44-field`, because `-` is a non-word character and
    // `\b` sits happily between `44` and `-`. That is the third outing for the
    // `\b` family in this repository — D113 and D116 are the Norwegian ones —
    // and the lesson generalises past alphabets: a CSS class is a TOKEN in a
    // space-separated list, so the test should compare tokens.
    const tokens = classLists.flatMap((c) => c.split(/\s+/).filter(Boolean))
    expect(tokens, 'the chip has a hit area').toContain('touch-44-field')
    expect(
      tokens.filter((tk) => tk === 'touch-44'),
      'a <select> is a replaced element and renders no ::after',
    ).toEqual([])
  })

  it('both utilities exist, so the choice was between them', () => {
    const css = readFileSync('app/globals.css', 'utf8')
    expect(css).toMatch(/\.touch-44\b/)
    expect(css).toMatch(/\.touch-44-field\b/)
  })
})

describe('W1 · nowrap is an xl rule, because v4 overflows at 320 without us', () => {
  /**
   * MEASURED on v4's own header before anything was built on it: at 320px with
   * the SHORT label the bundle already overflows — 63px of header overflow,
   * 26px of page overflow. So `nowrap` is a property of the ≥1280px design,
   * which is the only width v4 governs, and below it RESPONSIVE.md decides.
   */
  const src = readFileSync('components/AppHeader.tsx', 'utf8')

  it('the header wraps by default and only refuses to wrap at xl', () => {
    /* Anchored on `<header className=` and not on `<header`, because V5-1
       proved the looser anchor matches PROSE: a comment in that file mentioning
       the header element by name was found first, and the slice came back seven
       characters long. A source-grepping test has to name the thing it means. */
    const at = src.indexOf('<header className=')
    expect(at, 'the header element must be findable').toBeGreaterThan(-1)
    const header = src.slice(at, src.indexOf('>', at))
    expect(header.length).toBeGreaterThan(50)
    expect(header).toMatch(/\bflex-wrap\b/)
    expect(header).toMatch(/\bxl:flex-nowrap\b/)
  })
})

describe('W1 · the header carries only what v4 draws in it', () => {
  /**
   * v4 clears the header row of three controls: the width toggle and the
   * language picker move into the user menu (V4:196), and «Ny undersøkelse» is
   * drawn on the PAGES instead — V4:268 (Oversikt) and V4:1082 (Undersøkelser).
   *
   * THE PAIR OF ASSERTIONS IS THE POINT. Removing a control from the header is
   * fidelity only if the places the bundle DOES draw it exist; otherwise it is
   * a feature deleted. So the absence and the presence are asserted together,
   * and the second is this test's non-vacuity guard.
   */
  const header = readFileSync('components/AppHeader.tsx', 'utf8')

  it('no «Ny undersøkelse» CTA and no width toggle in the header row', () => {
    const jsx = header.slice(header.indexOf('return ('))
    expect(jsx.length).toBeGreaterThan(200)
    // The MobileNav slide-over keeps its own copy — that surface is
    // docs/RESPONSIVE.md's and no bundle draws it — so the assertion is about
    // the header's own children, which is what `<Link href="/undersokelser/ny"`
    // would be.
    expect(jsx).not.toMatch(/<Link\s+href="\/undersokelser\/ny"/)

    // NOT `not.toMatch(/<WideToggle/)`, which the first draft wrote and which
    // contradicted the third test in this block: the toggle IS in this file,
    // as `wideSlot={<WideToggle …>}`. The property is that every usage is
    // inside a slot prop — i.e. it is handed to the user menu rather than
    // rendered in the header row — so it is stated that way instead of as an
    // absence the component cannot honour.
    const uses = [...jsx.matchAll(/<WideToggle/g)]
    expect(uses.length, 'the toggle is still rendered somewhere').toBe(1)
    expect(jsx).toMatch(/wideSlot=\{<WideToggle/)
  })

  it('and both places the bundle DOES draw it are built', () => {
    const oversikt = readFileSync('app/(app)/oversikt/OverviewScreen.tsx', 'utf8')
    const surveys = readFileSync('app/(app)/undersokelser/page.tsx', 'utf8')
    expect(oversikt).toMatch(/undersokelser\/ny/)
    expect(surveys).toMatch(/undersokelser\/ny/)
  })

  it('the width toggle moved rather than vanished — the user menu has it', () => {
    expect(header).toMatch(/wideSlot=\{<WideToggle/)
    expect(header).toMatch(/langSlot=\{<LangPicker/)
  })
})

describe('W3 · the strip survives a longer preset title at 320px', () => {
  /**
   * `verify:responsive` found this and the arithmetic explains it:
   *
   *   arbeidsflate-kunder @320px — scrollWidth 338 > clientWidth 320
   *
   * «Dashboard følger oppsettet «Kundeopplevelse»» is three characters longer
   * than «…«Arbeidsmiljø»», and three characters at 11.5px semibold is ~18px —
   * the overflow exactly. The chip carried the bundle's `flex-none` and
   * `whitespace-nowrap`, which are right at ≥1280px and make it unable to
   * either shrink or wrap below that, so its width was decided by a REGISTRY
   * VALUE that differs per workspace.
   *
   * The gate is the real check; this asserts the fix is not silently undone,
   * because the failure only appears in one workspace at one width and a
   * future edit restoring `whitespace-nowrap` unconditionally would look
   * harmless in every other capture.
   */
  const src = readFileSync('components/WorkspaceStrip.tsx', 'utf8')

  it('the layout note does not refuse to shrink or wrap below xl', () => {
    const chip = src.slice(src.indexOf('{layoutNote}') - 400, src.indexOf('{layoutNote}'))
    expect(chip.length).toBeGreaterThan(100)
    const tokens = (chip.match(/className="([^"]*)"/)?.[1] ?? '').split(/\s+/)
    expect(tokens.length, 'the chip has a class list').toBeGreaterThan(3)
    expect(tokens, 'unconditional flex-none re-creates the 320px blocker').not.toContain('flex-none')
    expect(tokens, 'unconditional nowrap re-creates the 320px blocker').not.toContain(
      'whitespace-nowrap',
    )
    // The bundle's rules are KEPT where the bundle governs.
    expect(tokens).toContain('xl:flex-none')
    expect(tokens).toContain('xl:whitespace-nowrap')
  })
})
