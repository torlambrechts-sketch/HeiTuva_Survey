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
