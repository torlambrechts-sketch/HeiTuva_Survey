'use client'

import { useState } from 'react'
import { attributedColumns, isNegative, type RoledQuestion } from '@/lib/questions/roles'
import { csvValue } from '@/lib/results/attributed-csv'
import type { Attributed, AttributedRow } from '@/lib/results/types'

/**
 * «Svar per virksomhet» — HeiTuva.dc.html:2537-2588, new in the v1 bundle.
 *
 * The register an Åpenhetsloven survey is actually read through: one row per
 * supplier, named, with the key answers as cells and the whole submission in a
 * grid that opens inside the row. There is no threshold anywhere in it and that
 * is the point (Q17 §5) — `app.k_for` returns 0 for an organisation survey,
 * because attribution is what the law asks for.
 *
 * WHICH QUESTIONS BECOME COLUMNS is `lib/questions/roles.ts`, which reads the
 * pack's `role` and contains no regex (DECISIONS Q35). A survey built by hand
 * has no roles and therefore no columns; it still lists who answered, and every
 * answer is one tap away in the detail grid. That empty state is deliberate —
 * guessing which question mattered is the thing Q35 forbids.
 *
 * The two filters are the two roles that carry a finding: «Har avdekket brudd»
 * selects rows whose `brudd` answer is «Ja», «Mangler policy» rows whose
 * `policy` answer is «Nei». Both disappear when the survey designates no such
 * question, rather than sitting there matching nothing.
 *
 * RESPONSIVE.md § Expandable rows (Q34): below `md` this is a card per row with
 * the detail grid opening inside the card as a single column. No overflow menu;
 * the only action is expand.
 */
export type AttributedLabels = {
  title: string
  /**
   * The already-formatted count line. A function would be tidier at the call
   * site and is not allowed: this is a client component, and a function prop
   * cannot cross the server boundary — it fails at render with a digest and no
   * message, which is how it was found. Every label here is a plain string for
   * that reason.
   */
  count: string
  exportCsv: string
  colOrg: string
  colDate: string
  colStatus: string
  filterAll: string
  filterBreach: string
  filterPolicy: string
  filterNot: string
  statusAnswered: string
  statusReminded: string
  statusNot: string
  notAnswered: string
  note: string
}

type Filter = 'alle' | 'brudd' | 'policy' | 'ikke'

const STATUS_CHIP: Record<AttributedRow['status'], { background: string; color: string }> = {
  // The bundle's literal values (:4874). Two of the three are token references;
  // the answered chip's green pair is written out there and is written out here.
  svart: { background: '#E4F2E0', color: '#2F5D2A' },
  paaminnet: { background: 'var(--sbg)', color: 'var(--ink)' },
  ikke_svart: { background: 'var(--sf2)', color: 'var(--ink)' },
}

export function AttributedTable({
  surveyId,
  data,
  labels,
}: {
  surveyId: string
  data: Attributed
  labels: AttributedLabels
}) {
  const [filter, setFilter] = useState<Filter>('alle')
  const [open, setOpen] = useState<string | null>(null)

  const questions: RoledQuestion[] = (data.questions ?? []).map((q) => ({
    id: q.id,
    text: q.text,
    config: (q as unknown as { config?: Record<string, unknown> }).config ?? null,
  }))
  const columns = attributedColumns(questions)
  const roleColumn = (role: string) => columns.find((c) => c.role === role) ?? null
  const bruddCol = roleColumn('brudd')
  const policyCol = roleColumn('policy')

  const rows = data.rows ?? []
  const answerOf = (row: AttributedRow, questionId: string) =>
    (row.answers ?? []).find((a) => a.question_id === questionId)?.value ?? null

  const filters: { key: Filter; label: string; shown: boolean }[] = [
    { key: 'alle', label: labels.filterAll, shown: true },
    // A filter for a question the survey does not designate would match nothing
    // for a reason no one can see from the screen, so it is not offered.
    { key: 'brudd', label: labels.filterBreach, shown: bruddCol !== null },
    { key: 'policy', label: labels.filterPolicy, shown: policyCol !== null },
    { key: 'ikke', label: labels.filterNot, shown: true },
  ]

  const visible = rows.filter((r) => {
    if (filter === 'ikke') return r.status !== 'svart'
    if (filter === 'brudd') return bruddCol ? isNegative('brudd', answerOf(r, bruddCol.id)) : false
    if (filter === 'policy') return policyCol ? isNegative('policy', answerOf(r, policyCol.id)) : false
    return true
  })

  const statusLabel = (s: AttributedRow['status']) =>
    s === 'svart' ? labels.statusAnswered : s === 'paaminnet' ? labels.statusReminded : labels.statusNot

  const dateOf = (row: AttributedRow) =>
    row.responded_at
      ? new Date(row.responded_at).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' })
      : '—'

  const cell = (row: AttributedRow, columnId: string, role: string) => {
    const value = answerOf(row, columnId)
    const text = value === null || value === '' ? '—' : csvValue(value)
    const neg = isNegative(role as 'brudd', value)
    return { text, bg: value === null || value === '' ? 'transparent' : neg ? 'var(--ac3)' : '#E4F2E0' }
  }

  return (
    <section className="rounded-2xl border border-line bg-sf p-[22px]">
      <div className="flex flex-wrap items-center justify-between gap-[14px]">
        <div>
          <h2 className="font-display text-[23px] font-bold">{labels.title}</h2>
          <p className="mt-[3px] text-[13px] text-mut">{labels.count}</p>
        </div>
        <div className="flex flex-wrap items-center gap-[10px]">
          {/* RESPONSIVE.md § Tab rails and chip groups: wrap below md, never
              scroll. At 390px the four filters ran off the card's right edge
              and «Ikke svart» was unreachable — a chip you cannot see is a
              feature hidden on mobile, which rule 4 forbids. */}
          <div className="flex flex-wrap gap-[3px] rounded-[22px] p-1 md:rounded-full" style={{ background: 'var(--sf2)' }} role="group" aria-label={labels.title}>
            {filters.filter((f) => f.shown).map((f) => (
              <button
                key={f.key}
                type="button"
                aria-pressed={filter === f.key}
                onClick={() => setFilter(f.key)}
                className="touch-44 cursor-pointer whitespace-nowrap rounded-full border-none px-[14px] py-2 text-[12.5px] font-semibold text-ink"
                style={{ background: filter === f.key ? 'var(--ac)' : 'transparent' }}
              >
                {f.label}
              </button>
            ))}
          </div>
          {/* A link, not a button: the export is a GET that the browser can
              follow, retry and re-request, and nothing about producing a file
              is a mutation. Q43's route is what refuses a leser — this control
              is not the gate, it is the way in. */}
          <a
            href={`/undersokelser/${surveyId}/resultater/csv`}
            className="touch-44 flex cursor-pointer items-center whitespace-nowrap rounded-[10px] border border-line bg-transparent px-4 py-[10px] text-[12.5px] font-semibold text-ink"
          >
            {labels.exportCsv}
          </a>
        </div>
      </div>

      {/* Desktop: the header row of a table drawn in flex, as the bundle draws
          it. Hidden below md, where each row becomes its own card (Q34). */}
      <div className="mt-[14px] hidden items-end gap-[10px] border-b border-line pb-2 pt-3 text-[11px] uppercase tracking-[.08em] text-mut md:flex">
        <span className="min-w-0 flex-1">{labels.colOrg}</span>
        <span className="w-20 flex-none">{labels.colDate}</span>
        <span className="w-[104px] flex-none">{labels.colStatus}</span>
        {columns.map((c) => (
          <span
            key={c.id}
            title={c.full}
            className="w-24 flex-none text-[11.5px] leading-tight normal-case tracking-normal"
          >
            {c.label}
          </span>
        ))}
        <span className="w-6 flex-none" />
      </div>

      <div className="flex flex-col md:block">
        {visible.map((row) => {
          const isOpen = open === row.invitation_id
          return (
            <div
              key={row.invitation_id}
              className="mt-[10px] rounded-[12px] border border-line md:mt-0 md:rounded-none md:border-0 md:border-b md:border-line"
            >
              {/*
                DOM order is the DESKTOP reading order — name, date, status,
                answers, expander — and `order-*` moves the expander up on
                mobile rather than the markup moving. Below md the row wraps to
                two lines: the name and the chevron, then the status and the
                date. Truncating a supplier's name to "Ber…" to keep one line,
                which is what the first version did, defeats the point of a
                register.
              */}
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : row.invitation_id)}
                aria-expanded={isOpen}
                className="flex w-full cursor-pointer flex-wrap items-center gap-x-[10px] gap-y-[7px] border-none bg-transparent p-3 text-left font-[inherit] text-ink md:flex-nowrap md:gap-y-0 md:px-0 md:py-3"
              >
                {/* The basis is what makes it wrap. `flex-1` alone is
                    `flex-basis: 0`, so the name contributes nothing to the
                    wrap calculation, everything fits on one line, and the name
                    is the thing that gets squeezed — «Ber…» for Bergen
                    Logistikk AS. Claiming the full line minus the chevron
                    pushes the status and the date onto the second. */}
                <span className="order-1 min-w-0 flex-1 basis-[calc(100%-34px)] truncate text-sm font-semibold md:basis-0">
                  {row.name ?? row.email ?? '—'}
                </span>
                <span className="order-4 w-20 flex-none text-[12.5px] text-mut md:order-2">
                  {dateOf(row)}
                </span>
                <span className="order-3 w-[104px] flex-none md:order-3">
                  <span
                    className="inline-block rounded-full px-[10px] py-1 text-[11.5px] font-bold"
                    style={STATUS_CHIP[row.status]}
                  >
                    {statusLabel(row.status)}
                  </span>
                </span>
                {/* The answer cells are the desktop row. On a card they would be
                    a second, narrower copy of the detail grid below, so they are
                    not repeated — RESPONSIVE.md's rule is that the detail opens
                    inside the card, not that the row is reproduced twice. */}
                {columns.map((c) => {
                  const { text, bg } = cell(row, c.id, c.role)
                  return (
                    <span key={c.id} className="hidden w-24 flex-none md:order-4 md:block">
                      <span
                        className="inline-block rounded-full px-[10px] py-1 text-xs font-semibold"
                        style={{ background: bg }}
                      >
                        {text}
                      </span>
                    </span>
                  )
                })}
                <span aria-hidden className="order-2 w-6 flex-none text-center text-xs text-mut md:order-5">
                  {isOpen ? '▴' : '▾'}
                </span>
              </button>

              {isOpen ? (
                <div className="grid grid-cols-1 gap-[10px_18px] px-3 pb-4 md:grid-cols-2 md:px-0">
                  {questions.map((q) => {
                    const a = (row.answers ?? []).find((x) => x.question_id === q.id)
                    return (
                      <div key={q.id} className="rounded-[10px] border border-line bg-bg px-[13px] py-[11px]">
                        <div className="text-xs leading-[1.4] text-mut">{q.text}</div>
                        <div className="mt-1 text-[13.5px] font-semibold leading-[1.4]">
                          {a ? csvValue(a.value) || labels.notAnswered : labels.notAnswered}
                          {a?.comment ? <span className="font-normal text-mut"> — {a.comment}</span> : null}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : null}
            </div>
          )
        })}
      </div>

      <p className="mt-3 text-[12.5px] leading-normal text-mut">{labels.note}</p>
    </section>
  )
}
