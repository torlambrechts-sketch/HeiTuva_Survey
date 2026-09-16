import { readFileSync, existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  ONBOARD_KEYS,
  ONBOARD_STEPS,
  onboardCount,
  onboardDone,
  type OnboardFacts,
} from '../../lib/oversikt/onboarding'

const no = JSON.parse(readFileSync('messages/no.json', 'utf8')) as Record<string, Record<string, string>>
const en = JSON.parse(readFileSync('messages/en.json', 'utf8')) as Record<string, Record<string, string>>
const screen = readFileSync('app/(app)/oversikt/OverviewScreen.tsx', 'utf8')
const page = readFileSync('app/(app)/oversikt/page.tsx', 'utf8')

/**
 * CLAUDE.md, «A REFUSAL NAMED IN A COMMENT IS FOUND BY A GREP OVER THAT
 * COMMENT»: this file's own reasoning for not drawing the × spells out
 * `onboardHidden`, so test 11 went red on correct code the first time it ran.
 * The migration gate already strips `--` comments for exactly this; the same
 * move, for TypeScript and JSX. Line comments are matched only where the line
 * starts with one, so a `https://` inside a string survives.
 */
const codeOnly = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
const screenCode = codeOnly(screen)

const NOTHING: OnboardFacts = {
  surveys: 0,
  fromPack: 0,
  groups: 0,
  invitations: 0,
  testInvitations: 0,
}

/**
 * G3 — «Kom i gang» is DERIVED, and the tests are about that rather than about
 * the card's chrome. The bundle stores four ticks in a fixture object its own
 * buttons write (v6:6535, v6:9257): clicking «Gjør det» marks the step done
 * whether or not the thing was done. Every assertion below is a statement that
 * the tick cannot come apart from the thing.
 */
describe('G3 — the checklist is derived, never stored', () => {
  it('1. an organisation with nothing has nothing ticked', () => {
    const done = onboardDone(NOTHING)
    expect(ONBOARD_KEYS.every((k) => done[k] === false)).toBe(true)
    expect(onboardCount(done)).toBe(0)
  })

  it('2. every step is reachable — each one ticks on its own fact alone', () => {
    /* Not four assertions about four booleans: the point is that no step is
       satisfied by a DIFFERENT step's fact, which is how a checklist silently
       becomes a progress bar over one number. */
    const only: Record<string, OnboardFacts> = {
      wizard: { ...NOTHING, surveys: 1 },
      mal: { ...NOTHING, fromPack: 1 },
      import: { ...NOTHING, groups: 1 },
      test: { ...NOTHING, testInvitations: 1 },
    }
    for (const key of ONBOARD_KEYS) {
      const facts = only[key]
      if (!facts) throw new Error(`no facts declared for ${key}`)
      const done = onboardDone(facts)
      expect(done[key], `${key} should tick on its own fact`).toBe(true)
      expect(onboardCount(done), `${key} should tick nothing else`).toBe(1)
    }
  })

  it('3. it unticks — a step is false again the moment its fact is', () => {
    const all: OnboardFacts = { surveys: 3, fromPack: 2, groups: 1, invitations: 9, testInvitations: 1 }
    expect(onboardCount(onboardDone(all))).toBe(4)
    expect(onboardDone({ ...all, fromPack: 0 }).mal).toBe(false)
    expect(onboardDone({ ...all, testInvitations: 0 }).test).toBe(false)
  })

  it('4. «legg inn folkene dine» counts BOTH roads in', () => {
    /* The bundle's subline names two («lim inn en liste, eller koble til Entra
       ID») and this product has a third: pasting addresses at send, which makes
       invitations and no group. A step that only counted groups would tell an
       organisation that has invited ninety people it has added nobody. */
    expect(onboardDone({ ...NOTHING, groups: 1 }).import).toBe(true)
    expect(onboardDone({ ...NOTHING, invitations: 90 }).import).toBe(true)
    expect(onboardDone({ ...NOTHING, testInvitations: 1 }).import).toBe(false)
  })

  it('5. a test invitation does not satisfy «legg inn folkene dine»', () => {
    /* `invitations` is deliberately the NON-test count in the page. Sending
       yourself a test is step four; it is not putting your people in. */
    expect(page).toContain('.filter((i) => !i.is_test).length')
    expect(page).toContain('.filter((i) => i.is_test).length')
  })
})

describe('G3 — the card says only what is true', () => {
  it('6. every step has a title and a subline, in both languages', () => {
    const missing: string[] = []
    for (const step of ONBOARD_STEPS) {
      for (const [lang, m] of [['no', no], ['en', en]] as const) {
        for (const key of step.copy) if (!m.dash?.[key]) missing.push(`${lang}.dash.${key}`)
      }
    }
    for (const key of ['onboardTitle', 'onboardProgress', 'onboardDoIt', 'onboardDone']) {
      for (const [lang, m] of [['no', no], ['en', en]] as const) {
        if (!m.dash?.[key]) missing.push(`${lang}.dash.${key}`)
      }
    }
    expect(missing).toEqual([])
  })

  it('7. the template count is interpolated, never the bundle\'s ten and four', () => {
    /* v6:9247 writes «Ti maler på norsk, fire av dem lovpålagte» — a count of
       ITS fixture library, false here twice over (22 shared packs, 6 statutory
       as measured 2026-09-16). CLAUDE.md row 11's shape. */
    for (const m of [no, en]) {
      expect(m.dash?.onbMalSub).toContain('{packs}')
      expect(m.dash?.onbMalSub).toContain('{legal}')
      expect(m.dash?.onbMalSub).not.toMatch(/\bTi\b|\bten\b/i)
    }
    expect(page).toContain("t('onbMalSub', { packs:")
  })

  it('8. the ten-minute claim does not ship', () => {
    /* v6:9244's progress line is «{n} av 4 gjort · tar under ti minutter». The
       second clause is a duration nobody has measured — the same rule that kept
       the prototype's «+289» and its «3 av 4» manager grade off this screen. */
    for (const m of [no, en]) {
      expect(m.dash?.onboardProgress).not.toMatch(/minutt|minute/i)
    }
  })

  it('9. every step href is a route that exists', () => {
    /* D198's guard, one screen wider: F4 shipped two `<Link>`s to a route that
       had never existed, and Next prefetches every link in the viewport, so one
       invented href 404s from every screen that renders it. */
    for (const step of ONBOARD_STEPS) {
      const dir = `app/(app)${step.href}`
      expect(existsSync(dir), `${step.href} -> ${dir}`).toBe(true)
    }
  })

  it('10. a done step renders a statement, not a button that does nothing', () => {
    const done = screen.slice(screen.indexOf('{step.done ? ('))
    const branch = done.slice(0, done.indexOf(') : ('))
    expect(branch).toContain('<span')
    expect(branch).not.toContain('<Link')
    expect(branch).not.toContain('<button')
  })

  it('11. there is no dismiss control, because there is nothing to store it in', () => {
    /* v6:454 draws an × that writes `onboardHidden`. Nothing here writes it and
       nothing reads it; the card dismisses itself by being completed. */
    expect(screenCode).not.toContain('onboardHidden')
    expect(screenCode).not.toContain('Skjul')
    expect(page).toContain('onboardCount(onboardState) < ONBOARD_STEPS.length')
  })

  it('12. a leser is not shown a checklist they cannot read or act on', () => {
    /* `survey_invitations` selects on `can_edit_survey`, so step four would read
       «not done» for a leser as a fact about the RLS policy rather than about
       the organisation — the shape CLAUDE.md calls «the thing measured was not
       the thing claimed». */
    expect(page).toContain("viewer.role !== 'leser' && onboardCount(onboardState)")
  })
})
