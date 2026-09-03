'use client'

import { useState, useTransition } from 'react'
import { createBlankSurvey } from './actions'

/**
 * "Tom undersøkelse" (HeiTuva.dc.html:696). A button rather than a link
 * because it creates a row before it navigates; the action redirects into the
 * Builder on success.
 */
export function BlankSurveyButton({
  label,
  failedLabel,
}: {
  label: string
  failedLabel: string
}) {
  const [pending, startTransition] = useTransition()
  const [failed, setFailed] = useState(false)

  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setFailed(false)
          startTransition(async () => {
            const result = await createBlankSurvey()
            if (!result.ok) setFailed(true)
          })
        }}
        className="touch-44 cursor-pointer whitespace-nowrap rounded-[10px] border border-line bg-transparent px-[18px] py-[11px] text-[13px] font-semibold text-ink disabled:opacity-60"
      >
        {label}
      </button>
      {failed ? (
        <span role="alert" className="text-[12.5px] font-semibold text-ink">
          {failedLabel}
        </span>
      ) : null}
    </>
  )
}
