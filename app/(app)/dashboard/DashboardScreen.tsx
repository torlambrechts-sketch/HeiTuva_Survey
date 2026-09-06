import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { numberWord } from '@/lib/respondent/anonymity-promise'
import { DASH, fmt, heatTone, no, panelTone, pctOf5 } from '@/lib/results/present'
import { isGated, type DashboardSummary, type Heatmap, type Theme } from '@/lib/results/types'
import { InsightTabs } from '@/components/InsightTabs'
import { DashboardFilters } from './DashboardFilters'
import { PinButton } from './PinButton'
import { OpenPinnedButton } from './OpenPinnedButton'

const CARD = 'rounded-2xl border border-line bg-sf p-[22px]'

export async function DashboardScreen({
  surveys,
  selected,
  groups,
  group,
  period,
  summary,
  heatmap,
  trendBars,
  themes,
  filterLine,
  pinned,
}: {
  surveys: { id: string; title: string; status: string }[]
  selected: string[]
  groups: { id: string; name: string }[]
  group: string | null
  period: 'q' | 'h' | 'y'
  summary: DashboardSummary | null
  heatmap: Heatmap | null
  trendBars: { key: string; label: string; avg: number | null }[]
  themes: Theme[]
  filterLine: string
  /** The member's own pins, from `dashboard_pins`. */
  pinned: string[]
}) {
  const t = await getTranslations('dashboard')
  const tr = await getTranslations('results')
  const tNav = await getTranslations('nav')
  const locale = await getLocale()
  // The strictest threshold across the selected surveys, as the RPCs applied
  // it (Q17). Null only when there is nothing to show — then no cell is gated.
  const heatK = heatmap?.k ?? null
  const trendK = summary?.k ?? heatK

  const isPinned = new Set(pinned)
  const pin = (key: string) => (
    <PinButton
      panelKey={key}
      pinned={isPinned.has(key)}
      labelOn={t('pinnedOn')}
      labelOff={t('pinnedOff')}
    />
  )

  // Same rule as Resultater: a failed read renders as the em dash, not as zero.
  // "0 svar i utvalget" is a claim about the organisation; "—" is a claim about
  // the request.
  const unavailable = summary === null
  const completion = summary?.completion ?? null
  const pct = completion === null ? null : Math.round(completion * 100)

  // "Høyest og lavest" — the three best and three worst, as the design draws
  // them. Every driver in the list already carries a real n past the gate; a
  // gated question is not in the payload at all, so there is nothing to filter.
  const drivers = summary?.drivers ?? []
  const highest = drivers.slice(0, 3)
  const lowest = drivers.slice(-3).reverse().filter((d) => !highest.includes(d))

  const stats = [
    {
      key: 'responses',
      label: t('statResponses'),
      value: summary ? String(summary.n) : DASH,
      note: summary ? t('statResponsesNote', { invited: summary.invited }) : DASH,
    },
    {
      key: 'rate',
      label: t('statRate'),
      value: pct === null ? DASH : `${pct} %`,
      note: unavailable ? DASH : pct !== null && pct >= 70 ? t('statRateAbove') : t('statRateBelow'),
    },
    {
      key: 'avg',
      label: t('statAvg'),
      value: fmt(summary?.avg ?? null),
      note: t('statAvgNote'),
    },
    {
      key: 'surveys',
      label: t('statSurveys'),
      value: String(selected.length),
      note: t('statSurveysNote', { total: surveys.length }),
    },
  ]

  const href = (patch: Record<string, string | string[] | undefined>) => {
    const params = new URLSearchParams()
    const next = { periode: period, gruppe: group ?? undefined, u: selected, ...patch }
    if (next.periode && next.periode !== 'y') params.set('periode', String(next.periode))
    if (next.gruppe) params.set('gruppe', String(next.gruppe))
    const chosen = Array.isArray(next.u) ? next.u : next.u ? [String(next.u)] : []
    if (chosen.length && chosen.length !== surveys.length) {
      for (const id of chosen) params.append('u', id)
    }
    const q = params.toString()
    return q ? `/dashboard?${q}` : '/dashboard'
  }

  return (
    <div className="animate-enter pt-[34px]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          {/* The v1 bundle merges Dashboard and Rapporter under one heading
              with a rail between them (HeiTuva.dc.html:918-928). */}
          <div className="flex flex-wrap items-center gap-[14px]">
            <h1 className="font-display text-[28px] font-medium">{tNav('insight')}</h1>
            <InsightTabs
              label={tNav('insightTabs')}
              tabs={[
                { href: '/dashboard', label: tNav('dashboard') },
                { href: '/rapporter', label: tNav('reports') },
              ]}
            />
          </div>
          {/* "Levende tall · {utvalg} · {terskel}". The threshold is the one
              the RPCs actually applied to the panels on this screen — the k
              they returned for this selection, never a figure computed here
              (DECISIONS Q42's default; CLAUDE.md forbids a number the gate did
              not produce). It is omitted when there is nothing to gate. */}
          <p className="mt-[6px] text-[13px] text-mut">
            {unavailable
              ? t('unavailable')
              : [t('liveNumbers'), filterLine, trendK === null ? null : t('thresholdLine', { k: trendK })]
                  .filter(Boolean)
                  .join(' · ')}
          </p>
        </div>
        <DashboardFilters
          period={period}
          group={group}
          groups={groups}
          selected={selected}
          allCount={surveys.length}
          labels={{
            period: t('periodFilter'),
            group: t('groupFilter'),
            allGroups: t('allGroups'),
            q: t('periodLast'),
            h: t('periodTwo'),
            y: t('periodAll'),
          }}
        />
        {/* The design puts "Åpne rapport" at the end of the filter row
            (HeiTuva.dc.html:831), after the period and group selects. */}
        <OpenPinnedButton
          count={pinned.length}
          label={t('openPinned')}
          title={t('pinnedReportTitle', {
            date: new Date().toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' }),
          })}
        />
      </div>

      {/* RESPONSIVE.md § Tab rails and chip groups: the chips wrap, keep their
          design size, and nothing is hidden or moved behind a select. */}
      <div className="mt-4 flex flex-wrap gap-2">
        {surveys.map((s) => {
          const on = selected.includes(s.id)
          const next = on
            ? selected.filter((id) => id !== s.id)
            : [...selected, s.id]
          return (
            <Link
              key={s.id}
              href={href({ u: next.length ? next : surveys.map((x) => x.id) })}
              scroll={false}
              aria-pressed={on}
              className="touch-44 flex cursor-pointer items-center gap-2 rounded-full border px-[13px] py-2 text-[12.5px] font-semibold text-ink no-underline"
              style={{
                borderColor: on ? 'var(--ink)' : 'var(--line)',
                background: on ? 'var(--sbg)' : 'var(--bg)',
              }}
            >
              <span
                className="flex h-4 w-4 flex-none items-center justify-center rounded-[5px] text-[10px] font-bold"
                style={{ border: `1.5px solid ${on ? 'var(--ink)' : 'var(--line)'}` }}
              >
                {on ? '✓' : ''}
              </span>
              {s.title}
            </Link>
          )
        })}
      </div>

      <div className="mt-5 grid grid-cols-1 gap-[15px] md:grid-cols-2 xl:grid-cols-4">
        {stats.map((s) => (
          <div key={s.key} className="rounded-2xl border border-line bg-sf px-5 py-[18px]">
            <div className="text-[11px] uppercase tracking-[.1em] text-mut">{s.label}</div>
            <div className="mt-2 font-display text-[35px] font-bold leading-[1.05]">{s.value}</div>
            <div className="mt-[2px] text-[13px] text-mut">{s.note}</div>
          </div>
        ))}
      </div>

      <div className="mt-[18px] grid grid-cols-1 gap-[18px] xl:grid-cols-2">
        {/* Panel order is the bundle's own: `dashPanels` is
            ["trend","heatmap","drivers","themes"] and the heatmap spans
            `1 / -1` (HeiTuva.dc.html:3045-3047). Grid auto-placement therefore
            puts trend alone on row one, the heatmap across row two, and drivers
            beside themes on row three — including the empty cell next to trend.
            Reordering to fill that cell reads as an improvement and is exactly
            what CLAUDE.md rules out. */}
        <Panel title={t('panelTrend')} note={t('trendNote')} action={pin('trend')}>
          {trendBars.length ? (
            <div className="mt-[14px] flex flex-col gap-[9px]">
              {trendBars.map((b) => (
                <BarRow
                  key={b.key}
                  label={b.label}
                  value={b.avg === null ? tr('gatedCell', { k: trendK ?? 0 }) : no(b.avg)}
                  pct={b.avg === null ? 0 : pctOf5(b.avg)}
                  color={b.avg === null ? 'var(--sf2)' : 'var(--ac)'}
                />
              ))}
            </div>
          ) : (
            <Empty text={t('noData')} />
          )}
        </Panel>

        <div className="xl:col-span-2">
          <Panel
            title={t('panelHeatmap')}
            note={heatK === null ? t('heatNoteGeneric') : t('heatNote', { k: heatK, kWord: numberWord(heatK, locale) })}
            action={pin('heatmap')}
          >
            <HeatGrid heatmap={heatmap} gated={tr('gatedCell', { k: heatK ?? 0 })} gatedTitle={tr('gatedTitle', { k: heatK ?? 0 })} empty={t('noData')} />
          </Panel>
        </div>

        <Panel title={t('panelDrivers')} note={t('driversNote')} action={pin('drivers')}>
          {highest.length || lowest.length ? (
            <div className="mt-[14px] flex flex-col gap-[9px]">
              {highest.map((d) => (
                <BarRow key={`h-${d.question_id}`} label={d.text} value={no(d.avg)} pct={pctOf5(d.avg)} color="var(--ac2)" />
              ))}
              {lowest.map((d) => (
                <BarRow key={`l-${d.question_id}`} label={d.text} value={no(d.avg)} pct={pctOf5(d.avg)} color="var(--ac3)" />
              ))}
            </div>
          ) : (
            <Empty text={t('noData')} />
          )}
        </Panel>

        <Panel title={t('panelThemes')} note={t('themesNote')} action={pin('themes')}>
          {themes.length ? (
            <div className="mt-[14px] flex flex-wrap gap-2">
              {themes.map((theme) => (
                <span key={theme.key} className="rounded-full bg-sbg px-[14px] py-2 text-[13px]">
                  {/* The dashboard's own wording, not Resultater's: the
                      design writes "tid · nevnt 19 ganger" on both screens
                      (HeiTuva.dc.html:1466), and the short form here read as a
                      count of something unnamed. */}
                  {t('themeMentions', { label: theme.label, count: theme.mentions })}
                </span>
              ))}
            </div>
          ) : (
            <Empty text={tr('themesEmpty')} />
          )}
        </Panel>
      </div>

      {surveys.length === 0 ? (
        <div className={`${CARD} mt-[18px] text-center`}>
          <p className="font-display text-[21px] font-bold">{t('empty')}</p>
          <p className="mx-auto mt-2 max-w-[420px] text-[13px] leading-relaxed text-mut">
            {t('emptyBody')}
          </p>
        </div>
      ) : null}
    </div>
  )
}

function Panel({
  title,
  note,
  action,
  children,
}: {
  title: string
  note: string
  /** The design puts the pin on the panel's own header row, right-aligned. */
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className={CARD}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-[21px] font-bold">{title}</h2>
        {action}
      </div>
      {children}
      <p className="mt-3 text-xs leading-[1.5] text-mut">{note}</p>
    </section>
  )
}

function Empty({ text }: { text: string }) {
  return <p className="mt-[14px] text-[13px] text-mut">{text}</p>
}

function BarRow({
  label,
  value,
  pct,
  color,
}: {
  label: string
  value: string
  pct: number
  color: string
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-[140px] flex-none truncate text-[12.5px] xl:w-[180px]" title={label}>
        {label}
      </span>
      <span className="block h-[14px] flex-1 overflow-hidden rounded-[7px] bg-sf2">
        <span className="block h-full rounded-[7px]" style={{ background: color, width: `${pct}%` }} />
      </span>
      <span className="w-[70px] flex-none text-right text-[12.5px] font-semibold">{value}</span>
    </div>
  )
}

/**
 * The heatmap grid, and below `md` the grouped list RESPONSIVE.md specifies:
 * one section per team, one row per question, the same colour scale and the
 * same gated treatment. Both are rendered from the same payload rather than
 * from two different reads, so they cannot disagree.
 */
function HeatGrid({
  heatmap,
  gated,
  gatedTitle,
  empty,
}: {
  heatmap: Heatmap | null
  gated: string
  gatedTitle: string
  empty: string
}) {
  if (!heatmap || heatmap.cols.length === 0 || heatmap.rows.length === 0) {
    return <Empty text={empty} />
  }
  const label = (text: string) => (text.length > 26 ? `${text.slice(0, 24)}…` : text)

  return (
    <>
      <div className="mt-[14px] hidden overflow-x-auto md:block">
        <div className="flex items-end gap-[6px] pl-[118px]">
          {heatmap.cols.map((c) => (
            <span key={c.question_id} className="min-w-[64px] flex-1 text-[10.5px] leading-[1.3] text-mut">
              {label(c.text)}
            </span>
          ))}
        </div>
        <div className="mt-2 flex flex-col gap-[6px]">
          {heatmap.rows.map((row) => (
            <div key={row.group_id} className="flex items-center gap-[6px]">
              <span className="w-[112px] flex-none text-[12.5px] font-semibold">{row.label}</span>
              {row.cells.map((cell) => (
                <span
                  key={cell.question_id}
                  title={isGated(cell) ? gatedTitle : undefined}
                  className="flex h-[38px] min-w-[64px] flex-1 items-center justify-center rounded-lg text-[12.5px] font-semibold"
                  style={{ background: heatTone(cell) }}
                >
                  {isGated(cell) ? gated : no(cell.avg)}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-[14px] flex flex-col gap-4 md:hidden">
        {heatmap.rows.map((row) => (
          <div key={row.group_id}>
            <div className="text-[12.5px] font-semibold">{row.label}</div>
            <div className="mt-2 flex flex-col gap-[6px]">
              {heatmap.cols.map((col) => {
                const cell = row.cells.find((c) => c.question_id === col.question_id)
                if (!cell) return null
                return (
                  <div key={col.question_id} className="flex items-center gap-[10px]">
                    <span className="min-w-0 flex-1 truncate text-[12.5px] text-mut">{label(col.text)}</span>
                    <span
                      title={isGated(cell) ? gatedTitle : undefined}
                      className="flex h-11 w-[68px] flex-none items-center justify-center rounded-lg text-[12.5px] font-semibold"
                      style={{ background: heatTone(cell) }}
                    >
                      {isGated(cell) ? gated : no(cell.avg)}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

/** Kept beside the grid so the teams panel's ramp is defined once. */
export const teamBarTone = panelTone
