import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { OPTION_KEYS, OPTION_ROWS, ENFORCED_KEYS, optionsOf, runModeAllowed } from '../../lib/org/options'

const no = JSON.parse(readFileSync('messages/no.json', 'utf8')) as Record<string, Record<string, string>>
const en = JSON.parse(readFileSync('messages/en.json', 'utf8')) as Record<string, Record<string, string>>

/**
 * G2 — «Alternativer» as a CLAIM SET.
 *
 * Every row of this panel is a promise about what the product does. Four of
 * them were false for four bundles and nobody could see it, because the switch
 * stored, audited and round-tripped its value perfectly (D208). So the copy is
 * asserted here rather than reviewed: a row that says «Av: X» must have an
 * enforcement point, and a row that has none must say so.
 */
describe('G2 — every switch has copy, in both languages', () => {
  it('1. label and description exist for every key, in no and en', () => {
    const missing: string[] = []
    for (const k of OPTION_KEYS) {
      const base = `o${k.replace(/(^|_)(\w)/g, (_, __, c: string) => c.toUpperCase())}`
      for (const [lang, m] of [['no', no], ['en', en]] as const) {
        if (!m.admin?.[base]) missing.push(`${lang}.admin.${base}`)
        if (!m.admin?.[`${base}Desc`]) missing.push(`${lang}.admin.${base}Desc`)
      }
    }
    expect(missing, 'a switch would render a raw key').toEqual([])
  })

  it('2. every UNENFORCED row has its notice, in both languages', () => {
    // The notice key is BUILT BY CONCATENATION from `why`, which is exactly the
    // shape that renders a raw key when it does not resolve — nine of those got
    // behind seventeen green gates once (I1-3). So it is resolved here.
    const missing: string[] = []
    for (const row of OPTION_ROWS) {
      if (row.enforcedAt !== null) continue
      const key = `oUnread_${row.why}`
      for (const [lang, m] of [['no', no], ['en', en]] as const) {
        if (!m.admin?.[key]) missing.push(`${lang}.admin.${key}`)
      }
    }
    expect(missing, 'an unenforced switch would say nothing, or say a key').toEqual([])
  })

  it('3. the four enforced-by-G2 rows say what OFF does, in both languages', () => {
    // Tor's rule: «say what each toggle does when off». Asserted as a property
    // of the STRING rather than reviewed once — a later copy edit that drops the
    // clause fails here.
    for (const k of ['tuva', 'quiz', 'live', 'klarsprak'] as const) {
      const base = `o${k[0]!.toUpperCase()}${k.slice(1)}Desc`
      expect(no.admin![base], `no.${base} must say what off does`).toMatch(/\bAv:/)
      expect(en.admin![base], `en.${base} must say what off does`).toMatch(/\bOff:/)
    }
  })

  it('4. and the klarspråk row states the boundary it does NOT cross', () => {
    // `policyWarnings` carries the threshold and anonymity warnings, and
    // CLAUDE.md forbids making a security warning org-configurable. A reader of
    // the switch has to be able to tell that it does not silence those.
    expect(no.admin!.oKlarsprakDesc).toMatch(/terskel og anonymitet/)
    expect(en.admin!.oKlarsprakDesc).toMatch(/threshold and anonymity/)
  })
})

describe('G2 — the registry is the one statement of the set', () => {
  it('5. ENFORCED_KEYS is derived, and it is exactly the five with a reader', () => {
    expect([...ENFORCED_KEYS].sort()).toEqual(['klarsprak', 'live', 'quiz', 'sso', 'tuva'])
    expect(ENFORCED_KEYS.length + OPTION_ROWS.filter((r) => r.enforcedAt === null).length)
      .toBe(OPTION_KEYS.length)
  })

  it('6. an absent key reads as OFF — which is why M:0124 backfills', () => {
    // The reader's rule, stated once here so the migration's necessity is
    // provable rather than argued: adding a key without a default and a
    // backfill silently disables a shipped feature for every organisation.
    const none = optionsOf({})
    expect(Object.values(none).every((v) => v === false)).toBe(true)
    expect(optionsOf({ tuva: true }).tuva).toBe(true)
    expect(optionsOf(null).quiz).toBe(false)
  })

  it('7. standard is not a setting and cannot become one', () => {
    expect(runModeAllowed('standard', {})).toBe(true)
    expect(runModeAllowed('standard', { standard: false })).toBe(true)
    expect(OPTION_KEYS as readonly string[]).not.toContain('standard')
  })

  it('8. and no key is spelled twice — the Zod enum and the panel both derive', () => {
    // F3's `responsePct` shape: one rule, four implementations, three agreeing
    // by luck. Before G2 the set was written out in `keys.ts`, in a Zod enum in
    // `actions.ts`, and in the column default. The first two are one now.
    const actions = readFileSync('app/(app)/administrasjon/actions.ts', 'utf8')
    expect(actions, 'the Zod boundary re-spells the key set').not.toMatch(
      /z\.enum\(\[\s*'reminders'/,
    )
    expect(actions).toMatch(/z\.enum\(OPTION_KEYS\)/)
    const panel = readFileSync('app/(app)/administrasjon/OptionsPanel.tsx', 'utf8')
    expect(panel).toMatch(/const ROW_ORDER = OPTION_KEYS/)
  })
})
