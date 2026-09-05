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
 * Four promises, matching the design brief's §4 table:
 *   - promiseAnonymous     anonymous, threshold >= 5
 *   - promiseAnonymousLow  anonymous, threshold 3-4 (adds the recognisability caveat)
 *   - promiseNamed         named answers
 *   - promiseOrganisation  organisation respondents (attributed; anonymity/threshold irrelevant)
 */

export type AnonymityMode = 'anonymous' | 'named' | 'optional'
export type RespondentKind = 'person' | 'organisation'

export type PromiseInput = {
  anonymity: AnonymityMode
  kThreshold: number
  respondentKind: RespondentKind
}

export type Promise = {
  key: 'promiseAnonymous' | 'promiseAnonymousLow' | 'promiseNamed' | 'promiseOrganisation'
  values?: { kWord: string }
}

/** The threshold spelled as a word, in the respondent's own language — "minst
 *  fem", "at least five". Falls back to the digit for a value outside 3-10. */
const NUMBER_WORDS: Record<string, Record<number, string>> = {
  no: { 3: 'tre', 4: 'fire', 5: 'fem', 6: 'seks', 7: 'sju', 8: 'åtte', 9: 'ni', 10: 'ti' },
  en: { 3: 'three', 4: 'four', 5: 'five', 6: 'six', 7: 'seven', 8: 'eight', 9: 'nine', 10: 'ten' },
}

function numberWord(k: number, locale: string): string {
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
  return input.kThreshold < 5
    ? { key: 'promiseAnonymousLow', values }
    : { key: 'promiseAnonymous', values }
}
