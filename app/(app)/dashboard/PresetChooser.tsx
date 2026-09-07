'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { defaultWide, type LayoutFilters } from '@/lib/dashboard/layout'
import { saveLayout } from './actions'

/**
 * «Velg et oppsett å starte fra» — HeiTuva.dc.html:1042-1072.
 *
 * The first-run state: a member with no saved layout has nothing to draw, and
 * the design answers that with the shipped presets rather than an empty board.
 * This is the one place Q25 puts the ORGANISATION in front of the member —
 * "the organisation appears only in the first-run offer of presets".
 *
 * The bundle draws an illustration per preset (`p.il0`-`p.il6`, seven inline
 * SVGs). Those are decoration keyed by index and carry no data; they are
 * omitted here and logged as D101 rather than reproduced, because copying the
 * prototype's internal structure is what CLAUDE.md forbids and inventing
 * seven new drawings is not recreating a rendering.
 */
export function PresetChooser({
  presets,
  filters,
  labels,
}: {
  presets: { id: string; title: string; description: string; panels: string[]; tint: string | null; panelLabels: string[] }[]
  filters: LayoutFilters
  labels: { title: string; note: string; use: string }
}) {
  const router = useRouter()
  const [pending, start] = useTransition()

  return (
    <div className="mt-[22px] rounded-[18px] border border-line bg-sf p-[26px]">
      <div className="font-display text-[23px] font-medium">{labels.title}</div>
      <div className="mt-1 max-w-[640px] text-[13.5px] leading-[1.55] text-mut">{labels.note}</div>
      <div className="mt-5 grid grid-cols-1 gap-[14px] sm:grid-cols-[repeat(auto-fill,minmax(280px,1fr))]">
        {presets.map((p) => (
          <div
            key={p.id}
            className="flex flex-col rounded-2xl border border-line p-5"
            style={{ background: p.tint ?? 'var(--sf)' }}
          >
            <div className="font-display text-[19px] font-medium leading-[1.25]">{p.title}</div>
            <div className="mt-[6px] flex-1 text-[12.5px] leading-[1.5] text-mut">
              {p.description}
            </div>
            <div className="mt-3 flex flex-wrap gap-[5px]">
              {p.panelLabels.map((label) => (
                <span
                  key={label}
                  className="rounded-full border border-line bg-sf px-[9px] py-1 text-[11px] text-mut"
                >
                  {label}
                </span>
              ))}
            </div>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  await saveLayout({
                    panels: p.panels.map((key) => ({ key, wide: defaultWide(key) })),
                    filters,
                  })
                  router.refresh()
                })
              }
              className="touch-44 mt-4 cursor-pointer rounded-[10px] border-none bg-ac p-[10px] text-[13px] font-semibold text-acf"
            >
              {labels.use}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
