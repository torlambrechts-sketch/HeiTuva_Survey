import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { requireViewer } from '@/lib/auth/session'
import { ChipLink } from '@/app/(app)/bibliotek/ChipLink'
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
import { SharePanel, type ShareCandidate } from './SharePanel'
import { BlankSurveyButton } from './BlankSurveyButton'

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
  }))

  const pctOf = (s: SurveyListItem) =>
    s.target && s.target > 0 ? s.responseCount / s.target : 0

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

  const counts = {
    active: surveys.filter((s) => s.status === 'aktiv').length,
    drafts: surveys.filter((s) => s.status === 'utkast').length,
    closed: surveys.filter((s) => s.status === 'lukket').length,
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
    const merged: Search = { filter, sok: query, sorter: sort, ...over }
    if (merged.filter && merged.filter !== 'alle') next.set('filter', merged.filter)
    if (merged.sok) next.set('sok', merged.sok)
    if (merged.sorter && merged.sorter !== 'nyeste') next.set('sorter', merged.sorter)
    if (merged.del) next.set('del', merged.del)
    const qs = next.toString()
    return qs ? `/undersokelser?${qs}` : '/undersokelser'
  }

  return (
    <div className="animate-enter max-w-[1080px] pt-[34px]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[28px] font-medium">{t('title')}</h1>
          <p className="mt-[3px] text-[13px] text-mut">{t('counts', counts)}</p>
        </div>
        {canEdit ? (
          // Both labels are whitespace-nowrap by design, so at 320px the pair is
          // wider than the viewport unless the row may wrap. Wrapping is layout,
          // not the control — the buttons keep their exact design size.
          <div className="flex flex-wrap items-center gap-[10px]">
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
        )}
      </div>

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
                    : t('scopeLeadDesc', { k: Math.max(shareFor.kThreshold, 3) }),
              },
              alle_ansatte: { label: t('scopeAllLabel'), desc: t('scopeAllDesc') },
            },
          }}
        />
      ) : null}

      <div className="mt-[26px] flex min-h-[46px] flex-wrap items-center justify-between gap-[14px]">
        <div className="flex flex-wrap gap-2 rounded-full p-1 md:gap-[3px]" style={{ background: 'var(--sf2)' }}>
          {FILTERS.map((f) => (
            <ChipLink key={f} href={params({ filter: f })} active={filter === f} variant="segment">
              {t(FILTER_KEY[f])}
            </ChipLink>
          ))}
        </div>
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
                statusDraft: t('statusDraft', { count: s.questionCount }),
                // No denominator, no percentage: the pill falls back to the
                // response count rather than reporting a 0 % that is not true
                // (CLAUDE.md, "Never fabricate data in the UI").
                statusActive: s.target
                  ? t('statusActive', { pct: Math.min(100, Math.round(pctOf(s) * 100)) })
                  : t('statusActiveNoTarget', { done: s.responseCount }),
                statusClosed: s.target
                  ? t('statusClosed', { pct: Math.min(100, Math.round(pctOf(s) * 100)) })
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
