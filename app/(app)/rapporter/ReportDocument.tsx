'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { saveReport } from './editor-actions'
import type { ComposedDocument, ComposedSection, EditorOptions, EditorReport } from './editor-types'

type Labels = {
  empty: string
  meta: string
  filterLine: string
  sectionGroupLabel: string
  allGroups: string
  up: string
  down: string
  remove: string
  draft: string
  suppressedRow: string
  suppressedNote: string
  insufficient: string
  noSurvey: string
  sourceSnapshot: string
  sourceLive: string
  sectionLabels: Record<string, string>
}

/**
 * The document pane — HeiTuva.dc.html:1096-1180.
 *
 * Every number rendered here comes from `compose_report`. The component does
 * not sum, average or subtract: the RPC has already decided what may be shown,
 * and a second calculation in the browser would be a second gate with different
 * rules. Where the RPC withheld a value the design's own treatment is used —
 * the row renders, the number does not.
 */
export function ReportDocument({
  report,
  doc,
  options,
  canEdit,
  labels,
}: {
  report: EditorReport
  doc: ComposedDocument
  options: EditorOptions
  canEdit: boolean
  labels: Labels
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const sections = report.sections
  const byKey = new Map((doc.sections ?? []).map((s) => [s.key, s]))
  const groupable = new Set(
    options.sectionTypes.filter((s) => s.supportsGroupFilter).map((s) => s.key),
  )

  function patch(next: Parameters<typeof saveReport>[0]) {
    startTransition(async () => {
      const result = await saveReport(next)
      if (result.ok) router.refresh()
    })
  }

  const move = (key: string, dir: -1 | 1) => {
    const i = sections.indexOf(key)
    const j = i + dir
    if (i < 0 || j < 0 || j >= sections.length) return
    const next = sections.slice()
    const a = next[i]
    const b = next[j]
    if (a === undefined || b === undefined) return
    next[i] = b
    next[j] = a
    patch({ reportId: report.id, sections: next })
  }

  const iconBtn =
    'touch-44 flex h-[26px] w-[26px] cursor-pointer items-center justify-center rounded-[7px] border border-line bg-transparent text-[11px] text-mut disabled:cursor-not-allowed disabled:opacity-40'

  return (
    <div className="rounded-[18px] border border-line bg-sf px-6 py-[26px] shadow-[0_10px_28px_rgba(25,21,16,.06)] xl:px-[38px] xl:py-[34px]">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] uppercase tracking-[.1em] text-mut">{options.orgName}</div>
          <input
            defaultValue={report.title}
            onBlur={(e) => {
              const title = e.target.value.trim()
              if (title && title !== report.title) patch({ reportId: report.id, title })
            }}
            readOnly={!canEdit}
            aria-label={report.title}
            /* RESPONSIVE.md rule 2: the hit area reaches 44px below md while
               the painted control does not change — this input paints no box
               at all, so min-height moves no visible edge. `touch-44-field`
               would be wrong here: it draws an inset ring, and this field is
               borderless by design. */
            className="mt-[6px] min-h-[44px] w-full border-none bg-transparent font-display text-[28px] font-medium leading-[1.2] text-ink outline-none md:min-h-0"
          />
          <div className="mt-1 text-[12.5px] text-mut">{labels.meta}</div>
          <div className="mt-[2px] text-[12.5px] text-mut">{labels.filterLine}</div>
        </div>
        <span className="flex-none whitespace-nowrap rounded-full bg-sbg px-3 py-[6px] text-[12px] font-semibold">
          {labels.draft}
        </span>
      </div>

      <div className="my-[22px] h-px bg-line" />

      {report.filters.surveys.length === 0 ? (
        <p className="text-[13.5px] text-mut">{labels.noSurvey}</p>
      ) : sections.length === 0 ? (
        <p className="text-[13.5px] text-mut">{labels.empty}</p>
      ) : null}

      {sections.map((key, i) => {
        const section = byKey.get(key)
        return (
          <div key={key} className="mb-[26px]">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[15px] font-bold">{labels.sectionLabels[key] ?? key}</div>
              <span className="flex items-center gap-[5px]">
                {groupable.has(key) ? (
                  <select
                    aria-label={labels.sectionGroupLabel}
                    defaultValue={report.filters.sectionGroups?.[key] ?? ''}
                    disabled={!canEdit || pending}
                    onChange={(e) =>
                      patch({
                        reportId: report.id,
                        sectionGroups: {
                          ...(report.filters.sectionGroups ?? {}),
                          [key]: e.target.value || null,
                        },
                      })
                    }
                    className="touch-44-field rounded-lg border border-line bg-bg px-2 py-[5px] text-[11.5px] text-ink outline-none"
                  >
                    <option value="">{labels.allGroups}</option>
                    {options.groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                ) : null}
                <button
                  type="button"
                  onClick={() => move(key, -1)}
                  disabled={!canEdit || i === 0 || pending}
                  aria-label={labels.up}
                  title={labels.up}
                  className={iconBtn}
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => move(key, 1)}
                  disabled={!canEdit || i === sections.length - 1 || pending}
                  aria-label={labels.down}
                  title={labels.down}
                  className={iconBtn}
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() =>
                    patch({ reportId: report.id, sections: sections.filter((s) => s !== key) })
                  }
                  disabled={!canEdit || pending}
                  aria-label={labels.remove}
                  title={labels.remove}
                  className={`${iconBtn} text-[14px] leading-none`}
                >
                  ×
                </button>
              </span>
            </div>

            <SectionBody section={section} labels={labels} />
          </div>
        )
      })}

      {(doc.suppressed_groups?.length ?? 0) > 0 ? (
        <p className="mt-2 text-[12px] leading-[1.5] text-mut">
          {labels.suppressedNote.replace('{count}', String(doc.suppressed_groups!.length))}
        </p>
      ) : null}
    </div>
  )
}

/**
 * A section renders as bars when the RPC gave it group rows, and as a list of
 * question cells otherwise. Both shapes come from the design's `isBars` /
 * `isText` branches; the third (`isHeat`) is the heatmap, which reuses the row
 * shape until the heatmap RPC is wired into composition.
 */
function SectionBody({ section, labels }: { section: ComposedSection | undefined; labels: Labels }) {
  if (!section) return null

  if (section.rows) {
    if (section.rows.length === 0) return null
    return (
      <div className="mt-3 flex flex-col gap-[9px]">
        {section.rows.map((row) => (
          <div key={row.group_id ?? row.label ?? 'row'} className="flex items-center gap-3">
            <span className="w-[120px] flex-none overflow-hidden text-ellipsis whitespace-nowrap text-[12.5px] leading-[1.35] text-ink xl:w-[220px]">
              {row.label}
            </span>
            <span className="block h-[14px] flex-1 overflow-hidden rounded-[7px] bg-sf2">
              {row.suppressed || row.avg === null ? null : (
                <span
                  className="block h-full rounded-[7px] bg-ac"
                  style={{ width: `${Math.max(0, Math.min(100, (row.avg / 5) * 100))}%` }}
                />
              )}
            </span>
            <span className="w-[76px] flex-none text-right text-[12.5px] font-semibold">
              {/* Never a 0 or a dash that reads as a measurement: the design's
                  own "for få svar" wording, so a withheld cell is legible as
                  withheld rather than as a low score. */}
              {row.suppressed || row.avg === null ? (
                <span className="text-[11px] font-normal text-mut">{labels.suppressedRow}</span>
              ) : (
                row.avg.toFixed(1)
              )}
            </span>
          </div>
        ))}
      </div>
    )
  }

  if (section.cells) {
    if (section.cells.length === 0) return null
    return (
      <div className="mt-2 flex flex-col gap-[6px]">
        {section.cells.map((cell) => (
          <div key={cell.question_id} className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 flex-1 text-[13.5px] leading-[1.65]">{cell.text}</span>
            <span className="flex-none text-[13.5px] font-semibold">
              {cell.insufficient_data || cell.n === null ? (
                <span className="text-[11.5px] font-normal text-mut">{labels.insufficient}</span>
              ) : cell.avg !== null ? (
                cell.avg.toFixed(1)
              ) : (
                `n=${cell.n}`
              )}
            </span>
          </div>
        ))}
        <p className="mt-1 text-[11.5px] text-mut">
          {section.source === 'snapshot' ? labels.sourceSnapshot : labels.sourceLive}
        </p>
      </div>
    )
  }

  return null
}
