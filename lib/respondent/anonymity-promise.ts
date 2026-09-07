/**
 * The respondent's promise, derived from the survey's settings (Q17,
 * docs/Q17_terskel_forslag.md: "Løftet genereres fra innstillingen").
 *
 * The banner on /s/[token] must never be fixed copy: a text that promises more
 * than the setting holds is, in the proposal's words, "den eneste virkelige
 * feilen i hele denne endringen". This function turns (anonymity, threshold,
 * respondent type) into a message KEY plus the values that key interpolates.
 * The literals live in ui_messages under the `promise` namespace, so the wording
 * stays editable and translatable; this module owns only which promise applies.
 *
 * Promises, matching the design brief's §4 table plus DECISIONS Q91's tier:
 *   - promiseAnonymous     anonymous, threshold >= 5
 *   - promiseAnonymousLow  anonymous, threshold 3-4 (adds the recognisability caveat)
 *   - promiseAnonymousTwo  anonymous, threshold 2 — SEE BELOW
 *   - promiseNamed         named answers
 *   - promiseOrganisation  organisation respondents (attributed; anonymity/threshold irrelevant)
 *
 * ── WHY 2 NEEDS ITS OWN TIER (Q91) ──────────────────────────────────────────
 *
 * Verified at 2 specifically rather than assumed to follow: before this, k=2
 * fell into `promiseAnonymousLow`, whose caveat is «I små grupper kan svar
 * likevel være gjenkjennelige». That is the softer version of the property and
 * it is WRONG at 2 — the other respondent knows their own answer, sees the
 * aggregate and SUBTRACTS. They do not "recognise" the answer, they COMPUTE it.
 * Telling a respondent their answer may be recognisable, when it can be derived
 * exactly, is the class of error Q17 calls «den eneste virkelige feilen i hele
 * denne endringen»: a text promising more than the setting holds.
 */

import { thresholdTier } from '@/lib/questions/threshold-tier'

export type AnonymityMode = 'anonymous' | 'named' | 'optional'
export type RespondentKind = 'person' | 'organisation'

export type PromiseInput = {
  anonymity: AnonymityMode
  kThreshold: number
  respondentKind: RespondentKind
}

export type Promise = {
  key:
    | 'promiseAnonymous'
    | 'promiseAnonymousLow'
    | 'promiseAnonymousTwo'
    | 'promiseChoose'
    | 'promiseChooseLow'
    | 'promiseChooseTwo'
    | 'promiseNamed'
    | 'promiseOrganisation'
  values?: { kWord: string }
}

/** The threshold spelled as a word, in the respondent's own language — "minst
 *  fem", "at least five". Falls back to the digit for a value outside 2-10.
 *  2 is in the map since Q91 moved the floor there — without it the tier that
 *  exists BECAUSE 2 is different would have rendered «satt til 2». */
const NUMBER_WORDS: Record<string, Record<number, string>> = {
  no: { 2: 'to', 3: 'tre', 4: 'fire', 5: 'fem', 6: 'seks', 7: 'sju', 8: 'åtte', 9: 'ni', 10: 'ti' },
  en: { 2: 'two', 3: 'three', 4: 'four', 5: 'five', 6: 'six', 7: 'seven', 8: 'eight', 9: 'nine', 10: 'ten' },
}

export function numberWord(k: number, locale: string): string {
  return NUMBER_WORDS[locale]?.[k] ?? NUMBER_WORDS.no![k] ?? String(k)
}

/**
 * `locale` defaults to Norwegian, the source language: the model is
 * locale-agnostic, but the number word it carries is not, so the caller passes
 * the respondent's language when it renders.
 */
export function anonymityPromise(input: PromiseInput, locale = 'no'): Promise {
  // Organisation respondents are attributed. This wins over anonymity and the
  // threshold both — an organisation respondent is never promised anonymity.
  if (input.respondentKind === 'organisation') return { key: 'promiseOrganisation' }

  if (input.anonymity === 'named') return { key: 'promiseNamed' }

  // Anonymous (and the anonymous side of "optional"): the promise is the
  // threshold, and it changes when the threshold does. Below 5 the small-group
  // caveat is not decoration — it is the difference between an honest promise
  // and a dishonest one.
  const values = { kWord: numberWord(input.kThreshold, locale) }

  // «Valgfritt» is not a third promise — it is the anonymous one with the choice
  // named. A respondent who stays anonymous is gated by exactly the same
  // threshold, so the sentence has to carry the same number and the same
  // small-group caveat (v1 bundle :2949, `choose:n =>`). The old copy was a
  // bare invitation to choose, which said nothing about what choosing anonymity
  // would actually get them.
  const tier = thresholdTier(input.kThreshold)

  if (input.anonymity === 'optional') {
    if (tier === 'two') return { key: 'promiseChooseTwo', values }
    return tier === 'low' ? { key: 'promiseChooseLow', values } : { key: 'promiseChoose', values }
  }

  // Q91: 2 is its own tier, decided BEFORE the <5 branch it would otherwise
  // fall into. `thresholdTier` owns that order so the builder and the
  // Personvern panel cannot draw the line anywhere else.
  if (tier === 'two') return { key: 'promiseAnonymousTwo', values }
  return tier === 'low' ? { key: 'promiseAnonymousLow', values } : { key: 'promiseAnonymous', values }
}
