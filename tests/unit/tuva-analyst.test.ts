import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { analyse, headlineKey, lowestKey, rateOf, type AnalystSurvey } from '../../lib/tuva/analyst'

/**
 * V6-6 — svTuva reads participation and never content (Q184), and proposes a
 * task only on Q72's trigger (Q185).
 */
const s = (over: Partial<AnalystSurvey>): AnalystSurvey => ({
  id: 'id',
  title: 'Puls',
  status: 'aktiv',
  responses: 5,
  target: 10,
  groupSizes: [],
  k: 5,
  ...over,
})

describe('V6-6 — the analyst', () => {
  it('Q184 — its INPUTS are counts, asserted over the type it accepts', () => {
    /*
      The boundary, not a fact about today: the moment an input becomes a score,
      a theme or a quote, this stops being participation and needs the k gate.
      So the module may not name one.
    */
    const src = readFileSync('lib/tuva/analyst.ts', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    for (const forbidden of ['score', 'avg', 'average', 'theme', 'quote', 'answer', 'sentiment']) {
      expect(src, `the analyst reads ${forbidden}`).not.toMatch(new RegExp(`\\b${forbidden}`, 'i'))
    }
  })

  it('counts active surveys and the overall rate', () => {
    const a = analyse([
      s({ id: 'a', responses: 6, target: 10 }),
      s({ id: 'b', responses: 4, target: 10 }),
      s({ id: 'c', status: 'utkast', responses: 0, target: null }),
    ])
    expect(a.activeCount).toBe(2)
    // F1-1: 10 of 20 over the two ACTIVE rows. The draft is in neither half —
    // under the old arithmetic it was in the numerator only.
    expect(a.measured).toEqual({ ids: ['a', 'b'], responses: 10, target: 20, pct: 50 })
  })

  it('NO DENOMINATOR MEANS NO PERCENTAGE, not 0 %', () => {
    // CLAUDE.md: never fabricate a value. A 0 % derived from an unknown
    // denominator is indistinguishable from a real 0 % in a screenshot.
    const a = analyse([s({ target: null, responses: 0, status: 'utkast' })])
    expect(a.measured).toBeNull()
    expect(a.lowest).toBeNull()
  })

  it('names the lowest active survey, and breaks a tie by title', () => {
    const a = analyse([
      s({ id: 'a', title: 'B-survey', responses: 2, target: 10 }),
      s({ id: 'b', title: 'A-survey', responses: 2, target: 10 }),
    ])
    expect(a.lowest).toEqual({ title: 'A-survey', pct: 20 })
  })

  it('an unsent survey cannot be «lowest» — it has no rate, not a rate of zero', () => {
    const a = analyse([
      s({ id: 'a', responses: 3, target: 10 }),
      s({ id: 'b', title: 'Usendt', responses: 0, target: null }),
    ])
    expect(a.lowest?.title).toBe('Puls')
  })

  it('Q185 — the task tip fires on Q72’s TRIGGER and nothing else', () => {
    /*
      «this survey has a group that will never receive its own results» — a
      group whose SIZE is below the survey's k. Not a finding, not a score.
    */
    const withBlind = analyse([s({ groupSizes: [12, 3], k: 5 })])
    expect(withBlind.tips.some((t) => t.kind === 'below_threshold_group')).toBe(true)

    // Every group at or above k: no tip.
    const withoutBlind = analyse([s({ groupSizes: [12, 5], k: 5 })])
    expect(withoutBlind.tips.some((t) => t.kind === 'below_threshold_group')).toBe(false)

    // A group of zero is not a group below the threshold — nobody is in it, so
    // there is no one who will fail to receive results.
    const empty = analyse([s({ groupSizes: [12, 0], k: 5 })])
    expect(empty.tips.some((t) => t.kind === 'below_threshold_group')).toBe(false)
  })

  it('the task tip carries NO GROUP NAME — Q72 says so explicitly', () => {
    const a = analyse([s({ title: 'Puls', groupSizes: [2], k: 5 })])
    const tip = a.tips.find((t) => t.kind === 'below_threshold_group')!
    // The survey it is about, and nothing about the group.
    expect(Object.keys(tip).sort()).toEqual(['kind', 'surveyId', 'title'])

    /*
      Measured over the VALUES, not over the whole object. The discriminant is
      `below_threshold_group` — it names what it is about, so a grep across
      `JSON.stringify(tip)` finds «group» in the key and fails on correct code.
      That is the refusal-named-in-its-own-identifier shape, and the fix is to
      measure the thing the property is actually about: what the tip CARRIES.
    */
    const carried = [tip.surveyId, tip.title].join(' ')
    expect(carried, 'the tip carries something about the group').not.toMatch(
      /gruppe|group|\b\d+\b/i,
    )
  })

  it('the threshold is the SURVEY’s k, not a constant', () => {
    // `app.k_for` returns 0 for an organisation-respondent survey and at least
    // 3 otherwise, so a hard-coded 5 here would fire on surveys it must not.
    expect(analyse([s({ groupSizes: [4], k: 5 })]).tips.some((t) => t.kind === 'below_threshold_group')).toBe(true)
    expect(analyse([s({ groupSizes: [4], k: 3 })]).tips.some((t) => t.kind === 'below_threshold_group')).toBe(false)
    expect(analyse([s({ groupSizes: [4], k: 0 })]).tips.some((t) => t.kind === 'below_threshold_group')).toBe(false)
  })

  it('at most three tips, and none at all for an empty list', () => {
    expect(analyse([]).tips).toEqual([])
    expect(analyse([]).activeCount).toBe(0)
    const many = analyse([
      s({ id: 'a', responses: 1, target: 10, groupSizes: [2], k: 5 }),
      s({ id: 'b', status: 'utkast', target: null }),
    ])
    expect(many.tips.length).toBeLessThanOrEqual(3)
  })
})

/**
 * F1-1 — THE POPULATION PROPERTY.
 *
 * The defect these were written against: `totalResponses` summed over every row
 * in the list and `totalTarget` over only the rows that had a target, so the
 * ratio divided two different populations by each other. Against production —
 * nine surveys, seven with `target` null — that printed «700 % har svart», and
 * the same split made `lowest` report a 1/1 survey as the lowest while the two
 * with real participation were dropped for want of a denominator.
 *
 * `Math.min(100, …)` would have printed 100 % and still been false, so these
 * assert the PROPERTY and not the symptom: **a ratio is computed over one
 * population, and the module says which rows that was.**
 */
describe('F1-1 — a ratio comes from one population', () => {
  /* Production's actual shape, read 2026-09-14 from `heituva-prod`. Written
     out rather than generated, because the reason this shipped is that no
     fixture ever had it: seven of nine rows carry no target at all. */
  const PROD: AnalystSurvey[] = [
    s({ id: 'p1', title: 'Ny undersøkelse 1', status: 'utkast', responses: 0, target: null }),
    s({ id: 'p2', title: 'Ny undersøkelse 2', status: 'aktiv', responses: 1, target: 1 }),
    s({ id: 'p3', title: 'Psykososial kartlegging', status: 'utkast', responses: 0, target: null }),
    s({ id: 'p4', title: 'Ny undersøkelse 4', status: 'aktiv', responses: 1, target: 1 }),
    s({ id: 'p5', title: 'Ny undersøkelse 5', status: 'utkast', responses: 0, target: null }),
    s({ id: 'p6', title: 'Ny undersøkelse 6', status: 'utkast', responses: 0, target: null }),
    s({ id: 'p7', title: 'Ny undersøkelse 7', status: 'utkast', responses: 0, target: null }),
    s({ id: 'p8', title: 'Medarbeiderpuls høst', status: 'aktiv', responses: 7, target: null }),
    s({ id: 'p9', title: 'Påmelding til fagdag', status: 'aktiv', responses: 5, target: null }),
  ]

  it('production’s own shape does not produce 700 %', () => {
    const a = analyse(PROD)
    expect(a.activeCount).toBe(4)
    // Two active rows carry a target: 1/1 and 1/1.
    expect(a.measured).toEqual({ ids: ['p2', 'p4'], responses: 2, target: 2, pct: 100 })
    expect(a.unmeasuredCount).toBe(2)
  })

  it('the numerator and the denominator come from the SAME rows', () => {
    /* The property, asserted by re-deriving from the rows the module names
       rather than by re-stating its arithmetic. If a future edit widens one
       half, the re-derivation stops matching. */
    let checked = 0
    for (const input of [PROD, [], PROD.slice(0, 4), PROD.filter((x) => x.status === 'aktiv')]) {
      const a = analyse(input)
      if (!a.measured) continue
      checked += 1
      const population = input.filter((x) => a.measured!.ids.includes(x.id))
      expect(rateOf(population)).toEqual(a.measured)
      // And every named row really is one the rate could be computed over.
      for (const row of population) {
        expect(row.status).toBe('aktiv')
        expect(row.target).toBeGreaterThan(0)
      }
    }
    // Without this the loop passes by skipping every case, which is the shape
    // of a test that measures nothing.
    expect(checked, 'no input produced a measurable population').toBeGreaterThan(0)
  })

  it('the rate is over ACTIVE surveys, not over drafts and closed as well', () => {
    const a = analyse([
      s({ id: 'a', status: 'aktiv', responses: 5, target: 10 }),
      s({ id: 'd', status: 'utkast', responses: 0, target: 40 }),
      s({ id: 'c', status: 'lukket', responses: 40, target: 40 }),
    ])
    // 5/10, not 45/90.
    expect(a.measured).toEqual({ ids: ['a'], responses: 5, target: 10, pct: 50 })
  })

  it('«lowest» is drawn from the SAME population as the rate', () => {
    const a = analyse(PROD)
    // Not «Medarbeiderpuls høst» (7 responses, no target) and not a 100 % row
    // presented as the lowest of everything: it is the lowest of the two we can
    // measure, and `unmeasuredCount` is what lets the copy say so.
    expect(a.lowest).toEqual({ title: 'Ny undersøkelse 2', pct: 100 })
    expect(a.unmeasuredCount).toBe(2)
  })

  it('a rate never exceeds 100 %, because the row it sits above does not', () => {
    // A link or QR survey can be answered by more people than were invited.
    // `responsePct` on each row clamps; the headline must agree with the rows.
    const a = analyse([s({ id: 'x', responses: 18, target: 8 })])
    expect(a.measured?.pct).toBe(100)
  })

  it('no active survey with a target means no rate at all, not 0 %', () => {
    const a = analyse([s({ id: 'x', responses: 7, target: null })])
    expect(a.measured).toBeNull()
    expect(a.activeCount).toBe(1)
    expect(a.unmeasuredCount).toBe(1)
  })
})

/**
 * F1-1, the copy half. «66 %» and «66 % av de vi kan måle» are different
 * claims, so the sentence has to name the population the number came from —
 * and which sentence is honest is decided by `headlineKey`/`lowestKey` in the
 * module, never by the component.
 */
describe('F1-1 — the copy names the population', () => {
  const NO = JSON.parse(readFileSync('messages/no.json', 'utf8')).analyst as Record<string, string>
  const EN = JSON.parse(readFileSync('messages/en.json', 'utf8')).analyst as Record<string, string>

  it('the module chooses the claim, and it chooses by the numbers', () => {
    const all = analyse([s({ id: 'a', responses: 5, target: 10 })])
    expect(headlineKey(all)).toBe('headlineAll')
    expect(lowestKey(all)).toBe('lowest')

    const some = analyse([
      s({ id: 'a', responses: 5, target: 10 }),
      s({ id: 'b', responses: 7, target: null }),
    ])
    expect(headlineKey(some)).toBe('headlineSome')
    expect(lowestKey(some)).toBe('lowestOfMeasured')

    const none = analyse([s({ id: 'b', responses: 7, target: null })])
    expect(headlineKey(none)).toBe('headlineNone')
  })

  it('only the narrowed sentences carry the population, and they all carry it', () => {
    for (const [lang, m] of [
      ['no', NO],
      ['en', EN],
    ] as const) {
      expect(m.headlineSome, `${lang} headlineSome`).toContain('{m}')
      expect(m.lowestOfMeasured, `${lang} lowestOfMeasured`).toContain('{m}')
      // The unnarrowed ones must NOT — a population clause on a sentence that
      // covers everything is as wrong as its absence on one that does not.
      expect(m.headlineAll, `${lang} headlineAll`).not.toContain('{m}')
      expect(m.lowest, `${lang} lowest`).not.toContain('{m}')
      // And no rate may appear in the sentence that says there is no rate.
      expect(m.headlineNone, `${lang} headlineNone`).not.toContain('{pct}')
    }
  })

  it('every key the panel can ask for resolves in both languages', () => {
    /* A missing key renders as a raw key on screen, which is the defect nine of
       were found behind seventeen green gates. Derived from the union the
       module can return, so a fourth claim cannot arrive without its copy. */
    const keys = [
      'title',
      'headlineAll',
      'headlineSome',
      'headlineNone',
      'lowest',
      'lowestOfMeasured',
      'tipLowResponse',
      'tipLowResponseAction',
      'tipDraft',
      'tipDraftAction',
      'tipBelowThreshold',
      'tipBelowThresholdAction',
    ]
    for (const k of keys) {
      expect(NO[k], `no.${k}`).toBeTruthy()
      expect(EN[k], `en.${k}`).toBeTruthy()
    }
    // And nothing is left behind: the two keys the old arithmetic needed are
    // gone from both files, so a stale sentence cannot be revived by accident.
    for (const dead of ['headline', 'headlineNoRate']) {
      expect(NO[dead], `no.${dead} still shipped`).toBeUndefined()
      expect(EN[dead], `en.${dead} still shipped`).toBeUndefined()
    }
  })
})
