import { describe, expect, it } from 'vitest'

/**
 * Q17 negative test #6 — "Respondentskjermens løftetekst samsvarer med
 * innstillingen — test alle fire kombinasjoner, inkludert at teksten endres
 * når terskelen gjør det."
 *
 * RED (Phase 8): `lib/respondent/anonymity-promise` does not exist yet. The
 * respondent screen's promise text must be DERIVED from the survey's settings
 * (docs/Q17_terskel_forslag.md, "Løftet genereres fra innstillingen") rather
 * than a fixed string — "en fast tekst som lover mer enn innstillingen holder,
 * er den eneste virkelige feilen i hele denne endringen." This function is the
 * derivation; the four literals live in ui_messages (no/en) so the copy stays
 * editable, and the rendered banner is asserted in the respondent browser check
 * during implementation. Here we prove the LOGIC: the four settings map to four
 * distinct promises, and the promise changes when the threshold does.
 *
 * The import is dynamic so this file still collects its six tests while the
 * module is absent — each fails on the missing module rather than the whole
 * file failing to load.
 *
 * The four combinations are the rows of the design brief's §4 table:
 * anonymous at 5, anonymous at 3, named, and organisation.
 */
const load = () => import('@/lib/respondent/anonymity-promise')

describe('(Q17 #6) the respondent promise is derived from the setting', () => {
  it('anonymous at threshold 5 → the "minst fem" promise', async () => {
    const { anonymityPromise } = await load()
    const p = anonymityPromise({ anonymity: 'anonymous', kThreshold: 5, respondentKind: 'person' })
    expect(p.key).toBe('promiseAnonymous')
    expect(p.values?.kWord).toBe('fem')
  })

  it('anonymous at threshold 3 → the low-threshold promise, with the recognisability caveat', async () => {
    const { anonymityPromise } = await load()
    const p = anonymityPromise({ anonymity: 'anonymous', kThreshold: 3, respondentKind: 'person' })
    expect(p.key).toBe('promiseAnonymousLow')
    expect(p.values?.kWord).toBe('tre')
  })

  it('the promise changes when the threshold does — 5 and 3 are not the same promise', async () => {
    const { anonymityPromise } = await load()
    const at5 = anonymityPromise({ anonymity: 'anonymous', kThreshold: 5, respondentKind: 'person' })
    const at3 = anonymityPromise({ anonymity: 'anonymous', kThreshold: 3, respondentKind: 'person' })
    expect(at5.key).not.toBe(at3.key)
  })

  it('named → the "vises med navnet ditt" promise, regardless of threshold', async () => {
    const { anonymityPromise } = await load()
    const p = anonymityPromise({ anonymity: 'named', kThreshold: 5, respondentKind: 'person' })
    expect(p.key).toBe('promiseNamed')
  })

  it('organisation → the attributed promise, and the threshold is irrelevant to it', async () => {
    const { anonymityPromise } = await load()
    const named = anonymityPromise({ anonymity: 'named', kThreshold: 5, respondentKind: 'organisation' })
    const anon = anonymityPromise({ anonymity: 'anonymous', kThreshold: 3, respondentKind: 'organisation' })
    expect(named.key).toBe('promiseOrganisation')
    // Organisation attribution wins over the anonymity/threshold pair: an
    // organisation respondent is never promised anonymity.
    expect(anon.key).toBe('promiseOrganisation')
  })

  it('spells the threshold as a Norwegian number word for every allowed value', async () => {
    const { anonymityPromise } = await load()
    // The design brief's threshold options are 3, 4, 5, 8, 10.
    const word = (k: number) =>
      anonymityPromise({ anonymity: 'anonymous', kThreshold: k, respondentKind: 'person' }).values?.kWord
    expect(word(3)).toBe('tre')
    expect(word(4)).toBe('fire')
    expect(word(5)).toBe('fem')
    expect(word(8)).toBe('åtte')
    expect(word(10)).toBe('ti')
  })
})

describe('«valgfritt» — the respondent chooses, so the promise has to cover both halves', () => {
  it('names the threshold, because an anonymous answer is still gated by it', async () => {
    const { anonymityPromise } = await load()
    // The old copy was a bare invitation to choose, which told the respondent
    // nothing about what happens if they DO stay anonymous. The v1 bundle's
    // own text carries the number (:2949, `choose:n =>`), and Q17 requires the
    // promise to change with the threshold or it lies.
    expect(
      anonymityPromise({ anonymity: 'optional', kThreshold: 5, respondentKind: 'person' }),
    ).toEqual({ key: 'promiseChoose', values: { kWord: 'fem' } })
  })

  it('carries the small-group caveat below five, exactly as the anonymous branch does', async () => {
    const { anonymityPromise } = await load()
    expect(
      anonymityPromise({ anonymity: 'optional', kThreshold: 3, respondentKind: 'person' }),
    ).toEqual({ key: 'promiseChooseLow', values: { kWord: 'tre' } })
  })

  it('is still overridden by an organisation respondent', async () => {
    const { anonymityPromise } = await load()
    // Attribution wins over every anonymity setting, «valgfritt» included —
    // otherwise a supplier could be offered a choice the survey cannot honour.
    expect(
      anonymityPromise({ anonymity: 'optional', kThreshold: 5, respondentKind: 'organisation' }),
    ).toEqual({ key: 'promiseOrganisation' })
  })
})

describe('Q91 — k=2 is its own tier, not the low-threshold caveat', () => {
  it('anonymous at 2 does NOT get the «gjenkjennelig» caveat', async () => {
    const { anonymityPromise } = await load()
    const p = anonymityPromise({ anonymity: 'anonymous', kThreshold: 2, respondentKind: 'person' })
    // The property at 2 is arithmetic, not recognisability. A promise saying an
    // answer "may be recognisable" when it can be DERIVED EXACTLY promises more
    // than the setting holds — Q17's one real error.
    expect(p.key).toBe('promiseAnonymousTwo')
    expect(p.key).not.toBe('promiseAnonymousLow')
  })

  it('optional at 2 likewise', async () => {
    const { anonymityPromise } = await load()
    expect(anonymityPromise({ anonymity: 'optional', kThreshold: 2, respondentKind: 'person' }).key).toBe(
      'promiseChooseTwo',
    )
  })

  it('3 still gets the low tier — the boundary is where Q91 put it', async () => {
    const { anonymityPromise } = await load()
    expect(anonymityPromise({ anonymity: 'anonymous', kThreshold: 3, respondentKind: 'person' }).key).toBe(
      'promiseAnonymousLow',
    )
  })

  it('an organisation survey at 0 is unaffected — attributed by design', async () => {
    const { anonymityPromise } = await load()
    expect(
      anonymityPromise({ anonymity: 'named', kThreshold: 0, respondentKind: 'organisation' }).key,
    ).toBe('promiseOrganisation')
  })
})

/**
 * T1.5 — the keys the selector can return must RESOLVE, in both languages.
 *
 * Everything above this point tests which key the derivation picks. Nothing
 * tested that the key names a string. The two are different failures: a wrong
 * key shows the respondent the wrong promise, a missing key shows them
 * «respondent.promiseChooseTwo», and only the first was guarded.
 *
 * `verify:i18n` cannot see any of them. `scripts/verify/i18n.ts:51` skips every
 * message carrying an ICU placeholder, and six of the eight interpolate
 * `{kWord}` — so the gate that exists for exactly this class of defect is blind
 * to three quarters of this family by construction. That is why the assertion
 * is here rather than left to it.
 *
 * The key set is obtained by DRIVING the selector across its whole input space,
 * so a ninth variant added to the union type joins it on its own and fails the
 * resolution checks if its string is missing. The first test then pins that set
 * against a written list — deliberately, and it is the one place here a list is
 * right: a variant that stops being reachable is invisible to a check that only
 * asks whether what it reached resolves.
 */
describe('T1.5 — every promise the selector can return resolves, per locale', () => {
  const reachable = async () => {
    const { anonymityPromise } = await load()
    const keys = new Set<string>()
    for (const anonymity of ['anonymous', 'named', 'optional'] as const)
      for (const respondentKind of ['person', 'organisation'] as const)
        for (let k = 0; k <= 10; k++)
          keys.add(anonymityPromise({ anonymity, kThreshold: k, respondentKind }).key)
    return keys
  }

  it('the reachable set is the eight variants — derived, not listed', async () => {
    const keys = await reachable()
    expect([...keys].sort()).toEqual([
      'promiseAnonymous',
      'promiseAnonymousLow',
      'promiseAnonymousTwo',
      'promiseChoose',
      'promiseChooseLow',
      'promiseChooseTwo',
      'promiseNamed',
      'promiseOrganisation',
    ])
  })

  // Per locale or it is not a comparison: `no` is the source language and `en`
  // is the one a translator can leave behind, so asserting the union of the two
  // would pass with every English string missing.
  it.each(['no', 'en'])('%s carries a non-empty string for each of them', async (lang) => {
    const keys = await reachable()
    const messages = (await import(`@/messages/${lang}.json`)).default as Record<
      string,
      Record<string, string>
    >
    const missing = [...keys].filter((k) => !messages.respondent?.[k]?.trim())
    expect(missing).toEqual([])
  })

  /**
   * And the placeholder has to be fed. `Respondent.tsx:299` passes
   * `p.values?.kWord ?? ''`, so a variant that interpolates `{kWord}` while the
   * selector returns no `values` renders «minst  har svart» — a sentence with a
   * hole in it, which no gate reads and which is not a missing key.
   */
  it.each(['no', 'en'])('%s: every string naming {kWord} is returned with one', async (lang) => {
    const { anonymityPromise } = await load()
    const messages = (await import(`@/messages/${lang}.json`)).default as Record<
      string,
      Record<string, string>
    >
    const holes: string[] = []
    for (const anonymity of ['anonymous', 'named', 'optional'] as const)
      for (const respondentKind of ['person', 'organisation'] as const)
        for (let k = 2; k <= 10; k++) {
          const p = anonymityPromise({ anonymity, kThreshold: k, respondentKind }, lang)
          const interpolates = (messages.respondent?.[p.key] ?? '').includes('{kWord}')
          if (interpolates && !p.values?.kWord) holes.push(`${p.key} at k=${k}`)
        }
    expect(holes).toEqual([])
  })
})
