import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TUVA_ANSWERS, tuvaHref, tuvaKeyFor, type TuvaKey } from '../../lib/tuva/answers'
import { SURVEY_TABS, TAB_SEGMENT } from '../../lib/surveys/tabs'
import no from '../../messages/no.json'
import en from '../../messages/en.json'

/**
 * V6-5 — Tuva answers only where there is somewhere to go.
 *
 * Tor: «a helper promising a screen we refused is worse than a helper with one
 * fewer answer.» So the central test DERIVES the app's routes from the file
 * system and requires every href to be one of them — a list of routes written
 * here would be an enumeration that goes stale exactly when a screen is
 * removed, which is the case this is protecting against.
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
  if (prefix === '' ) {
    for (const entry of readdirSync(dir)) {
      if (entry === 'page.tsx') out.push('/')
    }
  }
  return out
}
const APP_ROUTES = new Set(routes('app/(app)'))

/** An href reduced to its route: query dropped, uuid replaced by the parameter. */
function toRoute(href: string): string {
  const path = href.split('?')[0]!
  return path.replace(/\/[0-9a-f-]{36}(?=\/|$)/i, '/:id')
}

describe('V6-5 — every Tuva answer lands somewhere that exists', () => {
  it('the app has routes at all — so the assertion below is not vacuous', () => {
    expect(APP_ROUTES.size).toBeGreaterThan(10)
    expect(APP_ROUTES).toContain('/bibliotek')
  })

  it('EVERY href resolves to a real route, derived from the file system', () => {
    const SURVEY = '11111111-2222-4333-8444-555555555555'
    let checked = 0
    for (const [key, entry] of Object.entries(TUVA_ANSWERS)) {
      for (const template of entry.hrefs) {
        const href = tuvaHref(template, SURVEY)
        expect(href, `${key}: ${template} resolved to nothing`).not.toBeNull()
        expect(
          APP_ROUTES,
          `${key}: ${template} points at ${toRoute(href!)}, which is not a route`,
        ).toContain(toRoute(href!))
        checked++
      }
    }
    expect(checked, 'no answer was checked').toBeGreaterThan(0)
  })

  it('NOTHING points at the screens we refused', () => {
    /*
      Feltarbeid is DECIDED-NOT-BUILT and Oversikt is NOT NOW. The bundle's
      svdetail entry sends «Hvem mangler, og når bør du purre» straight at
      Feltarbeid; that answer is repointed and reworded rather than shipped.
    */
    const all = Object.values(TUVA_ANSWERS).flatMap((e) => e.hrefs).join(' ')
    expect(all).not.toMatch(/feltarbeid/)
    expect(all).not.toMatch(/oversikt/)
    // And the survey tabs it does use are ones the registry actually carries.
    for (const t of ['malgruppe', 'personvern']) {
      expect(SURVEY_TABS as readonly string[], t).toContain(t)
      expect(Object.values(TAB_SEGMENT)).toContain(t)
    }
  })

  it('NO ANSWER PROMISES THE HALF WE DID NOT BUILD', () => {
    // «Hvem får den, og hvem faller fra» loses its second clause, because the
    // second clause is the refused surface.
    for (const [lang, set] of [['no', no], ['en', en]] as const) {
      const tv = (set as { tuva: Record<string, string> }).tuva
      const copy = Object.values(tv).join(' ')
      expect(copy, `${lang} promises the drop-off half`).not.toMatch(
        /faller fra|hvem mangler|who is missing|drops off/i,
      )
    }
  })

  it('Q178 — no answer uses blocking language', () => {
    /*
      The bundle's build entry says «Ingen blokkeringer — du kan sende» or «Noe
      må løses før du kan sende». Both are false about this product: nothing in
      Metodikk stops a send.
    */
    for (const [lang, set] of [['no', no], ['en', en]] as const) {
      const copy = Object.values((set as { tuva: Record<string, string> }).tuva).join(' ')
      expect(copy, lang).not.toMatch(/blokker|må løses før|before you can send|blocked/i)
    }
    // And it says the true thing instead.
    expect((no as { tuva: Record<string, string> }).tuva.byggs).toMatch(/hindrer deg i å sende/)
  })

  it('every key has copy in both languages, and every answer a label', () => {
    for (const [key, entry] of Object.entries(TUVA_ANSWERS) as [TuvaKey, { hrefs: string[] }][]) {
      for (const [lang, set] of [['no', no], ['en', en]] as const) {
        const tv = (set as { tuva: Record<string, string> }).tuva
        expect(tv[`${key}h`], `${lang}.tuva.${key}h`).toBeTruthy()
        expect(tv[`${key}s`], `${lang}.tuva.${key}s`).toBeTruthy()
        entry.hrefs.forEach((_, i) => {
          expect(tv[`${key}a${i}`], `${lang}.tuva.${key}a${i}`).toBeTruthy()
          expect(tv[`${key}a${i}d`], `${lang}.tuva.${key}a${i}d`).toBeTruthy()
        })
      }
    }
  })

  it('a path with no entry gets NOTHING rather than a generic answer', () => {
    // A helper that always has something to say is a helper nobody believes.
    for (const p of ['/dashboard', '/rapporter', '/oversikt', '/hjelp', '/undersokelser']) {
      expect(tuvaKeyFor(p), p).toBeNull()
    }
  })

  it('the survey-scoped entries resolve only with a survey in scope', () => {
    expect(tuvaHref('SURVEY/malgruppe', null)).toBeNull()
    expect(tuvaHref('SURVEY/malgruppe', 'abc')).toBe('/undersokelser/abc/malgruppe')
    expect(tuvaHref('/bibliotek', null)).toBe('/bibliotek')
  })

  it('Q183 — no on/off switch, and no rating, because neither has a writer', () => {
    /*
      **THE FIRST VERSION OF THIS ASSERTED `readdirSync('lib/tuva')` EQUALS
      'answers.ts'** — a snapshot of the directory as it stood, standing in for
      the property. V6-6 added `analyst.ts` beside it and the test went red on
      correct code. That is the enumeration shape in a test I wrote in the same
      session as a section about it: the list was true of the files that existed
      and said nothing about the rule.

      The rule is that NO file here ships a control whose state nothing stores.
      So it sweeps the directory instead of naming it, and a third module is
      covered on arrival rather than breaking this.
    */
    const files = readdirSync('lib/tuva').filter((f) => f.endsWith('.ts'))
    expect(files.length, 'lib/tuva is empty').toBeGreaterThan(0)
    for (const file of files) {
      const body = readFileSync(`lib/tuva/${file}`, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')
      for (const absent of ['tvShow', 'tvRated', 'tvTrackOpen', 'options.tuva']) {
        expect(body, `${file} ships ${absent} without a writer`).not.toContain(absent)
      }
    }
  })
})
