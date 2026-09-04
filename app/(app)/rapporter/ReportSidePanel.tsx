'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  createReportShare,
  saveReport,
  setReportSchedule,
  setReportStatus,
  setShareScope,
} from './editor-actions'
import type { EditorOptions, EditorReport, QuotePick } from './editor-types'

type Labels = {
  content: string
  filter: string
  share: string
  builtFrom: string
  period: string
  periodLast: string
  periodTwo: string
  periodAll: string
  group: string
  allGroups: string
  surveys: string
  groupThreshold: string
  whoSees: string
  roles: { key: 'ledelse' | 'ledere_eget_team' | 'alle_ansatte'; label: string; desc: string }[]
  copyLink: string
  exportPdf: string
  exportPptx: string
  leaderScopeNote: string
  plannedSend: string
  scheduleOptions: { key: 'none' | 'weekly' | 'monthly' | 'round'; label: string }[]
  scheduleNotes: Record<string, string>
  planSend: string
  closeSheet: string
  surveyChipMeta: string
  summary: string
  saveReport: string
  pickQuotes: string
  quotesEmpty: string
}

type Tab = 'innhold' | 'filter' | 'del'

/**
 * The editor's right rail — HeiTuva.dc.html:1182-1288.
 *
 * Three panels behind one segmented control. Every toggle writes to the report
 * row through a server action and refreshes, because the document beside it is
 * composed on the server: the design's "dokumentet oppdateres med en gang" is
 * a server round-trip here rather than local state, which is what keeps the
 * k-gate the only place that decides what a section may show.
 */
export function ReportSidePanel({
  report,
  options,
  canEdit,
  pptxEnabled,
  quotePicks,
  quotesChosen,
  labels,
}: {
  report: EditorReport
  options: EditorOptions
  canEdit: boolean
  pptxEnabled: boolean
  quotePicks: QuotePick[]
  quotesChosen: string[]
  labels: Labels
}) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('innhold')
  /**
   * Below xl the rail is a SHEET, not a second column (docs/RESPONSIVE.md § Report
   * editor: "side tabs become a sheet, same pattern as the Builder's right pane.
   * The document preview is the base layer at full width"). The button row stays
   * pinned under the header and opens it; at xl the sheet state is ignored and
   * the rail is simply the right column, exactly as the design draws it.
   */
  const [sheetOpen, setSheetOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [link, setLink] = useState<string | null>(null)

  function patch(next: Parameters<typeof saveReport>[0]) {
    startTransition(async () => {
      const result = await saveReport(next)
      if (result.ok) router.refresh()
    })
  }

  const on = new Set(report.sections)
  const chosenSurveys = new Set(report.filters.surveys)
  const picked = new Set(quotesChosen)

  const card = 'rounded-2xl border border-line bg-sf p-[18px]'
  const field =
    'touch-44-field mt-[6px] w-full rounded-[10px] border border-line bg-bg px-3 py-[10px] text-[13px] text-ink outline-none'
  const legend = 'block text-[11px] uppercase tracking-[.09em] text-mut'

  const openSheet = (next: Tab) => {
    setTab(next)
    setSheetOpen(true)
  }

  return (
    <div className="flex flex-col gap-[14px] xl:sticky xl:top-0">
      {/* The rail wraps below md (RESPONSIVE.md § Tab rails); the row gap has
          to carry the 44px hit areas apart when it does. */}
      <div className="flex flex-wrap gap-x-[3px] gap-y-[13px] rounded-[13px] bg-sf2 p-1 xl:gap-y-[3px]">
        {(
          [
            ['innhold', labels.content],
            ['filter', labels.filter],
            ['del', labels.share],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => openSheet(key)}
            aria-current={tab === key ? 'true' : undefined}
            className="touch-44 flex-1 cursor-pointer rounded-[10px] border-none px-3 py-[10px] text-[12.5px] font-semibold text-ink"
            style={{
              background: tab === key ? 'var(--sf)' : 'transparent',
              boxShadow: tab === key ? '0 1px 3px rgba(25,21,16,.14)' : 'none',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Base layer at xl, sheet below it. `hidden` rather than unmounted so a
          half-typed value in the Del panel survives closing the sheet. */}
      <div
        className={
          sheetOpen
            ? 'fixed inset-0 z-[70] flex flex-col gap-[14px] overflow-auto bg-bg p-5 xl:static xl:z-auto xl:overflow-visible xl:bg-transparent xl:p-0'
            : 'hidden flex-col gap-[14px] xl:flex'
        }
      >
        <button
          type="button"
          onClick={() => setSheetOpen(false)}
          aria-label={labels.closeSheet}
          className="touch-44 self-end rounded-[10px] border border-line bg-transparent px-4 py-2 text-[13px] font-semibold text-ink xl:hidden"
        >
          {labels.closeSheet}
        </button>

      {tab === 'innhold' ? (
        <div className={card}>
          <p className="text-[12.5px] leading-[1.5] text-mut">{labels.builtFrom}</p>
          <div className="mt-3 flex flex-col gap-[7px]">
            {options.sectionTypes.map((s) => {
              const active = on.has(s.key)
              return (
                <button
                  key={s.key}
                  type="button"
                  disabled={!canEdit || pending}
                  onClick={() =>
                    patch({
                      reportId: report.id,
                      sections: active
                        ? report.sections.filter((x) => x !== s.key)
                        : [...report.sections, s.key],
                    })
                  }
                  aria-pressed={active}
                  className="touch-44 flex cursor-pointer items-center gap-[10px] rounded-[11px] border p-3 text-left text-ink"
                  style={{
                    borderColor: active ? 'var(--ink)' : 'var(--line)',
                    background: active ? 'var(--sbg)' : 'var(--bg)',
                  }}
                >
                  <span
                    className="flex h-5 w-5 flex-none items-center justify-center rounded-[6px] border-[1.5px] text-[11px] font-bold"
                    style={{
                      borderColor: active ? 'var(--ink)' : 'var(--line)',
                      background: active ? 'var(--ac2)' : 'transparent',
                    }}
                  >
                    {active ? '✓' : ''}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold">{s.label}</span>
                    <span className="mt-px block text-[11.5px] leading-[1.35] text-mut">
                      {s.description}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>

          {/* "Velg sitater" — HeiTuva.dc.html:1202-1216. Shown only while the
              quotes section is on, exactly as `quotesOn` gates it there.

              What is stored differs from the prototype and is the whole point:
              it toggles an ANSWER ID, never the string. `app.report_quotes`
              resolves ids to text at render and re-runs the per-question
              k-gate each time, so a quote can stop appearing without anyone
              editing the report — which is what has to happen when the answers
              behind its question are deleted. */}
          {on.has('quotes') ? (
            <div className="mt-4">
              <div className={legend}>{labels.pickQuotes}</div>
              {quotePicks.length === 0 ? (
                <p className="mt-2 text-[12px] leading-[1.45] text-mut">{labels.quotesEmpty}</p>
              ) : (
                <div className="mt-2 flex flex-col gap-[6px]">
                  {quotePicks.map((q) => {
                    const active = picked.has(q.answer_id)
                    return (
                      <button
                        key={q.answer_id}
                        type="button"
                        disabled={!canEdit || pending}
                        aria-pressed={active}
                        onClick={() =>
                          patch({
                            reportId: report.id,
                            quotes: active
                              ? quotesChosen.filter((x) => x !== q.answer_id)
                              : [...quotesChosen, q.answer_id],
                          })
                        }
                        className="touch-44 flex cursor-pointer items-start gap-[9px] rounded-[10px] border px-[11px] py-[9px] text-left text-ink"
                        style={{
                          borderColor: active ? 'var(--ink)' : 'var(--line)',
                          background: active ? 'var(--sbg)' : 'var(--bg)',
                        }}
                      >
                        <span
                          className="mt-px flex h-[18px] w-[18px] flex-none items-center justify-center rounded-[5px] border-[1.5px] text-[10px] font-bold"
                          style={{
                            borderColor: active ? 'var(--ink)' : 'var(--line)',
                            background: active ? 'var(--ac2)' : 'transparent',
                          }}
                        >
                          {active ? '✓' : ''}
                        </span>
                        <span className="text-[12px] leading-[1.45]">{q.text}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      {tab === 'filter' ? (
        <div className={`${card} flex flex-col gap-[14px]`}>
          <label className="block">
            <span className={legend}>{labels.period}</span>
            <select
              className={field}
              disabled={!canEdit || pending}
              defaultValue="all"
              // Rounds are picked explicitly rather than by a relative window:
              // the report has to keep meaning the same thing after the next
              // round closes, and "siste runde" stored as a word would silently
              // repoint an archived statutory report at newer data.
              onChange={(e) => {
                const all = options.surveys.length ? report.filters.rounds : []
                patch({ reportId: report.id, rounds: e.target.value === 'all' ? [] : all })
              }}
            >
              <option value="last">{labels.periodLast}</option>
              <option value="two">{labels.periodTwo}</option>
              <option value="all">{labels.periodAll}</option>
            </select>
          </label>

          <label className="block">
            <span className={legend}>{labels.group}</span>
            <select
              className={field}
              disabled={!canEdit || pending}
              defaultValue={report.filters.group ?? ''}
              onChange={(e) => patch({ reportId: report.id, group: e.target.value || null })}
            >
              <option value="">{labels.allGroups}</option>
              {options.groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>

          <div>
            <span className={legend}>{labels.surveys}</span>
            <div className="mt-2 flex flex-col gap-[7px]">
              {options.surveys.map((s) => {
                const active = chosenSurveys.has(s.id)
                return (
                  <button
                    key={s.id}
                    type="button"
                    disabled={!canEdit || pending}
                    aria-pressed={active}
                    onClick={() =>
                      patch({
                        reportId: report.id,
                        surveys: active
                          ? report.filters.surveys.filter((x) => x !== s.id)
                          : [...report.filters.surveys, s.id],
                      })
                    }
                    className="touch-44 flex cursor-pointer items-center gap-[10px] rounded-[11px] border p-3 text-left text-ink"
                    style={{
                      borderColor: active ? 'var(--ink)' : 'var(--line)',
                      background: active ? 'var(--sbg)' : 'var(--bg)',
                    }}
                  >
                    <span
                      className="flex h-5 w-5 flex-none items-center justify-center rounded-[6px] border-[1.5px] text-[11px] font-bold"
                      style={{ borderColor: active ? 'var(--ink)' : 'var(--line)' }}
                    >
                      {active ? '✓' : ''}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-semibold">{s.title}</span>
                      <span className="mt-px block text-[11.5px] text-mut">
                        {labels.surveyChipMeta
                          .replace('{status}', s.status)
                          .replace('{count}', String(s.responses))}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          <p className="text-[12px] leading-[1.5] text-mut">{labels.groupThreshold}</p>
        </div>
      ) : null}

      {tab === 'del' ? (
        <div className={`${card} flex flex-col gap-3`}>
          <span className={legend}>{labels.whoSees}</span>
          {labels.roles.map((r) => {
            const active = report.shareScope === r.key
            return (
              <button
                key={r.key}
                type="button"
                disabled={!canEdit || pending}
                aria-pressed={active}
                onClick={() =>
                  startTransition(async () => {
                    const result = await setShareScope({ reportId: report.id, scope: r.key })
                    if (result.ok) router.refresh()
                  })
                }
                className="touch-44 flex cursor-pointer flex-col items-start gap-[2px] rounded-[11px] border px-[13px] py-[11px] text-left text-ink"
                style={{
                  borderColor: active ? 'var(--ink)' : 'var(--line)',
                  background: active ? 'var(--sbg)' : 'var(--bg)',
                }}
              >
                <span className="text-[13px] font-semibold">{r.label}</span>
                <span className="text-[11.5px] text-mut">{r.desc}</span>
              </button>
            )
          })}

          {/* The prototype prints a slug derived from the title. A link IS the
              credential here (DECISIONS: unguessable link only), so there is
              nothing to show until one is minted, and it is shown exactly once
              — only its hash is stored. */}
          <div className="overflow-hidden text-ellipsis whitespace-nowrap rounded-[10px] border border-dashed border-line bg-bg px-3 py-[10px] font-mono text-[12px] text-mut">
            {link ?? '—'}
          </div>
          <button
            type="button"
            disabled={!canEdit || pending}
            onClick={() =>
              startTransition(async () => {
                const result = await createReportShare({
                  reportId: report.id,
                  scope: report.shareScope,
                })
                if (result.ok) {
                  const url = `${window.location.origin}${result.url}`
                  setLink(url)
                  await navigator.clipboard?.writeText(url).catch(() => {})
                  router.refresh()
                }
              })
            }
            className="touch-44 cursor-pointer rounded-[10px] border-none bg-ac p-3 text-[13px] font-semibold text-acf"
          >
            {labels.copyLink}
          </button>

          <div className="flex gap-2">
            <a
              href={`/rapporter/${report.id}/pdf`}
              className="touch-44 flex-1 cursor-pointer rounded-[10px] border border-line bg-transparent p-[11px] text-center text-[12.5px] font-semibold text-ink no-underline"
            >
              {labels.exportPdf}
            </a>
            {/* Rendered but disabled behind feature_flags.pptx_export (Phase 5
                scope 5). The flag decides, not a hardcoded `disabled` — that is
                what makes turning it on in Phase 6 a row rather than a deploy. */}
            <button
              type="button"
              disabled={!pptxEnabled}
              title={labels.exportPptx}
              className="touch-44 flex-1 rounded-[10px] border border-line bg-transparent p-[11px] text-[12.5px] font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-40"
            >
              {labels.exportPptx}
            </button>
          </div>

          <p className="text-[12px] leading-[1.5] text-mut">{labels.leaderScopeNote}</p>
          <div className="h-px bg-line" />

          <span className={legend}>{labels.plannedSend}</span>
          <select
            className={field}
            disabled={!canEdit || pending}
            defaultValue={report.cadence}
            onChange={(e) =>
              startTransition(async () => {
                const result = await setReportSchedule({
                  reportId: report.id,
                  cadence: e.target.value as 'none' | 'weekly' | 'monthly' | 'round',
                })
                if (result.ok) router.refresh()
              })
            }
          >
            {labels.scheduleOptions.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
          <p className="text-[12px] leading-[1.5] text-mut">{labels.scheduleNotes[report.cadence]}</p>
          {/* The design's bordered confirm under the schedule note. It commits
              the cadence that is already selected — the select saves on change,
              so this is the "yes, that one" the design asks for rather than a
              second source of truth. */}
          <button
            type="button"
            disabled={!canEdit || pending || report.cadence === 'none'}
            onClick={() =>
              startTransition(async () => {
                const result = await setReportSchedule({ reportId: report.id, cadence: report.cadence })
                if (result.ok) router.refresh()
              })
            }
            className="touch-44 cursor-pointer rounded-[10px] border border-ink bg-transparent p-[11px] text-[12.5px] font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-40"
          >
            {labels.planSend}
          </button>
        </div>
      ) : null}

      </div>

      <div className="flex flex-wrap items-center justify-between gap-[10px]">
        <span className="text-[12px] text-mut">{labels.summary}</span>
        <button
          type="button"
          disabled={!canEdit || pending || report.status !== 'utkast'}
          onClick={() =>
            startTransition(async () => {
              const result = await setReportStatus({ reportId: report.id, status: 'klar' })
              if (result.ok) router.refresh()
            })
          }
          className="touch-44 cursor-pointer whitespace-nowrap rounded-[10px] border border-line bg-transparent px-4 py-[10px] text-[12.5px] font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-40"
        >
          {labels.saveReport}
        </button>
      </div>
    </div>
  )
}
