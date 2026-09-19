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
      /* N6 · v8:2418 — THE PRIMARY TREATMENT, and it is a change of KIND, not
         of size. v7 drew this as an outlined secondary (`border:1px solid
         var(--line)`, transparent, `font-weight:600`); v8 fills it with
         `var(--ink)` on `var(--sf)` text at 700 and drops the border, which
         makes it the dashboard's one primary action.

           height:36px · padding:0 16px · border-radius:10px · border:none
           background:var(--ink) · color:var(--sf) · 12.5px/700

         `height` with `padding:0` rather than vertical padding is the
         bundle's own arithmetic and it is not interchangeable: `py-[10px]` on
         13px text paints ~37px here and ~34px where the line-height differs,
         so the drawn height would depend on the font. */
      className="touch-44 flex h-[36px] cursor-pointer items-center rounded-[10px] border-none bg-ink px-[16px] text-[12.5px] font-bold text-sf disabled:opacity-60"
    >
      {label}
    </button>
  )
}
