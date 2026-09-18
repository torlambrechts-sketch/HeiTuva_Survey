import Link from 'next/link'
import type { ReactNode } from 'react'
import { optionsOf } from '@/lib/org/options'
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
  type SurveyListItem,
} from './keys'
import { SurveySearch } from './SurveySearch'
import { hasScheduleStatus, scheduleStatus } from '@/lib/schedules/status'
import { CADENCE_KEY } from '@/lib/send/registry'
import { SharePanel, type ShareCandidate } from './SharePanel'
import { BlankSurveyButton } from './BlankSurveyButton'
import { effectiveK } from '@/lib/questions/threshold-tier'
import { hasTarget, rateOf, rowRate } from '@/lib/surveys/participation'
import { PageHeader, PARTICIPATION } from '@/components/PageHeader'
import { cookies } from 'next/headers'
import { SCOPE_KEY, SURVEY_SCOPES, inScope, resolveScope, type ScopeRow } from '@/lib/surveys/scopes'
import {
  SURVEY_TUVA_COOKIE,
  SURVEY_VIEW_COOKIE,
  resolveSurveyView,
  resolveTuvaPlacement,
  type SurveyView,
} from '@/lib/surveys/view'
import { STATUS_BAR, listRow, type ListRow } from '@/lib/surveys/list-row'
import { readSummary } from '@/lib/results/read'
import { ViewSwitcher } from './ViewSwitcher'
import { MixBar } from './MixBar'
import { SurveyTable } from './SurveyTable'
import { SurveyCards } from './SurveyCards'
import { SurveyDetail } from './SurveyDetail'
import { RowMenu } from './RowMenu'
import { TuvaPlacementSwitch } from './TuvaPlacement'

type Search = {
  filter?: string
  sok?: string
  sorter?: string
  del?: string
  /** F4 — the scope rail. In the URL rather than a cookie because a scope is
   *  SHAREABLE: «look at the ones shared with me» is a link. The view mode is
   *  not shareable in the same way — it is how you like your screen — which is
   *  why that one is a cookie and this one is not. */
  omfang?: string
  /** Which survey the «Liste og detalj» view has open. Also a link. */
  valgt?: string
}

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
      'id, title, audience_label, status, results_scope, target, created_at, updated_at, k_threshold, respondent_kind, created_by, survey_questions(count), survey_editors(member_id)',
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

  // v8's «Snitt» column. Same reasoning as the counts above and one step
  // stronger: a mean is a RESULT, not participation, so it is gated as well as
  // routed. `survey_scale_means` (M:0131) applies `app.k_for` per question and
  // returns null where nothing qualifies — the drawing's own `scoreOf`
  // (v8:8245) has no threshold in it and would publish a single respondent's
  // answer on a list row. One batched call for the page, like the counts.
  const { data: meanRows, error: meanError } = await supabase.rpc('survey_scale_means', {
    p_org: viewer.orgId,
  })
  if (meanError) throw new Error(`survey_scale_means failed: ${meanError.message}`)
  const scaleMeans = new Map(
    (meanRows ?? []).map((m) => [m.survey_id, m.mean === null ? null : Number(m.mean)]),
  )

  // The series behind each row (Q22, Q23). One read for the page rather than a
  // per-row embed: `schedules` is org-scoped through `can_view_survey`, so this
  // returns exactly the rows the viewer may see — a leser included, which is
  // what puts the ↻ chip on their list.
  const { data: scheduleRows } = await supabase
    .from('schedules')
    .select('survey_id, cadence, runs_total, runs_done, paused_at, active, next_run_at, custom_every, custom_unit')
  const schedules = new Map((scheduleRows ?? []).map((x) => [x.survey_id, x]))

  /* F4 — the «Eier» column. One read for the page, keyed by member id.
     `org_members` is readable by any member of the organisation
     (`members_sel` is `app.is_org_member(org_id)`), so every role sees the
     name; the EMAIL rides along for the row's title attribute, where the
     drawing invents one from the name (v6:9057). */
  const { data: memberRows } = await supabase
    .from('org_members')
    .select('id, name, email')
    .eq('org_id', viewer.orgId)

  /* The organisation's DEFAULT view — the column half of Q122's mechanism
     (`M:0122`). The person's own choice is the cookie, resolved against this in
     three explicit steps by `resolveSurveyView`. */
  const { data: orgRow } = await supabase
    .from('organizations')
    .select('survey_view, options')
    .eq('id', viewer.orgId)
    .maybeSingle()

  /* G2 — «Vis Tuva-hjelp» (v6:8008), and THE ENFORCEMENT POINT the registry
     names for it (`lib/org/options.ts`).

     Off renders no analyst and no placement switch. Tuva reads participation
     counts and writes nothing, so nothing is stranded when it goes and no URL
     reaches it separately — it is a panel on a screen, not a route. That is
     what makes this one of the two toggles whose «off» needs no guard on the
     way back: there is no state to strand. */
  const tuvaOn = optionsOf(orgRow?.options).tuva
  const members = new Map(
    (memberRows ?? []).map((m) => [m.id, { name: m.name || m.email, email: m.email }]),
  )

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
    ? await supabase
        .from('survey_rounds')
        // F4 — `opens_at` and `round_no` ride along on a read the page already
        // makes. «Sendt» is the FIRST round's `opens_at` (NOT NULL with a
        // default, so every round has one) and a draft has no round at all,
        // which is the «—» v6:9061 draws.
        .select('id, survey_id, opens_at, round_no')
        .in('survey_id', surveyIds)
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

  /* ── F4: THE SCOPE RAIL, THE VIEW AND TUVA'S PLACEMENT ──────────────────
     The scope is applied AFTER the status filter and the search, because they
     are different axes and the drawing draws them in different places: the
     status rail is the shell's (v6:8634), the scope rail is the card's
     (v6:2206). A reader may hold one of each. */
  const scope = resolveScope(sp.omfang)

  const firstRound = new Map<string, string>()
  for (const r of analystRounds ?? []) {
    const prev = firstRound.get(r.survey_id)
    if (!prev || r.opens_at < prev) firstRound.set(r.survey_id, r.opens_at)
  }
  const sentDate = (iso: string | undefined) =>
    iso ? new Date(iso).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' }) : null

  /* `survey_editors(member_id)` is already on the list read, so «Delt med meg»
     needs no second query — and it asks whether the VIEWER is among them,
     which is what the label says (the drawing asks only whether anybody is). */
  const editorsOf = new Map(
    (rows ?? []).map((r) => [r.id, (r.survey_editors ?? []).map((e) => e.member_id)]),
  )

  const scopeRows: (ScopeRow & { id: string })[] = surveys.map((s) => ({
    id: s.id,
    responses: s.responseCount,
    target: s.target,
    status: s.status,
    ownerId: (rows ?? []).find((r) => r.id === s.id)?.created_by ?? null,
    recurring: (schedules.get(s.id)?.cadence ?? 'once') !== 'once',
    sharedWithViewer: (editorsOf.get(s.id) ?? []).includes(viewer.memberId),
  }))
  const inScopeIds = new Set(
    scopeRows.filter((r) => inScope(r, scope, viewer.memberId)).map((r) => r.id),
  )
  const scoped = sorted.filter((s) => inScopeIds.has(s.id))

  /** The three views read ONE derivation, so the switcher cannot appear to
   *  change the data (`lib/surveys/list-row.ts`). */
  const viewRows: ListRow[] = scoped.map((s) => {
    const owner = (rows ?? []).find((r) => r.id === s.id)?.created_by ?? null
    const m = owner ? members.get(owner) : undefined
    return listRow({
      id: s.id,
      title: s.title,
      audience: s.audience,
      status: s.status,
      responses: s.responseCount,
      target: s.target,
      questionCount: s.questionCount,
      ownerName: m?.name ?? null,
      ownerEmail: m?.email ?? null,
      sentLabel: sentDate(firstRound.get(s.id)),
      mean: scaleMeans.get(s.id) ?? null,
    })
  })

  /* The mix bar counts and rate are over the FILTERED set — what the reader can
     see — and the rate goes through `rateOf`, so the bundle's `target || 30`
     (v6:9023) is not reproduced a fourth time. */
  const barCounts = {
    aktiv: scoped.filter((s) => s.status === 'aktiv').length,
    utkast: scoped.filter((s) => s.status === 'utkast').length,
    lukket: scoped.filter((s) => s.status === 'lukket').length,
  }
  const barRate = rateOf(
    scoped.map((s) => ({ id: s.id, responses: s.responseCount, target: s.target })),
  )

  const store = await cookies()
  const view: SurveyView = resolveSurveyView(
    store.get(SURVEY_VIEW_COOKIE)?.value,
    orgRow?.survey_view,
  )
  const placement = resolveTuvaPlacement(store.get(SURVEY_TUVA_COOKIE)?.value)

  /* «Liste og detalj» selects one survey. The selection is in the URL, so it is
     a link somebody can send; an unknown or absent id falls back to the first
     row rather than rendering an empty panel beside a full list. */
  const selected =
    viewRows.find((r) => r.id === sp.valgt) ?? (view === 'delt' ? viewRows[0] : undefined)

  /* THE ONLY RESULTS READ ON THIS SCREEN, and only in the view that shows it:
     `results_summary` for the ONE selected survey. k-gated in the database, so
     a survey under the threshold comes back refused and the tile renders «—».
     One call, right population — see `SurveyDetail`'s header for why the same
     number is in neither the table nor the «På tvers» card. */
  const selectedAvg =
    view === 'delt' && selected ? ((await readSummary(selected.id))?.avg ?? null) : null

  /* The row menu, built ONCE here and mounted by the two views that carry
     actions. It has to be built by the page: the labels are next-intl's and the
     recurrence sentence comes from `lib/schedules/status.ts`, neither of which
     crosses into a client component. */
  const tuvaLabels = {
    toBubble: t('tuvaToBubble'),
    toSide: t('tuvaToSide'),
    toggle: t('tuvaToggle'),
    mark: t('tuvaMark'),
    name: t('tuvaName'),
    sub: t('tuvaSub'),
  }

  const rowMenu = (id: string) => {
    const s = surveys.find((x) => x.id === id)
    if (!s || !canEdit) return null
    const row = schedules.get(s.id)
    const st = row
      ? scheduleStatus(
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
          (iso) => new Date(iso).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' }),
        )
      : null
    return (
      <RowMenu
        survey={{
          id: s.id,
          title: s.title,
          status: s.status,
          scope: s.scope,
          kThreshold: s.kThreshold,
          respondentKind: s.respondentKind,
          schedulePaused: s.schedulePaused,
        }}
        canEdit={canEdit}
        shareHref={params({ del: s.id })}
        labels={{
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
          menuPause: s.schedulePaused ? t('menuResume') : t('menuPause'),
          menuStop: t('menuStopRecurrence'),
          stopConfirm: tSend('recurStopConfirm'),
          failed: t('actionFailed'),
          recurrence: st && hasScheduleStatus(st) ? tSend(st.key, ('values' in st ? st.values : {}) as never) : '',
        }}
      />
    )
  }


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
    /* F4 — `omfang` and `valgt` carry through every link on this screen, so
       clicking a scope does not silently drop the selection and clicking a row
       does not drop the scope. `over` may set either to `undefined` to clear
       it, which is how «Alle» removes the parameter rather than writing it. */
    const merged: Search = {
      filter,
      sok: query,
      sorter: sort,
      omfang: scope,
      valgt: sp.valgt,
      ...over,
    }
    if (merged.filter && merged.filter !== 'alle') next.set('filter', merged.filter)
    if (merged.sok) next.set('sok', merged.sok)
    if (merged.sorter && merged.sorter !== 'nyeste') next.set('sorter', merged.sorter)
    if (merged.omfang && merged.omfang !== 'alle') next.set('omfang', merged.omfang)
    if (merged.valgt) next.set('valgt', merged.valgt)
    if (merged.del) next.set('del', merged.del)
    const qs = next.toString()
    return qs ? `/undersokelser?${qs}` : '/undersokelser'
  }

  /**
   * THE MENUS, BUILT HERE AND PASSED AS ELEMENTS — NOT AS A FUNCTION.
   *
   * This was `menuFor={(id) => rowMenu(id)}` and it made the whole screen
   * return HTTP 500: **a function cannot cross the server/client boundary**,
   * and `SurveyTable` is a client component. `tsc`, ESLint and `next build`
   * all passed it, because the rule is enforced when the tree is SERIALISED,
   * which is to say at render time and nowhere earlier.
   *
   * React ELEMENTS do cross it, so the page — which has the translations, the
   * schedule sentence and the viewer's role — builds one menu per visible row
   * and hands over a plain object. The table looks its row up by id.
   *
   * ── AND IT MUST STAY BELOW EVERY BINDING `rowMenu` READS ──────────────────
   *
   * `rowMenu` used to be CALLED from the JSX, which runs after every `const` in
   * this function is initialised. Building the map eagerly moves the call
   * upwards, and the first placement — beside `rowMenu`'s own definition —
   * turned the 500 into a DIFFERENT 500: `shareHref={params({ del: s.id })}`
   * reaches `params`, declared forty lines further down, and a `const` read
   * before its declaration is a temporal dead zone, not `undefined`.
   *
   * **The second defect was invisible until the first was fixed**, which is the
   * argument for driving the screen rather than re-reading it: one 500 looks
   * exactly like another from outside. This block therefore sits immediately
   * above the `return`, after every helper, and that position is the guard.
   */
  const rowMenus: Record<string, ReactNode> = Object.fromEntries(
    viewRows.map((r) => [r.id, rowMenu(r.id)]),
  )

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

      {/* F4 — THE LIST CARD, and the two-column shape Tuva's side placement
          needs (v6:2200-2201: `flex-wrap;gap:16px` with the card at
          `flex:3 1 520px` and the column at `flex:1 1 268px`). The card is
          `relative` because the BUBBLE is absolutely positioned inside it. */}
      <div className="mt-[18px] flex flex-wrap items-start gap-4">
        <div className="relative min-w-0 flex-[3_1_520px] rounded-[20px] border border-line bg-sf">
          {/* v6:2202 — the card's head: the scope rail on the left, the view
              switcher, the search and the sort on the right. */}
          <div className="flex flex-wrap items-center justify-between gap-3.5 px-[22px] py-[18px]">
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <h2 className="whitespace-nowrap font-display text-[22px] font-medium">
                {t('listTitle')}
              </h2>
              {/* The five scope filters (v6:2206). LINKS, not buttons: the scope
                  is in the URL because «the ones shared with me» is something a
                  person sends to somebody. `touch-cluster` for the same reason
                  the subnav rail has it — 30px chips need 14px between painted
                  edges below 767px. */}
              <nav
                aria-label={t('scopeRailLabel')}
                className="touch-cluster flex flex-wrap gap-[3px] rounded-[11px] bg-sf2 p-1"
              >
                {SURVEY_SCOPES.map((s) => {
                  const on = scope === s
                  return (
                    <Link
                      key={s}
                      href={params({ omfang: s === 'alle' ? undefined : s })}
                      aria-current={on ? 'page' : undefined}
                      className="touch-44 cursor-pointer whitespace-nowrap rounded-lg px-3.5 py-[7px] text-xs font-semibold no-underline"
                      style={{
                        background: on ? 'var(--ink)' : 'transparent',
                        color: on ? 'var(--sf)' : 'var(--ink)',
                      }}
                    >
                      {t(SCOPE_KEY[s] as 'svScopeAll')}
                    </Link>
                  )
                })}
              </nav>
            </div>
            <span className="flex flex-wrap items-center gap-[9px]">
              <ViewSwitcher
                view={view}
                labels={{
                  liste: t('viewList'),
                  delt: t('viewSplit'),
                  kort: t('viewCards'),
                }}
              />
              <SurveySearch
                query={query}
                sort={sort}
                placeholder={t('search')}
                sortLabel={t('sortLabel')}
                sortOptions={SORTS.map((s) => ({ value: s, label: t(SORT_KEY[s]) }))}
              />
            </span>
          </div>

          <MixBar counts={barCounts} measured={barRate} total={scoped.length} />

          {viewRows.length === 0 ? (
            /* v6:2243 — the empty state has a RESET, because a person who has
               stacked a status, a scope and a search needs one control to get
               back rather than three. */
            <div className="m-[22px] rounded-xl border border-dashed border-line p-[22px] text-center">
              <p className="text-[13.5px] font-semibold">{t('emptyScope')}</p>
              <p className="mt-1 text-[12.5px] text-mut">{t('emptyScopeBody')}</p>
              <Link
                href="/undersokelser"
                className="touch-44 mt-3 inline-block cursor-pointer rounded-[10px] border border-line px-4 py-[9px] text-[12.5px] font-semibold text-ink no-underline"
              >
                {t('emptyReset')}
              </Link>
            </div>
          ) : view === 'liste' ? (
            <SurveyTable
              rows={viewRows}
              menus={rowMenus}
              labels={{
                colSurvey: t('colSurvey'),
                colResponses: t('colResponses'),
                colSent: t('colSent'),
                colStatus: t('colStatus'),
                colOwner: t('colOwner'),
                colAverage: t('colAverage'),
                colAction: t('colAction'),
                noSent: t('colNoSent'),
                noOwner: t('colNoOwner'),
                responsesOnly: t('colResponsesOnly', { n: '{n}' }),
                open: t('detailOpen'),
                build: t('menuEdit'),
                results: t('menuResults'),
                report: t('menuReport'),
                more: t('rowMore'),
                less: t('rowLess'),
                invited: t('rowInvited', { n: '{n}' }),
                answered: t('rowAnswered'),
                missing: t('rowMissing'),
                questions: t('colQuestions'),
                statusLabel: {
                  aktiv: t('status_aktiv'),
                  utkast: t('status_utkast'),
                  lukket: t('status_lukket'),
                },
              }}
            />
          ) : view === 'kort' ? (
            <SurveyCards rows={viewRows} />
          ) : (
            /* «Liste og detalj» — v6:2241. The left column is a compact picker
                and the right one is the panel; both are links, so a selection is
                a URL. */
            <div className="flex flex-wrap items-start gap-4 px-[22px] pb-[22px]">
              <div className="min-w-0 flex-[1_1_280px]">
                {viewRows.map((r) => (
                  <Link
                    key={r.id}
                    href={params({ valgt: r.id })}
                    aria-current={selected?.id === r.id ? 'true' : undefined}
                    className="mb-[7px] flex w-full items-center gap-[13px] rounded-xl border-[1.5px] px-3.5 py-[13px] text-left text-ink no-underline"
                    style={{
                      borderColor: selected?.id === r.id ? 'var(--ink)' : 'var(--line)',
                      background: selected?.id === r.id ? 'var(--sbg)' : 'var(--bg)',
                    }}
                  >
                    <span
                      aria-hidden="true"
                      className="block h-[38px] w-2 flex-none rounded-full"
                      style={{ background: STATUS_BAR[r.status] }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{r.title}</span>
                      <span className="mt-0.5 block truncate text-xs text-mut">
                        {[r.ownerName, r.pct === null ? null : t('rowPct', { pct: r.pct })]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
              {selected ? (
                <SurveyDetail
                  row={selected}
                  avg={selectedAvg}
                  canEdit={canEdit}
                  menu={rowMenu(selected.id)}
                />
              ) : null}
            </div>
          )}

          {/* G6 — the drawing's 76px spacer (v6:2415) is GONE with the bubble
              it cleared. It existed because v6 anchors that button inside this
              card; ours is anchored to the viewport by the shell, so there is
              nothing here for it to cover. In the bubble placement this branch
              now renders NO markup on the page at all — it publishes the
              analyst to the shell's helper. */}
          {tuvaOn && placement === 'bubble' ? (
            <TuvaPlacementSwitch placement="bubble" labels={tuvaLabels}>
              <AnalystPanel analyst={analyst} bare />
            </TuvaPlacementSwitch>
          ) : null}
        </div>

        {/* v6:2438 — the docked side column, which is the DRAWING'S DEFAULT and
            which the app had in neither placement. */}
        {tuvaOn && placement === 'side' ? (
          <TuvaPlacementSwitch placement="side" labels={tuvaLabels}>
            <AnalystPanel analyst={analyst} bare />
          </TuvaPlacementSwitch>
        ) : null}
      </div>
    </div>
  )
}
