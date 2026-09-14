import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { analyse, type AnalystSurvey } from '../../lib/tuva/analyst'

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
    expect(a.pct).toBe(50)
  })

  it('NO DENOMINATOR MEANS NO PERCENTAGE, not 0 %', () => {
    // CLAUDE.md: never fabricate a value. A 0 % derived from an unknown
    // denominator is indistinguishable from a real 0 % in a screenshot.
    const a = analyse([s({ target: null, responses: 0, status: 'utkast' })])
    expect(a.pct).toBeNull()
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
