import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  TUVA_ANSWERS,
  TUVA_FALLBACK,
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
 * G4/G5 — Tuva answers everywhere, and every answer lands somewhere real.
 *
 * **G5 inverted the central guard.** G4 asserted a SUPPRESSION LIST — the
 * screens the helper stayed off. Tor overruled the exclusions (the helper is on
 * every page), so the list is gone and the assertion is its opposite: **every
 * route under `app/(app)` resolves to an answer key.** That is the stronger
 * property, and the reason is what it does when the product changes — a
 * suppression list is silent about a screen nobody thought of, and this fails
 * on it.
 *
 * It can only fail because `tuvaKeyFor` has NO fallback: the general answer is
 * applied at the render (`TuvaHelper`), not in the resolver. A resolver ending
 * `return 'generell'` would make test 8 unfailable, which is exactly the shape
 * G4 was caught committing one phase earlier.
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

  it('8. EVERY app route resolves to an answer key — the inverted guard', () => {
    /* Tor, 2026-09-16, overruling V6-5's four-screen exclusion and G4's
       `TUVA_SUPPRESSED`: «THE HELPER IS THE SAME AND PRESENT ON EVERY PAGE. No
       exclusions.» So the property is coverage, not silence.

       Derived from the file system rather than listed, for the same reason
       test 2 is: a list here would be an enumeration that goes stale exactly
       when a screen ARRIVES, which is the case this exists to catch. */
    const id = '11111111-2222-4333-8444-555555555555'
    const uncovered = [...APP_ROUTES]
      .map((r) => r.replace(/\/:id(?=\/|$)/, `/${id}`))
      .filter((r) => tuvaKeyFor(r) === null)
    expect(uncovered, 'a screen that arrived without an answer set').toEqual([])
    expect(APP_ROUTES.size).toBeGreaterThan(25)
  })

  it('9. the resolver can still FAIL — it has no blanket fallback', () => {
    /* The half that makes test 8 mean anything. If `tuvaKeyFor` ended with
       `return 'generell'`, every conceivable path would resolve and test 8
       could never go red. The general answer is applied at the RENDER instead
       (`TuvaHelper`: `tuvaKeyFor(path) ?? TUVA_FALLBACK`), so no screen is
       silent AND an uncovered one is still a red build. */
    expect(tuvaKeyFor('/en-skjerm-som-ikke-finnes')).toBeNull()
    expect(TUVA_FALLBACK).toBe('generell')
    expect(TUVA_ANSWERS[TUVA_FALLBACK].length).toBeGreaterThan(0)
    const helper = readFileSync('components/TuvaHelper.tsx', 'utf8')
    expect(helper).toContain('?? TUVA_FALLBACK')
  })

  it('9b. the two overrules, stated as what now happens rather than as absence', () => {
    const id = '11111111-2222-4333-8444-555555555555'
    // V6-5's four excluded screens — each now has its own entry, not the
    // fallback, because v6's `tuvaFor` map holds three of them by name.
    expect(tuvaKeyFor('/oversikt')).toBe('oversikt')
    expect(tuvaKeyFor('/dashboard')).toBe('dashboard')
    expect(tuvaKeyFor('/rapporter')).toBe('rapporter')
    // v6 has no entry for /hjelp, so it takes the general answer — DECLARED in
    // the resolver rather than reached by fall-through.
    expect(tuvaKeyFor('/hjelp')).toBe('generell')
    // G4's suppression: the list screen now answers BESIDE svTuva.
    expect(tuvaKeyFor('/undersokelser')).toBe('generell')
    expect(tuvaKeyFor('/undersokelser/ny')).toBe('generell')
    // And the survey's own tabs, which G4 left null for every tab but two.
    expect(tuvaKeyFor(`/undersokelser/${id}/resultater`)).toBe('svdetail')
    expect(tuvaKeyFor(`/undersokelser/${id}`)).toBe('svdetail')
    expect(tuvaKeyFor(`/undersokelser/${id}/bygg`)).toBe('bygg')
    expect(tuvaKeyFor(`/undersokelser/${id}/send`)).toBe('send')
  })

  it('9c. no answer set is dead — every key is reachable from a real route', () => {
    /* The companion to test 8. Coverage says no screen lacks an answer; this
       says no answer lacks a screen, so a key left behind by a route that was
       renamed shows up here rather than sitting unread. */
    const id = '11111111-2222-4333-8444-555555555555'
    const reached = new Set(
      [...APP_ROUTES].map((r) => tuvaKeyFor(r.replace(/\/:id(?=\/|$)/, `/${id}`))),
    )
    const orphans = Object.keys(TUVA_ANSWERS).filter((k) => !reached.has(k as never))
    expect(orphans, 'an answer set no route resolves to').toEqual([])
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
    /* G5 — and it is withheld ON Oversikt, where it would point at the page
       being read. G6 adds the second case: a screen that supplies its own body
       through the slot gets its own content and not the shell's checklist link. */
    expect(panel).toContain("key === 'oversikt' || slot ? null :")
  })

  it('13. ONE BUBBLE — exactly one round control announces itself as Tuva', () => {
    /* Tor, 2026-09-16: «One product, one Tuva, and a screen should not have two
       bubbles for two reasons.»

       Measured BEFORE this changed, `/undersokelser` carried two round buttons
       for one helper, differing in size (52 vs 54), background (`bg-sbg` vs
       `bg-ac`), glyph («?» vs «T»), shadow, the unread dot — and, worst, **the
       accessible name**: «Åpne Tuva» and «Vis eller skjul Tuva». Two controls
       announced for one thing.

       THE NAME IS RESOLVED THROUGH THE MESSAGES rather than matched in the
       source, because no component contains the word: `aria-label={t('key')}`
       is all that is written down. The first version of this test swept for
       «Tuva» in the source and found ZERO — which would have reported a clean
       tree either way, and was caught only by the expected value being a list
       rather than a length. `(?<!\p{L})Tuva` is D113's rule: «HeiTuva» in
       `Logo.tsx` is the brand and is not this control. */
    const msg = NO as unknown as Record<string, Record<string, string>>
    const namesTuva = (ns: string, key: string) =>
      typeof msg[ns]?.[key] === 'string' && /(?<!\p{L})Tuva/u.test(msg[ns][key]!)
    expect(namesTuva('tuva', 'openLabel'), 'the sweep cannot see its own subject').toBe(true)

    const files: string[] = []
    const walk = (dir: string) => {
      for (const e of readdirSync(dir)) {
        const full = join(dir, e)
        if (statSync(full).isDirectory()) walk(full)
        else if (/\.tsx$/.test(full)) files.push(full)
      }
    }
    walk('app')
    walk('components')

    const bubbles = files.filter((f) => {
      const src = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
      if (!src.includes('rounded-full')) return false
      /* THE NAMESPACE IS PART OF THE KEY. Resolving `t('title')` against every
         namespace at once made `Builder.tsx` and `Wizard.tsx` false positives —
         their own `title` is not Tuva's, and some other namespace's is. A key
         without its namespace is not a message. */
      const spaces = [...src.matchAll(/useTranslations\('([A-Za-z0-9_]+)'\)/g)].map((m) => m[1]!)
      for (const m of src.matchAll(/aria-label=\{?t\('([A-Za-z0-9_]+)'\)/g)) {
        if (spaces.some((ns) => namesTuva(ns, m[1]!))) return true
      }
      return /aria-label="[^"]*(?<!\p{L})Tuva/u.test(src)
    })
    expect(bubbles, 'a second round control announcing itself as Tuva').toEqual([
      'components/TuvaHelper.tsx',
    ])
  })

  it('14. the shell reads the slot; the page publishes to it', () => {
    /* The two halves of «one bubble whose content a screen may replace», each
       asserted where it lives. Neither alone is the mechanism: a reader with no
       publisher renders the registry answer forever, and a publisher with no
       reader is a write nothing reads — this file's own standing question. */
    const helper = readFileSync('components/TuvaHelper.tsx', 'utf8')
    expect(helper).toContain('useTuvaSlot')
    expect(helper).toContain('{slot}')

    const placement = readFileSync('app/(app)/undersokelser/TuvaPlacement.tsx', 'utf8')
    expect(placement).toContain('<TuvaSlot>')
    // The second bubble is GONE from that file, not merely unused.
    expect(placement).not.toContain('rounded-full')

    const layout = readFileSync('app/(app)/layout.tsx', 'utf8')
    expect(layout).toContain('<TuvaSlotProvider>')
  })
})
