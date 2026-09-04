import { getTranslations } from 'next-intl/server'
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
    supabase
      .from('loop_actions')
      .select('id, text, due_at, done, created_at')
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
  const compliance: ComplianceChip[] = (definitions ?? []).map((def) => {
    const duty = dutyByKey.get(def.key)
    const due = duty?.next_due_at ? new Date(duty.next_due_at) : null

    let days: string
    let tone: string
    if (!duty || !due) {
      days = t('dueNotStarted')
      tone = 'var(--ac3)'
    } else {
      const months = Math.round((due.getTime() - now) / (1000 * 60 * 60 * 24 * 30.44))
      if (months < 0) {
        days = t('dueOverdue')
        tone = 'var(--ac3)'
      } else if (due.getFullYear() === new Date().getFullYear() && months <= 3) {
        days = t('dueThisYear')
        tone = 'var(--ac3)'
      } else {
        days = months <= 1 ? t('dueInMonth') : t('dueInMonths', { months })
        tone = months >= 6 ? 'var(--ac2)' : 'var(--ac)'
      }
    }

    return {
      key: def.key,
      title: def.title,
      law: def.law,
      due: duty?.next_due_at ? dateFmt(duty.next_due_at) : t('dueNotStarted'),
      days,
      tone,
    }
  })

  const activeSurveys = (surveys ?? []).filter((s) => s.status === 'aktiv').length

  return (
    <OverviewScreen
      orgName={viewer.orgName}
      firstName={(viewer.displayName || viewer.email).split(' ')[0] ?? ''}
      canEdit={viewer.role !== 'leser'}
      activeSurveys={activeSurveys}
      totalSurveys={(surveys ?? []).length}
      actions={actions.slice(0, 3)}
      compliance={compliance}
      activity={activity}
      loop={(loop ?? []).map((l) => ({
        id: l.id,
        text: l.text,
        when: l.due_at ? dateFmt(l.due_at) : null,
        done: l.done,
      }))}
      // The design shows the wizard prompt as a dismissible row. There is
      // nothing to dismiss until there is something else to do, so it stands in
      // for the empty state: an organisation with no surveys at all.
      showOnboard={(surveys ?? []).length === 0}
    />
  )
}
