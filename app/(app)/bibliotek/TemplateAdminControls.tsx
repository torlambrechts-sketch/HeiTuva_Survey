'use client'

import { useOptimistic, useState, useTransition } from 'react'
import { deleteTemplate, setTemplatePrivate } from './actions'

/** The private/shared pill and the delete × on a company template
 *  (HeiTuva.dc.html:1576-1580). */
export function TemplateAdminControls({
  packId,
  isPrivate,
  labels,
}: {
  packId: string
  isPrivate: boolean
  labels: { privateLabel: string; sharedLabel: string; deleteLabel: string; failed: string }
}) {
  const [saved, setSaved] = useState(isPrivate)
  const [optimistic, setOptimistic] = useOptimistic(saved)
  const [failed, setFailed] = useState(false)
  const [, startTransition] = useTransition()

  return (
    // The × paints ~10px wide, so its 44px hit area expands 17px each side and
    // ate 11px of the share pill's — a thumb aimed at "Slett mal" could flip
    // the template to private instead. RESPONSIVE.md rules 2-3: the painted
    // size is the design's, only the spacing grows, and only below md.
    <span className="flex items-center gap-[18px] md:gap-1.5">
      <button
        type="button"
        aria-pressed={optimistic}
        onClick={() =>
          startTransition(async () => {
            const next = !optimistic
            setOptimistic(next)
            const res = await setTemplatePrivate(packId, next)
            if (res.ok) setSaved(next)
            else setFailed(true)
          })
        }
        className="touch-44 cursor-pointer rounded-full border-none px-2.5 py-1 text-[11px] font-semibold"
        style={{ background: optimistic ? 'var(--sf2)' : 'var(--ac2)' }}
      >
        {optimistic ? labels.privateLabel : labels.sharedLabel}
      </button>
      <button
        type="button"
        aria-label={labels.deleteLabel}
        onClick={() =>
          startTransition(async () => {
            const res = await deleteTemplate(packId)
            if (!res.ok) setFailed(true)
          })
        }
        className="touch-44 cursor-pointer border-none bg-transparent text-[16px] leading-none text-mut"
      >
        ×
      </button>
      {failed ? <span className="sr-only" role="alert">{labels.failed}</span> : null}
    </span>
  )
}
