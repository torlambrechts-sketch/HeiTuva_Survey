import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import en from '../../messages/en.json'
import no from '../../messages/no.json'
import { SURVEY_TABS, TAB_SEGMENT } from '../../lib/surveys/tabs'
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

  it('kommentarer and tiltak are the ONLY tabs with a rail', () => {
    /* Stated in both directions, which is F3's lesson written into the phase
       that came after it: «these two have one» is half a property, and the
       half that catches a mistake is «and the other six must not». */
    const withRail = SURVEY_TABS.filter((t) => subTabsFor(t).length > 0)
    expect([...withRail].sort()).toEqual(['kommentarer', 'tiltak'])
    for (const t of SURVEY_TABS) {
      if (t === 'kommentarer' || t === 'tiltak') continue
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
