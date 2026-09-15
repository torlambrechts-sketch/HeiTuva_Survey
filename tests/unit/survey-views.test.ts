import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { STATUS_BAR, STATUS_DOT, initialsOf, listRow } from '../../lib/surveys/list-row'

/**
 * F4 — the three views, the mix bar and what none of them may print.
 *
 * The thread running through every test here is one sentence: **the bundle
 * offers an invented denominator of thirty in four separate places, and this
 * screen takes it in none of them.**
 *
 *   v6:9046  the row's own pct        → `listRow`
 *   v6:9058  the «Svar» table cell    → `SurveyTable`
 *   v6:9023  the mix bar's total      → `MixBar`
 *   v6:7710  the «Lav svarprosent» filter → `inScope` (tested next door)
 *
 * The first three are asserted here; the fourth in `survey-scopes.test.ts`.
 */
describe('F4 — one derivation, three views', () => {
  const base = {
    id: 'a',
    title: 'T',
    audience: null,
    status: 'aktiv',
    questionCount: 3,
    ownerName: null,
    ownerEmail: null,
    sentLabel: null,
  }

  it('a row with no denominator has pct NULL — never 0, which is a different claim', () => {
    /* A real zero («nobody answered yet, of the 40 invited») and an unknown
       («we do not know how many were invited») must not render alike. 0 as a
       stand-in makes the second look like the first. */
    const r = listRow({ ...base, responses: 6, target: null })
    expect(r.pct).toBeNull()
    expect(r.missing).toBeNull()

    const real = listRow({ ...base, responses: 0, target: 40 })
    expect(real.pct).toBe(0)
    expect(real.missing).toBe(40)
  })

  it('pct and missing come from ONE denominator, so they cannot disagree', () => {
    const r = listRow({ ...base, responses: 7, target: 10 })
    expect(r.pct).toBe(70)
    expect(r.missing).toBe(3)
  })

  it('a link survey answered by more people than were invited caps at 100', () => {
    /* `rowRate` caps, because a QR or link survey can be answered by more
       people than were invited and «140 %» is not a response rate. The count
       itself is NOT capped — the cell still shows what really came in. */
    const r = listRow({ ...base, responses: 14, target: 10 })
    expect(r.pct).toBe(100)
    expect(r.responses).toBe(14)
    expect(r.missing).toBe(0)
  })

  it('initials come from a real name and are NOTHING otherwise', () => {
    /* v6:9056 builds them from `s.owner || "Tuva Berg"` — a monogram for a
       person who does not exist. A survey with no owner gets no chip. */
    expect(initialsOf('Tuva Berg')).toBe('TB')
    expect(initialsOf('Åse')).toBe('Å')
    expect(initialsOf('a b c d')).toBe('AB')
    expect(initialsOf(null)).toBeNull()
    expect(initialsOf('   ')).toBeNull()
  })

  it('every status has a dot and a bar colour, so no view falls back to blank', () => {
    for (const s of ['aktiv', 'utkast', 'lukket']) {
      expect(STATUS_DOT[s], `dot for ${s}`).toBeTruthy()
      expect(STATUS_BAR[s], `bar for ${s}`).toBeTruthy()
    }
  })
})

describe('F4 — the invented denominator reaches no view', () => {
  /** Every file this screen renders through. Derived from the directory rather
   *  than listed, so a fourth view is covered the day it is added. */
  const files = [
    ...readdirSync('app/(app)/undersokelser')
      .filter((f) => f.endsWith('.tsx'))
      .map((f) => `app/(app)/undersokelser/${f}`),
    'lib/surveys/list-row.ts',
    'lib/surveys/scopes.ts',
  ]

  it('no file on this screen supplies a denominator for a survey that has none', () => {
    /* The property, not the spelling: `target || 30`, `target ?? 30` and any
       other constant standing in for a recipient count. Comments stripped,
       because these files explain the refusal by naming the thing refused —
       the fourth instance of that collision in this project, and the second
       inside F4. */
    for (const f of files) {
      const code = readFileSync(f, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')
      expect(code, `${f} invents a denominator`).not.toMatch(/target\s*(\|\||\?\?)\s*\d/)
    }
  })

  it('the three views read the shared derivation rather than dividing themselves', () => {
    for (const f of [
      'app/(app)/undersokelser/SurveyTable.tsx',
      'app/(app)/undersokelser/SurveyCards.tsx',
      'app/(app)/undersokelser/SurveyDetail.tsx',
      'app/(app)/undersokelser/MixBar.tsx',
    ]) {
      const code = readFileSync(f, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')
      expect(code, `${f} forms its own ratio`).not.toMatch(
        /responses?[A-Za-z]*\s*\/\s*[A-Za-z.]*target/i,
      )
    }
  })

  it('the mix bar’s bar, percentage and sentence are the SAME Measured', () => {
    /* One object feeds all three, so «66 %» and «78 av 118» cannot end up
       describing different populations — which is exactly what v6:9022-9029
       does, where the dots count every row and the rate divides by a total
       that includes thirty for each row without a target. */
    const src = readFileSync('app/(app)/undersokelser/MixBar.tsx', 'utf8')
    expect(src).toMatch(/measured\.pct/)
    expect(src).toMatch(/measured\.responses/)
    expect(src).toMatch(/measured\.target/)
  })
})

describe('F4 — the row menu survived the three views', () => {
  it('every action the old row offered is still mounted somewhere', () => {
    /* The drawing's table row has five icon buttons and no menu, so building
       to it would have deleted six actions that exist in no other place.
       Asserted over the SERVER ACTIONS the menu calls rather than over its
       labels, because a label can be renamed and an action cannot be
       mistaken. */
    const src = readFileSync('app/(app)/undersokelser/RowMenu.tsx', 'utf8')
    for (const action of [
      'closeSurvey',
      'copyAsNewRound',
      'deleteSurvey',
      'setSchedulePaused',
      'stopSchedule',
    ]) {
      expect(src, `RowMenu lost ${action}`).toContain(action)
    }
    // And it is mounted by the two views the drawing gives actions to.
    const page = readFileSync('app/(app)/undersokelser/page.tsx', 'utf8')
    expect(page).toContain('menus={rowMenus}')
    expect(page).toContain('menu={rowMenu(selected.id)}')
  })

  it('the page passes no function across the server/client boundary', () => {
    /* **THIS TEST PREVIOUSLY ASSERTED THE DEFECT'S OWN SPELLING.** It required
       `menuFor={(id) => rowMenu(id)}` to be present — and that line made the
       whole screen return HTTP 500, because a function cannot be serialised
       from a server component into a client one. `tsc`, ESLint and
       `next build` all passed it; the rule is enforced when the tree is
       serialised, and nothing before render does that.

       So the assertion is the PROPERTY instead: `page.tsx` is a server
       component, and a server component may pass no inline function as a JSX
       prop — server actions cross as imported identifiers marked `use server`,
       never as closures written at the call site.

       Comments are stripped first: the paragraph above quotes the forbidden
       spelling in order to explain it, which is the fifth time in this project
       that a file documenting its own refusal has failed a grep for it, and
       the third inside F4. */
    const code = readFileSync('app/(app)/undersokelser/page.tsx', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    const offenders = code.match(/\w+=\{\([^)]*\)\s*=>/g) ?? []
    expect(offenders, `page.tsx passes ${offenders.join(', ')} as a function prop`).toEqual([])
  })
})
