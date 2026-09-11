/**
 * HOW MUCH OF THE BUILDER DESCRIBES WHAT THE PRODUCT WILL NOT DO?
 *
 * The fidelity review measured statutory-vs-customer vocabulary and found 7 to
 * 0. This is the same measurement on a different axis, asked by Tor after the
 * Kjøremodus note was found telling an editor about two restrictions, neither
 * of which applied, before they had done anything.
 *
 * **The number that matters is not how many restrictions exist.** Some are real
 * and some are the product arguing with a dangerous setting, which is its job.
 * It is how many a person meets WITHOUT HAVING ASKED FOR ANYTHING — a screen
 * that opens by listing prohibitions is describing itself, not helping.
 *
 * So this reports two numbers, and the second is the one to watch.
 *
 *   npx tsx scripts/verify/builder-voice.ts
 */
import { readFileSync } from 'node:fs'

const no = JSON.parse(readFileSync('messages/no.json', 'utf8')).builder as Record<string, string>

const PANES = ['Builder', 'QuestionCard', 'RunModePanel', 'QuizPanel', 'PolicyPanel', 'EngagementPanel', 'PreviewPane']
const src = PANES.map((f) => readFileSync(`app/(app)/undersokelser/[id]/bygg/${f}.tsx`, 'utf8')).join('\n')

/** Rendered by the Builder, rather than merely present in the namespace. */
const rendered = Object.keys(no).filter((k) => new RegExp(`['"\`]${k}['"\`]`).test(src))

/** A sentence, not a label. «Quiz» and «Legg til» are neither promise nor prohibition. */
const isSentence = (v: string) => v.trim().length >= 28 && /\s/.test(v)

/**
 * HAND-CLASSIFIED, NOT PATTERN-MATCHED, AND THE FIRST ATTEMPT IS WHY.
 *
 * A marker regex over-collects badly here: «Ingen spørsmål ennå. Legg til ett»
 * is an empty state offering a next step, and «Ingen skjemafelt bryter
 * anonymiteten» is a checklist PASS — good news, matched as a prohibition.
 *
 * And one hit was the catalogue biting the measurement: `ready_policy`
 * («Terskel og målgruppe stemmer») matched `/må\b/`, because JavaScript's `\b`
 * is ASCII — «å» is a non-word character, so there is a boundary between «å»
 * and «l» INSIDE «målgruppe». That is D113/D116 exactly, in a script written to
 * count something else. Classification is a list because the property resists
 * a pattern, and the list is auditable in a way a regex is not.
 */
const RESTRICTIVE: Record<string, string> = {
  feedbackLinkOnly:
    'a link-or-QR survey has no thread — only when the survey has no invited round',
  readerNotice: 'a leser cannot edit — role reality, shown only to a leser',
  policyAnonNoteOrganisation: 'locked to named — only on an organisation survey',
  policyTwoText: 'the product arguing with threshold 2 — only at threshold 2',
  policyWarnTargetBelow: 'the result will never show — only when the group is under k',
  lockedNotice: 'sent, so questions are frozen — names the next step (copy as a new round)',
  quizInstantUnavailable: '«Ikke bygget» — Q84 absence-visible, inside QuizPanel',
  quizCertificateUnavailable: '«Ikke bygget» — Q84 absence-visible, inside QuizPanel',
  runModeNamedSurvey: 'live needs anonymous — NOW only after a refusal, was pre-emptive',
  quizPackLocked: 'the pack locks the mode — only when a statutory pack locks it',
  quizNotKeyable: 'this type cannot carry a key — only in quiz mode, on such a type',
}

/**
 * Of the restrictive ones, which reach a person who has asked for NOTHING —
 * a blank, anonymous, standard, unsent survey on the Generelt tab?
 */
/*
  C2 adds one, and it is classified RESTRICTIVE rather than left uncounted.

  `feedbackLinkOnly` says a link-or-QR survey has no thread to reply in. That is
  a limitation, so it belongs in the count — and the count is only worth
  anything if my own additions face it. It is NOT pre-emptive: it renders only
  when the survey actually has no invited round AND the mode is not `off`, which
  is the same gating `runModeNamedSurvey` earned after D153.

  The other five strings C2 adds — the section title, its description and the
  four mode descriptions — are enabling: they say what each setting GIVES you.
*/
const PREEMPTIVE: string[] = []

const sentences = rendered.filter((k) => isSentence(no[k]!))
const restrictive = sentences.filter((k) => k in RESTRICTIVE)
const unknown = Object.keys(RESTRICTIVE).filter((k) => !sentences.includes(k))

if (unknown.length) {
  console.error(`These are classified but no longer rendered as sentences: ${unknown.join(', ')}`)
  console.error('Re-classify rather than leaving an entry that suppresses nothing.')
  process.exit(1)
}

console.log(`Builder sentences rendered      ${sentences.length}`)
console.log(`  restrictive                   ${restrictive.length}  (${Math.round((restrictive.length / sentences.length) * 100)}%)`)
console.log(`  enabling / neutral            ${sentences.length - restrictive.length}`)
console.log(`\n  RESTRICTIVE AND PRE-EMPTIVE   ${PREEMPTIVE.length}   <- the one that matters`)
console.log('\nEvery restrictive sentence, and what gates it:')
for (const k of restrictive) console.log(`  ${k.padEnd(28)} ${RESTRICTIVE[k]}`)
