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
  pending: string
  pendingSub: string
  /** Q17 (brief §6): the method section states the threshold; a refused
   *  section states why; «Svar per virksomhet» says its table is not drawn yet. */
  methodK: string
  methodAttributed: string
  sectionUnavailable: string
  unavailablePersonSources: string
  perVirksomhetPending: string
  sourceLowerK: string
  trendRound: string
  driversHigh: string
  driversLow: string
  invited: string
  responded: string
  themeMentions: string
  quotesFallback: string
  quotesPicked: string
  quotesWithheld: string
  summaryEmpty: string
  /** Set only when the document came from a published report's frozen copy. */
  frozen: string | null
  notes: Record<string, string>
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
  /**
   * Which sections carry a group picker — the DESIGN's rule
   * (HeiTuva.dc.html:3087, `canGroup: k === "heatmap" || k === "teams"`), not
   * `report_section_types.supports_group_filter`.
   *
   * The column disagreed in both directions: false for `teams`, where the
   * design's own screenshot shows the picker, and true for `drivers` and
   * `themes`, where it does not. It is also not a UI flag — `get_quotes` reads
   * it to decide whether a leser may pass a group filter at all — so flipping
   * rows to fix a control would quietly widen a security input to answer a
   * layout question. The design's control is authoritative (CLAUDE.md); the
   * column keeps its own meaning.
   */
  const groupable = new Set(['heatmap', 'teams'])
  const hiddenCount = doc.suppressed_groups?.length ?? 0

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

      {labels.frozen ? (
        <p className="mt-2 text-[12px] leading-[1.5] text-mut">{labels.frozen}</p>
      ) : null}

      {hiddenCount > 0 ? (
        <p className="mt-2 text-[12px] leading-[1.5] text-mut">
          {labels.suppressedNote.replace('{count}', String(hiddenCount))}
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

  // Named, not faked. A section with no composer says so; borrowing another
  // section's numbers would be indistinguishable from content.
  if (section.pending) {
    return (
      <div className="mt-2">
        <p className="text-[13px] text-mut">{labels.pending}</p>
        <p className="mt-[2px] text-[11.5px] text-mut">{labels.pendingSub}</p>
      </div>
    )
  }

  // Refused for this report, with the reason — the RPC decided, the screen
  // repeats it. Never rendered gated, never rendered empty (brief §6).
  if (section.unavailable) {
    return (
      <div className="mt-2">
        <p className="text-[13px] text-mut">{labels.sectionUnavailable}</p>
        <p className="mt-[2px] text-[11.5px] text-mut">
          {section.reason === 'person_sources' ? labels.unavailablePersonSources : section.reason}
        </p>
      </div>
    )
  }

  const extra = section.extra ?? undefined
  const note = labels.notes[section.key]

  // Metode: the threshold the document rests on, and any source whose own
  // threshold is lower than the one the report uses.
  if (section.key === 'method' && extra && typeof extra.k === 'number') {
    const docK = extra.k
    return (
      <div className="mt-2 flex flex-col gap-[6px]">
        <p className="text-[13.5px] leading-[1.65]">
          {docK === 0 ? labels.methodAttributed : labels.methodK.replace('{k}', String(docK))}
        </p>
        {(extra.sources ?? [])
          .filter((s) => s.k > 0 && s.k < docK)
          .map((s) => (
            <p key={s.survey_id} className="text-[12px] leading-[1.5] text-mut">
              {labels.sourceLowerK
                .replace('{title}', s.title)
                .replace('{k}', String(s.k))
                .replace('{docK}', String(docK))}
            </p>
          ))}
      </div>
    )
  }

  // The rows are composed (and exported) — the table itself waits for the
  // design bundle's attributed view (docs/DEVIATIONS.md D87).
  if (section.key === 'per_virksomhet') {
    return <p className="mt-2 text-[13px] text-mut">{labels.perVirksomhetPending}</p>
  }

  if (section.rows) {
    if (section.rows.length === 0) return null
    return (
      <>
        <div className="mt-3 flex flex-col gap-[9px]">
          {section.rows.map((row) => (
            <Bar
              key={row.group_id ?? row.label ?? 'row'}
              label={row.label}
              value={row.suppressed ? null : row.avg}
              withheldLabel={labels.suppressedRow}
            />
          ))}
        </div>
        {note ? <Note text={note} /> : null}
      </>
    )
  }

  if (extra?.points) {
    return (
      <>
        <div className="mt-3 flex flex-col gap-[9px]">
          {extra.points.map((pt) => (
            <Bar
              key={pt.round_id}
              label={labels.trendRound.replace('{n}', String(pt.round_no))}
              value={pt.avg}
              withheldLabel={labels.suppressedRow}
            />
          ))}
        </div>
        {note ? <Note text={note} /> : null}
      </>
    )
  }

  if (extra?.quotes) {
    if (extra.quotes.length === 0) return null
    return (
      <>
        <div className="mt-2 flex flex-col gap-[6px]">
          {extra.quotes.map((q) => (
            <p key={q.answer_id} className="text-[13.5px] leading-[1.65]">
              «{q.text}»
            </p>
          ))}
        </div>
        {/* The design carries one of two notes under this section
            (HeiTuva.dc.html:2831): picked quotes say who chose them, an
            unpicked section says the first three are showing. The third line
            is ours — a pick the k-gate refused this render is said out loud
            rather than silently dropped from the list. */}
        <Note text={extra.picked ? labels.quotesPicked : labels.quotesFallback} />
        {extra.withheld ? (
          <Note text={labels.quotesWithheld.replace('{count}', String(extra.withheld))} />
        ) : null}
      </>
    )
  }

  if (extra?.themes) {
    if (extra.themes.length === 0) return null
    return (
      <>
        <div className="mt-2 flex flex-col gap-[6px]">
          {extra.themes.map((th) => (
            <div key={th.label} className="text-[13.5px] leading-[1.65]">
              {labels.themeMentions.replace('{label}', th.label).replace('{count}', String(th.count))}
            </div>
          ))}
        </div>
        {note ? <Note text={note} /> : null}
      </>
    )
  }

  if (extra?.drivers) {
    if (extra.drivers.length === 0) return null
    return (
      <div className="mt-3 flex flex-col gap-[9px]">
        {extra.drivers.map((d) => (
          <Bar key={d.question_id} label={d.text} value={d.avg} withheldLabel={labels.insufficient} />
        ))}
      </div>
    )
  }

  if (extra && typeof extra.invited === 'number') {
    return (
      <div className="mt-3 flex flex-wrap gap-6">
        <Stat label={labels.invited} value={String(extra.invited)} />
        <Stat label={labels.responded} value={String(extra.responded ?? 0)} />
        {extra.completion !== null && extra.completion !== undefined ? (
          <Stat label={labels.sourceLive} value={`${Math.round(extra.completion * 100)} %`} />
        ) : null}
      </div>
    )
  }

  /*
    Sammendrag is PROSE — "Tre hovedfunn i klartekst", as its own registry
    description says, and as the design writes it (HeiTuva.dc.html:1105-1120:
    five sentences, no numbers in a column).

    It arrives carrying `cells` as well as findings, because the composition
    needs them: the cross-section residual pass gates a scalar `n` against them,
    and a published report freezes them as the snapshot's `questions`. They are
    working data for the gate, not content for the reader — rendering them put a
    question-by-question table under a section whose whole point is that
    somebody already read the table for you.
  */
  if (section.key === 'summary') {
    const findings = (extra?.findings ?? []).filter((f) => f.text)
    if (findings.length === 0) {
      return <p className="mt-2 text-[13px] text-mut">{labels.summaryEmpty}</p>
    }
    return (
      <div className="mt-2 flex flex-col gap-[6px]">
        {findings.map((f, i) => (
          <p key={i} className="text-[13.5px] leading-[1.65]">
            {f.text}
          </p>
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
      </div>
    )
  }

  return null
}

/** The design's bar row: label, track, value — used by teams, trend and drivers
 *  alike, because the design draws all three the same way. */
function Bar({
  label, value, withheldLabel,
}: { label: string | null; value: number | null | undefined; withheldLabel: string }) {
  // `== null` on purpose: a gated round from get_trends has no `avg` key at all,
  // so the value arrives undefined rather than null. `value === null` let it
  // through to .toFixed() and took the whole page down.
  return (
    <div className="flex items-center gap-3">
      <span className="w-[120px] flex-none overflow-hidden text-ellipsis whitespace-nowrap text-[12.5px] leading-[1.35] text-ink xl:w-[220px]">
        {label}
      </span>
      <span className="block h-[14px] flex-1 overflow-hidden rounded-[7px] bg-sf2">
        {value == null ? null : (
          <span
            className="block h-full rounded-[7px] bg-ac"
            style={{ width: `${Math.max(0, Math.min(100, (value / 5) * 100))}%` }}
          />
        )}
      </span>
      <span className="w-[76px] flex-none text-right text-[12.5px] font-semibold">
        {value == null ? (
          <span className="text-[11px] font-normal text-mut">{withheldLabel}</span>
        ) : (
          value.toFixed(1)
        )}
      </span>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[12px] text-mut">{label}</div>
      <div className="mt-[2px] font-display text-[22px] font-semibold">{value}</div>
    </div>
  )
}

/** The muted line the design puts under a section, where it explains what the
 *  numbers are and why a row is missing. */
function Note({ text }: { text: string }) {
  return <p className="mt-[10px] text-[12px] leading-[1.5] text-mut">{text}</p>
}
