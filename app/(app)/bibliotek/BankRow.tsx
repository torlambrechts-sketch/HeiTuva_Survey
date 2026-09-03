'use client'

import { useState, useTransition } from 'react'
import { addBankQuestion, deleteBankQuestion } from './actions'

/**
 * A question-bank row — HeiTuva.dc.html:1665-1679.
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
  labels,
}: {
  questionId: string
  targetSurveyId: string | null
  text: string
  meta: string
  badge: string
  isOwn: boolean
  labels: { add: string; added: string; remove: string; noDraft: string; failed: string }
}) {
  const [pending, startTransition] = useTransition()
  const [state, setState] = useState<'idle' | 'added' | 'failed'>('idle')

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
          disabled={pending || !targetSurveyId || state === 'added'}
          title={targetSurveyId ? undefined : labels.noDraft}
          onClick={() =>
            startTransition(async () => {
              if (!targetSurveyId) return
              const res = await addBankQuestion(questionId, targetSurveyId)
              setState(res.ok ? 'added' : 'failed')
            })
          }
          className="touch-44 cursor-pointer whitespace-nowrap rounded-[10px] border border-line bg-sbg px-4 py-[9px] text-[12.5px] font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-50"
        >
          {state === 'added' ? labels.added : labels.add}
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
