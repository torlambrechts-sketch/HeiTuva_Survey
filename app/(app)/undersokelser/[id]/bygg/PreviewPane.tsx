'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { estimatedMinutes } from '@/lib/questions/registry'
import type { DraftQuestion } from './types'

/** The faces the design renders for a smiley scale (L:3983). */
const SMILEYS = ['☹', '🙁', '😐', '🙂', '😀']

/**
 * The chips one question shows in the phone preview.
 *
 * Keyed off the type, but returning data rather than markup — the respondent
 * renderer in Phase 3 needs the same answer, and this is the shape it will
 * read. Anything without a fixed set of choices previews as a single chip
 * standing in for the input.
 */
function previewChips(
  q: DraftQuestion,
  answerPlaceholder: string,
  yes: string,
  no: string,
): string[] {
  const c = q.config
  switch (q.type) {
    case 'scale':
      return Array.from({ length: c.points ?? 5 }, (_, i) => String(i + 1))
    case 'likert':
      return c.labels ?? []
    case 'smiley':
      return (c.labels ?? []).map((label, i) => SMILEYS[i] ?? label)
    case 'enps':
      return Array.from({ length: 11 }, (_, i) => String(i))
    case 'yesno':
      return [yes, no]
    case 'choice':
    case 'dropdown':
    case 'image':
    case 'ranking':
      return c.options ?? []
    case 'matrix':
      return (c.statements ?? []).slice(0, 3)
    case 'slider':
      return [`${c.low_label || '0'} ⟵ ● ⟶ ${c.high_label || '100'}`]
    case 'field':
      return (c.fields ?? []).map(([label]) => label)
    case 'text':
    default:
      return [answerPlaceholder]
  }
}

/**
 * "Slik ser respondenten det" (L:650-680).
 *
 * A static rendering, not a working respondent flow — that is Phase 3 at
 * /s/[token], where the real one is mobile-first and pixel-perfect against the
 * design's respondent screens.
 */
export function PreviewPane({
  title,
  questions,
  surveyId,
  canTest,
  quizMode,
  timeBonus,
}: {
  title: string
  questions: DraftQuestion[]
  /** V2-7 — «Test undersøkelsen» (V2:894) needs the survey it opens. */
  surveyId: string
  /**
   * A preview needs a round to test against, so the CTA is only offered on a
   * survey that has been sent. Offering it on a draft would be an action the
   * database refuses — the same rule the Oppgaver advance button follows.
   */
  canTest: boolean
  /** B1 — `surveys.run_mode = 'quiz'` (V2:899, V2:6506). */
  quizMode: boolean
  /** B1 — the persisted quiz setting, for the timer line (V2:6524). */
  timeBonus: boolean
}) {
  const t = useTranslations('builder')
  const tr = useTranslations('respondent')

  return (
    <div
      className="sticky top-0 rounded-2xl border border-line p-5"
      style={{ background: 'var(--sf2)' }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-[11px] uppercase tracking-[.1em] text-mut">{t('previewTitle')}</div>
        {canTest ? (
          // V2:894. «Svarene lagres ikke» is the banner's promise on the other
          // side of this link, and `p_dry_run` is what makes it true.
          <Link
            href={`/undersokelser/${surveyId}/test`}
            className="touch-44 cursor-pointer whitespace-nowrap rounded-[9px] border-none bg-ac px-[15px] py-[9px] text-[12.5px] font-bold text-ink no-underline"
          >
            ▷ {t('testCta')}
          </Link>
        ) : null}
      </div>
      {canTest ? <p className="mt-1.5 text-[12px] leading-[1.5] text-mut">{t('testHint')}</p> : null}
      <div
        className="mx-auto mt-3 w-full max-w-[300px] rounded-[34px] px-3 pb-[18px] pt-[14px]"
        style={{ background: 'var(--ink)', boxShadow: '0 18px 40px rgba(25,21,16,.18)' }}
      >
        <div
          className="mx-auto mb-3 h-[6px] w-24 rounded-[3px]"
          style={{ background: 'rgba(255,255,255,.25)' }}
        />
        <div className="min-h-[420px] rounded-[22px] bg-bg px-4 py-[18px]">
          {quizMode ? (
            /* V2:900-905. The bundle's `timer` reads «20 sek · tidsbonus» when
               the bonus is on. THERE IS NO CONFIGURED TIME LIMIT ANYWHERE IN THE
               SCHEMA — `M:0085` adds none and nothing else carries seconds — so
               «20 sek» would be an invented number in a preview an editor reads
               to learn what respondents get. The bonus scales points by how fast
               a correct answer arrives; it does not impose a deadline. So the
               true half of the sentence is rendered and the invented half is
               not. `quizPreviewScore`'s «0 poeng» and «1 av {count}» are both
               real starting state. */
            <div
              className="mb-3 flex flex-wrap items-center justify-between gap-x-2.5 gap-y-1 rounded-[11px] px-3 py-[9px]"
              style={{ background: 'var(--ac)' }}
            >
              <span className="whitespace-nowrap text-[11.5px] font-bold">
                {t('quizPreviewScore', { count: questions.length })}
              </span>
              <span className="whitespace-nowrap text-[11.5px] font-bold">
                {timeBonus ? t('quizPreviewBonus') : t('quizPreviewNoLimit')}
              </span>
            </div>
          ) : null}
          <div className="font-display text-[19px] font-bold leading-tight">{title}</div>
          <div className="mt-[2px] text-[13px] text-mut">
            {t('previewMeta', {
              count: questions.length,
              mins: estimatedMinutes(questions.length),
            })}
          </div>
          {questions.map((q, i) => {
            const chips = previewChips(q, t('previewAnswer'), t('previewYes'), t('previewNo'))
            /* B1 — the answer key, marked (V2:6506-6516).
               `survey_questions_answer_index_typed` (M:0085:64) allows a key only
               on these three types, so the same three decide whether the preview
               marks anything. Kept identical to the constraint rather than
               re-listed, because a fourth quizzable type would then be one edit
               in one place. */
            const keyable =
              quizMode && (q.type === 'choice' || q.type === 'yesno' || q.type === 'dropdown')
            /* THE BUNDLE DEFAULTS A MISSING KEY TO OPTION ONE AND WE MUST NOT.
               V2:6507 renders «Riktig svar: første alternativ» when `answerIndex`
               is undefined. `answer_index`'s own column comment already refused
               that at the schema level — «a default of 0 would silently mark the
               first option correct on every question ever written — a fabricated
               answer key, which is worse than an absent one». Rendering the
               bundle's default here would reintroduce in the UI exactly what the
               migration kept out of the table, on the screen an editor trusts to
               tell them whether they have set a key. `quizNoKey` («Ingen fasit
               valgt») is the honest state and already exists. */
            const hasKey = keyable && q.answerIndex !== null
            const quizLine = !quizMode
              ? null
              : !keyable
                ? t('quizNotScoring')
                : hasKey
                  ? t('quizKeyLine', { n: (q.answerIndex ?? 0) + 1, points: q.points })
                  : t('quizNoKey')
            return (
              <div key={q.id} className="mt-[17px]">
                <div className="text-[13.5px] font-medium">
                  {i + 1}. {q.text}{' '}
                  {q.required ? <span style={{ color: 'var(--ac2)' }}>*</span> : null}
                </div>
                {q.help ? <div className="mt-[3px] text-[13px] text-mut">{q.help}</div> : null}
                <div className="mt-[9px] flex flex-wrap gap-[7px]">
                  {chips.map((label, ci) => {
                    const correct = hasKey && ci === q.answerIndex
                    return (
                      <span
                        key={`${label}-${ci}`}
                        className="inline-flex items-center gap-1.5 rounded-[9px] border px-3 py-[7px] text-[13px]"
                        style={
                          correct
                            ? /* V2:6511-6516, as drawn. Q109 measured rather than
                                 assumed: #2F5D2A on #E4F2E0 is 6.65:1, above AA's
                                 4.5 and within a hair of the app's own --mut on
                                 --sf at 6.93, so the bundle's pair ships unchanged
                                 and is NOT promoted to a token — one departure is
                                 not a reason for four. */
                              { background: '#E4F2E0', borderColor: '#2F5D2A', color: '#2F5D2A' }
                            : { background: 'var(--sf)', borderColor: 'var(--line)', color: 'var(--mut)' }
                        }
                      >
                        {label}
                        {correct ? (
                          /* The second channel. Colour alone would put the whole
                             mark on one perceptual axis; the tiles solved the same
                             problem with a shape (D125) and this is its text
                             equivalent, which is also what the bundle writes. */
                          <span className="text-[10.5px] font-bold">{t('quizCorrectMark')}</span>
                        ) : null}
                      </span>
                    )
                  })}
                </div>
                {q.type === 'scale' || q.type === 'slider' ? (
                  // The same per-type default the respondent surface applies
                  // (L:2902-2903), so the preview shows what the
                  // respondent will actually see rather than two blanks.
                  <div className="mt-[6px] flex justify-between text-[11px] text-mut">
                    <span>{q.config.low_label || tr('scaleLowDefault')}</span>
                    <span>{q.config.high_label || tr('scaleHighDefault')}</span>
                  </div>
                ) : null}
                {quizLine ? (
                  <div className="mt-[7px] text-[11px] text-mut">{quizLine}</div>
                ) : null}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
