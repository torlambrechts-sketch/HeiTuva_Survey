import type { ComposedDocument, ComposedSection } from '@/app/(app)/rapporter/editor-types'

type Labels = {
  generated: string
  suppressedRow: string
  suppressedNote: string
  insufficient: string
  threshold: string
  scopeNote: string
  pending: string
  trendRound: string
  themeMentions: string
  invited: string
  responded: string
  completion: string
  summaryEmpty: string
  methodK: string
  methodAttributed: string
  sourceLowerK: string
}

/**
 * The shared report as its reader sees it — the document card from
 * HeiTuva.dc.html:1096-1180 with every editing control removed, because a
 * reader has nothing to edit.
 *
 * Mobile-first: a share link is opened on a phone far more often than the app
 * is, so this is one column at every width rather than the editor's two.
 */
export function SharedReport({
  doc,
  sectionLabels,
  labels,
}: {
  doc: ComposedDocument
  sectionLabels: Record<string, string>
  labels: Labels
}) {
  const sections = doc.sections ?? []

  return (
    <main className="mx-auto min-h-dvh max-w-[720px] animate-enter px-5 py-8">
      <div className="rounded-[18px] border border-line bg-sf px-6 py-[26px] shadow-[0_10px_28px_rgba(25,21,16,.06)] md:px-9 md:py-8">
        <div className="text-[11px] uppercase tracking-[.1em] text-mut">{doc.org_name}</div>
        <h1 className="mt-[6px] font-display text-[26px] font-medium leading-[1.2] md:text-[28px]">
          {doc.title}
        </h1>
        <p className="mt-1 text-[12.5px] text-mut">{labels.generated}</p>
        <p className="mt-[2px] text-[12.5px] text-mut">{labels.scopeNote}</p>

        <div className="my-[22px] h-px bg-line" />

        {sections.map((section) => (
          <section key={section.key} className="mb-[26px] last:mb-0">
            <h2 className="text-[15px] font-bold">{sectionLabels[section.key] ?? section.key}</h2>
            <SectionBody section={section} labels={labels} />
          </section>
        ))}

        {(doc.suppressed_groups?.length ?? 0) > 0 ? (
          <p className="mt-2 text-[12px] leading-[1.5] text-mut">{labels.suppressedNote}</p>
        ) : null}

        <p className="mt-4 border-t border-line pt-4 text-[12px] leading-[1.5] text-mut">
          {labels.threshold}
        </p>
      </div>
    </main>
  )
}

/**
 * The same shapes the editor renders, minus every control.
 *
 * It is written out again rather than shared with `ReportDocument` because the
 * two differ in what they may show, not only in how: this page has no move,
 * remove or group control, no draft chip and no section picker, and a reader
 * who is not a member must not be one prop away from any of them.
 */
function SectionBody({ section, labels }: { section: ComposedSection; labels: Labels }) {
  const extra = section.extra ?? undefined

  if (section.pending) {
    return <p className="mt-2 text-[13px] text-mut">{labels.pending}</p>
  }

  /**
   * T1.6 — the threshold the document rests on, in the method section, ALWAYS.
   *
   * `compose_report` has supplied `{k, sources}` for this section since
   * M:0089, and three of the four renderers read it: the editor
   * (`ReportDocument.tsx:274`), the PDF (`lib/reports/print.ts:120`) and the
   * deck (`lib/reports/pptx.ts:130`). This one did not, so the share link —
   * the only one of the four a reader OUTSIDE the organisation opens — showed
   * the method section with its threshold missing.
   *
   * The card's footer was not a substitute. `reports.groupThreshold` says
   * «Grupper under terskelen vises aldri nedbrutt» and carries no number, so
   * the reader learned that a threshold exists and never which one — and the
   * per-source line, which is the one that says a source is weaker than the
   * document claiming it, was absent altogether.
   */
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

  if (extra?.quotes) {
    if (extra.quotes.length === 0) return null
    return (
      <div className="mt-2 flex flex-col gap-[6px]">
        {extra.quotes.map((q) => (
          <p key={q.answer_id} className="text-[13.5px] leading-[1.65]">
            «{q.text}»
          </p>
        ))}
      </div>
    )
  }

  if (extra?.themes) {
    if (extra.themes.length === 0) return null
    return (
      <div className="mt-2 flex flex-col gap-[6px]">
        {extra.themes.map((th) => (
          <div key={th.label} className="text-[13.5px] leading-[1.65]">
            {labels.themeMentions.replace('{label}', th.label).replace('{count}', String(th.count))}
          </div>
        ))}
      </div>
    )
  }

  if (extra?.points) {
    return (
      <div className="mt-3 flex flex-col gap-[9px]">
        {extra.points.map((pt) => (
          <SharedBar
            key={pt.round_id}
            label={labels.trendRound.replace('{n}', String(pt.round_no))}
            value={pt.avg}
            withheldLabel={labels.suppressedRow}
          />
        ))}
      </div>
    )
  }

  if (extra?.drivers) {
    if (extra.drivers.length === 0) return null
    return (
      <div className="mt-3 flex flex-col gap-[9px]">
        {extra.drivers.map((d) => (
          <SharedBar
            key={d.question_id}
            label={d.text}
            value={d.avg}
            withheldLabel={labels.insufficient}
          />
        ))}
      </div>
    )
  }

  if (extra && typeof extra.invited === 'number') {
    return (
      <div className="mt-3 flex flex-wrap gap-6">
        {(
          [
            [labels.invited, String(extra.invited)],
            [labels.responded, String(extra.responded ?? 0)],
            ...(extra.completion === null || extra.completion === undefined
              ? []
              : ([[labels.completion, `${Math.round(extra.completion * 100)} %`]] as const)),
          ] as const
        ).map(([label, value]) => (
          <div key={label}>
            <div className="text-[11px] uppercase tracking-[.1em] text-mut">{label}</div>
            <div className="mt-1 font-display text-[26px] font-bold leading-none">{value}</div>
          </div>
        ))}
      </div>
    )
  }

  /* Sammendrag is prose here too — see the note in ReportDocument. Rendering
     `cells` in the share and print paths while the editor rendered findings
     meant the reader of a shared report saw a different Sammendrag from the
     person who wrote it. */
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

  if (section.rows) {
    if (section.rows.length === 0) return null
    return (
      <div className="mt-3 flex flex-col gap-[9px]">
        {section.rows.map((row) => (
          <SharedBar
            key={row.group_id ?? row.label ?? 'row'}
            label={row.label}
            value={row.suppressed ? null : row.avg}
            withheldLabel={labels.suppressedRow}
          />
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

/**
 * `value == null` and not `=== null`: a gated round arrives from `get_trends`
 * with no `avg` key at all rather than a null one, so a strict null check let
 * `undefined` through to `.toFixed`.
 */
function SharedBar({
  label,
  value,
  withheldLabel,
}: {
  label: string | null
  value: number | null | undefined
  withheldLabel: string
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-[110px] flex-none overflow-hidden text-ellipsis whitespace-nowrap text-[12.5px] md:w-[180px]">
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
      <span className="w-[74px] flex-none text-right text-[12.5px] font-semibold">
        {value == null ? (
          <span className="text-[11px] font-normal text-mut">{withheldLabel}</span>
        ) : (
          value.toFixed(1)
        )}
      </span>
    </div>
  )
}
