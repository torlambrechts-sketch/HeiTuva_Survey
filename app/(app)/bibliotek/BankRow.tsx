'use client'

import { useState, useTransition } from 'react'
import { addBankQuestion, deleteBankQuestion } from './actions'
import { useBankNote } from './BankNote'

/**
 * A question-bank row — L:1665-1679.
 *
 * RESPONSIVE.md § Data tables, narrow row: badge + text + actions is three
 * fields that fit, so it stays a row and stacks below md only because the
 * controls do not fit at 390px. "Legg til" and the delete × are consequential
 * (they change a draft, and remove a question permanently), so neither goes
 * behind an overflow menu at any viewport.
 */
export function BankRow({
  questionId,
  targetSurveyId,
  text,
  meta,
  badge,
  isOwn,
  disabledReason,
  labels,
}: {
  questionId: string
  targetSurveyId: string | null
  text: string
  meta: string
  badge: string
  isOwn: boolean
  /** Set for a reader — see UsePackButton. */
  disabledReason?: string
  /**
   * Every one of these is a STRING, and that is load-bearing rather than tidy.
   *
   * `addedInto` was `(title: string) => string`, built in `bibliotek/page.tsx`
   * — a SERVER component. A function cannot cross into a client component;
   * Next throws «An error occurred in the Server Components render» and the
   * whole bank tab 500s. CI run 108 caught it on `bibliotek-bank`, desktop and
   * mobile, after every Builder capture passed.
   *
   * The draft's title is known where the labels are built, so the finished
   * sentence crosses the boundary and no closure does.
   */
  labels: { add: string; addedInto: string; remove: string; noDraft: string; failed: string }
}) {
  const [pending, startTransition] = useTransition()
  const [state, setState] = useState<'idle' | 'failed'>('idle')
  const { announce } = useBankNote()

  return (
    <div className="flex flex-col gap-3 border-b border-line py-3.5 md:flex-row md:items-center md:gap-3.5">
      <div className="flex min-w-0 flex-1 items-start gap-3.5">
        <span
          className="flex-none rounded-full px-2.5 py-[5px] text-[11px] font-bold"
          style={{ background: isOwn ? 'var(--sf2)' : 'var(--ac2)' }}
        >
          {badge}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-medium">{text}</div>
          <div className="mt-0.5 text-[13px] text-mut">{meta}</div>
        </div>
      </div>

      <div className="flex flex-none items-center gap-3.5">
        {isOwn ? (
          <button
            type="button"
            aria-label={labels.remove}
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const res = await deleteBankQuestion(questionId)
                if (!res.ok) setState('failed')
              })
            }
            className="touch-44 h-9 w-[34px] cursor-pointer rounded-[9px] border border-line bg-transparent text-[15px] leading-none text-mut"
          >
            ×
          </button>
        ) : null}

        <button
          type="button"
          // Disabled rather than hidden: rule 4 forbids removing a feature on
          // mobile, and the reason it cannot run is explained above the list.
          /* `state === 'added'` used to be in here, which made a question
             addable exactly once. Nothing in the schema asks for that —
             `survey_questions` takes as many copies as an editor wants, and the
             same scale question about two teams is ordinary. The confirmation
             is the pill now, not the button. */
          disabled={pending || !targetSurveyId || Boolean(disabledReason)}
          title={disabledReason ?? (targetSurveyId ? undefined : labels.noDraft)}
          onClick={() =>
            startTransition(async () => {
              if (!targetSurveyId) return
              const res = await addBankQuestion(questionId, targetSurveyId)
              if (res.ok) {
                setState('idle')
                announce(labels.addedInto)
              } else setState('failed')
            })
          }
          className="touch-44 cursor-pointer whitespace-nowrap rounded-[10px] border border-line bg-sbg px-4 py-[9px] text-[12.5px] font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-50"
        >
          {labels.add}
        </button>
      </div>

      {state === 'failed' ? (
        <p role="alert" className="text-[12.5px] font-semibold text-ink">
          {labels.failed}
        </p>
      ) : null}
    </div>
  )
}
