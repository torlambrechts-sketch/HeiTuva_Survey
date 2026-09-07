'use client'

import { useTransition } from 'react'
import { freezeLayoutReport } from './actions'

/**
 * «Frys som rapport» (NEW:940, 3650) — DECISIONS Q29's other control.
 *
 * Beside «Åpne rapport (n)», not instead of it: one reads the pins, this reads
 * the layout. The action re-reads the layout server-side, so the button carries
 * no state of its own.
 */
export function FreezeButton({ label, title }: { label: string; title: string }) {
  const [pending, start] = useTransition()

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(async () => void (await freezeLayoutReport(title)))}
      className="touch-44 cursor-pointer rounded-[10px] border border-line bg-transparent px-3 py-[10px] text-[13px] font-semibold text-ink disabled:opacity-60"
    >
      {label}
    </button>
  )
}
