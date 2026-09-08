import { describe, expect, it } from 'vitest'
import no from '@/messages/no.json'
import {
  THRESHOLD_CAVEAT_BELOW,
  THRESHOLD_FLOOR,
  thresholdTier,
} from '@/lib/questions/threshold-tier'
import { anonymityPromise } from '@/lib/respondent/anonymity-promise'

/**
 * DECISIONS Q91 — 2 is its own tier, and three surfaces have to agree where it
 * begins.
 *
 * The defect this exists to prevent is the one the fix pass actually found, not
 * one imagined for a test: `anonymityPromise` was CORRECT and still wrong at 2,
 * because 2 fell into the `< 5` branch whose caveat is «I små grupper kan svar
 * likevel være gjenkjennelige». The function did what it was written to do. The
 * boundary was in the wrong place, in one of three copies of it.
 *
 * So the assertions below are about the BOUNDARY rather than about any one
 * caller's output — a test per caller would have passed on all three copies
 * while they disagreed.
 */
describe('the tier boundary', () => {
  it('puts the floor itself in the «two» tier', () => {
    expect(thresholdTier(THRESHOLD_FLOOR)).toBe('two')
  })

  it('puts the value one above the floor in «low», not «two»', () => {
    // 3 is where the caveat is honest: you learn the sum of two others without
    // learning which said which. Different in kind from 2, not in degree.
    expect(thresholdTier(THRESHOLD_FLOOR + 1)).toBe('low')
  })

  it('fails toward the STRONGER warning below the floor, not past it', () => {
    // The CHECK refuses 1, so this is unreachable through the UI. That is the
    // reason to assert it: an impossible value that lands in `low` would carry
    // the softer promise, and nothing else would notice.
    expect(thresholdTier(1)).toBe('two')
    expect(thresholdTier(0)).toBe('two')
  })

  it('drops the caveat at the caveat boundary and not before', () => {
    expect(thresholdTier(THRESHOLD_CAVEAT_BELOW - 1)).toBe('low')
    expect(thresholdTier(THRESHOLD_CAVEAT_BELOW)).toBe('none')
  })

  it('agrees with the CHECK constraint the migration writes', () => {
    // M:0055 is `k_threshold >= 2 or respondent_kind = 'organisation'`. If
    // someone moves the floor again, this fails here rather than in copy.
    expect(THRESHOLD_FLOOR).toBe(2)
  })
})

describe('the promise is bound to that boundary, not to its own copy of it', () => {
  const at = (k: number) =>
    anonymityPromise({ anonymity: 'anonymous', kThreshold: k, respondentKind: 'person' }).key

  it('uses a distinct key for every tier', () => {
    const keys = [at(2), at(3), at(5)]
    expect(new Set(keys).size).toBe(3)
  })

  it('changes key exactly where thresholdTier changes tier, across the whole range', () => {
    // Derived rather than enumerated: the promise's key must be a function of
    // the tier for every value the picker can produce, so a fourth branch added
    // to one and not the other fails here.
    const byTier = new Map<string, Set<string>>()
    for (let k = 1; k <= 12; k++) {
      const tier = thresholdTier(k)
      if (!byTier.has(tier)) byTier.set(tier, new Set())
      byTier.get(tier)!.add(at(k))
    }
    for (const [tier, keys] of byTier) expect([tier, keys.size]).toEqual([tier, 1])
  })

  it('«valgfritt» carries the same boundary as the anonymous branch', () => {
    const opt = (k: number) =>
      thresholdTier(k) ===
      thresholdTier(
        // the tier implied by which key «optional» produced
        anonymityPromise({ anonymity: 'optional', kThreshold: k, respondentKind: 'person' }).key ===
          'promiseChooseTwo'
          ? 2
          : anonymityPromise({ anonymity: 'optional', kThreshold: k, respondentKind: 'person' })
                .key === 'promiseChooseLow'
            ? 3
            : 5,
      )
    for (let k = 1; k <= 12; k++) expect([k, opt(k)]).toEqual([k, true])
  })
})

describe('the «two» copy states the arithmetic, not recognisability', () => {
  /**
   * Q91, verbatim: «Med terskel 2 kan den som svarer regne seg fram til hva den
   * andre svarte» — NOT «kan være gjenkjennelig». Asserted on the strings
   * because the wording IS the decision here: a softer synonym passes every
   * structural check and breaks the promise.
   */
  const strings = [
    (no as never as Record<string, Record<string, string>>).admin!.thresholdTwoWarning!,
    (no as never as Record<string, Record<string, string>>).builder!.policyTwoText!,
    (no as never as Record<string, Record<string, string>>).respondent!.promiseAnonymousTwo!,
    (no as never as Record<string, Record<string, string>>).respondent!.promiseChooseTwo!,
    // The fourth surface, added after the catalogue sweep found it. The Results
    // screen carried its own `k < 5` and therefore had no «two» tier at all: at
    // k=2 it rendered `thresholdLineLow`, «små grupper kan være
    // gjenkjennelige». Same defect as the respondent promise, different screen,
    // and it survived the phase that fixed the promise.
    (no as never as Record<string, Record<string, string>>).results!.thresholdLineTwo!,
  ]

  it('every «two» string says the other respondent can WORK IT OUT', () => {
    for (const s of strings) expect([s.slice(0, 40), /regne seg fram/.test(s)]).toEqual([
      s.slice(0, 40),
      true,
    ])
  })

  it('no «two» string uses the softer «gjenkjennelig» caveat', () => {
    // That word belongs to the `low` tier and is false at 2.
    for (const s of strings) expect([s.slice(0, 40), /gjenkjennelig/.test(s)]).toEqual([
      s.slice(0, 40),
      false,
    ])
  })

  it('every «two» string exists — a missing key would pass both checks above', () => {
    // `undefined` matches neither regex, so a surface that never got its «two»
    // copy would slip through the two assertions above in silence. That is how
    // the Results line went unnoticed for a phase.
    for (const s of strings) expect(typeof s).toBe('string')
  })

  it('the «low» tier still uses it, so the two tiers are actually different copy', () => {
    // A positive control: if `low` lost the caveat too, the assertion above
    // would pass while the tiers said the same thing.
    const low = (no as never as Record<string, Record<string, string>>).respondent!
      .promiseAnonymousLow!
    expect(/gjenkjennelig/.test(low)).toBe(true)
  })

  it('the admin and builder tiers both offer «Med navn» as the alternative', () => {
    // Q91 requires the honest alternative «in the same breath», not in a help
    // article. Both settings surfaces say it; the respondent surfaces do not,
    // because a respondent cannot change the mode.
    const admin = (no as never as Record<string, Record<string, string>>).admin!
      .thresholdTwoAlternative!
    const builder = (no as never as Record<string, Record<string, string>>).builder!.policyTwoText!
    expect(/Med navn/.test(admin)).toBe(true)
    expect(/Med navn/.test(builder)).toBe(true)
  })
})
