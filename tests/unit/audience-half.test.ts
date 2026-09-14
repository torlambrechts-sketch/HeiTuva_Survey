import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import no from '../../messages/no.json'
import en from '../../messages/en.json'
import { SURVEY_TABS } from '../../lib/surveys/tabs'

/**
 * V6-4b — Målgruppe ships as HALF a tab, and the other half is refused.
 *
 * «Hvem får den» is a property of the survey. «Hvem faller fra» is Feltarbeid
 * under another name: a surface organised around who did not answer is a list
 * of names and an omission, whatever it is called.
 *
 * The tempting next commit is one that adds a «2 av 6 har svart» column and
 * looks like an improvement, so the refusal is asserted over the SOURCE rather
 * than left to the doc comment above it.
 */
const page = readFileSync('app/(app)/undersokelser/[id]/malgruppe/page.tsx', 'utf8')
/** Comments stripped — the page's own header names `responded_at` in order to
 *  refuse it, which is the refusal-in-a-comment shape. */
const code = page.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

describe('V6-4b — the audience half ships, the drop-off half does not', () => {
  it('the page NEVER reads a response state', () => {
    for (const forbidden of ['responded_at', 'respondedAt', 'bounced_at', 'reminded_at']) {
      expect(code, `the page reads ${forbidden}`).not.toContain(forbidden)
    }
    // Nor the identity columns a per-person list would need.
    for (const column of ['email', 'phone', 'member_id', 'name,']) {
      expect(code, `the page selects ${column} from invitations`).not.toMatch(
        new RegExp(`select\\([^)]*${column}`),
      )
    }
  })

  it('it selects group_id and nothing else from the invitations', () => {
    // Selecting more «just in case» is how the refused half arrives later as a
    // one-line change.
    expect(code).toMatch(/from\('survey_invitations'\)\s*\.select\('group_id'\)/)
  })

  it('it counts, and never renders a per-person row', () => {
    // The unit of this screen is a GROUP. A map keyed by group id is the shape
    // that cannot accidentally become a list of people.
    expect(code).toMatch(/byGroup/)
    expect(code).not.toMatch(/invitations\s*\)?\.map\(/)
  })

  it('test invitations are excluded, so the count is what reached people', () => {
    expect(code).toMatch(/\.eq\('is_test', false\)/)
  })

  it('THE REFUSAL IS ON SCREEN, not silent — it must read as a decision', () => {
    /*
      A missing half that says nothing reads as a tab somebody did not finish,
      and the next person «completes» it. The copy names what is not shown and
      points at the thing that meets the need instead.
    */
    expect(code).toMatch(/dropoffRefused/)
    for (const [lang, set] of [['no', no], ['en', en]] as const) {
      const a = (set as { surveyAudience: Record<string, string> }).surveyAudience
      expect(a.dropoffRefused, lang).toBeTruthy()
      // It says what we do NOT show, and offers the reminder instead.
      expect(a.dropoffRefused, lang).toMatch(/ikke har svart|has not answered/)
      expect(a.toReminders, lang).toBeTruthy()
    }
  })

  it('the tab is in the registry now that its route exists', () => {
    // The registry's own rule: a tab is listed only when its route exists.
    expect(SURVEY_TABS).toContain('malgruppe')
    // And the two that were refused outright still are not.
    expect(SURVEY_TABS).not.toContain('over')
    expect(SURVEY_TABS).not.toContain('feltarbeid')
  })
})
