import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  SURVEY_TABS,
  TAB_NAV_KEY,
  TAB_SEGMENT,
  resolveSurveyPath,
  surveyTabHref,
} from '../../lib/surveys/tabs'
import no from '../../messages/no.json'
import en from '../../messages/en.json'

/**
 * V6-2 — the re-parent: Bygg / Send / Resultater stop being three numbered
 * steps and become tabs on one survey, WITHOUT the routes moving.
 *
 * The two halves that have to stay true together are the rail (AppSubnav) and
 * the paths (the routes themselves). They agree only because both read
 * `lib/surveys/tabs.ts`; if either grows its own copy, the pill that looks
 * selected stops being the screen you are on — and no screenshot shows that,
 * because every pill still renders and every tab still works.
 */
const ID = '11111111-2222-4333-8444-555555555555'
const subnav = readFileSync('components/AppSubnav.tsx', 'utf8')
const bar = readFileSync('app/(app)/undersokelser/[id]/SurveyContextBar.tsx', 'utf8')
/** Code with `//` and block comments stripped. CLAUDE.md: a file that documents
 *  its own refusals contains the words it refuses, and this component's doc
 *  comment names the very rail it must no longer draw. */
const code = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

describe('V6-2 — one registry, read by the rail and by the routes', () => {
  it('every tab has a label in both languages', () => {
    for (const tab of SURVEY_TABS) {
      for (const [lang, set] of [['no', no], ['en', en]] as const) {
        const nav = (set as { nav: Record<string, string> }).nav[TAB_NAV_KEY[tab]]
        expect(nav, `${lang}.nav.${TAB_NAV_KEY[tab]} (for ${tab})`).toBeTruthy()
      }
      expect((no as { nav: Record<string, string> }).nav.subnavSurvey).toBeTruthy()
      expect((en as { nav: Record<string, string> }).nav.subnavSurvey).toBeTruthy()
    }
  })

  it('THE PATHS ARE KEPT — every tab is a real route segment, not a parameter', () => {
    /*
      Tor's ruling, and the property the whole phase turns on: «a survey has
      three phases with distinct state, and a URL saying which one you are in is
      a property, not an implementation choice.» So no href may carry a tab
      parameter, and each must end in the segment that owns it.
    */
    for (const tab of SURVEY_TABS) {
      const href = surveyTabHref(ID, tab)
      expect(href).toBe(`/undersokelser/${ID}/${TAB_SEGMENT[tab]}`)
      expect(href, 'a tab must never become a query parameter').not.toMatch(/\?|fane=/)
    }
    // And the three segments are the routes that already existed.
    expect(Object.values(TAB_SEGMENT).sort()).toEqual([
      'bygg',
      'historikk',
      'kommentarer',
      'malgruppe',
      'personvern',
      'resultater',
      'send',
      'tiltak',
    ])
  })

  it('href and resolve are inverses, so no pill can look selected while another is shown', () => {
    for (const tab of SURVEY_TABS) {
      const r = resolveSurveyPath(surveyTabHref(ID, tab))
      expect(r?.surveyId).toBe(ID)
      expect(r?.tab, tab).toBe(tab)
    }
  })

  it('/live and /test resolve to NO current tab rather than to the first one', () => {
    /*
      «No pill is current» and «the first pill is current» are different claims,
      and only the first is true on /live. A resolver returning a bare tab would
      have had to pick one.
    */
    for (const seg of ['live', 'test']) {
      const r = resolveSurveyPath(`/undersokelser/${ID}/${seg}`)
      expect(r?.surveyId, seg).toBe(ID)
      expect(r?.tab, seg).toBeNull()
    }
    // The bare detail path too — it redirects, and marks nothing.
    expect(resolveSurveyPath(`/undersokelser/${ID}`)?.tab).toBeNull()
  })

  it('refuses paths that are not a survey sub-route', () => {
    for (const p of ['/undersokelser', '/undersokelser/ny', '/bibliotek', '/oppgaver', '/']) {
      expect(resolveSurveyPath(p), p).toBeNull()
    }
    // A malformed id is not a survey — the same guard the page itself applies.
    expect(resolveSurveyPath('/undersokelser/not-a-uuid/bygg')).toBeNull()
  })

  it('the subnav renders the registry rather than a list of its own', () => {
    expect(code(subnav)).toMatch(/SURVEY_TABS\.map/)
    expect(code(subnav)).toMatch(/resolveSurveyPath\(pathname\)/)
    // `aria-current` comes from the PATH SEGMENT. A parameter read here would
    // be a second source of truth for which tab is showing.
    expect(code(subnav)).toMatch(/survey\.tab \? surveyTabHref\(/)
  })

  it('the context bar keeps NO second copy of the rail — the condition the move rests on', () => {
    /*
      AppSubnav's own header sets this for `admin`: two controls doing one job,
      one of them able to go out of date, is worse than one control. The library
      obeyed it at Q172; this is the same test for the survey.

      Measured over the CODE, because the doc comment above the component names
      the rail it no longer draws — the refusal-in-a-comment shape.
    */
    const body = code(bar)
    expect(body).not.toMatch(/\bSTEPS\b/)
    expect(body, 'the bar must not link to the tab routes').not.toMatch(
      /\/(bygg|send|resultater)\b/,
    )
    // What it DOES keep is identity, and /live is an action rather than a tab.
    expect(body).toMatch(/\/live/)
    expect(body).toMatch(/statusUtkast|STATUS_KEY/)
  })

  it('the retired step labels are gone from both languages, not left dangling', () => {
    // They had no readers after the move. A message nobody reads is a claim
    // nobody checks.
    for (const [lang, set] of [['no', no], ['en', en]] as const) {
      const nav = (set as { surveyNav: Record<string, string> }).surveyNav
      for (const k of ['stepBuild', 'stepSend', 'stepResults']) {
        expect(nav[k], `${lang}.surveyNav.${k}`).toBeUndefined()
      }
      expect(nav.back, lang).toBeTruthy()
      expect(nav.runLive, lang).toBeTruthy()
    }
  })

  it('only tabs whose route exists are in the registry', () => {
    /*
      The rail may not promise a screen we decided against. `over` (Oversikt) is
      NOT NOW and `feltarbeid` is DECIDED-NOT-BUILT, so neither may appear here
      — and the four narrowings, Metodikk and Historikk arrive with their own
      phases rather than ahead of them.
    */
    expect(SURVEY_TABS).not.toContain('over')
    expect(SURVEY_TABS).not.toContain('feltarbeid')
    // Grows per phase: V6-2 shipped three, V6-4 adds the narrowings and
    // Historikk. Målgruppe is NOT among them — see the registry's own note.
    expect(SURVEY_TABS.length).toBe(8)
  })
})
