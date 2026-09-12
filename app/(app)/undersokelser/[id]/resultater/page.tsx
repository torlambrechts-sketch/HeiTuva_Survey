import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { requireViewer } from '@/lib/auth/session'
import { isSourced } from '@/lib/benchmarks/sourced'
import {
  readAggregate,
  readAttributed,
  readBenchmarks,
  readQuotes,
  readSummary,
  readThemes,
  readTrends,
} from '@/lib/results/read'
import { isGated, type Quotes } from '@/lib/results/types'
import { readScheduleChip } from '@/lib/schedules/read'
import { SurveyContextBar } from '../SurveyContextBar'
import { TeamBoard } from './TeamBoard'
import { ResultsScreen } from './ResultsScreen'

/** Canonical UUID shape; anything else cannot name a survey. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Resultater — HeiTuva.dc.html:2136-2298.
 *
 * Everything on this screen comes from the Phase 4 SECURITY DEFINER RPCs, and
 * nothing on it comes from `responses` or `answers` directly: there is no
 * select policy on those tables, so this page could not read them if it tried.
 * That is the point — the k gate lives in the database, and this component
 * renders whatever survived it.
 *
 * Two places where the bundle draws a number the schema cannot supply, and this
 * screen therefore does not (CLAUDE.md, "never fabricate data in the UI"):
 * the prototype's previous-round average is literally `avgScore - 0.3` and its
 * trend chip is the constant "+0,3", and its benchmark footnote claims a panel
 * of 214 companies. The first is replaced by the real previous round from
 * `get_trends`, the second by the benchmark row's own `source`. Both are logged
 * in docs/DEVIATIONS.md.
 */
export default async function ResultsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ bransje?: string; tema?: string }>
}) {
  const { id } = await params
  const { bransje, tema } = await searchParams

  if (!UUID.test(id)) notFound()

  const viewer = await requireViewer()
  const supabase = await createClient()
  const t = await getTranslations('results')

  const { data: survey, error } = await supabase
    .from('surveys')
    .select('id, title, audience_label, status, anonymity, results_scope, created_at, k_threshold, respondent_kind, run_mode')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()
  if (error) throw new Error(`results survey read failed: ${error.message}`)
  if (!survey) notFound()

  // The industry chips are the industries the benchmark table actually holds.
  // The design lists five; seeding five would be inventing four datasets.
  /* Q134 — an UNSOURCED benchmark is not a benchmark. The seed shipped invented
     industry figures whose own source string said «erstatt med kildeført
     referanse», and the screen rendered both the bar and that sentence. Filtered
     here, at the read, so the chips and the card disappear together rather than
     leaving a chip that selects an industry with nothing behind it. */
  const { data: industries } = await supabase
    .from('benchmarks')
    .select('industry, source')
    .order('industry')
  const industryList = [...new Set((industries ?? []).filter((r) => isSourced(r.source)).map((r) => r.industry))]
  const industry =
    bransje && industryList.includes(bransje) ? bransje : (industryList[0] ?? 'Alle bransjer')

  const [{ data: questions }, { data: rounds }, { count: editorCount }, { data: pickable }] =
    await Promise.all([
      supabase
        .from('survey_questions')
        .select('id, type, text, config, position')
        .eq('survey_id', id)
        .order('position'),
      supabase
        .from('survey_rounds')
        .select('id, round_no, status, opens_at')
        .eq('survey_id', id)
        .order('round_no', { ascending: false }),
      supabase
        .from('survey_editors')
        .select('member_id', { count: 'exact', head: true })
        .eq('survey_id', id),
      supabase
        .from('surveys')
        .select('id, title, status')
        .eq('org_id', viewer.orgId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false }),
    ])

  const [summary, aggregate, trends, themes, benchmarks, attributed] = await Promise.all([
    readSummary(id),
    readAggregate(id),
    readTrends(id),
    readThemes(id),
    readBenchmarks(id, industry),
    // Only asked for when the survey IS attributed. `attributed_results` would
    // refuse a person survey anyway (`not_attributed`, M:0034:180) and the
    // reader would flatten that to null — but a refusal per page load is a
    // refusal in the logs, and a leser opening any results screen would generate
    // one. The condition is here so the question is only asked where it has an
    // answer, not to make the RPC's own rule optional.
    survey.respondent_kind === 'organisation' ? readAttributed(id) : Promise.resolve(null),
  ])

  // Quotes are one read per free-text question, and each one is independently
  // k-gated — including by the theme filter, which narrows the slice further.
  const textQuestions = (questions ?? []).filter((q) => q.type === 'text')
  const themeKeys = new Set((themes?.themes ?? []).map((x) => x.key))
  const activeTheme = tema && themeKeys.has(tema) ? tema : null
  const quoteEntries = await Promise.all(
    textQuestions.map(async (q) => [q.id, await readQuotes(id, q.id, { theme: activeTheme })] as const),
  )
  const quotes = new Map<string, Quotes | null>(quoteEntries)

  const latestRound = rounds?.[0] ?? null
  const hasRounds = (rounds?.length ?? 0) > 0

  const scopeLabel = editorCount
    ? t('scopeShared', {
        count: editorCount,
        scope: t(
          survey.results_scope === 'alle_ansatte'
            ? 'scopeAlle'
            : survey.results_scope === 'ledere_eget_team'
              ? 'scopeLeder'
              : 'scopeHr',
        ),
      })
    : t('scopePrivate')

  // V2-10. `quiz_leaderboard` answers `forbidden`, `not_a_quiz`,
  // `board_disabled` or a team list; the three refusals are DISTINGUISHED here
  // because they are not the same fact — «switched off» and «no team has enough
  // answers» would otherwise both render as an empty board, which is the
  // never-fabricate rule applied to an absence rather than to a number.
  let board: { teams: { team: string; score: number }[]; state: 'ok' | 'off' | 'not_quiz' } = {
    teams: [],
    state: 'not_quiz',
  }
  if (survey.run_mode === 'quiz') {
    const { data } = await supabase.rpc('quiz_leaderboard', { p_survey: survey.id })
    const payload = data as { error?: string; teams?: { team: string; score: number }[] } | null
    board =
      payload?.error === 'board_disabled'
        ? { teams: [], state: 'off' }
        : { teams: payload?.teams ?? [], state: 'ok' }
  }

  return (
    <>
      <SurveyContextBar
        liveMode={survey.run_mode === 'live'}
        surveyId={survey.id}
        title={survey.title}
        audience={survey.audience_label}
        status={survey.status}
        recurrence={await readScheduleChip(survey.id, survey.status)}
        current="resultater"
      />
      <ResultsScreen
        surveyId={survey.id}
        status={survey.status}
        anonymity={survey.anonymity}
        kThreshold={survey.k_threshold}
        respondentKind={survey.respondent_kind === 'organisation' ? 'organisation' : 'person'}
        scopeLabel={scopeLabel}
        sentAt={latestRound?.opens_at ?? null}
        hasRounds={hasRounds}
        surveys={pickable ?? []}
        questions={(questions ?? []).map((q) => ({
          id: q.id,
          type: q.type,
          text: q.text,
          config: (q.config ?? {}) as Record<string, unknown>,
        }))}
        summary={summary}
        aggregate={aggregate}
        trends={trends}
        themes={themes}
        benchmarks={benchmarks}
        industries={industryList}
        industry={industry}
        activeTheme={activeTheme}
        quotes={Object.fromEntries(
          [...quotes].map(([qid, q]) => [qid, q && !isGated(q) ? q : null]),
        )}
        attributed={attributed}
        recurrence={await readScheduleChip(survey.id, survey.status)}
      />
      {/* V2-10 — «Lagtavle», only on a quiz. The RPC is k-gated (`M:0086`):
          a team score is a per-group breakdown of what people said, and a team
          of two scoring full marks discloses both of them. */}
      {survey.run_mode === 'quiz' ? (
        <div className="mt-[18px]">
          <TeamBoard
            teams={board.teams}
            state={board.state}
            strings={{
              title: t('boardTitle'),
              gated: t('boardGated', { k: survey.k_threshold ?? 5 }),
              empty: t('boardEmpty'),
              off: t('boardOff'),
              notQuiz: t('boardNotQuiz'),
            }}
          />
        </div>
      ) : null}
    </>
  )
}
