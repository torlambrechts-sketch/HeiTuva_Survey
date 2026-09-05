import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { requireViewer } from '@/lib/auth/session'
import { isFlagEnabled } from '@/lib/flags'
import { SurveyContextBar } from '../SurveyContextBar'
import { SendScreen } from './SendScreen'

/** Canonical UUID shape; anything else cannot name a survey. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Send — HeiTuva.dc.html:1686-1912.
 *
 * Everything the screen decides is loaded here and handed down: the survey, the
 * org's groups with their headcounts, whether a round is already open, and
 * whether the SMS channel is switched on. The screen itself holds only the
 * choices the user is making before they press send.
 */
export default async function SendPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID.test(id)) notFound()

  const viewer = await requireViewer()
  const supabase = await createClient()

  const { data: survey, error } = await supabase
    .from('surveys')
    .select('id, title, audience_label, status, anonymity, langs, k_threshold, respondent_kind, policy_locked, template_pack_key')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()
  if (error) throw new Error(`send survey read failed: ${error.message}`)
  if (!survey) notFound()

  const [{ count: questionCount }, { data: groups }, { data: openRound }] = await Promise.all([
    supabase
      .from('survey_questions')
      .select('id', { count: 'exact', head: true })
      .eq('survey_id', id),
    supabase.from('groups').select('id, name').eq('org_id', viewer.orgId).order('name'),
    supabase
      .from('survey_rounds')
      .select('id, round_no, status')
      .eq('survey_id', id)
      .eq('status', 'open')
      .maybeSingle(),
  ])

  // Headcounts for the group cards. A separate grouped read rather than an
  // embed, because the count is of ACTIVE members and an embedded count cannot
  // carry that filter.
  const { data: members } = await supabase
    .from('org_members')
    .select('group_id')
    .eq('org_id', viewer.orgId)
    .eq('status', 'active')
    .not('group_id', 'is', null)

  // Q17 — what the survey promises, and whether the Send screen may still
  // change it. A statutory pack locks anonymity from creation; a survey with
  // answers is locked by the guard. Either way the chips below are disabled
  // with the reason, instead of letting send_round fail on the trigger.
  const t = await getTranslations('send')
  const attributed = survey.respondent_kind === 'organisation'
  const k = attributed ? 0 : Math.max(survey.k_threshold, 3)
  let lockedReason: string | null = null
  if (survey.template_pack_key) {
    const { data: pack } = await supabase
      .from('template_packs')
      .select('legal_ref, title, policy')
      .is('org_id', null)
      .eq('key', survey.template_pack_key)
      .maybeSingle()
    const policy = (pack?.policy ?? null) as { locked?: boolean; k_threshold?: number } | null
    if (policy?.locked) {
      const legalRef = pack?.legal_ref ?? pack?.title ?? survey.template_pack_key
      lockedReason = attributed
        ? t('lockedByPackAttributed', { legalRef })
        : t('lockedByPack', { legalRef, anonymity: t('lockedAnonymousWord'), k })
    }
  }
  if (!lockedReason && survey.policy_locked) lockedReason = t('lockedBySent')

  const headcount = new Map<string, number>()
  for (const m of members ?? []) {
    if (m.group_id) headcount.set(m.group_id, (headcount.get(m.group_id) ?? 0) + 1)
  }

  return (
    <>
      <SurveyContextBar
        surveyId={survey.id}
        title={survey.title}
        audience={survey.audience_label}
        status={survey.status}
        current="send"
      />
      <SendScreen
        surveyId={survey.id}
        title={survey.title}
        anonymity={survey.anonymity}
        kThreshold={k}
        respondentKind={attributed ? 'organisation' : 'person'}
        lockedReason={lockedReason}
        questionCount={questionCount ?? 0}
        alreadyOpen={Boolean(openRound)}
        canSend={viewer.role !== 'leser'}
        smsEnabled={await isFlagEnabled('sms_channel', viewer.orgId)}
        orgName={viewer.orgName}
        groups={(groups ?? []).map((g) => ({
          id: g.id,
          name: g.name,
          count: headcount.get(g.id) ?? 0,
        }))}
      />
    </>
  )
}
