import { readFileSync, existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import no from '../../messages/no.json'
import en from '../../messages/en.json'

/**
 * T4 — v8's `packdetail`, built at `/bibliotek/[id]`.
 *
 * The assertion this file exists for is the FIRST one: a message key that does
 * not resolve renders as the raw key, `tsc` is happy, and `verify:i18n` cannot
 * see it either — it looks for Norwegian on an English page, and
 * «library.packColType» is neither. Tor found nine of those behind seventeen
 * green gates. So the keys are swept out of the source and looked up in both
 * message sets, which is the same shape `integrations.test.ts` settled on after
 * the registry defect.
 */
const PAGE = 'app/(app)/bibliotek/[id]/page.tsx'
const source = () => readFileSync(PAGE, 'utf8')
const code = () => source().replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const bag = (m: unknown, ns: string) =>
  (m as Record<string, Record<string, string>>)[ns] ?? {}

describe('T4 — the pack detail route', () => {
  it('exists at the path the library already owns', () => {
    // A path segment rather than a fourth `?fane=` value, because the library's
    // tabs are query parameters; and the uuid rather than `key`, because
    // `template_packs` is unique on (org_id, key) and a global pack may share a
    // key with an organisation's own.
    expect(existsSync(PAGE)).toBe(true)
    expect(code()).toContain(".eq('id', id)")
  })

  it.each(['no', 'en'])('every message key it reads resolves in %s', (lang) => {
    const messages = lang === 'no' ? no : en
    const src = code()
    const missing: string[] = []
    // `t` is the `library` namespace. `tQ` is `qtype` and is NOT swept here:
    // its argument is a question TYPE, which the registry owns and
    // `registry-strings.test.ts` already asserts in both languages.
    for (const m of src.matchAll(/\bt\('([^']+)'/g)) {
      const key = m[1]!
      if (!bag(messages, 'library')[key]) missing.push(`library.${key}`)
    }
    expect(missing, `unresolved in ${lang}`).toEqual([])
  })

  it('the library CARD provides the way in, and it is v8 own control', () => {
    // A route with no link is a route nobody can reach or measure. v8:4924
    // draws a bordered peek beside «Bruk mal» and calls `t.onPeek`; the first
    // version of this made the card TITLE a link instead, which needed
    // `touch-44` and then overlapped the admin controls by up to 93px² at
    // 320px. The control belongs in the action row, as drawn.
    const card = readFileSync('app/(app)/bibliotek/TemplateCard.tsx', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
    expect(card).toContain('/bibliotek/${pack.id}')
    expect(card).toContain('labels.peek')
    // The title is a heading again, not a control.
    expect(card).not.toMatch(/<h3[^>]*>\s*<Link/)
  })

  it('«Krav» is the BUILDER own expression, not a second opinion', () => {
    // `surveyQuestionFrom` resolves `required: q.required ?? false`. If this
    // screen decided it differently, a pack could read «Påkrevd» here and
    // materialise optional — two answers to one question, which is the shape
    // F3 found four implementations of.
    expect(code()).toContain('q.required ?? false')
    expect(readFileSync('lib/questions/pack.ts', 'utf8')).toContain('required: q.required ?? false')
  })

  it('does NOT build v8 manufactured purpose sentence', () => {
    // v8:7943 fabricates «Måler … og gir tall du kan følge fra runde til runde»
    // from the audience when its fixture has no purpose. There is no `purpose`
    // column, and the sentence asserts something untrue of a pack nobody runs
    // twice. The screen renders `audience` or nothing.
    const src = code()
    expect(src).not.toContain('runde til runde')
    expect(src).toContain('pack.audience')
  })

  it('reads and never writes — the copy claims that, so the code must hold it', () => {
    // «Lesevisning · ingenting opprettes før du trykker «Bruk mal»» is a claim
    // about what this route does. D221: a control whose COPY asserts a write it
    // does not perform is worse than one that does nothing. Here the claim is
    // the other way round, and it has to stay true.
    const src = code()
    expect(bag(no, 'library').packReadOnly).toContain('ingenting opprettes')
    for (const forbidden of ['.insert(', '.update(', '.delete(', '.upsert('])
      expect(src, `${forbidden} would falsify packReadOnly`).not.toContain(forbidden)
  })
})
