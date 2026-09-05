import { notFound } from 'next/navigation'
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
    .select('id, title, audience_label, status, anonymity, langs')
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
