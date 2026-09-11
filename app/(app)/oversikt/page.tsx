import { getTranslations } from 'next-intl/server'
import { readWorkspace } from '@/lib/workspace/current'
import { createClient } from '@/lib/supabase/server'
import { requireViewer } from '@/lib/auth/session'
import { OverviewScreen, type ActionItem, type Activity, type ComplianceChip } from './OverviewScreen'

/**
 * Oversikt — HeiTuva.dc.html:218-317. Built last in Phase 5, because it is the
 * only screen that aggregates all of the others.
 *
 * Participation figures come from `overview_activity`, a SECURITY DEFINER RPC:
 * they count rows in `responses`, which no client may select from, even though
 * none of them is a result. Everything else on the screen is ordinary
 * RLS-scoped reads.
 */
export default async function OverviewPage() {
  const viewer = await requireViewer()
  const supabase = await createClient()
  const t = await getTranslations('dash')

  const [
    { data: activityRaw },
    { data: surveys },
    { data: definitions },
    { data: duties },
    { data: loop },
    { data: counts },
  ] = await Promise.all([
    supabase.rpc('overview_activity', { p_org: viewer.orgId }),
    supabase
      .from('surveys')
      .select('id, title, status, created_at')
      .eq('org_id', viewer.orgId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
    supabase.from('duty_definitions').select('key, title, law, default_interval_months').order('key'),
    supabase
      .from('duties')
      .select('definition_key, next_due_at')
      .eq('org_id', viewer.orgId),
    // V2-4 · Q68 (DEFAULTED). `loop_actions` is superseded by `tasks` and the
    // table is dropped (`M:0062`). This card keeps its drawing and changes its
    // SOURCE — «Sløyfen lukket» is what the task register is, read four rows at
    // a time. What Q68 actually retires is the second WRITE path; see D113.
    supabase
      .from('tasks')
      .select('id, title, due_at, status, created_at')
      .eq('org_id', viewer.orgId)
      .order('created_at', { ascending: false })
      .limit(4),
    supabase.rpc('survey_response_counts', { p_org: viewer.orgId }),
  ])

  // `survey_response_counts` returns responses per survey and nothing else, so
  // the denominator comes from the invitations themselves. Counting them here
  // rather than adding a column keeps "invited" meaning what it says: rows that
  // were actually sent, not a target somebody typed.
  const surveyIds = (surveys ?? []).map((s) => s.id)
  const { data: invitations } = await supabase
    .from('survey_invitations')
    .select('round_id, survey_rounds!inner(survey_id)')
    .in(
      'survey_rounds.survey_id',
      surveyIds.length ? surveyIds : ['00000000-0000-0000-0000-000000000000'],
    )
  const invitedBySurvey = new Map<string, number>()
  for (const row of invitations ?? []) {
    const sid = (row as unknown as { survey_rounds: { survey_id: string } }).survey_rounds.survey_id
    invitedBySurvey.set(sid, (invitedBySurvey.get(sid) ?? 0) + 1)
  }

  const raw = (activityRaw ?? {}) as Record<string, unknown>
  const activity: Activity = {
    thisWeek: Number(raw.this_week ?? 0),
    thisYear: Number(raw.this_year ?? 0),
    completion: raw.completion === null || raw.completion === undefined ? null : Number(raw.completion),
    days: (raw.days ?? []) as Activity['days'],
    weeks: (raw.weeks ?? []) as Activity['weeks'],
    streakWeeks: Number(raw.streak_weeks ?? 0),
  }

  const responsesBySurvey = new Map(
    ((counts ?? []) as { survey_id: string; responses: number }[]).map((c) => [c.survey_id, c]),
  )

  // Open rounds, for the "lukkes {dato}" half of the low-response item. The
  // prototype writes "lukkes om 3 dager" for every survey; here it is either
  // the real closing date or the sentence without it.
  const { data: openRounds } = await supabase
    .from('survey_rounds')
    .select('survey_id, closes_at, status')
    .eq('status', 'open')
    .in('survey_id', surveyIds.length ? surveyIds : ['00000000-0000-0000-0000-000000000000'])
  const closesBySurvey = new Map((openRounds ?? []).map((r) => [r.survey_id, r.closes_at]))

  const dateFmt = (iso: string) =>
    new Date(iso).toLocaleDateString('nb-NO', { day: 'numeric', month: 'long' })

  const actions: ActionItem[] = []
  for (const s of surveys ?? []) {
    const c = responsesBySurvey.get(s.id)
    const invited = invitedBySurvey.get(s.id) ?? 0
    if (s.status === 'aktiv' && c && invited > 0) {
      const pct = Math.round((c.responses / invited) * 100)
      if (pct < 70) {
        const closes = closesBySurvey.get(s.id)
        actions.push({
          key: `low-${s.id}`,
          tint: 'var(--ac3)',
          title: t('actionLowResponse', { title: s.title }),
          sub: closes
            ? t('actionLowResponseSub', { pct, closes: dateFmt(closes) })
            : t('actionLowResponseNoClose', { pct }),
          cta: t('actionLowResponseCta'),
          href: `/undersokelser/${s.id}/send`,
        })
      }
    }
    if (s.status === 'utkast') {
      actions.push({
        key: `draft-${s.id}`,
        tint: 'var(--ac)',
        title: t('actionDraft', { title: s.title }),
        sub: t('actionDraftSub'),
        cta: t('actionDraftCta'),
        href: `/undersokelser/${s.id}/bygg`,
      })
    }
  }

  // The prototype's third item counts unread free text. There is no "read"
  // state anywhere in the schema, so counting free-text answers would render a
  // number that never goes down — the item would be permanent and meaningless.
  // It is left out rather than faked; when a read marker exists it belongs here.

  const dutyByKey = new Map((duties ?? []).map((d) => [d.definition_key, d]))
  const now = Date.now()

  /**
   * The compliance card's timeline runs "nå" to "12 mnd" (HeiTuva.dc.html:349),
   * so a duty's position on it is `months / 12`, computed HERE, on every render,
   * from `next_due_at`. It is deliberately not a column: a duty's interval can
   * change and nothing would recompute a stored percentage, so it would go
   * quietly stale on the first screen anyone sees. If a frozen report ever needs
   * a position that cannot move, that belongs to the snapshot that freezes it.
   *
   * The clamp keeps the dot on the bar rather than half off its end: the marker
   * is 16px wide with `margin-left:-8px`, so 0% and 100% hang over the edges.
   * Two cases land on the left end deliberately — a duty that is overdue, and
   * one the organisation has never instantiated (duties are created on first
   * touch, so a new organisation has four of these). Both are "at or before
   * now", which is where the axis starts; the bundle draws neither (D92).
   */
  const AXIS_MONTHS = 12
  const posFor = (months: number | null) =>
    months === null ? 3 : Math.min(97, Math.max(3, Math.round((months / AXIS_MONTHS) * 100)))

  const compliance: ComplianceChip[] = (definitions ?? []).map((def) => {
    const duty = dutyByKey.get(def.key)
    const due = duty?.next_due_at ? new Date(duty.next_due_at) : null

    let days: string
    let when: string
    let tone: string
    let urgent: boolean
    let months: number | null = null
    if (!duty || !due) {
      days = t('dueNotStarted')
      when = t('dueNotStarted')
      tone = 'var(--ac3)'
      urgent = true
    } else {
      months = Math.round((due.getTime() - now) / (1000 * 60 * 60 * 24 * 30.44))
      if (months < 0) {
        days = t('dueOverdue')
        when = t('dueOverdue')
        tone = 'var(--ac3)'
        urgent = true
      } else if (due.getFullYear() === new Date().getFullYear() && months <= 3) {
        days = t('dueThisYear')
        when = t('dueWhenThisYear')
        tone = 'var(--ac3)'
        urgent = true
      } else {
        days = months <= 1 ? t('dueInMonth') : t('dueInMonths', { months })
        when = months <= 1 ? t('dueWhenMonth') : t('dueWhenMonths', { months })
        tone = months >= 6 ? 'var(--ac2)' : 'var(--ac)'
        urgent = false
      }
    }

    return {
      key: def.key,
      title: def.title,
      law: def.law,
      due: duty?.next_due_at ? dateFmt(duty.next_due_at) : t('dueNotStarted'),
      days,
      when,
      tone,
      urgent,
      pos: posFor(months !== null && months < 0 ? null : months),
    }
  })

  /**
   * "N av M plikter krever handling i år" — a count of DUTIES, not of responses.
   * Q28's participation-versus-derived rule does not reach it and no k-gate
   * applies: nothing here is computed from what anybody answered. It counts the
   * statutory obligations whose deadline the organisation has to act on, which
   * is public-facing information about the organisation itself; the same four
   * rows are already named on this screen and in Rapporter. A future reader
   * seeing a bare number beside compliance data should find this rather than
   * have to reconstruct it.
   *
   * "Krever handling" is the same test the tone already makes: not started,
   * past its date, or falling due inside the current year.
   */
  const complianceUrgent = compliance.filter((c) => c.urgent).length

  const activeSurveys = (surveys ?? []).filter((s) => s.status === 'aktiv').length

  return (
    <OverviewScreen
      workspace={await readWorkspace(viewer.orgId)}
      orgName={viewer.orgName}
      firstName={(viewer.displayName || viewer.email).split(' ')[0] ?? ''}
      canEdit={viewer.role !== 'leser'}
      activeSurveys={activeSurveys}
      totalSurveys={(surveys ?? []).length}
      actions={actions.slice(0, 3)}
      compliance={compliance}
      complianceUrgent={complianceUrgent}
      activity={activity}
      loop={(loop ?? []).map((l) => ({
        id: l.id,
        text: l.title,
        when: l.due_at ? dateFmt(l.due_at) : null,
        // «done» is now the register's own terminal step rather than a boolean
        // somebody set. A task reaches `lukket` only through the close guard,
        // so this count means «assessed and closed» rather than «ticked».
        done: l.status === 'lukket',
      }))}
      // The design shows the wizard prompt as a dismissible row. There is
      // nothing to dismiss until there is something else to do, so it stands in
      // for the empty state: an organisation with no surveys at all.
      showOnboard={(surveys ?? []).length === 0}
    />
  )
}
