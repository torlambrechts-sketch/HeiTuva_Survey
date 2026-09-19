'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  movePanel,
  patchPanel,
  removePanel,
  spanOf,
  toggleWidth,
  type Cols,
  type LayoutFilters,
  type PanelEntry,
  type PanelHeight,
  type Period,
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
  cols,
  surveys,
  groups,
  labels,
  cfg,
}: {
  panelKey: string
  panels: PanelEntry[]
  filters: LayoutFilters
  cols: Cols
  surveys: { id: string; title: string }[]
  groups: { id: string; name: string }[]
  labels: { up: string; down: string; wide: string; narrow: string; remove: string }
  cfg: {
    open: string
    close: string
    size: string
    height: string
    lav: string
    normal: string
    hoy: string
    brk: string
    brkOn: string
    scope: string
    srcAll: string
    grpAll: string
    perInherit: string
    periods: Record<Period, string>
  }
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [open, setOpen] = useState(false)

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

  /* v8's own size chips, and the LABELS ARE THE BUNDLE'S (v8:7112). They differ
     by column count because a half is 2 of 4 and 3 of 6, so the fraction shown
     has to be derived from `cols` rather than written down once. */
  const sizeChips: [number, string][] =
    cols === 4
      ? [[1, '¼'], [2, '½'], [3, '¾'], [4, '1/1']]
      : [[2, '⅓'], [3, '½'], [4, '⅔'], [6, '1/1']]
  const activeSpan = spanOf(entry, cols)

  const chip = (on: boolean) =>
    `touch-44 h-[26px] cursor-pointer rounded-full border px-[10px] text-[11.5px] ${
      on ? 'border-ink bg-sf font-semibold shadow-[0_1px_3px_rgba(25,21,16,.14)]' : 'border-line bg-transparent text-mut'
    }`
  const field =
    'touch-44-field h-[32px] w-full rounded-[10px] border border-line bg-sf px-[9px] text-[12.5px]'
  const legend = 'text-[11px] font-semibold uppercase tracking-[.04em] text-mut'

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
        aria-label={open ? cfg.close : cfg.open}
        title={open ? cfg.close : cfg.open}
        aria-expanded={open}
        disabled={pending}
        onClick={() => setOpen((v) => !v)}
        className={round}
      >
        ⚙
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

      {/* v8's per-panel scope panel (`scopeOpen`, v8:7118). Rendered in the
          normal flow rather than as an overlay: the bundle floats it over the
          card, and a fixed corner over full-width content is the defect D225
          traced — this project has paid for that shape once already. */}
      {open ? (
        <span className="mt-[10px] flex w-full flex-col gap-[10px] rounded-[12px] border border-line bg-sf2 p-[11px]">
          <span className="flex flex-col gap-[5px]">
            <span className={legend}>{cfg.size}</span>
            <span className="touch-cluster flex flex-wrap items-center gap-[6px]">
              {sizeChips.map(([n, label]) => (
                <button
                  key={n}
                  type="button"
                  disabled={pending}
                  className={chip(activeSpan === n)}
                  onClick={() => apply(patchPanel(panels, panelKey, { span: n }))}
                >
                  {label}
                </button>
              ))}
            </span>
          </span>

          <span className="flex flex-col gap-[5px]">
            <span className={legend}>{cfg.height}</span>
            <span className="touch-cluster flex flex-wrap items-center gap-[6px]">
              {(['lav', 'normal', 'hoy'] as PanelHeight[]).map((h) => (
                <button
                  key={h}
                  type="button"
                  disabled={pending}
                  className={chip((entry.h ?? 'normal') === h)}
                  onClick={() => apply(patchPanel(panels, panelKey, { h }))}
                >
                  {cfg[h]}
                </button>
              ))}
            </span>
          </span>

          <button
            type="button"
            disabled={pending}
            className={chip(entry.br === true) + ' self-start'}
            onClick={() =>
              // `undefined` CLEARS the key rather than storing `false`: absent
              // already means «no break», and two spellings of one state is how
              // a value goes stale on one of them (M:0137).
              apply(patchPanel(panels, panelKey, { br: entry.br ? undefined : true }))
            }
          >
            {entry.br ? cfg.brkOn : cfg.brk}
          </button>

          <span className="flex flex-col gap-[5px]">
            <span className={legend}>{cfg.scope}</span>
            {/* Each select CLEARS its override when set back to the inherit
                option, so «same as the board» stays one state. */}
            <select
              className={field}
              value={entry.src ?? ''}
              disabled={pending}
              onChange={(e) =>
                apply(patchPanel(panels, panelKey, { src: e.target.value || undefined }))
              }
            >
              <option value="">{cfg.srcAll}</option>
              {surveys.map((s2) => (
                <option key={s2.id} value={s2.id}>
                  {s2.title}
                </option>
              ))}
            </select>
            <select
              className={field}
              value={entry.per ?? ''}
              disabled={pending}
              onChange={(e) =>
                apply(
                  patchPanel(panels, panelKey, {
                    per: (e.target.value || undefined) as Period | undefined,
                  }),
                )
              }
            >
              <option value="">{cfg.perInherit}</option>
              {(['q', 'h', 'y'] as Period[]).map((per) => (
                <option key={per} value={per}>
                  {cfg.periods[per]}
                </option>
              ))}
            </select>
            <select
              className={field}
              value={entry.grp ?? ''}
              disabled={pending}
              onChange={(e) =>
                apply(patchPanel(panels, panelKey, { grp: e.target.value || undefined }))
              }
            >
              <option value="">{cfg.grpAll}</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </span>
        </span>
      ) : null}
    </span>
  )
}
