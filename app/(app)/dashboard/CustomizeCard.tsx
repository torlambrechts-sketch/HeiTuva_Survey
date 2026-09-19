'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  type Cols,
  addPanel,
  archetypeOf,
  filtersForPreset,
  readFilters,
  type LayoutFilters,
  type PanelEntry,
} from '@/lib/dashboard/layout'
import { savePreset, saveLayout, deletePreset, resetLayout, setColumns } from './actions'

/**
 * «Tilpass dashboardet» — HeiTuva.dc.html:944-1040.
 *
 * Three tabs, exactly as drawn: «Utvalg og periode» (the filters Q46 moved out
 * of the header), «Paneler» (the picker, grouped by the question its reader is
 * asking), «Oppsett» (save a shared preset, switch, start over).
 *
 * RESPONSIVE.md § «Tilpass» card: it stacks in place, the tabs wrap as a Tab
 * rail, and both grids become one column. Written into that file before this
 * component existed (Q33).
 */
export type PickerItem = {
  key: string
  label: string
  desc: string
  /** The bundle's `req` chip: a precondition stated in the picker rather than
   *  a panel that renders empty (NEW:3668). Empty when there is none. */
  req: string
  available: boolean
}

export type PresetChip = {
  id: string
  title: string
  panels: string[]
  /** Shipped presets cannot be deleted; an organisation's own can, by an
   *  editor. `null` id marks a shipped one. */
  own: boolean
}

const ARCHETYPES = ['agg', 'reg', 'duty'] as const

export function CustomizeCard({
  open,
  panels,
  filters,
  surveys,
  groups,
  picker,
  presets,
  canEdit,
  thresholdLine,
  cols,
  labels,
}: {
  open: boolean
  panels: PanelEntry[]
  cols: Cols
  filters: LayoutFilters
  surveys: { id: string; title: string }[]
  groups: { id: string; name: string }[]
  picker: PickerItem[]
  presets: PresetChip[]
  /** Writing a SHARED preset is an editor act (Q25); a leser composes their own
   *  board and saves it, but does not name one for the organisation. */
  canEdit: boolean
  thresholdLine: string
  labels: Record<string, string | undefined>
}) {
  const router = useRouter()
  const [colsPending, startCols] = useTransition()
  const [tab, setTab] = useState<'data' | 'panels' | 'layout'>('data')
  const [draft, setDraft] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [pending, start] = useTransition()

  if (!open) return null

  const go = (patch: { periode?: string; gruppe?: string; u?: string[] }) => {
    const params = new URLSearchParams()
    const period = patch.periode ?? filters.period
    const group = patch.gruppe !== undefined ? patch.gruppe : (filters.group_id ?? '')
    const chosen = patch.u ?? filters.survey_ids
    if (period && period !== 'y') params.set('periode', period)
    if (group) params.set('gruppe', group)
    if (chosen.length && chosen.length !== surveys.length) for (const id of chosen) params.append('u', id)
    params.set('tilpass', tab)
    router.push(`/dashboard?${params.toString()}`, { scroll: false })
  }

  const tabs = [
    ['data', labels.tabData],
    ['panels', labels.tabPanels],
    ['layout', labels.tabLayout],
  ] as const

  const field =
    'touch-44-field w-full rounded-[10px] border border-line bg-bg px-3 py-[10px] text-[13px] text-ink outline-none'
  const legend = 'text-[11px] uppercase tracking-[.1em] text-mut'

  return (
    <div className="mt-[18px] rounded-[18px] border border-line bg-sf p-[22px] shadow-[0_14px_34px_rgba(25,21,16,.08)]">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="text-[15.5px] font-semibold">{labels.title}</div>
        {/* RESPONSIVE.md § Tab rails: the pill group wraps, nothing is hidden
            and no chip becomes a select.

            F3 — `touch-cluster`, and it is CLAUDE.md's row 10 for the fourth
            time. Wrapping was the half that was implemented; the SPACING the
            wrap then needs was not. Measured at 320px: the chips are `py-[7px]`
            — 33px painted — «Oppsett» wraps to a second line at a 36px pitch,
            so the painted edges are 3px apart where a 44px hit area on a 33px
            control needs (44-33)/2 x 2 = 11px. The gate reported 685px² of
            overlap, which is «Oppsett»'s 83px width by the 8.25px shortfall.

            Not F3's own defect — `git log -1 -- CustomizeCard.tsx` is `36f4a36`
            and this phase does not touch the file — but it is the first
            COMPLETED 320px sweep since, and a blocker left red because it
            predates the phase is a blocker nobody owns. `touch-cluster` is
            scoped to ≤767px, so the drawn 3px survives on desktop. */}
        <div className="touch-cluster flex flex-wrap gap-[3px] rounded-full bg-sf2 p-1">
          {tabs.map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              aria-pressed={tab === k}
              className="touch-44 cursor-pointer rounded-full px-[15px] py-[7px] text-[12.5px] font-semibold text-ink"
              style={{
                background: tab === k ? 'var(--sf)' : 'transparent',
                boxShadow: tab === k ? '0 1px 3px rgba(25,21,16,.14)' : 'none',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'data' && (
        <div className="mt-4 grid grid-cols-1 gap-[22px] md:grid-cols-[1.3fr_.7fr]">
          <div>
            <div className={legend}>{labels.surveysLegend}</div>
            <div className="mt-[10px] flex flex-wrap gap-2">
              {surveys.map((s) => {
                const on = filters.survey_ids.includes(s.id)
                const next = on
                  ? filters.survey_ids.filter((id) => id !== s.id)
                  : [...filters.survey_ids, s.id]
                return (
                  <button
                    key={s.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => go({ u: next.length ? next : surveys.map((x) => x.id) })}
                    className="touch-44 flex cursor-pointer items-center gap-2 rounded-full border px-[13px] py-2 text-[12.5px] font-semibold text-ink"
                    style={{
                      borderColor: on ? 'var(--ink)' : 'var(--line)',
                      background: on ? 'var(--sbg)' : 'transparent',
                    }}
                  >
                    <span
                      className="flex h-4 w-4 flex-none items-center justify-center rounded-[5px] text-[10px] font-bold"
                      style={{ border: `1.5px solid ${on ? 'var(--ink)' : 'var(--line)'}` }}
                    >
                      {on ? '✓' : ''}
                    </span>
                    {s.title}
                  </button>
                )
              })}
            </div>
            {/* Q42: the threshold the RPCs applied to the panels on screen, and
                the sentence stays directly under the chips it describes
                (RESPONSIVE.md § «Tilpass» card). */}
            <div className="mt-[10px] text-[12.5px] leading-[1.5] text-mut">
              {thresholdLine} — {labels.thresholdScope}
            </div>
          </div>
          <div className="flex flex-col gap-[14px]">
            {/* G1 — v8:8947 draws exactly two column counts. A chip row rather
                than a select because the bundle draws chips, and because two
                options in a select is the control substitution CLAUDE.md
                forbids. */}
            <div>
              <span className={`block ${legend}`}>{labels.columns}</span>
              <span className="touch-cluster mt-2 flex flex-wrap items-center gap-[6px]">
                {([4, 6] as const).map((n) => (
                  <button
                    key={n}
                    type="button"
                    disabled={colsPending}
                    onClick={() => startCols(async () => { await setColumns(n); router.refresh() })}
                    className={`touch-44 h-[30px] cursor-pointer rounded-full border px-[12px] text-[12px] ${
                      cols === n
                        ? 'border-ink bg-sf font-semibold shadow-[0_1px_3px_rgba(25,21,16,.14)]'
                        : 'border-line bg-transparent text-mut'
                    }`}
                  >
                    {(labels.columnsN ?? '{n}').replace('{n}', String(n))}
                  </button>
                ))}
              </span>
            </div>
            <label className="block">
              <span className={`block ${legend}`}>{labels.period}</span>
              <select
                value={filters.period}
                onChange={(e) => go({ periode: e.target.value })}
                className={`mt-2 ${field}`}
              >
                <option value="q">{labels.periodLast}</option>
                <option value="h">{labels.periodTwo}</option>
                <option value="y">{labels.periodAll}</option>
              </select>
            </label>
            <label className="block">
              <span className={`block ${legend}`}>{labels.group}</span>
              <select
                value={filters.group_id ?? ''}
                onChange={(e) => go({ gruppe: e.target.value })}
                className={`mt-2 ${field}`}
              >
                <option value="">{labels.allGroups}</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      )}

      {tab === 'panels' && (
        <>
          <div className="mt-[14px] text-[12.5px] text-mut">{labels.pickerNote}</div>
          <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-[repeat(auto-fill,minmax(320px,1fr))]">
            {ARCHETYPES.map((arche) => {
              const items = picker.filter((i) => archetypeOf(i.key) === arche)
              if (!items.length) return null
              return (
                <div key={arche}>
                  <div className={legend}>{labels[`arche_${arche}`]}</div>
                  <div className="mt-[2px] text-[12.5px] italic text-mut">
                    «{labels[`archeQ_${arche}`]}»
                  </div>
                  <div className="mt-[9px] flex flex-col gap-[7px]">
                    {items.map((i) => {
                      const inUse = panels.some((p) => p.key === i.key)
                      const can = i.available && !inUse
                      return (
                        <div
                          key={i.key}
                          className="flex items-center gap-3 rounded-[11px] border border-line bg-bg px-[13px] py-[11px]"
                          style={{ color: i.available ? 'var(--ink)' : 'var(--mut)' }}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block text-[13.5px] font-semibold">{i.label}</span>
                            <span className="mt-px block text-[12px] leading-[1.4] text-mut">
                              {i.desc}
                            </span>
                            {i.req ? (
                              <span className="mt-[5px] inline-block rounded-full bg-sf2 px-2 py-[3px] text-[11px] text-mut">
                                {i.req}
                              </span>
                            ) : null}
                          </span>
                          <button
                            type="button"
                            disabled={!can || pending}
                            onClick={() =>
                              start(async () => {
                                const next = addPanel(panels, i.key)
                                await saveLayout({ panels: next, filters })
                                router.refresh()
                              })
                            }
                            className="touch-44 flex-none rounded-[9px] border border-line px-[13px] py-2 text-[12px] font-semibold"
                            style={{
                              cursor: can ? 'pointer' : 'default',
                              background: inUse ? 'var(--sbg)' : 'transparent',
                              color: i.available ? 'var(--ink)' : 'var(--mut)',
                            }}
                          >
                            {inUse ? labels.added : i.available ? labels.add : labels.unavailable}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {tab === 'layout' && (
        <div className="mt-4 grid grid-cols-1 gap-[22px] md:grid-cols-2">
          <div>
            <div className={legend}>{labels.saveLegend}</div>
            <div className="mt-[10px] flex gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={labels.namePlaceholder}
                aria-label={labels.saveLegend}
                disabled={!canEdit}
                className="touch-44-field min-w-0 flex-1 rounded-[10px] border border-line bg-bg px-3 py-[10px] text-[13px] text-ink outline-none"
              />
              <button
                type="button"
                disabled={!canEdit || !draft.trim() || pending}
                onClick={() =>
                  start(async () => {
                    const res = await savePreset({ title: draft, panels, filters })
                    const key = res.ok
                      ? res.groupDropped
                        ? 'groupDropped'
                        : 'saved'
                      : res.reason === 'duplicate'
                        ? 'duplicate'
                        : 'saveFailed'
                    setNotice(labels[key] ?? '')
                    if (res.ok) setDraft('')
                    router.refresh()
                  })
                }
                className="touch-44 whitespace-nowrap rounded-[10px] bg-ac px-4 py-[10px] text-[12.5px] font-semibold text-acf disabled:opacity-50"
                style={{ cursor: canEdit ? 'pointer' : 'default' }}
              >
                {labels.save}
              </button>
            </div>
            {/* Q51, Tor: the boundary is structural AND stated. The line below
                is shown BEFORE saving whenever a group filter is active, so an
                administrator learns the group will not travel while they can
                still decide, rather than discovering it in a colleague's
                broken panel later. */}
            {canEdit && filtersForPreset(filters).groupDropped ? (
              <div className="mt-2 text-[12.5px] leading-[1.5] text-mut">
                {labels.groupWillNotTravel}
              </div>
            ) : null}
            <div className="mt-2 text-[12.5px] leading-[1.5] text-mut">
              {canEdit ? labels.saveNote : labels.saveLeser}
            </div>
            {notice ? (
              <div role="status" className="mt-2 text-[12.5px] font-semibold text-ink">
                {notice}
              </div>
            ) : null}
          </div>
          <div>
            <div className={legend}>{labels.switchLegend}</div>
            {/* `.touch-cluster` on BOTH levels: the row between chips, and the
                chip-plus-× pair inside each one. A 30px chip with a 44px area
                overflows 7px per side, so a 7px row gap and a 0px inner gap
                both collide — Gate 3e measured 594px² between «Ledergruppa»
                and its own delete control. Same utility as the panel cards
                (RESPONSIVE.md global rule 2, one systemic fix). */}
            <div className="touch-cluster mt-[10px] flex flex-wrap gap-[7px]">
              {presets.map((p) => (
                <span key={p.id} className="touch-cluster flex items-center">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      start(async () => {
                        await saveLayout({
                          panels: p.panels.map((key) => ({
                            key,
                            wide: key === 'heatmap',
                          })),
                          filters,
                        })
                        router.refresh()
                      })
                    }
                    className="touch-44 cursor-pointer rounded-full border border-line px-[13px] py-2 text-[12.5px] font-semibold text-ink"
                  >
                    {p.title}
                  </button>
                  {p.own && canEdit ? (
                    <button
                      type="button"
                      aria-label={`${labels.deletePreset}: ${p.title}`}
                      disabled={pending}
                      onClick={() =>
                        start(async () => {
                          await deletePreset(p.id)
                          router.refresh()
                        })
                      }
                      className="touch-44 cursor-pointer border-none bg-transparent px-1 text-[16px] leading-none text-mut"
                    >
                      ×
                    </button>
                  ) : null}
                </span>
              ))}
            </div>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  await resetLayout()
                  router.refresh()
                })
              }
              /*
                24px below md, raised from 14px 2026-09-10 after CI measured a
                169px² overlap between «Ledergruppa» and this control at 390px.

                THE 14px CAME FROM THE WRONG PAIR. RESPONSIVE.md's «44px hit
                areas need 14px between painted edges» assumes BOTH controls are
                around 30px tall, so each overflows ~7px. That holds chip-to-chip
                and it is where the number was measured. It does not hold here:
                the chip above is ~33px and overflows ~5px, but THIS control is a
                bare text link with `p-0` at 12.5px — about 15px painted, so its
                44px area overflows ~14px. Five plus fourteen is nineteen, and
                fourteen was never going to be enough.

                So the number is not tuned again; it is derived from what the two
                controls actually are. 24px is the design's step above 20px, per
                RESPONSIVE.md: «use the design's existing spacing step at or
                above that, never a smaller one».
              */
              className="touch-44 mt-3 max-md:mt-6 cursor-pointer border-none bg-transparent p-0 text-[12.5px] text-mut underline"
            >
              {labels.startOver}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/** Re-exported so the server component can build `filters` from the URL with
 *  the same reader the card uses. One definition, four callers. */
export { readFilters }
