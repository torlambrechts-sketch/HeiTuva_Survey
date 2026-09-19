import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { numberWord } from '@/lib/respondent/anonymity-promise'
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
import { attributedColumns, isNegative } from '@/lib/questions/roles'
import { changeBetween } from '@/lib/results/compare'
import { CompareRounds } from './CompareRounds'
import { ThemeMatrix } from './ThemeMatrix'
import { isGated } from '@/lib/results/types'
import type {
  Aggregate,
  Attributed,
  Benchmarks,
  Insight,
  QuestionResult,
  ResultsSummary,
  Themes,
  Trends,
} from '@/lib/results/types'
import { AttributedTable } from './AttributedTable'
import { RoundsPanel } from './RoundsPanel'
import { SurveyPicker } from './SurveyPicker'
import { ShareThemes } from './ShareThemes'
import { effectiveK, thresholdTier } from '@/lib/questions/threshold-tier'

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
  kThreshold,
  respondentKind,
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
  sub,
  groupThemes,
  industries,
  industry,
  activeTheme,
  quotes,
  attributed: attributedData,
  recurrence,
}: {
  surveyId: string
  status: 'utkast' | 'aktiv' | 'lukket'
  anonymity: 'anonymous' | 'named' | 'optional'
  /** The survey's own display threshold and respondent type (Q17). */
  kThreshold: number
  respondentKind: 'person' | 'organisation'
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
  /** G2 — which of v8's four resultat views is on screen (v8:7736). */
  sub: string
  groupThemes: { groupId: string; name: string; themes: Themes | null }[]
  industries: string[]
  industry: string
  activeTheme: string | null
  quotes: Record<string, QuoteSet | null>
  /** Q17 §5 — the named register, present only for an organisation survey. */
  attributed: Attributed | null
  /** The ↻ sentence, or '' when the survey has no series (Q22). */
  recurrence: string
}) {
  const t = await getTranslations('results')
  const tNav = await getTranslations('surveyNav')
  const tResp = await getTranslations('respondent')
  const locale = await getLocale()

  // The threshold this screen's numbers rest on — the same value app.k_for
  // applies in the database. Every "for få svar" line below says which number
  // that is; fixed copy would promise five on a survey gated at three.
  const attributed = respondentKind === 'organisation'
  const k = effectiveK(kThreshold, attributed ? 'organisation' : 'person')
  const kWord = numberWord(k, locale)
  const gatedText = t('insufficient', { kWord })
  const gatedTitle = t('insufficientTitle', { k })

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

  // A read that failed is NOT a survey with no answers. `readSummary` returns
  // null on a Postgres error, and rendering that as "0 svar av 0 inviterte"
  // would put a fabricated number on the screen — indistinguishable from a real
  // one, which is the case CLAUDE.md rules out. Every value becomes the design's
  // em dash and the reason is said out loud. The design has no failure state
  // (its data is a local array), so this is the minimal consistent one.
  const unavailable = summary === null
  const completion = summary?.completion ?? null

  /*
    An organisation survey counts different things (bundle :4882-4886). «Snitt»
    and «svarprosent» are the wrong questions to ask of a supplier register:
    what the Åpenhetsloven reader needs is who answered, who reported a breach,
    who has no policy, and who has not answered at all.

    The two middle numbers come from the roles the pack designated (Q35), so
    they are absent when the survey designates none — a card reading "0
    avdekket brudd" on a survey that never asked about breaches is a fabricated
    number, and CLAUDE.md rules that out more firmly than it rules out a gap.
  */
  const attributedRows = attributedData?.rows ?? []
  const attributedQuestions = (attributedData?.questions ?? []).map((q) => ({
    id: q.id,
    text: q.text,
    config: (q as unknown as { config?: Record<string, unknown> }).config ?? null,
  }))
  const roleCols = attributedColumns(attributedQuestions)
  const answerFor = (row: (typeof attributedRows)[number], questionId: string) =>
    (row.answers ?? []).find((a) => a.question_id === questionId)?.value ?? null
  const countByRole = (role: 'brudd' | 'policy') => {
    const col = roleCols.find((c) => c.role === role)
    if (!col) return null
    return attributedRows.filter((r) => isNegative(role, answerFor(r, col.id))).length
  }
  const breachCount = countByRole('brudd')
  const missingPolicy = countByRole('policy')

  const attributedStats = [
    {
      key: 'answered',
      label: t('attribStatAnswered'),
      value: `${attributedRows.filter((r) => r.status === 'svart').length} ${t('attribStatOf')} ${attributedRows.length}`,
      note: t('attribStatAnsweredNote'),
      bg: 'var(--sf)',
      fg: 'var(--ink)',
      title: '',
    },
    breachCount === null
      ? null
      : {
          key: 'breach',
          label: t('attribStatBreach'),
          value: String(breachCount),
          note: t('attribStatBreachNote'),
          bg: 'var(--ac3)',
          fg: 'var(--ink)',
          title: '',
        },
    missingPolicy === null
      ? null
      : {
          key: 'policy',
          label: t('attribStatPolicy'),
          value: String(missingPolicy),
          note: t('attribStatPolicyNote'),
          bg: 'var(--sf)',
          fg: 'var(--ink)',
          title: '',
        },
    {
      key: 'missing',
      label: t('attribStatMissing'),
      value: String(attributedRows.filter((r) => r.status !== 'svart').length),
      note: t('attribStatMissingNote', {
        count: attributedRows.filter((r) => r.status === 'paaminnet').length,
      }),
      bg: 'var(--sf)',
      fg: 'var(--ink)',
      title: '',
    },
  ].filter((s): s is NonNullable<typeof s> => s !== null)

  const personStats = [
    {
      key: 'responses',
      label: t('statResponses'),
      value: summary ? String(summary.n) : DASH,
      note: summary ? t('statResponsesNote', { invited: summary.invited }) : DASH,
      bg: 'var(--sf)',
      fg: 'var(--ink)',
      title: '',
    },
    {
      key: 'rate',
      label: t('statRate'),
      value: completion === null ? DASH : `${Math.round(completion * 100)}%`,
      note: unavailable ? DASH : t('statRateNote'),
      bg: 'var(--ac)',
      fg: 'var(--acf)',
      title: '',
    },
    {
      key: 'avg',
      label: t('statAvg'),
      value: fmt(summary?.avg ?? null),
      note: t('statAvgNote'),
      bg: 'var(--sf)',
      fg: 'var(--ink)',
      // :2530. Only this card can be withheld — Q28 keeps the response count
      // and the rate visible below the threshold, because they are counts of
      // people rather than svarutledete tall — so it is the only one with a
      // reason to give.
      title: (summary?.avg ?? null) === null ? gatedTitle : '',
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
      title: '',
    },
  ]

  /*
    A viewer this survey has nothing to show. `attributed_results` refuses a
    leser outright (`forbidden`, M:0034:180 — attributed rows are named data
    and a leser reads aggregates only), and `readAttributed` flattens that to
    null like every other reader on this screen.

    Without this branch the four stat cards rendered from an empty array: "0 av
    0 virksomheter har svart", "0 avdekket brudd". Every one of those is a
    fabricated number — indistinguishable in a screenshot from a supplier
    survey nobody answered, which is exactly the case CLAUDE.md rules out. So
    the cards are not drawn at all and the reason is said out loud.

    Neither bundle draws this: a leser opening an organisation survey is a
    state the prototype has no roles to have. Minimal consistent option, logged
    as D98.
  */
  const attributedDenied = attributed && attributedData === null

  // Q28 note, because the bundle disagrees and the disagreement is deliberate:
  // its person stat set blanks «Svar» and «Svarprosent» to "—" below the
  // threshold (`below ? "—"`, :4888-4889). Q28 keeps them — the threshold hides
  // svarutledete tall, not counts of people — so only «Snittscore» goes to the
  // em dash here, which it already does because the RPC withholds `avg`.
  const stats = attributed && attributedData ? attributedStats : personStats

  return (
    <div className="flex animate-enter flex-col gap-[18px] pt-[28px]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[26px] font-medium">{t('title')}</h1>
          <p className="mt-[3px] text-[12.5px] text-mut">{scopeLabel}</p>
          <p className="mt-[3px] text-[12.5px] text-mut">
            {/* DECISIONS Q91 — the tier comes from `thresholdTier`, not from a
                comparison here. This line carried its own `k < 5` until V2-2's
                catalogue sweep derived the set of surfaces that decide a tier
                and found it: at k=2 the screen said «små grupper kan være
                gjenkjennelige», the softer wording Q91 rejected, for the same
                reason the respondent promise did — a correct comparison in a
                second copy of the boundary. */}
            {attributed
              ? t('thresholdLineAttributed')
              : thresholdTier(k) === 'two'
                ? t('thresholdLineTwo', { k })
                : thresholdTier(k) === 'low'
                  ? t('thresholdLineLow', { k })
                  : t('thresholdLine', { k })}
          </p>
          {unavailable ? (
            <p role="alert" className="mt-[3px] text-[12.5px] text-mut">
              {t('unavailable')}
            </p>
          ) : null}
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

      {attributedDenied ? (
        <div className={CARD}>
          <p className="font-display text-[23px] font-bold">{t('attribDeniedTitle')}</p>
          <p className="mt-2 max-w-[520px] text-[13px] leading-relaxed text-mut">
            {t('attribDeniedBody')}
          </p>
        </div>
      ) : null}

      {/* The v1 bundle changed this grid from `repeat(4, 1fr)` (OLD:2156) to
          `repeat(auto-fill, minmax(200px, 1fr))` (:2528), which is why the
          explicit breakpoints are gone: auto-fill reflows continuously from
          four tracks to one as the frame narrows, so RESPONSIVE.md's rule is
          satisfied by the design's own grid rather than by columns layered on
          top of it. It also handles the case the old grid could not — an
          organisation survey whose pack designates no key questions has two
          stat cards, not four, and they keep their size instead of stretching
          to half the row each. */}
      {attributedDenied ? null : (
      <div
        className="grid gap-[15px]"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}
      >
        {stats.map((s) => (
          <div
            key={s.key}
            // :2530 — the card carries the reason when its value is withheld.
            title={s.title || undefined}
            className="rounded-2xl border border-line px-5 py-[18px]"
            style={{ background: s.bg, color: s.fg }}
          >
            <div className="text-[11px] uppercase tracking-[.1em] opacity-70">{s.label}</div>
            <div className="mt-2 font-display text-[35px] font-bold leading-[1.05]">{s.value}</div>
            <div className="mt-[2px] text-[12.5px] opacity-75">{s.note}</div>
          </div>
        ))}
      </div>
      )}

      {attributed && attributedData ? (
        <AttributedTable
          surveyId={surveyId}
          data={attributedData}
          labels={{
            title: t('attribTitle'),
            count: t('attribCount', {
              answered: attributedRows.filter((r) => r.status === 'svart').length,
              total: attributedRows.length,
              reminded: attributedRows.filter((r) => r.status === 'paaminnet').length,
            }),
            exportCsv: t('attribExport'),
            colOrg: t('attribColOrg'),
            colDate: t('attribColDate'),
            colStatus: t('attribColStatus'),
            filterAll: t('attribFilterAll'),
            filterBreach: t('attribFilterBreach'),
            filterPolicy: t('attribFilterPolicy'),
            filterNot: t('attribFilterNot'),
            statusAnswered: t('attribStatusAnswered'),
            statusReminded: t('attribStatusReminded'),
            statusNot: t('attribStatusNot'),
            notAnswered: t('attribNotAnswered'),
            note: t('attribNote'),
          }}
        />
      ) : null}

      {/* «Runde for runde» (:2592). The bundle's own condition is more than one
          round — a single bar says nothing the stat cards have not said. An
          attributed survey has no averages to plot, so it does not get one. */}
      {!attributed && trends && (trends.points?.length ?? 0) > 1 ? (
        <RoundsPanel
          trends={trends}
          labels={{
            title: t('roundsTitle'),
            // NEW:2596 — the panel's right-hand line is the RECURRENCE status
            // when there is a series, and the round count otherwise. Same
            // sentence as the row chip and the Send screen's status row.
            status: recurrence || t('roundsStatus', { count: trends.points.length }),
            round: (n) => t('roundsLabel', { n }),
            answers: (n) => t('roundsAnswers', { count: n }),
            belowThreshold: (n) => t('roundsBelow', { count: n }),
            note: t('roundsNote'),
          }}
        />
      ) : null}

      {/* The bundle switches the whole lower half on respondent kind:
          `resAttrib` and `resAggregate` are `pol.kind === "org"` and its
          negation (:4861), and an organisation survey shows the register
          instead of — not beside — the aggregate panels. That is right on its
          own terms: a supplier register has no group breakdown to draw, no
          trend of averages, and no themes, because each row IS the finding.

          It also removes a crash rather than hiding one. `results_summary`
          returns team rows as `{n: null, avg: null}` when a group has nothing
          to average — neither a number nor `insufficient_data` — and the two
          call sites below took the union at its word and called `.toFixed` on
          it. Both are fixed to render the em dash; this switch is the design,
          not the fix. */}
      {/* G2 — v8's four resultat views (v8:7736). «Per spørsmål» is the list
          that was always here; the other three are renderings of data this
          screen already holds, so none of them opens a new data path. An
          attributed (organisation) survey keeps its register and has no rail
          content to switch — each row IS the finding there. */}
      {!attributed && sub === 'sammenlign' ? (
        <CompareRounds
          points={trends?.points ?? []}
          labels={{
            title: t('cmpTitle'),
            lead: t('cmpLead'),
            rounds: t('cmpRounds', { n: trends?.points?.length ?? 0 }),
            change: t('cmpChange'),
            none: t('cmpNone'),
            withheld: t('cmpChangeWithheld'),
            round: (n: number) => t('cmpRound', { n }),
            answers: (n: number) => t('answers', { n }),
          }}
        />
      ) : null}

      {!attributed && sub === 'matrise' ? (
        <ThemeMatrix
          themeLabels={(themes?.themes ?? []).map((x) => ({ key: x.key, label: x.label }))}
          rows={groupThemes}
          labels={{
            title: t('mtxTitle'),
            lead: t('mtxLead'),
            group: t('mtxGroup'),
            noThemes: t('mtxNoThemes'),
            rowAllWithheld: t('mtxRowAllWithheld'),
          }}
        />
      ) : null}

      {!attributed && sub === 'frisvar' ? (
        <section className={`${CARD} mt-4 min-w-0`}>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="min-w-0 font-display text-[21px] font-medium">{t('frisvarTitle')}</h2>
            {/* `min-w-0`, NOT `shrink-0`. Measured at 320px this span was 283px
                wide and could not shrink, so it set the page to 326 — F3's rule:
                in an overflow, look for the narrowest child that CANNOT shrink,
                not the widest one reported. */}
            <span className="min-w-0 text-[12.5px] text-mut">{t('frisvarLead')}</span>
          </div>
          {/* THE SAME `QuoteList` THE QUESTION CARD USES. Free text goes
              through `get_quotes`, which is k-gated, and never through a raw
              select — `responses` and `answers` have no select policy at all.
              Reusing the component rather than writing a second renderer is
              what keeps one treatment of a withheld quote set. */}
          {questions.filter((q) => q.type === 'text').length === 0 ? (
            <p className="mt-3 text-[13px] leading-relaxed text-mut">{t('frisvarNone')}</p>
          ) : (
            questions
              .filter((q) => q.type === 'text')
              .map((q) => (
                /* `min-w-0` — F3's grid lesson: a flex/grid child defaults to
                   min-content and a long unbroken quote sets the track. The
                   frisvar tab overflowed 326 > 320 the first time it was
                   measured, and the widest reported element was the victim
                   rather than the cause. */
                <div key={q.id} className="mt-5 min-w-0 first:mt-3">
                  <h3 className="min-w-0 break-words text-[14px] font-semibold">{q.text}</h3>
                  <QuoteList
                    set={quotes[q.id] ?? null}
                    anonymous={anonymity === 'anonymous'}
                    anonLabel={t('anonymous')}
                    empty={gatedText}
                  />
                </div>
              ))
          )}
        </section>
      ) : null}

      {!attributed && sub === 'sporsmal' ? (
        <>
        {questions.map((q) => {
          const result = byQuestion.get(q.id)
          if (!result) return null
          return (
            <section key={q.id} className={CARD}>
              {/* `flex-wrap` — RESPONSIVE.md rule 1 and the sentence in global
                  rule 7: remove the width constraint and let flex-wrap do the
                  work. `shrink-0` STAYS, and is why the wrap is needed: the
                  meta must not be squeezed into three lines beside a long
                  question at desktop, so below `md` it takes its own line
                  instead. Found at 320px, where «Vises ved minst fem svar»
                  (153px, unshrinkable) pushed the page to 350. */}
              <div className="flex flex-wrap items-baseline justify-between gap-[14px]">
                <h2 className="min-w-0 text-[15.5px] font-semibold">{q.text}</h2>
                <span className="shrink-0 text-[13px] text-mut" title={isGated(result) ? gatedTitle : undefined}>
                  {questionMeta(q, result, quotes[q.id] ?? null)}
                </span>
              </div>
              {isGated(result) ? (
                /* v1 bundle :2617-2622. The first bundle had no hidden state on a
                   question block at all (`resultBlocks` carried no `hidden`,
                   OLD:4090), so the grey paragraph here was ours for a state the
                   drawing lacked — D48. The v1 bundle specifies it: an em dash at
                   display size with the reason beside it, which reads as a value
                   that is withheld rather than as a notice about the card. */
                <div className="mt-3 flex items-baseline gap-3" title={gatedTitle}>
                  <span className="font-display text-[30px] font-medium leading-none">{DASH}</span>
                  <span className="text-[13px] text-mut">{gatedText}</span>
                </div>
              ) : q.type === 'text' ? (
                <QuoteList set={quotes[q.id] ?? null} anonymous={anonymity === 'anonymous'} anonLabel={t('anonymous')} empty={gatedText} />
              ) : (
                <div className="mt-[15px] flex flex-col gap-[10px]">
                  {questionBars(
                    result,
                    optionKeys(q, tResp('yes'), tResp('no'), {
                      low: tResp('scaleLowDefault'),
                      high: tResp('scaleHighDefault'),
                      enpsLow: tResp('enpsLowDefault'),
                      enpsHigh: tResp('enpsHighDefault'),
                    }),
                  ).map((b) => (
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
            {summary && summary.n >= (summary.k ?? 5) ? t('insightNote') : t('insightNoteWaiting', { kWord })}
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
                {t(label, { k })} · {t(meta)}
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
                /* G2.2 — through `changeBetween` rather than a hand guard.
                   The guard here was CORRECT, and that is the point: it was
                   correct because somebody remembered `mine === null`, and the
                   next two-cell figure is the one nobody remembers. The
                   benchmark is a published figure and never gated, so only one
                   endpoint can withhold — which is exactly the pair that makes
                   a manual check look unnecessary right up until it is. */
                const change = changeBetween(
                  { avg: row.bench },
                  mine === null ? { avg: null, insufficient_data: true } : { avg: mine },
                )
                const diff = change.kind === 'value' ? change.delta : null
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
                /*
                  A THIRD STATE the union does not name, found by V1-2's first
                  organisation-survey fixture. `results_summary` returns a team
                  as `{n: null, avg: null}` when the group has nothing to
                  average — not gated, not a number — and `no(team.avg)` then
                  called `.toFixed` on null and took the whole screen down with
                  a digest and no message.

                  It is NOT an attributed-only bug, which is why it is fixed
                  here rather than avoided by the switch above: a person survey
                  made only of yes/no questions has no scale answers either, so
                  every group returns a null average once anyone answers. No
                  seeded survey had that shape, so nothing had ever asked.

                  Rendered as the em dash: "there is no average here" is a real
                  state and is not the same as "withheld", which is why it does
                  not borrow the gated wording.
                */
                const value = gated ? null : team.avg
                return (
                  <div key={team.group_id}>
                    <div className="flex justify-between text-[13px]">
                      <span>{team.label}</span>
                      <span className="font-semibold" title={gated ? gatedTitle : undefined}>
                        {gated ? t('gatedCell', { k }) : fmt(value)}
                      </span>
                    </div>
                    <div className="mt-[5px] h-[9px] overflow-hidden rounded-full bg-sf2">
                      <div
                        className="h-full rounded-full"
                        style={
                          value === null || value === undefined
                            ? { background: 'var(--sf2)', width: '0%' }
                            : { background: teamTone(value), width: `${pctOf5(value)}%` }
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
                {themes?.insufficient_data ? gatedText : t('themesEmpty')}
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

        {/* Inside the switch, as the bundle has them (:2739-2742, within
            `resAggregate`). «Legg til et svar» is wrong on a supplier register
            in any case: an organisation's answer comes from the organisation,
            not from whoever is reading the table. */}
        <div className="flex flex-wrap gap-[10px]">
          <Link
            href={`/undersokelser/${surveyId}/send`}
            className="touch-44 cursor-pointer rounded-[10px] bg-ac px-[22px] py-[13px] text-sm font-bold text-acf no-underline"
          >
            {t('addAnswer')}
          </Link>
          <Link
            href="/oversikt"
            className="touch-44 cursor-pointer rounded-[10px] border border-line px-[22px] py-[13px] text-sm font-semibold text-ink no-underline"
          >
            {t('backToOverview')}
          </Link>
        </div>
        </>
      ) : null}
    </div>
  )

  /** The right-hand meta line on a question card — HeiTuva.dc.html:2749. */
  function questionMeta(q: Question, result: QuestionResult, set: QuoteSet | null) {
    if (isGated(result)) return gatedText
    if (q.type === 'text') return t('freeTextCount', { count: set?.n ?? result.n })
    if (result.avg !== null && result.avg !== undefined) {
      return t('avgOf', { avg: no(result.avg), max: num(q.config, 'points', 5) })
    }
    return t('answerCount', { count: result.n })
  }
}

/**
 * The option keys a distribution is drawn against, per question type.
 *
 * The labels this function does not get from the question's own config come
 * from next-intl — the same messages the respondent surface renders, rather
 * than a second Norwegian literal that would not follow a language switch.
 * That is `yes`/`no`, and the scale anchors: the design supplies those as a
 * default PER TYPE (HeiTuva.dc.html:2902-2903), and a question that names its
 * own overrides them. Reading them off the question alone is what made this
 * screen render "1 — 1" and "5 — 5" on every seeded survey.
 */
function optionKeys(
  q: Question,
  yes: string,
  no: string,
  anchors: { low: string; high: string; enpsLow: string; enpsHigh: string },
): { key: string; label: string }[] {
  const options = list(q.config, 'options')
  switch (q.type) {
    case 'scale':
      return scaleKeys(
        num(q.config, 'points', 5),
        str(q.config, 'low_label') || anchors.low,
        str(q.config, 'high_label') || anchors.high,
      )
    case 'likert':
    case 'smiley': {
      const labels = list(q.config, 'labels')
      return labels.map((label, i) => ({ key: String(i + 1), label }))
    }
    case 'enps':
      // 0-10, with the design's own eNPS pair on the ends.
      return Array.from({ length: 11 }, (_, i) => ({
        key: String(i),
        label:
          i === 0 ? `0 — ${anchors.enpsLow}` : i === 10 ? `10 — ${anchors.enpsHigh}` : String(i),
      }))
    case 'yesno':
      return [
        { key: 'true', label: yes },
        { key: 'false', label: no },
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
          className="min-w-0 break-words rounded-[10px] bg-sf2 px-[15px] py-[13px] text-[13.5px] leading-[1.45]"
        >
          “{q.text}”
          {anonymous ? <span className="text-xs" style={{ color: '#6F6759' }}> — {anonLabel}</span> : null}
        </div>
      ))}
    </div>
  )
}
