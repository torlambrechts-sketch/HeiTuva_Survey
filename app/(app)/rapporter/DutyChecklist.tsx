'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toggleDutyCheck } from './actions'

/**
 * The duty's checklist — HeiTuva.dc.html:945-952.
 *
 * Optimistic, because the design's checkbox responds instantly and a statutory
 * checklist is ticked in bursts. The optimistic value is rolled back if the
 * write fails: a tick that stays on screen while the database refused it is a
 * false record of compliance, which is worse than a slow checkbox.
 */
export function DutyChecklist({
  definitionKey,
  checks,
  canEdit,
}: {
  definitionKey: string
  checks: { key: string; label: string; done: boolean }[]
  canEdit: boolean
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [optimistic, setOptimistic] = useState<Record<string, boolean>>({})

  const isDone = (c: { key: string; done: boolean }) => optimistic[c.key] ?? c.done

  function toggle(key: string, next: boolean) {
    setOptimistic((o) => ({ ...o, [key]: next }))
    startTransition(async () => {
      const result = await toggleDutyCheck(definitionKey, key, next)
      if (!result.ok) {
        setOptimistic((o) => ({ ...o, [key]: !next }))
        return
      }
      // Drop the optimistic entry so the refreshed server value takes over
      // again; leaving it would pin the checkbox to a stale local guess.
      setOptimistic((o) => Object.fromEntries(Object.entries(o).filter(([k]) => k !== key)))
      router.refresh()
    })
  }

  return (
    // RESPONSIVE.md global rule 2: the painted checkbox keeps the design's
    // 22px at every width, so what has to change is the SPACING — a 22px row
    // with the bundle's 9px gap leaves two 44px hit areas overlapping by 13px,
    // and a thumb aimed at "Tiltaksplan med frister" ticks "Risikoområder
    // vurdert". 22px of vertical gap is the smallest that separates them; the
    // design's 9px returns at xl, where the bundle is authoritative and a
    // mouse does not need 44px.
    <div className="mt-4 flex flex-col gap-x-0 gap-y-[22px] xl:gap-y-[9px]">
      {checks.map((c) => {
        const on = isDone(c)
        return (
          <button
            key={c.key}
            type="button"
            role="checkbox"
            aria-checked={on}
            disabled={!canEdit}
            onClick={() => toggle(c.key, !on)}
            className="touch-44 flex cursor-pointer items-center gap-[11px] border-none bg-transparent p-0 text-left text-ink disabled:cursor-default"
          >
            <span
              className="flex h-[22px] w-[22px] flex-none items-center justify-center rounded-[7px] text-xs font-bold"
              // The design's own pair (HeiTuva.dc.html:3149): a ticked box is
              // --ac2 on --ac2, not --ac on --ink. Yellow is the primary-action
              // colour everywhere else in this product, so a yellow tick read as
              // a button rather than as a completed item.
              style={{
                border: `1.5px solid ${on ? 'var(--ac2)' : 'var(--line)'}`,
                background: on ? 'var(--ac2)' : 'transparent',
              }}
            >
              {on ? '✓' : ''}
            </span>
            <span className="text-[13.5px]">{c.label}</span>
          </button>
        )
      })}
    </div>
  )
}
