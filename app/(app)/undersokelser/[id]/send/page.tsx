import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { requireViewer } from '@/lib/auth/session'
import { isFlagEnabled } from '@/lib/flags'
import type { Cadence, CustomUnit } from '@/lib/send/registry'
import { readScheduleChip } from '@/lib/schedules/read'
import { SurveyContextBar } from '../SurveyContextBar'
import { SendScreen } from './SendScreen'
import { effectiveK } from '@/lib/questions/threshold-tier'
import { SYNC_SOURCE_FLAGS, type ImportSource } from '@/lib/send/registry'
import type { FlagKey } from '@/lib/flags'

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
    .select('id, title, audience_label, status, anonymity, langs, k_threshold, respondent_kind, policy_locked, template_pack_key, run_mode')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()
  if (error) throw new Error(`send survey read failed: ${error.message}`)
  if (!survey) notFound()

  const [{ count: questionCount }, { data: groups }, { data: openRound }, { data: suppressedRows }] =
    await Promise.all([
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
      // V2-3b · Q60. Readable by every member on purpose: a redaktør about to
      // send needs to know why the count is lower than the group.
      supabase.from('suppressions').select('email').eq('org_id', viewer.orgId),
    ])

  // The live series (Q22, Q23). Read through RLS as the viewer — since M:0044's
  // predicate swap a leser reads it too, which is what puts the ↻ chip on their
  // screen. `maybeSingle`: a survey has at most one schedule, and none until it
  // has been sent with a cadence.
  const { data: schedule } = await supabase
    .from('schedules')
    .select('cadence, runs_total, runs_done, paused_at, active, next_run_at, custom_every, custom_unit')
    .eq('survey_id', id)
    .maybeSingle()

  // Q21 — the pack's cadence pre-fills the picker and explains itself. NOT a
  // lock: `duty_definitions.default_interval_months` is a reporting interval,
  // and turning it into a frozen control would be the product inventing a legal
  // constraint the law does not impose.
  const { data: duty } = survey.template_pack_key
    ? await supabase
        .from('duty_definitions')
        .select('key, law, default_interval_months')
        .eq('pack_key', survey.template_pack_key)
        .maybeSingle()
    : { data: null }

  const inheritedCadence: Cadence | null =
    duty?.default_interval_months === 12 ? 'annual'
    : duty?.default_interval_months === 24 ? 'biennial'
    : duty?.default_interval_months === 3 ? 'quarterly'
    : duty?.default_interval_months === 1 ? 'monthly'
    : null

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
  const tDuty = await getTranslations('duty')
  const attributed = survey.respondent_kind === 'organisation'
  const k = effectiveK(survey.k_threshold, attributed ? 'organisation' : 'person')
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
        liveMode={survey.run_mode === 'live'}
        surveyId={survey.id}
        title={survey.title}
        audience={survey.audience_label}
        status={survey.status}
        recurrence={await readScheduleChip(survey.id, survey.status)}
        current="send"
      />
      <SendScreen
        surveyId={survey.id}
        title={survey.title}
        anonymity={survey.anonymity}
        kThreshold={k}
        respondentKind={attributed ? 'organisation' : 'person'}
        lockedReason={lockedReason}
        status={survey.status}
        schedule={
          schedule
            ? {
                cadence: schedule.cadence as Cadence,
                runsTotal: schedule.runs_total,
                runsDone: schedule.runs_done,
                pausedAt: schedule.paused_at,
                active: schedule.active,
                nextRunAt: schedule.next_run_at,
                customEvery: schedule.custom_every,
                customUnit: schedule.custom_unit as CustomUnit | null,
              }
            : null
        }
        inheritedCadence={inheritedCadence}
        // Q48(b): the statute reference from next-intl, keyed by the
        // registry key — the column is still there and still canonical, but
        // nothing reads it for display.
        inheritedLegalRef={duty?.key ? tDuty(`law_${duty.key}` as never) : null}
        questionCount={questionCount ?? 0}
        alreadyOpen={Boolean(openRound)}
        canSend={viewer.role !== 'leser'}
        smsEnabled={await isFlagEnabled('sms_channel', viewer.orgId)}
        /* DECISIONS Q62 — the gate Q9 and D44 both describe, finally performed.
           `entra_sync`, `google_sync` and `hr_sync` were seeded false and read
           by NOTHING; a hard-coded client constant was doing the gating, which
           is not org-scoped and cannot be switched per tenant (D110 instance
           2). Resolved here, on the server, per organisation. */
        syncSources={(
          await Promise.all(
            (Object.entries(SYNC_SOURCE_FLAGS) as [ImportSource, FlagKey][]).map(
              async ([source, flag]) =>
                (await isFlagEnabled(flag, viewer.orgId)) ? source : null,
            ),
          )
        ).filter((s): s is ImportSource => s !== null)}
        /* V2-3b · Q60. The list the import preview badges against. The
           DATABASE refuses these regardless (`M:0060`); this is so the person
           importing can see it before they send, rather than reading a count
           that is going to be quietly smaller. */
        suppressed={(suppressedRows ?? []).map((r) => r.email.toLowerCase())}
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
