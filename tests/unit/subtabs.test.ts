import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import en from '../../messages/en.json'
import no from '../../messages/no.json'
import { SURVEY_TABS, TAB_SEGMENT, resolveSurveyPath } from '../../lib/surveys/tabs'
import {
  REFUSED,
  REFUSED_KEYS,
  SUBTABS,
  refusalKey,
  resolveSubTab,
  subLabelKey,
  subTabHref,
  subTabsFor,
} from '../../lib/surveys/subtabs'

const BUNDLE = 'design-reference-v6/heituva-survey-app-design/project/HeiTuva.dc.html'

/**
 * The bundle's own 27, read from the source rather than transcribed.
 *
 * `SUBS` (v6:7139-7145) is seven `tab: [[key,label], …]` entries. Parsing it
 * here rather than listing it is the difference between a test that checks
 * what we believe and one that checks what the drawing says — and this
 * project has written down twice what a transcribed number costs.
 */
function bundleSubTabs(): Record<string, string[]> {
  const src = readFileSync(BUNDLE, 'utf8').split('\n').slice(7138, 7145).join('\n')
  const out: Record<string, string[]> = {}
  for (const m of src.matchAll(/(\w+):\s*\[(\["[a-z]+","[^"]*"\](?:,\["[a-z]+","[^"]*"\])*)\]/g)) {
    out[m[1]!] = [...m[2]!.matchAll(/\["([a-z]+)","[^"]*"\]/g)].map((x) => x[1]!)
  }
  return out
}

describe('F5 — the sub-tab registry is the second navigation level', () => {
  const bundle = bundleSubTabs()

  it('the bundle really does hold 27 sub-tabs in seven rails', () => {
    /* The guard on every count below. If this changes, a handoff moved and
       every verdict in docs/f5/00-plan.md needs re-deriving rather than
       re-reading. */
    expect(Object.keys(bundle)).toHaveLength(7)
    expect(Object.values(bundle).flat()).toHaveLength(27)
  })

  it('every sub-tab we OFFER is one the drawing draws, under the same tab', () => {
    /* The direction that catches an invention. A sub-tab in our registry that
       the bundle does not draw is a screen somebody added, which the
       do-not-invent rule forbids. */
    for (const tab of SURVEY_TABS) {
      for (const sub of subTabsFor(tab)) {
        expect(bundle[tab], `bundle has no rail for ${tab}`).toBeDefined()
        expect(bundle[tab], `${tab}/${sub} is not drawn`).toContain(sub)
      }
    }
  })

  it('every sub-tab we REFUSE is one the drawing draws', () => {
    /* The same direction for the refusals: a refusal for something nobody drew
       is a sentence about nothing, and it would read on screen as a feature we
       had considered. */
    for (const key of REFUSED_KEYS) {
      const [tab, sub] = key.split('/')
      expect(bundle[tab!], `bundle has no rail for ${tab}`).toBeDefined()
      expect(bundle[tab!], `${key} is refused but not drawn`).toContain(sub)
    }
  })

  it('a refused sub-tab is ABSENT from the registry, never both', () => {
    /* The registry and the refusal list are disjoint. Being in both would mean
       a rail offering a pill whose page says it is not built — which is the
       exact promise `tabs.ts` refuses one level up. */
    for (const key of REFUSED_KEYS) {
      const [tab, sub] = key.split('/')
      expect(subTabsFor(tab as never), `${key} is offered AND refused`).not.toContain(sub)
    }
  })

  it('every refusal has a sentence in BOTH languages, and it is not a raw key', () => {
    /* A missing message renders as the key itself, which is the defect nine of
       were found behind seventeen green gates. Asserted over the shipped
       strings rather than over the registry. */
    for (const msg of Object.values(REFUSED)) {
      for (const [lang, set] of [['no', no], ['en', en]] as const) {
        const v = (set.surveys as Record<string, string>)[msg]
        expect(v, `${lang}: surveys.${msg} missing`).toBeTruthy()
        expect(v, `${lang}: surveys.${msg} is a key`).not.toMatch(/^[a-z][A-Za-z_]*$/)
      }
    }
  })

  it('every OFFERED sub-tab has a label in both languages', () => {
    for (const tab of SURVEY_TABS) {
      for (const sub of subTabsFor(tab)) {
        for (const [lang, set] of [['no', no], ['en', en]] as const) {
          const key = subLabelKey(tab, sub)
          expect((set.surveys as Record<string, string>)[key], `${lang}: surveys.${key}`).toBeTruthy()
        }
      }
    }
  })

  it('every tab that has a rail has a rail HEADING in both languages', () => {
    for (const tab of SURVEY_TABS) {
      if (subTabsFor(tab).length === 0) continue
      for (const [lang, set] of [['no', no], ['en', en]] as const) {
        expect(
          (set.surveys as Record<string, string>)[`subRail_${tab}`],
          `${lang}: surveys.subRail_${tab}`,
        ).toBeTruthy()
      }
    }
  })

  it('the first sub-tab carries no parameter, so the tab and its default are one URL', () => {
    /* Otherwise the subnav pill and the rail pill point at two spellings of the
       same screen and only one of them reads as current — `libraryTabHref`'s
       reason, one level down. */
    for (const tab of SURVEY_TABS) {
      const subs = subTabsFor(tab)
      if (subs.length === 0) continue
      const seg = TAB_SEGMENT[tab]
      expect(subTabHref('S', tab, subs[0]!, seg)).toBe(`/undersokelser/S/${seg}`)
      for (const s of subs.slice(1)) {
        expect(subTabHref('S', tab, s, seg)).toBe(`/undersokelser/S/${seg}?vis=${s}`)
      }
    }
  })

  it('an unknown ?vis= falls back to the first, and a tab with no rail resolves to null', () => {
    for (const tab of SURVEY_TABS) {
      const subs = subTabsFor(tab)
      if (subs.length === 0) {
        expect(resolveSubTab(tab, 'anything')).toBeNull()
        continue
      }
      expect(resolveSubTab(tab, undefined)).toBe(subs[0])
      expect(resolveSubTab(tab, 'ikke-en-fane')).toBe(subs[0])
      for (const s of subs) expect(resolveSubTab(tab, s)).toBe(s)
    }
  })

  it('a refused sub-tab still names its reason, so the screen can say it', () => {
    for (const key of REFUSED_KEYS) {
      const [tab, sub] = key.split('/')
      expect(refusalKey(tab as never, sub!)).toBe(REFUSED[key])
    }
    expect(refusalKey('kommentarer', 'alle')).toBeNull()
  })

  it('SUBTABS holds no tab that is not a real tab', () => {
    /* `Partial<Record<SurveyTab, …>>` is checked by tsc, and this is the
       runtime half — a key added by a JSON edit or a merge would pass the
       compiler and be invisible to the rail. */
    for (const k of Object.keys(SUBTABS)) {
      expect(SURVEY_TABS as readonly string[], `${k} is not a survey tab`).toContain(k)
    }
  })
})

describe('F5-1 — the filters, and what they are filters OF', () => {
  const src = (f: string) =>
    readFileSync(f, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')

  const COMMENTS = 'app/(app)/undersokelser/[id]/kommentarer/page.tsx'
  const TASKS = 'app/(app)/undersokelser/[id]/tiltak/page.tsx'
  const AUDIENCE = 'app/(app)/undersokelser/[id]/malgruppe/page.tsx'

  it('exactly three tabs have a rail, and the other five must not', () => {
    /* Stated in both directions, which is F3's lesson written into the phase
       that came after it: «these have one» is half a property, and the half
       that catches a mistake is «and the rest must not».

       It says THREE because F5-2 added `sporsmal`. Recorded rather than
       silently widened: this assertion failed when the read view shipped, which
       is the test doing its job — a rail appearing on a fourth tab without a
       phase behind it is exactly what it is for. */
    const RAILED = ['kommentarer', 'sporsmal', 'tiltak']
    const withRail = SURVEY_TABS.filter((t) => subTabsFor(t).length > 0)
    expect([...withRail].sort()).toEqual(RAILED)
    for (const t of SURVEY_TABS) {
      if (RAILED.includes(t)) continue
      expect(subTabsFor(t), `${t} grew a rail`).toHaveLength(0)
    }
  })

  it('malgruppe has no rail BECAUSE two of its three are refused', () => {
    /* A rail of one pill is not a rail. The reason it is one pill is the two
       refusals, so the two facts are asserted together — otherwise a later
       phase that un-refuses «Segmenter» leaves this tab railless for no
       recorded reason. */
    expect(subTabsFor('malgruppe')).toHaveLength(0)
    expect(REFUSED_KEYS).toContain('malgruppe/segmenter')
    expect(REFUSED_KEYS).toContain('malgruppe/levering')
    expect(bundleSubTabs()['malgruppe']).toEqual(['grupper', 'segmenter', 'levering'])
  })

  it('a filter only reads fields its page actually selects', () => {
    /* `law_ref` is the instance: the tasks page selected five columns and
       «Med hjemmel» is a fact about a sixth, so the filter would have matched
       NOTHING and looked like an empty result rather than a bug. */
    expect(src(TASKS)).toMatch(/\.select\('[^']*law_ref[^']*'\)/)
    expect(src(TASKS)).toMatch(/law_ref !== null/)
    expect(src(COMMENTS)).toMatch(/\.select\('[^']*handled_at[^']*'\)/)
    expect(src(COMMENTS)).toMatch(/handled_at === null/)
  })

  it('neither page turns a sub-tab into a second query', () => {
    /* One read, three views. Three round trips over nine rows would be three
       chances for the counts to disagree, and the bundle's own mechanism is a
       predicate (`commentsFiltered`, `tasksFiltered`). */
    for (const f of [COMMENTS, TASKS]) {
      const eqRoundFilters = [...src(f).matchAll(/\.in\('(round_id|source_round_id)'/g)]
      expect(eqRoundFilters.length, `${f} reads its list more than once`).toBe(1)
    }
  })

  it('the empty state names the FILTER when the screen is not empty', () => {
    /* «Ingen kommentarer ennå» under «Venter» is false when nine are handled.
       An empty view and an empty screen are different facts and the copy says
       which one it is. */
    for (const [f, keys] of [
      [COMMENTS, ['subEmptyVenter', 'subEmptyBesvart']],
      [TASKS, ['subEmptyHjemmel', 'subEmptyApne']],
    ] as const) {
      for (const k of keys) expect(src(f), `${f} lacks ${k}`).toContain(k)
      for (const [lang, set] of [['no', no], ['en', en]] as const) {
        for (const k of keys) {
          expect((set.surveys as Record<string, string>)[k], `${lang}: ${k}`).toBeTruthy()
        }
      }
    }
  })

  it('«Behandlet», never «Besvart» — handled_at has two writers', () => {
    /* `reply_to_comment` (M:0102) sets it WITH a reply and
       `set_comment_handled` (M:0101) sets it WITHOUT one, so «Besvart» is
       false on the second path. The row chip on this screen has said
       «Behandlet» since C4 and two words for one state is how one goes wrong.
       Asserted over the SHIPPED string, not over the registry. */
    expect((no.surveys as Record<string, string>).sub_kommentarer_besvart).toBe('Behandlet')
    expect((no.surveyComments as Record<string, string>).handled).toBe('Behandlet')
  })

  it('every page that has a rail mounts it, and malgruppe mounts the refusals', () => {
    expect(src(COMMENTS)).toContain('<SubTabRail')
    expect(src(TASKS)).toContain('<SubTabRail')
    expect(src(AUDIENCE)).toContain('<SubTabRefusals')
    // And the tab with no rail does not mount one.
    expect(src(AUDIENCE)).not.toContain('<SubTabRail')
  })
})

describe('F5-2 — the question read view, and the column it must not have', () => {
  const READ = 'app/(app)/undersokelser/[id]/sporsmal/page.tsx'
  const src = readFileSync(READ, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

  it('THE TEMA COLUMN IS NOT BUILT, and the screen says why', () => {
    /* v6:6959 is `theme: THEMES[i % THEMES.length]` over a six-item array —
       the drawing assigns a theme BY INDEX MODULO. `survey_questions` has no
       theme column and `theme_rules` is the free-text classifier, not a
       taxonomy. It is the column that would look MOST like real data, so it is
       refused ON the screen rather than quietly dropped. */
    expect(src).not.toMatch(/THEMES|\btheme\b/i)
    expect(src).toContain('qNoTheme')
    for (const [lang, set] of [['no', no], ['en', en]] as const) {
      expect((set.surveys as Record<string, string>).qNoTheme, lang).toBeTruthy()
    }
  })

  it('Besvart and Snitt come from aggregate_results, never from a table read', () => {
    /* Invariant 1: the client selects nothing from `responses` or `answers`.
       The only results path on this screen is the k-gated RPC, called ONCE for
       the whole survey rather than per question. */
    expect(src).toMatch(/\.rpc\('aggregate_results'/)
    expect(src).not.toMatch(/from\('(responses|answers)'\)/)
    expect([...src.matchAll(/\.rpc\('aggregate_results'/g)]).toHaveLength(1)
  })

  it('a refused cell renders the em dash, never a zero', () => {
    /* «Nobody answered» and «we may not say» are different claims, and only one
       of them is about the respondents. `insufficient_data` maps to null and
       null renders «—». */
    expect(src).toMatch(/insufficient_data \? null/)
    expect(src).toMatch(/n == null \? '—'/)
    expect(src).toMatch(/avg == null \? '—'/)
  })

  it('the filters read the REGISTRY, not the bundle’s label regex', () => {
    /* v6:7253 matches `/Skala|Likert|Smilefjes|NPS/` against the rendered
       label — an enumeration of the four strings its fixture produced. Ours
       asks `specOf(type).group`, so a sixth scale type needs no edit here. */
    expect(src).toMatch(/specOf\(/)
    expect(src).toMatch(/\.group\b/)
    expect(src).toMatch(/'skala'/)
    expect(src).toMatch(/'apne'/)
    expect(src).not.toMatch(/Likert\|/)
  })

  it('the question count is of ALL questions, not of the filtered view', () => {
    /* «3 spørsmål» under «Fritekst» on a survey of twelve is a fact about the
       filter wearing the survey's clothes — F1's population rule, one screen
       over. */
    expect(src).toMatch(/qCount', \{ n: rows\.length \}/)
    expect(src).toMatch(/shown\.map\(/)
  })

  it('the tab points at the read view and the builder stays its own route', () => {
    expect(TAB_SEGMENT.sporsmal).toBe('sporsmal')
    expect(src).toContain('qOpenBuilder')
    expect(src).toMatch(/\/bygg`/)
  })

  it('a leser is not offered the builder, which is the point of the split', () => {
    /* `bygg/page.tsx:208` renders `canEdit={viewer.role !== 'leser'}`, so the
       link would hand that role an editor with every control greyed out — the
       screen this view exists to spare them. */
    expect(src).toMatch(/viewer\.role === 'leser' \? null/)
  })

  it('/bygg still lights the Spørsmål pill, because it is that tab’s editor', () => {
    /* Without the alias the rail would mark NOTHING current while somebody is
       editing the questions — the same answer `/live` gets, and wrong for the
       opposite reason: /live genuinely has no pill and the builder has one. */
    const r = resolveSurveyPath('/undersokelser/11111111-2222-4333-8444-555555555555/bygg')
    expect(r?.tab).toBe('sporsmal')
  })
})

describe('F5-3 — resultat keeps its ONE screen, and says so four ways', () => {
  const RESULTS = 'app/(app)/undersokelser/[id]/resultater/page.tsx'
  const SCREEN = 'app/(app)/undersokelser/[id]/resultater/ResultsScreen.tsx'
  const strip = (f: string) =>
    readFileSync(f, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')

  it('resultat has NO rail — all six are answered without one', () => {
    expect(subTabsFor('resultat')).toHaveLength(0)
    /* And the four that needed saying are said. «Per spørsmål» and «Runder» are
       not refusals: they ARE this screen. */
    for (const k of ['matrise', 'sammenlign', 'fordeling', 'frisvar']) {
      expect(REFUSED_KEYS, `resultat/${k}`).toContain(`resultat/${k}`)
    }
    expect(REFUSED_KEYS).not.toContain('resultat/sporsmal')
    expect(REFUSED_KEYS).not.toContain('resultat/runder')
  })

  it('Fordeling and Frisvar are refused BECAUSE the card already holds them', () => {
    /* The load-bearing measurement: `ResultsScreen` opens one <section> per
       question and that card carries both the bars and the quotes. If either
       ever moves out of the per-question card, this refusal stops being true
       and the test that guards it fails. */
    const body = strip(SCREEN)
    const card = body.slice(body.indexOf('<section key={q.id}'))
    expect(card.slice(0, 3000)).toContain('QuoteList')
    expect(card.slice(0, 3000)).toContain('questionBars')
  })

  it('the matrix note points at the screen that already draws it', () => {
    /* `/dashboard` passes its survey array straight to `get_heatmap`, so
       `?u=<id>` IS the survey-scoped group x question matrix. Driven: it
       reports «1 undersøkelse» and two cells where the unscoped view has
       twenty-eight. A second entry point to one picture is what the rail rule
       refuses one floor up. */
    expect(strip(RESULTS)).toMatch(/\/dashboard\?u=\$\{survey\.id\}/)
    expect(strip(RESULTS)).toContain('resMatrixLink')
    /* G1 changed the ARGUMENT this is called with — the dashboard page now
       reads per panel SCOPE (`sc.survey_ids`) rather than from one page-level
       `selected`. The property this line is here to protect is «/dashboard is
       the screen that draws the matrix», so it asserts the CALL, not the
       spelling of its arguments. A guard pinned to an argument list fails on
       every refactor that keeps the property true, which is what it just did. */
    expect(strip('app/(app)/dashboard/page.tsx')).toMatch(/readHeatmap\(viewer\.orgId,/)
  })

  it('every resultat refusal has a sentence in both languages', () => {
    for (const k of REFUSED_KEYS.filter((x) => x.startsWith('resultat/'))) {
      for (const [lang, set] of [['no', no], ['en', en]] as const) {
        expect((set.surveys as Record<string, string>)[REFUSED[k]!], `${lang}: ${k}`).toBeTruthy()
      }
    }
  })
})

describe('F5-4 — the invitation preview IS the template', () => {
  const PREVIEW = 'app/(app)/undersokelser/[id]/send/InvitationPreview.tsx'
  const src = readFileSync(PREVIEW, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

  it('it calls the SAME function the worker calls, and stores nothing', () => {
    /* Two writers for one fact is the failure this shape avoids: a stored
       subject would keep showing what somebody saved after the template
       changed, so the preview would be wrong exactly when it mattered. */
    expect(src).toMatch(/invitationMessage\(\{/)
    expect(readFileSync('supabase/functions/mail-worker/index.ts', 'utf8')).toMatch(
      /invitationMessage\(\{/,
    )
  })

  it('`surveys` still has no subject, sender, purpose or body column', () => {
    /* The measurement that made the preview render the template rather than a
       row. Asserted over the generated types, so adding such a column fails
       here in the commit that adds it. */
    const types = readFileSync('types/database.ts', 'utf8')
    const surveys = types.slice(types.indexOf('surveys: {'), types.indexOf('surveys: {') + 2600)
    for (const col of ['invitation_subject', 'invitation_body', 'sender', 'purpose']) {
      expect(surveys, `surveys.${col} appeared`).not.toMatch(new RegExp(`\\b${col}\\b`))
    }
  })

  it('the origin is read from the environment and NEVER invented', () => {
    /* A host is a claim, not a specification — the `heituva.no` lesson. Where
       NEXT_PUBLIC_APP_URL is unset the preview says so instead of guessing a
       plausible domain, which is the easiest false thing to ship because it
       reads as a fact. */
    expect(src).toMatch(/process\.env\.NEXT_PUBLIC_APP_URL/)
    expect(src).toMatch(/invOriginMissing/)
    expect(src).not.toMatch(/heituva\.(no|com)/)
  })

  it('no real token is shown, and the placeholder says it is one', () => {
    expect(src).toMatch(/invTokenPlaceholder/)
    expect(src).toMatch(/invLinkNote/)
    for (const [lang, set] of [['no', no], ['en', en]] as const) {
      const ph = (set.surveys as Record<string, string>).invTokenPlaceholder!
      expect(ph, lang).toBeTruthy()
      // Not 32+ hex, i.e. not something a reader could mistake for a token.
      expect(ph, `${lang}: the placeholder looks like a token`).not.toMatch(/^[0-9a-f]{16,}$/i)
    }
  })

  it('the embedded question is refused, because our mail contains none', () => {
    /* `lib/mail/copy.ts` is greeting, one sentence, the link, the promise, the
       question route and the do-not-forward line. Drawing the «Derfor ligger
       spørsmålet i e-posten» card would explain a rule for a feature that does
       not exist — a false claim about the product, not a missing panel. */
    const copy = readFileSync('lib/mail/copy.ts', 'utf8')
    expect(copy).not.toMatch(/options|question_id|q1/)
    expect(src).toMatch(/invNoEmbeddedQuestion/)
  })

  it('utsending has no rail — four of its seven are already this screen', () => {
    expect(subTabsFor('utsending')).toHaveLength(0)
    expect(REFUSED_KEYS).toContain('utsending/leveranse')
    expect(REFUSED_KEYS).toContain('utsending/bolger')
    // Invitasjon is BUILT, so it must not be in the refusal list.
    expect(REFUSED_KEYS).not.toContain('utsending/invitasjon')
  })
})
