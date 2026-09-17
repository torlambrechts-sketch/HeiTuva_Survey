import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  LOW_RATE,
  SCOPE_KEY,
  SURVEY_SCOPES,
  inScope,
  resolveScope,
  type ScopeRow,
} from '../../lib/surveys/scopes'
import {
  SURVEY_VIEWS,
  TUVA_PLACEMENTS,
  isSurveyView,
  resolveSurveyView,
  resolveTuvaPlacement,
} from '../../lib/surveys/view'

const row = (over: Partial<ScopeRow> = {}): ScopeRow => ({
  id: 'a',
  responses: 0,
  target: null,
  status: 'aktiv',
  ownerId: null,
  recurring: false,
  sharedWithViewer: false,
  ...over,
})

describe('F4 — the five scope filters', () => {
  it('«Lav svarprosent» excludes a row with NO denominator rather than guessing one', () => {
    /* v6:7710 divides by `target || 30`, so a survey with no recipient count is
       judged against a number nobody chose — the invented denominator a third
       time, now deciding what a person SEES. A row with no target is
       UNMEASURED, not low. */
    expect(inScope(row({ responses: 20, target: null }), 'lav', 'me')).toBe(false)
    expect(inScope(row({ responses: 1, target: 10 }), 'lav', 'me')).toBe(true)
    expect(inScope(row({ responses: 9, target: 10 }), 'lav', 'me')).toBe(false)
  })

  it('«Lav» is about ACTIVE surveys — a closed one under the threshold is not low, it is over', () => {
    const under = { responses: 1, target: 10 }
    expect(inScope(row({ ...under, status: 'aktiv' }), 'lav', 'me')).toBe(true)
    expect(inScope(row({ ...under, status: 'lukket' }), 'lav', 'me')).toBe(false)
    expect(inScope(row({ ...under, status: 'utkast' }), 'lav', 'me')).toBe(false)
  })

  it('the threshold is the drawing’s, and the boundary belongs to «not low»', () => {
    expect(LOW_RATE).toBe(0.7)
    expect(inScope(row({ responses: 7, target: 10 }), 'lav', 'me')).toBe(false)
    expect(inScope(row({ responses: 69, target: 100 }), 'lav', 'me')).toBe(true)
  })

  it('«Mine» is the VIEWER’s, and an unowned survey belongs to nobody', () => {
    expect(inScope(row({ ownerId: 'me' }), 'mine', 'me')).toBe(true)
    expect(inScope(row({ ownerId: 'someone' }), 'mine', 'me')).toBe(false)
    /* A survey created before Q96 gave `created_by` its writers has no owner,
       and «Mine» must not claim it — the never-fabricate rule in a predicate. */
    expect(inScope(row({ ownerId: null }), 'mine', 'me')).toBe(false)
  })

  it('«Delt med meg» is a fact about the VIEWER, not about the survey', () => {
    /* The drawing's predicate is «this survey has co-editors» (v6:7712), which
       selects every shared survey in the organisation. The label says «med
       meg». Deviation logged; the property is asserted here so a later
       widening fails. */
    expect(inScope(row({ sharedWithViewer: true }), 'delt', 'me')).toBe(true)
    expect(inScope(row({ sharedWithViewer: false }), 'delt', 'me')).toBe(false)
  })

  it('every scope resolves, and an unknown one is «alle» exactly as an absent one is', () => {
    for (const s of SURVEY_SCOPES) expect(resolveScope(s)).toBe(s)
    expect(resolveScope(undefined)).toBe('alle')
    expect(resolveScope(null)).toBe('alle')
    expect(resolveScope('  mine  ')).toBe('mine')
    expect(resolveScope('nonsense')).toBe('alle')
  })

  it('every scope has a label in BOTH languages, keyed by the registry', () => {
    for (const lang of ['no', 'en']) {
      const m = JSON.parse(readFileSync(`messages/${lang}.json`, 'utf8')).surveys as Record<string, string>
      for (const s of SURVEY_SCOPES) {
        expect(m[SCOPE_KEY[s]], `${lang}.surveys.${SCOPE_KEY[s]}`).toBeTruthy()
      }
    }
  })

  it('a sixth scope cannot silently select everything', () => {
    /* `inScope` switches over the union with no `default`, so an added key is a
       compile error rather than a pill that quietly matches every row. Asserted
       over the source because the property is the ABSENCE of a branch.

       COMMENTS STRIPPED FIRST, and this test went red on correct code without
       it: `scopes.ts` explains the design by NAMING the branch it does not
       have. That is CLAUDE.md's «a refusal named in a comment is found by a
       grep over that comment», arriving inside the phase, in a file whose own
       comment is the thing that matched. The mechanical half of that section's
       remedy applies here — measure the CODE — because the string genuinely
       must not ship, unlike V5-3's «Sluttdato» which had to be restated. */
    const src = readFileSync('lib/surveys/scopes.ts', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    expect(src).not.toMatch(/default:\s*\n?\s*return true/)
    for (const s of SURVEY_SCOPES) expect(src).toContain(`case '${s}'`)
  })
})

describe('F4 — the view switcher and Tuva’s placement', () => {
  it('«Liste» is the TABLE and «Liste og detalj» is the panel — the keys, not the labels', () => {
    /* v6:8942: `rowsOn` (the six-column table) is `svView === "liste"`, `listOn`
       (list plus detail) is `"delt"`. Reading the LABELS gets these backwards
       and ships the detail panel under the table's name. */
    expect(SURVEY_VIEWS).toEqual(['liste', 'delt', 'kort'])
  })

  it('the view resolves in three steps, and a bad cookie falls back like an absent one', () => {
    expect(resolveSurveyView('kort', 'delt')).toBe('kort')
    expect(resolveSurveyView(null, 'delt')).toBe('delt')
    expect(resolveSurveyView(null, null)).toBe('liste')
    expect(resolveSurveyView('nonsense', 'delt')).toBe('delt')
    expect(resolveSurveyView('nonsense', 'nonsense')).toBe('liste')
  })

  it('Tuva defaults to the BUBBLE — a changed default, not a removed column', () => {
    /* G6, Tor 2026-09-16 (D228), overruling the drawing: v6:9014 is
       `svTuvaSide: st.svTuvaDocked !== false`, so unset means the docked side
       column there. Here unset means the bubble.

       **The set is unchanged and that is the point.** A person who has chosen
       the column still has it, because the cookie still holds `side` and the
       switch inside the bubble still writes it. Only the value an ABSENT
       cookie resolves to moved, which is what «change the default, not what it
       can hold» means. An unknown cookie falls back the same way — a bad value
       must not be able to pick the other placement. */
    expect(TUVA_PLACEMENTS).toEqual(['side', 'bubble'])
    expect(resolveTuvaPlacement(undefined)).toBe('bubble')
    expect(resolveTuvaPlacement(null)).toBe('bubble')
    expect(resolveTuvaPlacement('nonsense')).toBe('bubble')
    // The column is still REACHABLE, which is the half a default cannot show.
    expect(resolveTuvaPlacement('side')).toBe('side')
    expect(resolveTuvaPlacement('bubble')).toBe('bubble')
  })

  it('the write boundary and the reader share one set', () => {
    for (const v of SURVEY_VIEWS) expect(isSurveyView(v)).toBe(true)
    expect(isSurveyView('board')).toBe(false)
    expect(isSurveyView(null)).toBe(false)
  })
})
