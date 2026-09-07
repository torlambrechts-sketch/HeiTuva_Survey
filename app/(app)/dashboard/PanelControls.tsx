'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  movePanel,
  removePanel,
  toggleWidth,
  type LayoutFilters,
  type PanelEntry,
} from '@/lib/dashboard/layout'
import { saveLayout } from './actions'

/**
 * «Flytt, endre bredde og fjern direkte på kortene» — HeiTuva.dc.html:1085-1099.
 *
 * Four round controls on every panel card. Each computes the next layout with
 * the pure model in `lib/dashboard/layout.ts` and persists it; nothing here
 * decides what a layout may be.
 *
 * The model returns the SAME array for an impossible move, so a disabled
 * control that is clicked anyway writes nothing — the guard is the identity
 * check below rather than the `disabled` attribute, which is a hint to a
 * pointer and not a rule.
 */
export function PanelControls({
  panelKey,
  panels,
  filters,
  labels,
}: {
  panelKey: string
  panels: PanelEntry[]
  filters: LayoutFilters
  labels: { up: string; down: string; wide: string; narrow: string; remove: string }
}) {
  const router = useRouter()
  const [pending, start] = useTransition()

  const i = panels.findIndex((p) => p.key === panelKey)
  const entry = panels[i]
  if (!entry) return null

  const apply = (next: PanelEntry[]) =>
    start(async () => {
      if (next === panels) return
      await saveLayout({ panels: next, filters })
      router.refresh()
    })

  const round =
    'touch-44 flex h-[30px] w-[30px] cursor-pointer items-center justify-center rounded-full border border-line bg-transparent text-mut disabled:opacity-40'

  return (
    <span className="touch-cluster flex flex-wrap items-center justify-end gap-[6px]">
      <button
        type="button"
        aria-label={labels.up}
        title={labels.up}
        disabled={i === 0 || pending}
        onClick={() => apply(movePanel(panels, panelKey, -1))}
        className={round}
      >
        ↑
      </button>
      <button
        type="button"
        aria-label={labels.down}
        title={labels.down}
        disabled={i === panels.length - 1 || pending}
        onClick={() => apply(movePanel(panels, panelKey, 1))}
        className={round}
      >
        ↓
      </button>
      <button
        type="button"
        // The bundle's label is the width the button would GIVE it, not the one
        // it has (NEW:3675: `widthLabel: isWide ? "Halv bredde" : "Full bredde"`).
        title={entry.wide ? labels.narrow : labels.wide}
        aria-label={entry.wide ? labels.narrow : labels.wide}
        disabled={pending}
        onClick={() => apply(toggleWidth(panels, panelKey))}
        className="touch-44 h-[30px] cursor-pointer rounded-full border border-line bg-transparent px-[11px] text-[12px] text-mut"
      >
        {entry.wide ? labels.narrow : labels.wide}
      </button>
      <button
        type="button"
        aria-label={labels.remove}
        title={labels.remove}
        disabled={pending}
        onClick={() => apply(removePanel(panels, panelKey))}
        className={round}
      >
        ×
      </button>
    </span>
  )
}
