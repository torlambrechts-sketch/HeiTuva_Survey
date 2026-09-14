import Link from 'next/link'
import { AnalystPanel } from './AnalystPanel'
import { analyse } from '@/lib/tuva/analyst'
import { kForMirror } from '@/lib/surveys/retention'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { requireViewer } from '@/lib/auth/session'
import {
  FILTERS,
  FILTER_KEY,
  FILTER_STATUS,
  SORTS,
  SORT_KEY,
  type Filter,
  type Sort,
} from './keys'
import { SurveySearch } from './SurveySearch'
import { SurveyRow, type SurveyListItem } from './SurveyRow'
import { hasScheduleStatus, scheduleStatus } from '@/lib/schedules/status'
import { CADENCE_KEY } from '@/lib/send/registry'
import { SharePanel, type ShareCandidate } from './SharePanel'
import { BlankSurveyButton } from './BlankSurveyButton'
import { effectiveK } from '@/lib/questions/threshold-tier'
import { hasTarget, rateOf, rowRate } from '@/lib/surveys/participation'
import { PageHeader, PARTICIPATION } from '@/components/PageHeader'

type Search = { filter?: string; sok?: string; sorter?: string; del?: string }

/**
 * Undersøkelser — built against HeiTuva.dc.html:689-805.
 *
 * Filter, search, sort and the open share panel live in the URL rather than
 * component state. The prototype keeps all four local, which no link can
 * express and a reload discards; the rendering is unchanged.
 */
export default async function SurveysPage({ searchParams }: { searchParams: Promise<Search> }) {
  const viewer = await requireViewer()
  const sp = await searchParams
  const t = await getTranslations('surveys')
  const tSend = await getTranslations('send')
  const tNav = await getTranslations('nav')

  const filter: Filter = FILTERS.includes(sp.filter as Filter) ? (sp.filter as Filter) : 'alle'
  const sort: Sort = SORTS.includes(sp.sorter as Sort) ? (sp.sorter as Sort) : 'nyeste'
  const query = (sp.sok ?? '').trim()
  const canEdit = viewer.role !== 'leser'

  const supabase = await createClient()

  // One literal string, not a concatenation: supabase-js infers the row type
  // from the select's literal type, and any expression widens it to `string`,
  // which collapses every field to GenericStringError.
  let listQuery = supabase
    .from('surveys')
    .select(
      'id, title, audience_label, status, results_scope, target, created_at, updated_at, k_threshold, respondent_kind, survey_questions(count), survey_editors(member_id)',
    )
    .eq('org_id', viewer.orgId)
    .is('deleted_at', null)

  const status = FILTER_STATUS[filter]
  if (status) listQuery = listQuery.eq('status', status)
  if (query) listQuery = listQuery.ilike('title', `%${query}%`)

  const { data: rows, error } = await listQuery
  if (error) {
    // A swallowed read here would render "no surveys yet" over a real list —
    // the exact failure that hid three members on Brukere.
    throw new Error(`surveys list read failed: ${error.message}`)
  }

  // Response totals come from the SECURITY DEFINER RPC, never from a client
  // select on `responses` (CLAUDE.md invariant 1). An aggregate embed would
  // have been silently zero rather than an error, which is worse.
  const { data: countRows, error: countError } = await supabase.rpc('survey_response_counts', {
    p_org: viewer.orgId,
  })
  if (countError) throw new Error(`survey_response_counts failed: ${countError.message}`)
  const responseCounts = new Map(
    (countRows ?? []).map((c) => [c.survey_id, Number(c.responses)]),
  )

  // The series behind each row (Q22, Q23). One read for the page rather than a
  // per-row embed: `schedules` is org-scoped through `can_view_survey`, so this
  // returns exactly the rows the viewer may see — a leser included, which is
  // what puts the ↻ chip on their list.
  const { data: scheduleRows } = await supabase
    .from('schedules')
    .select('survey_id, cadence, runs_total, runs_done, paused_at, active, next_run_at, custom_every, custom_unit')
  const schedules = new Map((scheduleRows ?? []).map((x) => [x.survey_id, x]))

  const surveys: SurveyListItem[] = (rows ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    audience: r.audience_label,
    status: r.status,
    scope: r.results_scope,
    target: r.target,
    questionCount: r.survey_questions?.[0]?.count ?? 0,
    responseCount: responseCounts.get(r.id) ?? 0,
    editorCount: r.survey_editors?.length ?? 0,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    kThreshold: r.k_threshold,
    respondentKind: r.respondent_kind === 'organisation' ? 'organisation' : 'person',
    schedulePaused: Boolean(schedules.get(r.id)?.paused_at),
  }))

  /* V6-6 — svTuva's inputs. Group SIZES per survey, for Q72's trigger: «this
     survey has a group that will never receive its own results». Sizes only —
     no names, because the task Q72 describes carries none.

     Two reads rather than a join, because `survey_invitations` is org-scoped
     through its round and PostgREST cannot express the aggregate; the numbers
     are small (one row per invitation for THIS org's surveys) and they are
     counts of people, which Q28 permits. */
  const surveyIds = (rows ?? []).map((r) => r.id)
  const { data: analystRounds } = surveyIds.length
    ? await supabase.from('survey_rounds').select('id, survey_id').in('survey_id', surveyIds)
    : { data: [] }
  const roundToSurvey = new Map((analystRounds ?? []).map((r) => [r.id, r.survey_id]))
  const { data: analystInvites } = (analystRounds ?? []).length
    ? await supabase
        .from('survey_invitations')
        .select('round_id, group_id')
        .in('round_id', (analystRounds ?? []).map((r) => r.id))
        .eq('is_test', false)
    : { data: [] }

  const sizes = new Map<string, Map<string, number>>()
  for (const inv of analystInvites ?? []) {
    const sid = roundToSurvey.get(inv.round_id)
    if (!sid || !inv.group_id) continue
    const per = sizes.get(sid) ?? new Map<string, number>()
    per.set(inv.group_id, (per.get(inv.group_id) ?? 0) + 1)
    sizes.set(sid, per)
  }

  const analyst = analyse(
    surveys.map((s) => ({
      id: s.id,
      title: s.title,
      status: s.status,
      responses: s.responseCount,
      target: s.target,
      groupSizes: [...(sizes.get(s.id)?.values() ?? [])],
      // The mirror of `app.k_for`, guarded by tests/db/k-for-mirror.test.ts.
      k: kForMirror({ respondent_kind: s.respondentKind, k_threshold: s.kThreshold }),
    })),
  )

  /* One definition of a row's rate, shared with the headline above it
     (`rowRate`, beside `rateOf`). A row with no recipient count sorts last and
     shows no percentage at all — the pill falls back to the count below. */
  const pctOf = (s: SurveyListItem) => {
    const row = { id: s.id, responses: s.responseCount, target: s.target }
    return hasTarget(row) ? rowRate(row) : 0
  }

  // Sorted here rather than in Postgres: two of the four orders are computed
  // (response share, and status by the design's Aktiv/Utkast/Lukket reading
  // order rather than the enum's), so doing it in one place keeps them
  // consistent.
  const STATUS_ORDER = { aktiv: 0, utkast: 1, lukket: 2 } as const
  const sorted = [...surveys].sort((a, b) => {
    switch (sort) {
      case 'navn':
        return a.title.localeCompare(b.title, 'nb')
      case 'status':
        return STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
      case 'svar':
        return pctOf(b) - pctOf(a)
      case 'nyeste':
      default:
        return b.createdAt.localeCompare(a.createdAt)
    }
  })

  /* F3 — «På tvers» is the ORGANISATION's whole set, which is what the words
     mean, while `surveys` above is the filter the reader can see. A second,
     minimal read rather than filtering the first one in JS: `ilike` is the
     database's and re-implementing it here would be a second definition of
     which rows the list is showing. */
  const { data: allRows, error: allError } = await supabase
    .from('surveys')
    .select('id, status, target, survey_questions(count)')
    .eq('org_id', viewer.orgId)
    .is('deleted_at', null)
  if (allError) throw new Error(`survey totals read failed: ${allError.message}`)
  const all = (allRows ?? []).map((r) => ({
    id: r.id,
    status: r.status,
    target: r.target,
    questions: r.survey_questions?.[0]?.count ?? 0,
    responses: responseCounts.get(r.id) ?? 0,
  }))

  const counts = {
    active: all.filter((s) => s.status === 'aktiv').length,
    drafts: all.filter((s) => s.status === 'utkast').length,
    closed: all.filter((s) => s.status === 'lukket').length,
  }
  /* The card's rate is over the organisation, and `rateOf` is the one place a
     ratio is formed — the drawing's own `crossStats` (v6:9131) divides by
     `target || 30`, inventing a denominator, which is F1's defect in the
     bundle. */
  const crossRate = rateOf(all)

  // The share panel is open for one survey at a time, named in the URL.
  const shareFor = sp.del ? surveys.find((s) => s.id === sp.del) : undefined
  let candidates: ShareCandidate[] = []
  if (shareFor && canEdit) {
    // A 'leser' can never co-edit, so they are not offered — the design filters
    // the same way (HeiTuva.dc.html:3417).
    const { data: members } = await supabase
      .from('org_members')
      .select('id, name, email, role, groups!org_members_group_id_fkey(name)')
      .eq('org_id', viewer.orgId)
      .eq('status', 'active')
      .neq('role', 'leser')
      .order('name')
    const { data: editors } = await supabase
      .from('survey_editors')
      .select('member_id')
      .eq('survey_id', shareFor.id)
    const chosen = new Set((editors ?? []).map((e) => e.member_id))
    candidates = (members ?? [])
      .filter((m) => m.id !== viewer.memberId)
      .map((m) => ({
        id: m.id,
        name: m.name || m.email,
        role: m.role,
        group: (m.groups as unknown as { name: string } | null)?.name ?? null,
        selected: chosen.has(m.id),
      }))
  }

  const params = (over: Partial<Record<keyof Search, string>>) => {
    const next = new URLSearchParams()
    const merged: Search = { filter, sok: query, sorter: sort, ...over }
    if (merged.filter && merged.filter !== 'alle') next.set('filter', merged.filter)
    if (merged.sok) next.set('sok', merged.sok)
    if (merged.sorter && merged.sorter !== 'nyeste') next.set('sorter', merged.sorter)
    if (merged.del) next.set('del', merged.del)
    const qs = next.toString()
    return qs ? `/undersokelser?${qs}` : '/undersokelser'
  }

  return (
    <div className="animate-enter">
      {/* F3 — the two-column band the drawing has on four screens and the app
          had on none (v6:2130). The CTA pair moves INTO the card's action slot,
          which is where v6:2143 draws «＋ Ny»; both buttons are kept because
          removing one is a product change and this is a layout phase. */}
      <PageHeader
        title={t('title')}
        counts={t('counts', counts)}
        scope={t('scopeLine', {
          status: filter === 'alle' ? t('scopeAll') : t(FILTER_KEY[filter]),
          shown: sorted.length,
          total: all.length,
        })}
        lead={t('lead')}
        cross={{
          total: t('crossResponses', { n: crossRate?.responses ?? 0 }),
          action: canEdit ? (
            // Both labels are whitespace-nowrap by design, so at 320px the pair
            // is wider than the viewport unless the row may wrap. Wrapping is
            // layout, not the control — the buttons keep their design size.
            <div className="flex flex-wrap items-center justify-end gap-[10px]">
              <Link
                href="/undersokelser/ny"
                className="touch-44 cursor-pointer whitespace-nowrap rounded-[10px] border-none bg-ac px-5 py-[11px] text-[13px] font-semibold text-ink no-underline"
              >
                {tNav('newSurvey')}
              </Link>
              <BlankSurveyButton label={tNav('blankSurvey')} failedLabel={t('actionFailed')} />
            </div>
          ) : (
            <p className="text-[13px] text-mut">{t('readerNotice')}</p>
          ),
          /* v6:9131's order: aktive, rate, spørsmål, utkast. The token says
             WHERE the rate goes; the number and the label are the card's. */
          chips: [
            { value: String(counts.active), label: t('chipActive') },
            PARTICIPATION,
            { value: String(all.reduce((a, s) => a + s.questions, 0)), label: t('chipQuestions') },
            { value: String(counts.drafts), label: t('chipDrafts') },
          ],
          participation: { measured: crossRate, total: all.length },
        }}
      />

      {/* V6-6 — svTuva. Participation only (Q184); the task tip is Q72's
          trigger or it is absent (Q185). */}
      <AnalystPanel analyst={analyst} />

      {shareFor && canEdit ? (
        <SharePanel
          surveyId={shareFor.id}
          title={shareFor.title}
          scope={shareFor.scope}
          candidates={candidates}
          closeHref={params({ del: undefined })}
          labels={{
            title: t('shareTitle', { title: shareFor.title }),
            sub: t('shareSub'),
            editors: t('shareEditors'),
            scopeHeading: t('shareScope'),
            submit: t('shareSubmit'),
            close: t('shareClose'),
            empty: t('shareNoCandidates'),
            failed: t('actionFailed'),
            scopes: {
              ledelse: { label: t('scopeHrLabel'), desc: t('scopeHrDesc') },
              ledere_eget_team: {
                label: t('scopeLeadLabel'),
                desc:
                  shareFor.respondentKind === 'organisation'
                    ? t('scopeLeadDescAttributed')
                    : t('scopeLeadDesc', { k: effectiveK(shareFor.kThreshold, 'person') }),
              },
              alle_ansatte: { label: t('scopeAllLabel'), desc: t('scopeAllDesc') },
            },
          }}
        />
      ) : null}

      {/* F3 — THE STATUS CHIPS ARE GONE FROM HERE, not duplicated: v6:8634
          draws them in the subnav strip and `AppSubnav` builds them from
          `keys.ts`. The condition is the one `AppSubnav` already states for
          `admin` — a shell rail may absorb an in-page one only when its list is
          COMPLETE — and four of four is. The row keeps the search and the sort,
          which the drawing puts here (v6:2217-2222); the SCOPE filters that
          v6:2206 draws in this position are F4's. */}
      <div className="mt-[26px] flex min-h-[46px] flex-wrap items-center justify-end gap-[14px]">
        <SurveySearch
          query={query}
          sort={sort}
          placeholder={t('search')}
          sortLabel={t('sortLabel')}
          sortOptions={SORTS.map((s) => ({ value: s, label: t(SORT_KEY[s]) }))}
        />
      </div>

      {sorted.length === 0 ? (
        <p className="mt-4 text-[13px] text-mut">
          {filter === 'alle' && !query ? t('emptyAll') : t('empty')}
        </p>
      ) : (
        <div className="mt-1 flex flex-col gap-3">
          {sorted.map((s) => (
            <SurveyRow
              key={s.id}
              survey={s}
              canEdit={canEdit}
              shareHref={params({ del: s.id })}
              labels={{
                primaryDraft: t('primaryDraft'),
                primaryActive: t('primaryActive'),
                primaryClosed: t('primaryClosed'),
                moreOptions: t('moreOptions'),
                menuEdit: t('menuEdit'),
                menuSend: t('menuSend'),
                menuResults: t('menuResults'),
                menuReport: t('menuReport'),
                menuAnswer: t('menuAnswer'),
                menuShare: t('menuShare'),
                menuCopy: t('menuCopy'),
                menuClose: t('menuClose'),
                menuDelete: t('menuDelete'),
                menuPause: schedules.get(s.id)?.paused_at ? t('menuResume') : t('menuPause'),
                menuStop: t('menuStopRecurrence'),
                stopConfirm: tSend('recurStopConfirm'),
                // The status sentence, formatted here because `SurveyRow` is a
                // client component and next-intl's `t` does not cross that
                // boundary. Same function as the Send screen's status row and
                // the rounds panel — one definition, four readers.
                recurrence: (() => {
                  const row = schedules.get(s.id)
                  if (!row) return ''
                  const st = scheduleStatus(
                    {
                      cadence: row.cadence as never,
                      runsTotal: row.runs_total,
                      runsDone: row.runs_done,
                      pausedAt: row.paused_at,
                      active: row.active,
                      nextRunAt: row.next_run_at,
                      customEvery: row.custom_every,
                      customUnit: row.custom_unit as never,
                    },
                    s.status,
                    (c) => tSend(CADENCE_KEY[c].label as 'cadOnce').toLowerCase(),
                    (iso) =>
                      new Date(iso).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' }),
                  )
                  return hasScheduleStatus(st)
                    ? tSend(st.key, ('values' in st ? st.values : {}) as never)
                    : ''
                })(),
                statusDraft: t('statusDraft', { count: s.questionCount }),
                // No denominator, no percentage: the pill falls back to the
                // response count rather than reporting a 0 % that is not true
                // (CLAUDE.md, "Never fabricate data in the UI").
                statusActive: s.target
                  ? t('statusActive', { pct: Math.round(pctOf(s) * 100) })
                  : t('statusActiveNoTarget', { done: s.responseCount }),
                statusClosed: s.target
                  ? t('statusClosed', { pct: Math.round(pctOf(s) * 100) })
                  : t('statusClosedNoTarget', { done: s.responseCount }),
                people: s.target ? t('people', { count: s.target }) : '',
                responses: s.target
                  ? t('responses', { done: s.responseCount, target: s.target })
                  : t('responsesNoTarget', { done: s.responseCount }),
                sharedWith: s.editorCount
                  ? t('sharedWith', {
                      count: s.editorCount,
                      scope:
                        s.scope === 'ledelse'
                          ? t('scopeHrShort')
                          : s.scope === 'ledere_eget_team'
                            ? t('scopeLeadShort')
                            : t('scopeAllShort'),
                    })
                  : '',
                failed: t('actionFailed'),
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
