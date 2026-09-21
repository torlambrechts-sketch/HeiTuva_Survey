import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/*
  B2 — THE FOURTH TAB, AND A PANEL THE THIRD HANDOFF REDREW.

  V2:6472 lists four tabs: Generelt · Legg til · Innstillinger · Vis. The app
  carried three and stacked RunModePanel, QuizPanel, PolicyPanel and
  EngagementPanel under `settings` — so «Innstillinger» meant four panels where
  the bundle means two, and «Generelt», the tab where a survey's MODE is
  decided, did not exist. «Byggemodus» sat above the tab rail, reachable from
  every tab, rather than inside the card V2:580-587 draws it in.

  ── THE ADD PANEL IS THE INTERESTING HALF ──────────────────────────────────

  Before B2 the panel was `flex-col`, a 26px radius-8 tint, a 13.5px/600 label
  and a VISIBLE 11.5px description. That is not drift: it is **L:513-525,
  property for property**. The legacy bundle drew exactly that, and the app
  implemented it faithfully.

  v2 redrew the panel — two columns, a 20px radius-6 tint, a 12.5px/600 label
  at line-height 1.25, `10px 11px` padding, radius 10, and the description
  moved from a visible line to `title`. So the description's disappearance is
  ONE PROPERTY OF A REDRAW, not the removal of something we invented, and Q52
  hands a v2 phase the whole redraw rather than the convenient parts of it.
  The description is still shipped and still translated; it is an accessible
  description now instead of a line.
*/
const BUILDER = 'app/(app)/undersokelser/[id]/bygg/Builder.tsx'
const PANEL = 'app/(app)/undersokelser/[id]/bygg/RunModePanel.tsx'
const NO = 'messages/no.json'
const EN = 'messages/en.json'

const decomment = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/^\s*\/\/.*$/gm, '')

const builder = decomment(readFileSync(BUILDER, 'utf8'))
const panel = decomment(readFileSync(PANEL, 'utf8'))
const buildTabs = decomment(readFileSync('lib/surveys/build-tabs.ts', 'utf8'))
const no = JSON.parse(readFileSync(NO, 'utf8')) as Record<string, Record<string, string>>
const en = JSON.parse(readFileSync(EN, 'utf8')) as Record<string, Record<string, string>>

describe('T5 — the right pane has v8’s SIX tabs in contextual groups', () => {
  it('lists them in the bundle’s order', () => {
    /* T5 — this pinned V2:6472's flat four until v8 was read. The six live in
       `lib/surveys/build-tabs.ts` now, as GROUPS of at most two (v8:10678), so
       the builder imports a registry instead of declaring a list. */
    expect(buildTabs).toContain(
      "export const BUILD_TABS = ['add', 'content', 'general', 'settings', 'lint', 'preview'] as const",
    )
    expect(builder).toContain('const TAB_KEY = BUILD_TAB_KEY')
  })

  it('names each one, in both languages', () => {
    for (const k of ['tabGeneral', 'tabAdd', 'tabContent', 'tabSettings', 'tabLint', 'tabPreview']) {
      expect(buildTabs).toContain(k)
      expect(no.builder![k], `no.builder.${k}`).toBeTruthy()
      expect(en.builder![k], `en.builder.${k}`).toBeTruthy()
    }
    // v8:10680-10683's labels, verbatim — not the old «Generelt · Legg til».
    expect(no.builder!.tabAdd).toBe('Spørsmål')
    expect(no.builder!.tabContent).toBe('Innhold')
    expect(no.builder!.tabGeneral).toBe('Kjøremodus')
    expect(no.builder!.tabSettings).toBe('Personvern og frekvens')
    expect(no.builder!.tabPreview).toBe('Slik ser den ut')
  })

  it('puts mode on `general` and policy/engagement on `settings`', () => {
    expect(builder).toContain("{tab === 'general' ? (\n        <RunModePanel")
    expect(builder).toContain("{tab === 'general' && runMode === 'quiz' ? (")
    expect(builder).toContain("{tab === 'settings' ? (\n        <PolicyPanel")
    // T5 — and the two that got their OWN tab rather than being stacked.
    expect(builder).toContain("{tab === 'lint' ? (\n        <MethodPanel")
    expect(builder).toContain("{tab === 'content' ? (")
  })

  it('wraps below md, because four flex-1 tabs cannot shrink to 320px', () => {
    /* CI run 110: every `bygg` state at scrollWidth 329 against 320px, 390px
       clean. `flex-1` leaves `min-width: auto`, so each tab's floor is its label
       plus 24px of padding — three fitted, four do not. RESPONSIVE.md § Tab
       rails says wrap, keep the chips' dimensions, hide nothing, left-align, and
       give the rows a gap that clears 44px hit areas on adjacent chips. */
    // THE PROPERTY IS «every rail that renders this tab set», NOT «the rail I
    // found». There are two — `rightPane`'s role=tablist, which lives inside
    // the sheet, and the `xl:hidden` row pinned under the header, which is the
    // one on screen at 320px. Run 110 was diagnosed as the first and fixed
    // there; run 112 returned byte-identical because that rail was not visible.
    // Counting them is what this asserts, so a third rail fails here.
    const rails = builder.match(/\{buildTabGroup\(tab\)\.map\(\(k\) => \(/g) ?? []
    expect(rails.length).toBe(2)
    for (const m of builder.matchAll(/className="([^"]*)"\s*\n?\s*(?:style|role)?[^>]*>\s*\{buildTabGroup/g)) {
      expect(m[1], `a TABS rail that cannot wrap: ${m[1]}`).toContain('flex-wrap')
    }
    expect(builder).toContain('flex flex-wrap gap-x-[3px] gap-y-1.5')
    expect(builder).toContain('mb-3 flex flex-wrap gap-2 xl:hidden')
    expect(builder).toContain('md:flex-nowrap')
    // Nothing hidden and no new control: still one button per tab.
    expect(builder).not.toMatch(/overflow-x-auto|snap-x/)
  })

  it('no longer floats the build-mode switch above the rail', () => {
    // It lives inside RunModePanel now, which is where V2:580-587 draws it.
    expect(builder).not.toContain("aria-label={t('mode')}")
    expect(panel).toContain('aria-label={s.buildMode}')
    expect(panel).toContain('onAdvancedChange(m)')
  })

  it('swaps the build-mode description with the mode, as the bundle does', () => {
    // V2:6111-6113 — the sentence describes the CURRENT setting, so a reader is
    // never told what the other mode gives them.
    expect(panel).toContain('advanced ? s.buildModeDescAdvanced : s.buildModeDescSimple')
    expect(no.builder!.buildModeDescSimple).not.toBe(no.builder!.buildModeDescAdvanced)
    for (const k of ['buildMode', 'buildModeDescSimple', 'buildModeDescAdvanced']) {
      expect(no.builder![k], `no.builder.${k}`).toBeTruthy()
      expect(en.builder![k], `en.builder.${k}`).toBeTruthy()
    }
  })
})

describe('the add panel, as v2 redraws it', () => {
  it('is a two-column grid', () => {
    expect(builder).toContain('grid grid-cols-2 gap-[7px]')
    expect(builder).not.toContain('mt-[9px] flex flex-col gap-[7px]')
  })

  it('carries v2’s tint, label and padding rather than the legacy bundle’s', () => {
    expect(builder).toContain('h-5 w-5 flex-none rounded-md')
    expect(builder).toContain('text-[12.5px] font-semibold leading-[1.25]')
    expect(builder).toContain('gap-[9px] rounded-[10px] border border-line bg-bg px-[11px] py-[10px]')
  })

  it('keeps the per-type description shipped and translated, as `title`', () => {
    // v2 moved it off the face of the button; it is not dropped, and dropping
    // it would lose a string every type carries in two languages.
    //
    // T8 — it is NESTED now rather than the whole title: v8:989 makes the
    // palette dual-mode and its title reads «{desc} · klikk eller dra inn i
    // flyten». The property is «the description reaches `title`», so this
    // asserts that and not the expression's spelling — pinning the spelling is
    // what made this fail on a change that kept the description.
    expect(builder).toMatch(/title=\{t\('paletteDragHintQ',[\s\S]{0,120}ADD_DESC_KEY\[type\]/)
    expect(no.builder!.paletteDragHintQ).toContain('{desc}')
    for (const k of ['addDescScale', 'addDescChoice', 'addDescMatrix', 'addDescField']) {
      expect(no.builder![k], `no.builder.${k}`).toBeTruthy()
      expect(en.builder![k], `en.builder.${k}`).toBeTruthy()
    }
  })

  it('keeps every add button a 44px target at two columns', () => {
    // Two columns halves the width, not the hit area: RESPONSIVE.md global
    // rule 2 is unconditional and the padding alone paints under 44px.
    const buttons = builder.match(/className="touch-44 flex min-w-0 cursor-pointer items-center/g)
    expect(buttons).not.toBeNull()
  })

  /* ── T7 · v8:578-600 — THE META CARD COLLAPSES ─────────────────────────
     v8's own `metaOpen` defaults to true and swaps the card between an
     editing state and a one-line summary. The interesting half is not that
     it collapses; it is WHAT it collapses, which had to be derived rather
     than copied — see the boundary test below. */

  it('T7 — the meta card has both of v8\u2019s toggles, each moving one way', () => {
    // v8:581 «Skjul ▴» closes, v8:597 «Rediger ▾» opens. A single control
    // spelled `setMetaOpen(!metaOpen)` would pass a looser test and lose the
    // drawing's two distinct buttons.
    expect(builder).toMatch(/onClick=\{\(\) => setMetaOpen\(false\)\}/)
    expect(builder).toMatch(/onClick=\{\(\) => setMetaOpen\(true\)\}/)
    expect(builder).toContain("t('metaHide')")
    expect(builder).toContain("t('metaEdit')")
    for (const k of ['metaHide', 'metaEdit']) {
      expect(no.builder![k], `no.builder.${k}`).toBeTruthy()
      expect(en.builder![k], `en.builder.${k}`).toBeTruthy()
    }
  })

  it('T7 — the collapse takes the inputs and the length line, NOT the chips', () => {
    // THE BOUNDARY, and it is a decision rather than a transcription. v8's
    // collapsible region is the «Målgruppe» label, the audience field and the
    // length line; its title input, its flow chips and its density switch
    // live in a HEADER CARD we do not have, so ours hold those in the same
    // card. Collapsing them would hide something v8's collapse does not hide.
    const start = builder.indexOf('{metaOpen ? (')
    expect(start).toBeGreaterThan(0)
    // The fragment's own closer, which is the only one in the file — asserted,
    // so a second fragment elsewhere widens this slice loudly rather than
    // silently. A slice that runs to the end of the file would contain
    // everything and this test would pass by being vacuous.
    expect(builder.match(/<\/>/g)).toHaveLength(1)
    const open = builder.slice(start, builder.indexOf('</>', start))
    expect(open.length).toBeGreaterThan(200)
    expect(open).toContain("t('audiencePlaceholder')")
    expect(open).toContain('{lengthNote}')
    expect(open).not.toContain('flowChipQuestions')
    expect(open).not.toContain("t('viewLabel')")
  })

  it('T7 — the length line is ONE expression, read in both states', () => {
    // The closed summary restates it (v8:595). Two call sites forming the
    // same sentence is how a figure and its restatement drift apart — F3's
    // four-implementations shape, at the size of one line.
    expect(builder).toMatch(/const lengthNote = t\('lengthNote'/)
    expect(builder.match(/t\('lengthNote'/g)).toHaveLength(1)
    expect(builder.match(/\{lengthNote\}/g)).toHaveLength(2)
  })

  it('T7 — the card carries v8\u2019s two paddings and no third', () => {
    // v8:10911 — 20px open, 14px 18px closed. `p-5` IS 20px, so the open
    // state keeps the metric this card already shipped.
    expect(builder).toMatch(/padding: metaOpen \? '20px' : '14px 18px'/)
  })
})
