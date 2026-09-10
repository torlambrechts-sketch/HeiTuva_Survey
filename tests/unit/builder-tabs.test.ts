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
const no = JSON.parse(readFileSync(NO, 'utf8')) as Record<string, Record<string, string>>
const en = JSON.parse(readFileSync(EN, 'utf8')) as Record<string, Record<string, string>>

describe('the right pane has the bundle’s four tabs', () => {
  it('lists them in the bundle’s order', () => {
    expect(builder).toContain("const TABS = ['general', 'add', 'settings', 'preview'] as const")
  })

  it('names each one, in both languages', () => {
    for (const k of ['tabGeneral', 'tabAdd', 'tabSettings', 'tabPreview']) {
      expect(builder).toContain(k)
      expect(no.builder![k], `no.builder.${k}`).toBeTruthy()
      expect(en.builder![k], `en.builder.${k}`).toBeTruthy()
    }
    expect(no.builder!.tabGeneral).toBe('Generelt')
  })

  it('puts mode on `general` and policy/engagement on `settings`', () => {
    expect(builder).toContain("{tab === 'general' ? (\n        <RunModePanel")
    expect(builder).toContain("{tab === 'general' && runMode === 'quiz' ? (")
    expect(builder).toContain("{tab === 'settings' ? (\n        <PolicyPanel")
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
    expect(builder).toContain('title={t(ADD_DESC_KEY[type] ?? TYPE_OPTION_KEY[type])}')
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
})
