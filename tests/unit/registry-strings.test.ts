import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import no from '../../messages/no.json'
import en from '../../messages/en.json'

/**
 * DECISIONS Q48(b) — `duty_definitions` and `report_section_types` keep their
 * strings in next-intl, keyed by the registry key.
 *
 * The mechanism is the one V1-4 built for the dashboard's panel vocabulary and
 * this EXTENDS it rather than inventing an overlay: the registry holds KEYS,
 * next-intl holds STRINGS, and a test binds the two over the SET including the
 * converse — no string without a registry row.
 *
 * Why not the `ui_messages` overlay it was originally designed as: these
 * strings are OURS, not the customer's. `duty_definitions.law` is a statutory
 * reference, and a customer editing «Arbeidsmiljøloven § 4-3» would be editing
 * a legal citation. The overlay remains the right answer for a registry string
 * a customer must be able to rename, and DECISIONS.md records that it is
 * deferred rather than refuted.
 *
 * The keys are read from the MIGRATION and the SEED rather than the database,
 * so this stays a unit test — the same choice `dashboard-panels.test.ts` makes,
 * and for the same reason: the file that defines the set is the file to read.
 */
// The duties are SEEDED, not migrated — `supabase/seed.sql` is where the four
// rows are written. Found by the test failing on an empty set, which is what
// the parser guard below exists for.
const DUTY_SEED = 'supabase/seed.sql'
// Section types arrived across THREE migrations — the original ten, D88's
// `per_virksomhet`, and V1-5's `duties`. The set is the union, derived by
// reading all three rather than by naming twelve keys here: a fourth migration
// adding one must reach this test, and a hand-written list would not notice.
const SECTION_MIGRATIONS = [
  'supabase/migrations/20260904000006_report_templates.sql',
  'supabase/migrations/20260904000034_attributed_and_org_policy.sql',
  'supabase/migrations/20260907000047_panel_registry.sql',
]

function keysFrom(sql: string, table: string): string[] {
  // Every `('key', …` in an insert into the named table.
  const block = sql.slice(sql.indexOf(`insert into public.${table}`))
  const stop = block.indexOf(';')
  return [...(stop > 0 ? block.slice(0, stop) : block).matchAll(/\(\s*'([a-z_]+)'\s*,/g)].map(
    (m) => m[1]!,
  )
}

describe('(Q48b) the registries hold keys; next-intl holds the strings', () => {
  const dutyKeys = keysFrom(readFileSync(DUTY_SEED, 'utf8'), 'duty_definitions')
  const sectionKeys = SECTION_MIGRATIONS.flatMap((f) =>
    keysFrom(readFileSync(f, 'utf8'), 'report_section_types'),
  )

  it('the four statutory duties and the twelve section types are found', () => {
    // A guard on the parser: if a migration is reshaped and these come back
    // empty, every assertion below would pass over nothing.
    expect(dutyKeys.sort()).toEqual(['apenhet', 'arbeidsmiljo', 'likestilling', 'trakassering'])
    expect(new Set(sectionKeys).size, 'twelve section types').toBe(12)
  })

  it('every duty has a title AND a law in both languages', () => {
    for (const key of dutyKeys) {
      for (const [lang, msgs] of [['no', no], ['en', en]] as const) {
        const d = msgs.duty as Record<string, string | undefined>
        expect(d[`title_${key}`], `${lang}.duty.title_${key}`).toBeTruthy()
        expect(d[`law_${key}`], `${lang}.duty.law_${key}`).toBeTruthy()
      }
    }
  })

  it('every section type has a label in both languages', () => {
    for (const key of new Set(sectionKeys)) {
      for (const [lang, msgs] of [['no', no], ['en', en]] as const) {
        const s = msgs.section as Record<string, string | undefined>
        expect(s[`label_${key}`], `${lang}.section.label_${key}`).toBeTruthy()
      }
    }
  })

  it('THE CONVERSE: no string exists for a key no registry has', () => {
    // The half that catches a retired row leaving its copy behind — a name for
    // something nothing can render, which reads as reachable to whoever opens
    // the message file to find out what exists.
    const named = (prefix: string, ns: Record<string, string>) =>
      Object.keys(ns)
        .filter((k) => k.startsWith(prefix))
        .map((k) => k.slice(prefix.length))

    expect(named('title_', no.duty as Record<string, string>).sort()).toEqual([...dutyKeys].sort())
    expect(named('law_', no.duty as Record<string, string>).sort()).toEqual([...dutyKeys].sort())
    expect(named('label_', no.section as Record<string, string>).sort()).toEqual(
      [...new Set(sectionKeys)].sort(),
    )
  })

  it("a law reference is NOT translated — it is a citation, and that is deliberate", () => {
    // «Åpenhetsloven §§ 4–5» is the name of a Norwegian statute. Rendering it
    // as "Transparency Act §§ 4-5" in English would invent a citation that no
    // court, lawyer or auditor recognises. The English keys exist so the
    // binding above is total; their VALUES keep the Norwegian statute names,
    // and only the surrounding descriptions are translated.
    for (const key of dutyKeys) {
      const nb = (no.duty as Record<string, string>)[`law_${key}`]!
      const eng = (en.duty as Record<string, string>)[`law_${key}`]!
      const statute = nb.split('·')[0]!.trim()
      expect(eng, `en.duty.law_${key} keeps the Norwegian statute name`).toContain(statute)
    }
  })
})
