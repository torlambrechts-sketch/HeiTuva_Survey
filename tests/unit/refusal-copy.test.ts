import { describe, expect, it } from 'vitest'
import en from '@/messages/en.json'
import no from '@/messages/no.json'

/**
 * A refusal must read identically whatever the data behind it is
 * (Tor, 2026-09-06, on D98).
 *
 * The point is not tidiness. A refusal message that varies with the data is an
 * ORACLE for the data: «0 av 5 virksomheter har svart» refused to a leser tells
 * them the count they were refused, and «for få svar — 3 av 5» tells a reader
 * exactly how far under the threshold a group is. The gate is only worth having
 * if what it says is the same on either side of it.
 *
 * The structural form of that property is: a refusal string carries no ICU
 * placeholder. A string with no `{…}` cannot vary, in any language, whatever
 * the caller passes. That is why this is asserted on the MESSAGE rather than by
 * rendering the screen twice — a render proves it for the two shapes the
 * fixture happened to have; the absence of a placeholder proves it for all of
 * them.
 *
 * The list is closed and named. A new refusal added without a line here is not
 * covered, which is the point of enumerating rather than pattern-matching on
 * key names: `insufficient` and `gatedCell` DO carry the threshold, deliberately
 * (Q17 — the promise is generated from the setting or it lies), and a rule that
 * guessed from the key would have to exempt them anyway.
 */
const INVARIANT_REFUSALS: [namespace: string, key: string][] = [
  // D98 — a leser opening an organisation survey.
  ['results', 'attribDeniedTitle'],
  ['results', 'attribDeniedBody'],
  // The results read failed. Says nothing about how much data there was.
  ['results', 'unavailable'],
  // Q30 — «Svar per virksomhet» refused to a share-link reader. The reason must
  // not name which sources were excluded; that would leak what it hides.
  ['reports', 'unavailablePersonSources'],
]

const bundles: [string, Record<string, Record<string, string>>][] = [
  ['no', no as never],
  ['en', en as never],
]

describe('a refusal reads the same whatever the data is', () => {
  for (const [namespace, key] of INVARIANT_REFUSALS) {
    for (const [lang, bundle] of bundles) {
      it(`${lang}: ${namespace}.${key} carries no placeholder`, () => {
        const value = bundle[namespace]?.[key]
        // Guarded on the message EXISTING — an absent key has no placeholder
        // either, and would pass this vacuously.
        expect(value, `${namespace}.${key} is missing from ${lang}.json`).toBeTruthy()
        expect(value).not.toMatch(/\{[^}]+\}/)
      })
    }
  }

  it('POSITIVE CONTROL: the threshold promise DOES vary, and must', () => {
    // Without this the assertion above would also pass if every message in the
    // product were a fixed string — including the ones Q17 requires to carry
    // the number, because a promise that does not track the setting lies.
    expect(no.results.insufficient).toMatch(/\{[^}]+\}/)
    expect(en.results.insufficient).toMatch(/\{[^}]+\}/)
  })
})
