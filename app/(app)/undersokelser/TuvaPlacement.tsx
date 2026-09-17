'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { ReactNode } from 'react'
import type { TuvaPlacement } from '@/lib/surveys/view'
import { setTuvaPlacement } from './actions'
import { TuvaSlot } from '@/components/TuvaSlot'

/**
 * F4 — WHERE TUVA SITS, and the switch between the two.
 *
 * The audit's finding: v6 draws BOTH a docked side column (v6:2438-2465) and a
 * floating bubble (v6:2413-2436), `svTuvaSide: st.svTuvaDocked !== false` makes
 * the SIDE COLUMN the default, and `onSvTuvaDock` / `onSvTuvaUndock`
 * (v6:9017-9018) let a person move between them. **The app rendered neither** —
 * a full-width `<aside>` at the top of the page with no switch at all.
 *
 * ── THE KEY'S NAME MEANS THE OPPOSITE OF WHAT IT SAYS, AND IT IS A TRAP ────
 *
 * `onSvTuvaDock` sets `svTuvaDocked: false` — it moves Tuva to the BUBBLE. The
 * button that calls it is labelled «Fell ned til boble». So in the bundle's own
 * vocabulary «docked» is the SIDE COLUMN, and the handler named «dock» undocks.
 * Reading the handler names instead of their bodies puts the default on the
 * wrong placement and the two buttons on the wrong controls.
 *
 * Our values are `side` and `bubble`, which cannot be read backwards.
 *
 * ── THE SWITCH IS PER-PERSON STATE, SAME MECHANISM AS THE VIEW ─────────────
 *
 * A cookie (`heituva.svtuva`), written by a server action, because the list is
 * a server component — Q122's reasoning, decided once and applied to both
 * choices this screen carries. No column beside it: `M:0122` states why.
 *
 * ── G6: THE BUBBLE MOVED TO THE SHELL, AND ONLY THE COLUMN IS DRAWN HERE ──
 *
 * The open/shut state went with it — it is `useState` in `TuvaHelper` for the
 * same reason it was here: it answers «right now», not «how I like my list».
 * What stays is the SIDE COLUMN and the two switches, because the cookie and
 * the server action that writes it belong to this route.
 */
export function TuvaPlacementSwitch({
  placement,
  labels,
  children,
}: {
  placement: TuvaPlacement
  labels: { toBubble: string; toSide: string; toggle: string; mark: string; name: string; sub: string }
  /** The analyst's content, rendered by the server component that has the
   *  translations — this file only decides WHERE it sits. */
  children: ReactNode
}) {
  const router = useRouter()
  const [busy, start] = useTransition()

  const move = (to: TuvaPlacement) =>
    start(async () => {
      await setTuvaPlacement({ placement: to })
      router.refresh()
    })

  if (placement === 'side') {
    return (
      /* v6:2439 — `flex:1 1 268px;max-width:340px`, sticky at 16px, `--sbg`. */
      <aside
        aria-label={labels.name}
        className="sticky top-4 min-w-0 max-w-[340px] flex-[1_1_268px] rounded-[20px] border border-line bg-sbg p-5"
      >
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex h-14 w-14 flex-none items-center justify-center rounded-2xl bg-sf font-display text-xl font-semibold"
          >
            {labels.mark}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-bold">{labels.name}</div>
            <div className="mt-0.5 text-xs text-mut">{labels.sub}</div>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => move('bubble')}
            aria-label={labels.toBubble}
            title={labels.toBubble}
            className="touch-44 flex h-[30px] w-[30px] flex-none cursor-pointer items-center justify-center rounded-[9px] border border-line bg-sf p-0 text-ink"
          >
            {/* v6:2447 */}
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 5L4 10M4 10h4.5M4 10V5.5M15 19l5-5M20 14h-4.5M20 14v4.5" />
            </svg>
          </button>
        </div>
        <div className="mt-3.5">{children}</div>
      </aside>
    )
  }

  /* G6 — THE BUBBLE IS NO LONGER DRAWN HERE.
     Tor: «One product, one Tuva, and a screen should not have two bubbles for
     two reasons.» Measured before the change, this screen had two round
     buttons differing in size, colour, glyph, shadow, the unread dot AND the
     accessible name — «Åpne Tuva» here, «Vis eller skjul Tuva» there — which
     is two controls announced for one helper.

     So the bubble placement now PUBLISHES its content to the shell's single
     helper instead of drawing a second button. The dock switch travels with
     the content, because the server action that writes the cookie lives in
     this route and the shell must not import it.

     The 76px spacer the drawing puts under the list (v6:2415) goes with it:
     it existed so an absolutely positioned bubble would not cover the last
     row, and the helper is anchored to the viewport rather than to the card. */
  return (
    <TuvaSlot>
      {children}
      <button
        type="button"
        disabled={busy}
        onClick={() => move('side')}
        className="touch-44 mt-[10px] flex w-full items-center gap-2 rounded-[11px] border border-dashed border-line px-[13px] py-[9px] text-[11.5px] font-semibold text-mut"
      >
        {/* v6:2422 — the same icon the drawing puts on this switch. */}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M14 5h6v6M20 5l-7 7M10 19H4v-6M4 19l7-7" />
        </svg>
        {labels.toSide}
      </button>
    </TuvaSlot>
  )
}
