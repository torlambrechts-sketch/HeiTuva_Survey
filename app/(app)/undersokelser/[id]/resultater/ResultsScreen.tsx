import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import {
  DASH,
  fmt,
  no,
  pctOf5,
  pctOfEnps,
  questionBars,
  scaleKeys,
  teamTone,
} from '@/lib/results/present'
import { isGated } from '@/lib/results/types'
import type {
  Aggregate,
  Benchmarks,
  Insight,
  QuestionResult,
  ResultsSummary,
  Themes,
  Trends,
} from '@/lib/results/types'
import { SurveyPicker } from './SurveyPicker'
import { ShareThemes } from './ShareThemes'

type Question = { id: string; type: string; text: string; config: Record<string, unknown> }
type QuoteSet = { n: number; theme: string | null; quotes: { text: string }[] }

/** Card chrome the design repeats on every panel of this screen. */
const CARD = 'rounded-2xl border border-line bg-sf p-[22px] shadow-card'

const num = (c: Record<string, unknown>, key: string, fallback: number): number =>
  typeof c[key] === 'number' ? (c[key] as number) : fallback
const str = (c: Record<string, unknown>, key: string): string | null =>
  typeof c[key] === 'string' && c[key] ? (c[key] as string) : null
const list = (c: Record<string, unknown>, key: string): string[] =>
  Array.isArray(c[key]) ? (c[key] as unknown[]).map(String) : []

export async function ResultsScreen({
  surveyId,
  status,
  anonymity,
  scopeLabel,
  sentAt,
  hasRounds,
  surveys,
  questions,
  summary,
  aggregate,
  trends,
  themes,
  benchmarks,
  industries,
  industry,
  activeTheme,
  quotes,
}: {
  surveyId: string
  status: 'utkast' | 'aktiv' | 'lukket'
  anonymity: 'anonymous' | 'named' | 'optional'
  scopeLabel: string
  sentAt: string | null
  hasRounds: boolean
  surveys: { id: string; title: string; status: string }[]
  questions: Question[]
  summary: ResultsSummary | null
  aggregate: Aggregate | null
  trends: Trends | null
  themes: Themes | null
  benchmarks: Benchmarks | null
  industries: string[]
  industry: string
  activeTheme: string | null
  quotes: Record<string, QuoteSet | null>
}) {
  const t = await getTranslations('results')
  const tNav = await getTranslations('surveyNav')

  const byQuestion = new Map<string, QuestionResult>(
    (aggregate?.questions ?? []).map((q) => [q.question_id, q]),
  )

  // "Denne runden" and "forrige runde" are the last two points on the real
  // trend line. The prototype computes the previous round as `avg - 0.3`, which
  // is a placeholder, not a number this app is allowed to draw.
  const points = trends?.points ?? []
  const thisRound = points[points.length - 1] ?? null
  const prevRound = points[points.length - 2] ?? null
  const thisAvg = thisRound && !isGated(thisRound) ? thisRound.avg : null
  const prevAvg = prevRound && !isGated(prevRound) ? prevRound.avg : null
  const delta = thisAvg !== null && prevAvg !== null ? thisAvg - prevAvg : null

  const completion = summary?.completion ?? null
  const stats = [
    {
      key: 'responses',
      label: t('statResponses'),
      value: String(summary?.n ?? 0),
      note: t('statResponsesNote', { invited: summary?.invited ?? 0 }),
      bg: 'var(--sf)',
      fg: 'var(--ink)',
    },
    {
      key: 'rate',
      label: t('statRate'),
      value: completion === null ? DASH : `${Math.round(completion * 100)}%`,
      note: t('statRateNote'),
      bg: 'var(--ac)',
      fg: 'var(--acf)',
    },
    {
      key: 'avg',
      label: t('statAvg'),
      value: fmt(summary?.avg ?? null),
      note: t('statAvgNote'),
      bg: 'var(--sf)',
      fg: 'var(--ink)',
    },
    {
      key: 'status',
      label: t('statStatus'),
      value: tNav(
        status === 'aktiv' ? 'statusAktiv' : status === 'lukket' ? 'statusLukket' : 'statusUtkast',
      ),
      note: sentAt
        ? t('statusSent', { date: new Date(sentAt).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' }) })
        : t('statusNotSent'),
      bg: 'var(--sf)',
      fg: 'var(--ink)',
    },
  ]

  return (
    <div className="flex animate-enter flex-col gap-[18px] pt-[26px]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[26px] font-medium">{t('title')}</h1>
          <p className="mt-[3px] text-[12.5px] text-mut">{scopeLabel}</p>
        </div>
        <SurveyPicker label={t('switchSurvey')} current={surveyId} surveys={surveys} />
      </div>

      {!hasRounds ? (
        <div className={`${CARD} text-center`}>
          <p className="font-display text-[23px] font-bold">{t('notSentYet')}</p>
          <p className="mx-auto mt-2 max-w-[460px] text-[13px] leading-relaxed text-mut">
            {t('notSentYetBody')}
          </p>
        </div>
      ) : null}

      {/* RESPONSIVE.md: the four stat cards keep their design size and reflow
          to two columns below xl and one below md. */}
      <div className="grid grid-cols-1 gap-[15px] md:grid-cols-2 xl:grid-cols-4">
        {stats.map((s) => (
          <div
            key={s.key}
            className="rounded-2xl border border-line px-5 py-[18px]"
            style={{ background: s.bg, color: s.fg }}
          >
            <div className="text-[11px] uppercase tracking-[.1em] opacity-70">{s.label}</div>
            <div className="mt-2 font-display text-[35px] font-bold leading-[1.05]">{s.value}</div>
            <div className="mt-[2px] text-[12.5px] opacity-75">{s.note}</div>
          </div>
        ))}
      </div>

      {questions.map((q) => {
        const result = byQuestion.get(q.id)
        if (!result) return null
        return (
          <section key={q.id} className={CARD}>
            <div className="flex items-baseline justify-between gap-[14px]">
              <h2 className="text-[15.5px] font-semibold">{q.text}</h2>
              <span className="shrink-0 text-[13px] text-mut">
                {questionMeta(q, result, quotes[q.id] ?? null)}
              </span>
            </div>
            {isGated(result) ? (
              <p className="mt-[15px] rounded-[10px] bg-sf2 px-[15px] py-[13px] text-[13.5px] text-mut">
                {t('insufficient')}
              </p>
            ) : q.type === 'text' ? (
              <QuoteList set={quotes[q.id] ?? null} anonymous={anonymity === 'anonymous'} anonLabel={t('anonymous')} empty={t('insufficient')} />
            ) : (
              <div className="mt-[15px] flex flex-col gap-[10px]">
                {questionBars(result, optionKeys(q)).map((b) => (
                  <div key={b.key} className="flex items-center gap-3">
                    <span className="w-[126px] flex-none text-right text-[13px] text-mut">
                      {b.label}
                    </span>
                    <span className="block h-6 flex-1 overflow-hidden rounded-lg bg-sf2">
                      <span
                        className="block h-full rounded-lg"
                        style={{ background: b.color, width: `${b.pct}%` }}
                      />
                    </span>
                    <span className="w-[70px] flex-none text-[12.5px] font-semibold">{b.value}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        )
      })}

      <section className={`${CARD} mb-[18px]`}>
        <h2 className="font-display text-[23px] font-bold">{t('whatAnswersTell')}</h2>
        {summary && summary.insights.length > 0 ? (
          <div className="mt-[14px] flex flex-col gap-[10px]">
            {summary.insights.map((i, idx) => (
              <InsightRow key={`${i.key}-${idx}`} insight={i} questions={questions} />
            ))}
          </div>
        ) : null}
        <p className="mt-3 text-[13px] text-mut">
          {summary && summary.n >= (summary.k ?? 5) ? t('insightNote') : t('insightNoteWaiting')}
        </p>
        <div className="mt-[14px] flex flex-wrap gap-2 border-t border-line pt-[14px]">
          {(
            [
              ['reportLineSummary', 'reportLineSummaryMeta'],
              ['reportLineGroups', 'reportLineGroupsMeta'],
              ['reportLineThemes', 'reportLineThemesMeta'],
              ['reportLineActions', 'reportLineActionsMeta'],
              ['reportLineMethod', 'reportLineMethodMeta'],
            ] as const
          ).map(([label, meta]) => (
            <span
              key={label}
              className="rounded-full bg-sf2 px-[13px] py-[7px] text-[13px] text-mut"
            >
              {t(label)} · {t(meta)}
            </span>
          ))}
        </div>
      </section>

      {benchmarks && benchmarks.rows.length > 0 ? (
        <section className={`${CARD} mb-[18px]`}>
          <div className="flex flex-wrap items-baseline justify-between gap-[14px]">
            <h2 className="font-display text-[23px] font-bold">{t('vsIndustry')}</h2>
            <div className="flex flex-wrap gap-[6px]">
              {industries.map((ind) => (
                <Link
                  key={ind}
                  href={`/undersokelser/${surveyId}/resultater?bransje=${encodeURIComponent(ind)}`}
                  scroll={false}
                  aria-current={ind === industry ? 'true' : undefined}
                  className="touch-44 rounded-full border border-line px-[13px] py-[7px] text-[12.5px] text-ink no-underline"
                  style={{ background: ind === industry ? 'var(--ac)' : 'transparent' }}
                >
                  {ind}
                </Link>
              ))}
            </div>
          </div>
          <div className="mt-[18px] flex flex-col gap-4">
            {benchmarks.rows.map((row) => {
              const gated = isGated(row)
              const mine = gated ? null : row.mine
              const minePct =
                mine === null
                  ? 0
                  : row.scale === 'enps'
                    ? pctOfEnps(mine)
                    : row.scale === 'rate'
                      ? Math.round(mine * 100)
                      : pctOf5(mine)
              const benchPct =
                row.scale === 'enps'
                  ? pctOfEnps(row.bench)
                  : row.scale === 'rate'
                    ? Math.round(row.bench * 100)
                    : pctOf5(row.bench)
              const show = (v: number) =>
                row.scale === 'rate' ? `${Math.round(v * 100)} %` : row.scale === 'enps' ? String(Math.round(v)) : no(v)
              const diff = mine === null ? null : mine - row.bench
              return (
                <div key={row.metric_key}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm font-semibold">
                      {t(
                        row.metric_key === 'engagement_avg'
                          ? 'benchEngagement'
                          : row.metric_key === 'response_rate'
                            ? 'benchResponseRate'
                            : 'benchEnps',
                      )}
                    </span>
                    <span className="flex items-baseline gap-[10px]">
                      <span className="text-sm font-semibold">
                        {mine === null ? t('benchInsufficient') : show(mine)}
                      </span>
                      <span className="text-[13px] text-mut">
                        {t('benchIndustryValue', { value: show(row.bench) })}
                      </span>
                      {diff === null ? null : (
                        <span
                          className="rounded-full px-[10px] py-1 text-xs font-semibold"
                          style={{ background: diff >= 0 ? 'var(--ac2)' : 'var(--ac3)' }}
                        >
                          {diff >= 0 ? '+' : ''}
                          {/* A difference between two percentages is percentage
                              POINTS, which is what the design writes (…" pp").
                              "−16 %" would read as a relative change. */}
                          {row.scale === 'rate'
                            ? `${Math.round(diff * 100)} pp`
                            : show(diff)}
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="mt-[7px] h-[10px] overflow-hidden rounded-full bg-sf2">
                    <div className="h-full rounded-full bg-ac" style={{ width: `${minePct}%` }} />
                  </div>
                  <div className="mt-1 h-[5px] overflow-hidden rounded-full bg-sf2">
                    <div
                      className="h-full rounded-full bg-mut opacity-45"
                      style={{ width: `${benchPct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
          <p className="mt-[14px] text-[13px] leading-[1.55] text-mut">
            {t('benchSource', { source: benchmarks.rows[0]?.source ?? '' })}
          </p>
        </section>
      ) : null}

      <div className="grid grid-cols-1 gap-[18px] xl:grid-cols-2">
        <section className={CARD}>
          <h2 className="text-[15.5px] font-semibold">{t('vsPrevious')}</h2>
          <div className="mt-[14px] flex flex-wrap items-end gap-[22px]">
            <div>
              <div className="font-display text-[40px] font-medium leading-none">{fmt(thisAvg)}</div>
              <div className="mt-[3px] text-[13px] text-mut">{t('thisRound')}</div>
            </div>
            <div className="pb-[6px]">
              <div className="text-[22px] font-semibold text-mut">{fmt(prevAvg)}</div>
              <div className="text-[13px] text-mut">{t('previousRound')}</div>
            </div>
            <div className="mb-2 rounded-full bg-ac2 px-[13px] py-[7px] text-[12.5px] font-semibold">
              {delta === null
                ? prevRound
                  ? t('trendNone')
                  : t('noPreviousRound')
                : t('trendDelta', { value: `${delta >= 0 ? '+' : '−'}${no(Math.abs(delta))}` })}
            </div>
          </div>
          <div className="mt-[18px] flex flex-col gap-[11px]">
            {(summary?.teams ?? []).map((team) => {
              const gated = isGated(team)
              return (
                <div key={team.group_id}>
                  <div className="flex justify-between text-[13px]">
                    <span>{team.label}</span>
                    <span className="font-semibold">
                      {gated ? t('gatedCell') : no(team.avg)}
                    </span>
                  </div>
                  <div className="mt-[5px] h-[9px] overflow-hidden rounded-full bg-sf2">
                    <div
                      className="h-full rounded-full"
                      style={
                        gated
                          ? { background: 'var(--sf2)', width: '0%' }
                          : { background: teamTone(team.avg), width: `${pctOf5(team.avg)}%` }
                      }
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        <section className={CARD}>
          <h2 className="text-[15.5px] font-semibold">{t('textThemes')}</h2>
          {themes && themes.themes.length > 0 ? (
            <div className="mt-[14px] flex flex-wrap gap-2">
              {activeTheme ? (
                <Link
                  href={`/undersokelser/${surveyId}/resultater?bransje=${encodeURIComponent(industry)}`}
                  scroll={false}
                  className="touch-44 rounded-full border border-line px-[14px] py-2 text-[13px] text-ink no-underline"
                >
                  {t('allThemes')}
                </Link>
              ) : null}
              {themes.themes.map((theme) => (
                <Link
                  key={theme.key}
                  href={`/undersokelser/${surveyId}/resultater?bransje=${encodeURIComponent(industry)}&tema=${encodeURIComponent(theme.key)}`}
                  scroll={false}
                  aria-current={theme.key === activeTheme ? 'true' : undefined}
                  className="touch-44 rounded-full px-[14px] py-2 text-[13px] text-ink no-underline"
                  style={{ background: theme.key === activeTheme ? 'var(--ac)' : 'var(--sbg)' }}
                >
                  {t('themeMentions', { label: theme.label, count: theme.mentions })}
                </Link>
              ))}
            </div>
          ) : (
            <p className="mt-[14px] text-[13px] text-mut">
              {themes?.insufficient_data ? t('insufficient') : t('themesEmpty')}
            </p>
          )}
          <p className="mt-[14px] text-[13px] leading-[1.6] text-mut">{t('themesNote')}</p>
          <ShareThemes
            label={t('shareWithTeam')}
            copiedLabel={t('shareCopied')}
            summary={(themes?.themes ?? [])
              .map((x) => t('themeMentions', { label: x.label, count: x.mentions }))
              .join('\n')}
          />
        </section>
      </div>

      <div className="flex flex-wrap gap-[10px]">
        <Link
          href={`/undersokelser/${surveyId}/send`}
          className="touch-44 cursor-pointer rounded-[10px] bg-ac px-[22px] py-[13px] text-sm font-bold text-acf no-underline"
        >
          {t('addAnswer')}
        </Link>
        <Link
          href="/"
          className="touch-44 cursor-pointer rounded-[10px] border border-line px-[22px] py-[13px] text-sm font-semibold text-ink no-underline"
        >
          {t('backToOverview')}
        </Link>
      </div>
    </div>
  )

  /** The right-hand meta line on a question card — HeiTuva.dc.html:2749. */
  function questionMeta(q: Question, result: QuestionResult, set: QuoteSet | null) {
    if (isGated(result)) return t('insufficient')
    if (q.type === 'text') return t('freeTextCount', { count: set?.n ?? result.n })
    if (result.avg !== null && result.avg !== undefined) {
      return t('avgOf', { avg: no(result.avg), max: num(q.config, 'points', 5) })
    }
    return t('answerCount', { count: result.n })
  }
}

/** The option keys a distribution is drawn against, per question type. */
function optionKeys(q: Question): { key: string; label: string }[] {
  const options = list(q.config, 'options')
  switch (q.type) {
    case 'scale':
      return scaleKeys(
        num(q.config, 'points', 5),
        str(q.config, 'low_label') ?? '1',
        str(q.config, 'high_label') ?? String(num(q.config, 'points', 5)),
      )
    case 'likert':
    case 'smiley': {
      const labels = list(q.config, 'labels')
      return labels.map((label, i) => ({ key: String(i + 1), label }))
    }
    case 'enps':
      return Array.from({ length: 11 }, (_, i) => ({ key: String(i), label: String(i) }))
    case 'yesno':
      return [
        { key: 'true', label: 'Ja' },
        { key: 'false', label: 'Nei' },
      ]
    default:
      return options.map((label, i) => ({ key: String(i), label }))
  }
}

function InsightRow({ insight, questions }: { insight: Insight; questions: { id: string; text: string }[] }) {
  const tone =
    insight.tone === 'good' ? 'var(--ac2)' : insight.tone === 'note' ? 'var(--ac)' : 'var(--ac3)'
  return (
    <div className="flex items-start gap-[13px] rounded-[13px] border border-line bg-bg px-4 py-[14px]">
      <span className="block w-2 flex-none self-stretch rounded-full" style={{ background: tone }} />
      <span className="flex-1">
        <InsightText insight={insight} questions={questions} />
      </span>
    </div>
  )
}

async function InsightText({
  insight,
  questions,
}: {
  insight: Insight
  questions: { id: string; text: string }[]
}) {
  const t = await getTranslations('results')
  const question = questions.find((q) => q.id === insight.question_id)?.text ?? ''
  const body =
    insight.key === 'low_question'
      ? t('insightLow', { question, value: no(insight.value) })
      : insight.key === 'split_question'
        ? t('insightSplit', { question, value: Math.round(insight.value) })
        : insight.key === 'strong_question'
          ? t('insightStrong', { question, value: no(insight.value) })
          : t('insightRate', { value: Math.round(insight.value) })
  const action =
    insight.key === 'low_question'
      ? t('insightLowAction')
      : insight.key === 'split_question'
        ? t('insightSplitAction')
        : insight.key === 'strong_question'
          ? t('insightStrongAction')
          : t('insightRateAction')
  return (
    <>
      <span className="block text-[14.5px] leading-[1.5]">{body}</span>
      <span className="mt-1 block text-[13px] text-mut">
        {t('nextStep')}: {action}
      </span>
    </>
  )
}

/**
 * Free-text quotes. No author, no group, no timestamp — the RPC does not return
 * them, so there is nothing here to leak. The design prints "— Anonym" beside
 * each quote; that is only true of an anonymous survey, so a named one gets no
 * attribution rather than a false one (docs/DEVIATIONS.md D45).
 */
function QuoteList({
  set,
  anonymous,
  anonLabel,
  empty,
}: {
  set: QuoteSet | null
  anonymous: boolean
  anonLabel: string
  empty: string
}) {
  if (!set || set.quotes.length === 0) {
    return <p className="mt-[15px] rounded-[10px] bg-sf2 px-[15px] py-[13px] text-[13.5px] text-mut">{empty}</p>
  }
  return (
    <div className="mt-[15px] flex flex-col gap-[10px]">
      {set.quotes.map((q, i) => (
        <div
          key={i}
          className="rounded-[10px] bg-sf2 px-[15px] py-[13px] text-[13.5px] leading-[1.45]"
        >
          “{q.text}”
          {anonymous ? <span className="text-xs" style={{ color: '#6F6759' }}> — {anonLabel}</span> : null}
        </div>
      ))}
    </div>
  )
}
