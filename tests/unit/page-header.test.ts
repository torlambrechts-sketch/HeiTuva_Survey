import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  participationChip,
  participationLabelKey,
  rateOf,
  type RateRow,
} from '../../lib/surveys/participation'

/**
 * F3 — the «På tvers» card may not re-open F1's defect.
 *
 * The bundle has it twice: `crossStats` (v6:9131) and `insStats` (v6:8238) both
 * compute `sum(responses) / sum(target || 30)`, giving a survey with no
 * recipient count an INVENTED denominator of thirty. Four screens were about to
 * be built from those lines.
 */
const r = (id: string, responses: number, target: number | null): RateRow => ({ id, responses, target })

/** The four screens v6 draws the band on (v6:2130, 2476, 2800, 4619). */
const SCREENS: Record<string, string> = {
  'app/(app)/undersokelser/page.tsx': 'Undersøkelser',
  'app/(app)/dashboard/DashboardScreen.tsx': 'Innsikt',
  'app/(app)/rapporter/ReportsScreen.tsx': 'Rapporter',
  'app/(app)/bibliotek/page.tsx': 'Bibliotek',
}

describe('F3 — the shared card states its population', () => {
  it('the drawing’s «|| 30» is nowhere in our source', () => {
    /* The property, not the instance: nothing may supply a denominator for a
       survey that has none. Asserted over the two modules that could. */
    for (const f of ['lib/surveys/participation.ts', 'components/PageHeader.tsx']) {
      const code = readFileSync(f, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')
      expect(code, `${f} invents a denominator`).not.toMatch(/target\s*\|\|/)
      expect(code, `${f} invents a denominator`).not.toMatch(/target\s*\?\?\s*\d/)
    }
  })

  it('a row with no recipient count is in NEITHER half', () => {
    const m = rateOf([r('a', 5, 10), r('b', 40, null)])
    expect(m).toEqual({ ids: ['a'], responses: 5, target: 10, pct: 50 })
  })

  it('the label carries the population exactly when it is a subset', () => {
    expect(participationLabelKey(rateOf([r('a', 5, 10)]), 1)).toBe('rateAll')
    expect(participationLabelKey(rateOf([r('a', 5, 10), r('b', 40, null)]), 2)).toBe('rateSome')
    expect(participationLabelKey(rateOf([r('b', 40, null)]), 1)).toBe('rateNone')
  })

  it('«rateNone» means NO CHIP — not a chip saying nothing', () => {
    /* A «0 %» or a «—» there is a fabricated value in the never-fabricate
       sense: indistinguishable from a real zero in a screenshot. Asserted over
       the resolver rather than over the component's source, so the property
       survives a refactor that a grep for a spelling would not. */
    const label = (k: string, m: number) => `${k}:${m}`
    expect(participationChip(undefined, label)).toBeNull()
    expect(participationChip({ measured: rateOf([r('b', 40, null)]), total: 1 }, label)).toBeNull()
    expect(participationChip({ measured: rateOf([r('a', 5, 10)]), total: 1 }, label)).toEqual({
      value: '50 %',
      label: 'rateAll:1',
    })
    expect(
      participationChip({ measured: rateOf([r('a', 5, 10), r('b', 40, null)]), total: 2 }, label),
    ).toEqual({ value: '50 %', label: 'rateSome:1' })
  })

  it('the screen hands over ROWS, never a percentage', () => {
    /* The seam that makes the rule unbreakable per screen: `PageHeader`'s
       participation prop is `{ measured, total }`, and there is no `pct` for a
       caller to pass. */
    const src = readFileSync('components/PageHeader.tsx', 'utf8')
    expect(src).toMatch(/participation\?:\s*\{\s*measured: Measured \| null; total: number \}/)
  })

  it('both labels resolve in both languages, and only the subset one names it', () => {
    for (const lang of ['no', 'en']) {
      const m = JSON.parse(readFileSync(`messages/${lang}.json`, 'utf8')).pageHeader as Record<string, string>
      for (const k of ['cross', 'crossLabel', 'rateAll', 'rateSome']) {
        expect(m[k], `${lang}.pageHeader.${k}`).toBeTruthy()
      }
      expect(m.rateSome, `${lang}.rateSome`).toContain('{m}')
      expect(m.rateAll, `${lang}.rateAll`).not.toContain('{m}')
    }
  })

  it('the band is on ALL FOUR screens v6 draws it on, each with the card', () => {
    /* The audit's measurement was `grep -rn 'På tvers\\|crossStats\\|insStats' app/
       messages/` returning ZERO — one surface drawn four times and built on
       none. This is that measurement inverted: a screen may not keep the band
       and drop the card, and a fifth screen gaining one is a visible edit. */
    for (const [f, name] of Object.entries(SCREENS)) {
      const src = readFileSync(f, 'utf8')
      expect(src, `${name} does not import the band`).toMatch(
        /import \{[^}]*PageHeader[^}]*\} from '@\/components\/PageHeader'/,
      )
      expect(src, `${name} draws the band without the card`).toMatch(/cross=\{\{/)
    }
  })

  it('THREE of the four place the rate — Bibliotek draws none, and may not', () => {
    /* **This test asserted four, and the fourth was wrong.** `libStats`
       (v6:9573) is `maler · lovpålagte · spørsmål i banken · egne maler`: no
       participation chip, correctly, because a template library has no
       respondents. «All four» was an enumeration of the three that do, read as
       a property of the band — in the phase whose subject is that shape, in a
       test written to guard it.

       So the property is stated in both directions. The three that show a rate
       place it as the TOKEN, so the number and the label stay the component's;
       Bibliotek must place none, so a later phase cannot invent a percentage
       over template packs by copying the screen beside it. */
    for (const [f, name] of Object.entries(SCREENS)) {
      const src = readFileSync(f, 'utf8')
      if (name === 'Bibliotek') {
        expect(src, 'Bibliotek grew a participation chip').not.toContain('PARTICIPATION')
      } else {
        expect(src, `${name} does not place the participation chip`).toContain('PARTICIPATION')
      }
    }
  })

  it('the row rate and the headline rate have ONE definition each', () => {
    /* F1's rule one level down. `responsePct` sat in
       `app/(app)/undersokelser/keys.ts` with NO caller while two comments cited
       it as «the treatment every row gets», and the list had a third copy
       inline. Measured with
       `grep -rn responsePct . --include=*.ts --include=*.tsx`: its own
       definition and two mentions in prose.

       Asserted as «nothing outside this module divides responses by target»,
       which is the property; the spellings that were live are just what it
       happened to catch. */
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.name === 'node_modules'
          ? []
          : e.isDirectory()
            ? walk(`${dir}/${e.name}`)
            : /\.tsx?$/.test(e.name)
              ? [`${dir}/${e.name}`]
              : [],
      )
    const offenders = ['app', 'components', 'lib']
      .flatMap(walk)
      .filter((f) => f !== 'lib/surveys/participation.ts')
      .filter((f) => {
        const code = readFileSync(f, 'utf8')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/^\s*\/\/.*$/gm, '')
        return /responses?[A-Za-z]*\s*\/\s*[A-Za-z.]*target/i.test(code)
      })
    expect(offenders, 'a second definition of the response rate').toEqual([])
  })
})
