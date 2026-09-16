import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  TUVA_ANSWERS,
  TUVA_SUPPRESSED,
  TUVA_TABS,
  TUVA_TABS_ARE_REGISTERED,
  TUVA_TOP_LEVEL_HREFS,
  surveyIdIn,
  tuvaHref,
  tuvaKeyFor,
} from '../../lib/tuva/answers'
import { SURVEY_TABS } from '../../lib/surveys/tabs'
import no from '../../messages/no.json'
import en from '../../messages/en.json'

/**
 * G4 — Tuva answers only where there is somewhere to go.
 *
 * Tor: «a helper promising a screen we refused is worse than a helper with one
 * fewer answer.» The central test DERIVES the app's routes from the file system
 * and requires every href to be one of them — a list written here would be an
 * enumeration that goes stale exactly when a screen is removed, which is the
 * case it protects against.
 *
 * **The survey-scoped half needs no route assertion at all**, and that is the
 * reuse rather than a second test: those answers carry a `SurveyTab`, and
 * `tests/unit/survey-tabs.test.ts` already derives `SURVEY_TABS` from
 * `app/(app)/undersokelser/[id]`. A tab that is not a real segment fails THERE,
 * and a tab outside the registry is a compile error here.
 */

/** Every route under app/(app), derived. */
function routes(dir: string, prefix = ''): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (!statSync(full).isDirectory()) {
      if (entry === 'page.tsx' && prefix) out.push(prefix)
      continue
    }
    // Route groups `(x)` do not appear in the URL; `[id]` is a parameter.
    const seg = entry.startsWith('(') ? '' : entry.startsWith('[') ? '/:id' : `/${entry}`
    out.push(...routes(full, prefix + seg))
  }
  return out
}
const APP_ROUTES = new Set(routes('app/(app)'))

/** An href reduced to its route: query dropped, uuid replaced by the parameter. */
function toRoute(href: string): string {
  const path = href.split('?')[0]!
  return path.replace(/\/[0-9a-f-]{36}(?=\/|$)/i, '/:id')
}

const NO = no as unknown as Record<string, Record<string, string>>
const EN = en as unknown as Record<string, Record<string, string>>

describe('G4 — every Tuva answer lands somewhere that exists', () => {
  it('1. the app has routes at all — so the assertions below are not vacuous', () => {
    expect(APP_ROUTES.size).toBeGreaterThan(10)
    expect(APP_ROUTES).toContain('/bibliotek')
    expect(TUVA_TOP_LEVEL_HREFS.length).toBeGreaterThan(0)
    expect(TUVA_TABS.length).toBeGreaterThan(0)
  })

  it('2. EVERY top-level href resolves to a real route, derived from the file system', () => {
    const bad = TUVA_TOP_LEVEL_HREFS.filter((h) => !APP_ROUTES.has(toRoute(h)))
    expect(bad, 'an answer pointing at a screen nobody built').toEqual([])
  })

  it('3. every survey-scoped answer names a tab the registry holds', () => {
    /* The structural half: `SURVEY_TABS` is checked against the filesystem by
       survey-tabs.test.ts, so this only has to establish that Tuva draws from
       that set rather than from strings of its own. */
    expect(TUVA_TABS_ARE_REGISTERED).toBe(true)
    for (const tab of TUVA_TABS) expect(SURVEY_TABS).toContain(tab)
  })

  it('4. NOTHING points at the screens we refused', () => {
    const all = JSON.stringify(TUVA_ANSWERS)
    // Feltarbeid is DECIDED-NOT-BUILT; `over` (survey Oversikt) is NOT NOW.
    expect(all).not.toContain('feltarbeid')
    expect(TUVA_TABS).not.toContain('over' as never)
    // And no href may reach them by spelling either.
    for (const h of TUVA_TOP_LEVEL_HREFS) expect(h).not.toMatch(/feltarbeid/)
  })

  it('5. NO ANSWER PROMISES THE HALF WE DID NOT BUILD', () => {
    /* «Hvem får den, og hvem faller fra» is two screens sharing a name: the
       audience ships, the drop-off half is Feltarbeid under another name. The
       copy may keep the first clause only. */
    for (const m of [NO, EN]) {
      const audience = `${m.tuva?.sndAudienceLabel} ${m.tuva?.sndAudienceDesc}`
      expect(audience).not.toMatch(/faller fra|drops? out|frafall/i)
      const reminder = `${m.tuva?.sndReminderLabel} ${m.tuva?.sndReminderDesc}`
      expect(reminder).not.toMatch(/hvem mangler|who is missing/i)
    }
  })

  it('6. Q178 — no answer uses blocking language', () => {
    /* «Ingen blokkeringer — du kan sende» is false about this product: nothing
       in Metodikk stops a send, and the schema makes the claim
       unrepresentable. */
    for (const m of [NO, EN]) {
      const body = Object.values(m.tuva ?? {}).join(' ')
      expect(body).not.toMatch(/blokker/i)
      expect(body).not.toMatch(/må løses før du kan sende/i)
      expect(body).not.toMatch(/cannot send|blocks the send/i)
    }
  })

  it('7. every key has copy in both languages, and every answer a label and a line', () => {
    const missing: string[] = []
    for (const [key, answers] of Object.entries(TUVA_ANSWERS)) {
      for (const [lang, m] of [['no', NO], ['en', EN]] as const) {
        for (const suffix of ['Headline', 'Short']) {
          if (!m.tuva?.[`${key}${suffix}`]) missing.push(`${lang}.tuva.${key}${suffix}`)
        }
        for (const a of answers) {
          for (const suffix of ['Label', 'Desc']) {
            if (!m.tuva?.[`${a.stem}${suffix}`]) missing.push(`${lang}.tuva.${a.stem}${suffix}`)
          }
        }
      }
    }
    expect(missing, 'a key the panel builds by concatenation that does not resolve').toEqual([])
  })

  it('8. a path with no entry gets NOTHING rather than a generic answer', () => {
    /* V6-5's decision, standing: a helper that always has an opinion is one
       nobody believes. */
    expect(tuvaKeyFor('/oversikt')).toBeNull()
    expect(tuvaKeyFor('/dashboard')).toBeNull()
    expect(tuvaKeyFor('/rapporter')).toBeNull()
    expect(tuvaKeyFor('/hjelp')).toBeNull()
  })

  it('9. /undersokelser gets nothing, because svTuva stands there', () => {
    /* The drawing decides this twice: `tvShow` excludes "surveys" by name
       (v6:8965) and `tuvaFor`'s map has no `surveys` entry (v6:6831-6882).
       Building both would put two bubbles in one corner. */
    /* THE DECLARATION IS WHAT IS ASSERTED, and the comment in the resolver
       says why: deleting the suppression changes no behaviour today, because
       nothing below it matches `/undersokelser` either. Proven — removing the
       line left all twelve tests green, which is a guard that cannot fail. So
       the list is the guard, and a future prefix rule cannot quietly claim
       this route without failing here. */
    expect(TUVA_SUPPRESSED).toContain('/undersokelser')
    expect(tuvaKeyFor('/undersokelser')).toBeNull()
    expect(tuvaKeyFor('/undersokelser?visning=kort')).toBeNull()
    const id = '11111111-2222-4333-8444-555555555555'
    expect(tuvaKeyFor(`/undersokelser/${id}/resultater`)).toBeNull()
    // The two sub-routes that DO answer are the exceptions, named.
    expect(tuvaKeyFor(`/undersokelser/${id}/bygg`)).toBe('bygg')
    expect(tuvaKeyFor(`/undersokelser/${id}/send`)).toBe('send')
  })

  it('10. the survey-scoped entries resolve only with a survey in scope', () => {
    const id = '11111111-2222-4333-8444-555555555555'
    const tabAnswer = TUVA_ANSWERS.send.find((a) => 'tab' in a)!
    expect(tuvaHref(tabAnswer, null)).toBeNull()
    expect(tuvaHref(tabAnswer, id)).toContain(`/undersokelser/${id}/`)
    expect(surveyIdIn(`/undersokelser/${id}/send`)).toBe(id)
    expect(surveyIdIn('/bibliotek')).toBeNull()
  })

  it('11. NO RATING AND NO ASK BOX — and the screen says so rather than going quiet', () => {
    /* Both collect something with nowhere to put it, and the rating is the
       sharper case: the drawing's own down-vote line says «Spørsmålet er logget
       slik at vi kan lære av det» (v6:9011), asserting a write that does not
       exist. The refusals are copy, so they are asserted as copy. */
    const panel = readFileSync('components/TuvaHelper.tsx', 'utf8')
    const code = panel.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
    expect(code).not.toContain('onTvRate')
    expect(code).not.toMatch(/<input/)
    for (const m of [NO, EN]) {
      expect(m.tuva?.noRating?.length ?? 0).toBeGreaterThan(40)
      expect(m.tuva?.noAsk?.length ?? 0).toBeGreaterThan(40)
    }
  })

  it('12. «Kom i gang» is not drawn twice — the panel links to the one that works', () => {
    /* G3 shipped this checklist on Oversikt, DERIVED. The bundle's second copy
       (v6:8976) uses different predicates, so the two could disagree on the
       same day — and its own label marks steps one and two done by the same
       condition, which is four steps over three predicates. */
    const panel = readFileSync('components/TuvaHelper.tsx', 'utf8')
    expect(panel).toContain("href=\"/oversikt\"")
    for (const m of [NO, EN]) expect(m.tuva?.trackElsewhere).toBeTruthy()
  })
})
