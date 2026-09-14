/**
 * F1-2 — «Slik behandles svaret ditt», the respondent's own disclosure
 * (`rlAnonOpen` / `rlAnonRows`, v6:5245-5259 and v6:10067-10075).
 *
 * ── WHY IT IS A MODULE AND NOT SIX LINES IN THE COMPONENT ──────────────────
 *
 * Same discipline as `anonymityPromise` one screen up, and for the same reason
 * Q17 gives: **a text that promises more than the setting holds is «den eneste
 * virkelige feilen i hele denne endringen».** Six rows, each one a CLAIM about
 * what the running product does, on the surface read by the person who was
 * promised anonymity. Which claim applies is decided here, from the survey's
 * own settings; the wording lives in `ui_messages` so it stays translatable and
 * editable without a deploy.
 *
 * ── WHERE THE BUNDLE IS WRONG, AND IT IS WRONG THREE TIMES ─────────────────
 *
 * 1. **«Svarene slettes automatisk etter 24 måneder»** (v6:10075). Q187: the
 *    column default is 12, the value is per-organisation
 *    (`check (retention_months in (0,6,12,24))`), and `retention_months = 0` or
 *    `auto_delete` off means nothing is ever deleted. Interpolated here, with
 *    «never» as its own claim carrying no duration at all — a caller cannot
 *    render a period it was not handed. `M:0121` is what gets the figure onto a
 *    surface that has no session.
 *
 * 2. **It branches `pol.anon === "anonymous"` and nothing else**, so a
 *    respondent on an OPTIONAL survey is told «Svarene dine og navnet ditt»
 *    before she has chosen. `anonymityPromise` already refuses that conflation
 *    one screen up; so does this.
 *
 * 3. **«Resultater vises først fra {threshold} svar»** is asserted for every
 *    survey, including one whose respondents are ORGANISATIONS. `app.k_for`
 *    returns 0 there — attributed under åpenhetsloven — so the sentence
 *    describes a gate that is not applied. The threshold comes from
 *    `kForMirror`, which `tests/db/k-for-mirror.test.ts` holds against the real
 *    function.
 *
 * ── AND TWO ROWS ARE NARROWED FROM THE DRAWING BECAUSE ITS VERSION IS NOT
 *    QUITE TRUE ───────────────────────────────────────────────────────────
 *
 * · «Påminnelser — sendes av systemet, ikke av lederen din» claims something
 *   about WHO acts, and a `redaktor` can in fact trigger a round of reminders
 *   from the Send screen. What is unconditionally true, and is what a
 *   respondent actually wants to know, is the SELECTION:
 *   `app.enqueue_reminders` reaches only invitations with `responded_at is
 *   null`. So the row states that.
 * · «Frisvar — vises anonymisert» is stated as the gate that exists:
 *   `get_quotes` strips the group label below the threshold. «Anonymised» is a
 *   process claim we do not perform; withholding the group is one we do.
 */
import { kForMirror } from '@/lib/surveys/retention'
import type { Retention } from '@/lib/surveys/retention'
import {
  numberWord,
  type AnonymityMode,
  type RespondentKind,
} from '@/lib/respondent/anonymity-promise'

export type SheetInput = {
  anonymity: AnonymityMode
  kThreshold: number
  respondentKind: RespondentKind
  retention: Retention
}

export type SheetRow = {
  labelKey: string
  valueKey: string
  values?: Record<string, string | number>
}

/**
 * Every key this module can return, for the copy test to sweep.
 *
 * Written as the union rather than as a list the test repeats: a seventh row or
 * a fourth anonymity mode cannot arrive without its copy, because the test
 * reads THIS and a key with no string fails there instead of rendering raw on a
 * respondent's screen.
 */
export const SHEET_KEYS = [
  'sheetTitle',
  'sheetOpen',
  'sheetClose',
  'sheetStoredLabel',
  'sheetStoredAnonymous',
  'sheetStoredOptional',
  'sheetStoredNamed',
  'sheetStoredOrg',
  'sheetWhoSeesLabel',
  'sheetWhoSeesAnonymous',
  'sheetWhoSeesOptional',
  'sheetWhoSeesNamed',
  'sheetWhoSeesOrg',
  'sheetThresholdLabel',
  'sheetThreshold',
  'sheetThresholdNone',
  'sheetRemindersLabel',
  'sheetReminders',
  'sheetFreeTextLabel',
  'sheetFreeText',
  'sheetFreeTextNamed',
  'sheetFreeTextOrg',
  'sheetRetentionLabel',
  'sheetRetentionMonths',
  'sheetRetentionForever',
] as const

export function anonymitySheet(input: SheetInput, locale = 'no'): SheetRow[] {
  const isOrg = input.respondentKind === 'organisation'
  /* The SAME mirror the analyst uses, and the one the db test holds against
     `app.k_for`. 0 means «no threshold is applied», which is a different claim
     from «the threshold is zero» and gets a different sentence. */
  const k = kForMirror({
    respondent_kind: input.respondentKind,
    k_threshold: input.kThreshold,
  })

  const stored = isOrg
    ? 'sheetStoredOrg'
    : input.anonymity === 'named'
      ? 'sheetStoredNamed'
      : input.anonymity === 'optional'
        ? 'sheetStoredOptional'
        : 'sheetStoredAnonymous'

  const whoSees = isOrg
    ? 'sheetWhoSeesOrg'
    : input.anonymity === 'named'
      ? 'sheetWhoSeesNamed'
      : input.anonymity === 'optional'
        ? 'sheetWhoSeesOptional'
        : 'sheetWhoSeesAnonymous'

  const freeText = isOrg
    ? 'sheetFreeTextOrg'
    : input.anonymity === 'named'
      ? 'sheetFreeTextNamed'
      : 'sheetFreeText'

  return [
    { labelKey: 'sheetStoredLabel', valueKey: stored },
    { labelKey: 'sheetWhoSeesLabel', valueKey: whoSees },
    k > 0
      ? {
          labelKey: 'sheetThresholdLabel',
          valueKey: 'sheetThreshold',
          values: { kWord: numberWord(k, locale) },
        }
      : { labelKey: 'sheetThresholdLabel', valueKey: 'sheetThresholdNone' },
    { labelKey: 'sheetRemindersLabel', valueKey: 'sheetReminders' },
    { labelKey: 'sheetFreeTextLabel', valueKey: freeText },
    input.retention.kept === 'months'
      ? {
          labelKey: 'sheetRetentionLabel',
          valueKey: 'sheetRetentionMonths',
          values: { n: input.retention.months },
        }
      : { labelKey: 'sheetRetentionLabel', valueKey: 'sheetRetentionForever' },
  ]
}
