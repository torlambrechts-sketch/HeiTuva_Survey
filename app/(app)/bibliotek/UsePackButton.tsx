'use client'

import { useState, useTransition } from 'react'
import { createSurveyFromPack } from './actions'

/** "Bruk mal". The action redirects into the new survey on success, so the only
 *  state this needs is the failure path. */
export function UsePackButton({
  packId,
  label,
  failedLabel,
  disabledReason,
  className = '',
}: {
  packId: string
  label: string
  failedLabel: string
  /** Set for a reader: the button stays visible but refuses up front rather
   *  than calling an action that RLS will reject. */
  disabledReason?: string
  className?: string
}) {
  const [pending, startTransition] = useTransition()
  const [failed, setFailed] = useState(false)

  return (
    <>
      <button
        type="button"
        disabled={pending || Boolean(disabledReason)}
        title={disabledReason}
        onClick={() =>
          startTransition(async () => {
            const res = await createSurveyFromPack(packId)
            // A successful call redirects and never returns a value here.
            setFailed(res !== undefined && !res.ok)
          })
        }
        className={`touch-44 cursor-pointer rounded-[10px] border-none bg-ac text-[13px] font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      >
        {label}
      </button>
      {failed ? (
        <p role="alert" className="mt-2 text-[12.5px] font-semibold text-ink">
          {failedLabel}
        </p>
      ) : null}
    </>
  )
}
