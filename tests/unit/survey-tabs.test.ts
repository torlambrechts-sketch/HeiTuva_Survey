import { readFileSync, readdirSync } from 'node:fs'
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
/* V7-1 — repointed at the registry the rail moved into. Same property, same
   strictness, different file; see the note in `library-tabs.test.ts`. */
const subnav = readFileSync('lib/shell/subnav.ts', 'utf8')
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
    /*
      AND EVERY SEGMENT IS A REAL ROUTE DIRECTORY, DERIVED RATHER THAN LISTED.

      This was a literal list of eight strings, and F5-2 is what showed why that
      is the wrong shape: re-pointing `sporsmal` from `bygg` to its own read view
      failed this test for a spelling while saying nothing about whether the new
      route existed. The property the rule actually wants is «no pill points at a
      404», so it is read off the filesystem — a tab pointing at a segment nobody
      built now fails here, and a segment renamed alongside its directory does
      not.
    */
    const routes = readdirSync('app/(app)/undersokelser/[id]', { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
    for (const tab of SURVEY_TABS) {
      expect(routes, `${tab} points at a segment with no route`).toContain(TAB_SEGMENT[tab])
    }
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
    // The current pill comes from the PATH SEGMENT. A parameter read here would
    // be a second source of truth for which tab is showing — so `currentId` is
    // `survey.tab` and nothing else, including on /live and /test where it is
    // null and no pill may light.
    expect(code(subnav)).toMatch(/currentId: survey\.tab/)
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

  it('NO HARD-CODED SURVEY SUB-PATH NAMES A ROUTE THAT DOES NOT EXIST', () => {
    /*
      F4 SHIPPED `/undersokelser/${id}/rapport`, AND NO SUCH ROUTE HAS EVER
      EXISTED. Two call sites — the row's action icons and the detail panel's
      six links — built the path as a template literal instead of going through
      this registry, so the derivation two tests above could not see them: it
      checks the tabs IN `SURVEY_TABS`, and these were never in it.

      The cost was 65 of 288 captures failing in `verify:browser` with
      «404 (Not Found)», on screens that have nothing to do with reports —
      `live`, `bygg`, `send`, `resultater`, `bibliotek` — because **Next
      prefetches every `<Link>` in the viewport**, so one bad href on a list row
      404s from every screen that renders the list. The symptom appears
      everywhere except where the cause is.

      So the property is stated over the SOURCE rather than over the registry:
      any `/undersokelser/${…}/<segment>` written anywhere in the app must name
      a directory that exists. Derived from the filesystem, so a route added or
      renamed needs no edit here, and the next invented segment fails in the
      commit that adds it.
    */
    const dirs = readdirSync('app/(app)/undersokelser/[id]', { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)

    const files: string[] = []
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const full = `${dir}/${e.name}`
        if (e.isDirectory()) walk(full)
        else if (/\.tsx?$/.test(e.name)) files.push(full)
      }
    }
    walk('app')
    walk('components')
    /* G4 — `lib` joins the sweep. Tuva's answers live in `lib/tuva/answers.ts`
       and form survey sub-routes, so the property this test states — no
       hard-coded survey sub-path may name a route that does not exist — was
       true of two directories and silent about the third. Widened here rather
       than copied into a second test: it is the same property, and two tests
       asserting it is how they come to disagree. */
    walk('lib')

    const offenders: string[] = []
    for (const file of files) {
      const body = code(readFileSync(file, 'utf8'))
      // `/undersokelser/${anything}/segment` — the template-literal form. A
      // trailing `?query` or a closing backtick/quote ends the segment.
      for (const m of body.matchAll(/\/undersokelser\/\$\{[^}]+\}\/([a-z-]+)/g)) {
        const seg = m[1]!
        if (!dirs.includes(seg)) offenders.push(`${file}: /${seg}`)
      }
    }

    expect(offenders, 'a link to a survey sub-route nobody built').toEqual([])
  })

  it('the survey INDEX derives its target from the registry, not from a literal', () => {
    /*
      V7-4. The index used to redirect to a hard-coded `/bygg` under a comment
      describing the pre-F5-2 world: «the survey context is a step rail over
      Bygg / Send / Resultater, and Bygg is the first step». Both halves had
      stopped being true — a correct line made wrong by its surroundings, which
      is the shape this tranche met four times.

      Asserted as a DERIVATION rather than as a destination: the test does not
      say «it goes to /sporsmal», because that would be the same literal moved
      into the test. It says the source reads the registry — so reordering
      `SURVEY_TABS` moves the redirect and this test keeps holding.
    */
    const src = readFileSync('app/(app)/undersokelser/[id]/page.tsx', 'utf8')
    const body = code(src)
    expect(body).toContain('TAB_SEGMENT[SURVEY_TABS[0]]')
    // And no literal segment survives in the redirect.
    expect(body).not.toMatch(/redirect\(`\/undersokelser\/\$\{id\}\/[a-z]/)

    // The one caller that used to depend on the index now names what it wants,
    // so the index is free to mean «the survey's front door» and nothing else.
    const lib = code(readFileSync('app/(app)/bibliotek/actions.ts', 'utf8'))
    expect(lib).toMatch(/redirect\(`\/undersokelser\/\$\{survey\.id\}\/bygg`\)/)
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
