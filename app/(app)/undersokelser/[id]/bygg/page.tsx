import { notFound } from 'next/navigation'

/** Canonical UUID shape; anything else cannot name a survey. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
import { createClient } from '@/lib/supabase/server'
import { requireViewer } from '@/lib/auth/session'
import type { QualityRule } from '@/lib/questions/quality'
import { parseEngagement } from '@/lib/engagement'
import { readScheduleChip } from '@/lib/schedules/read'
import { SurveyContextBar } from '../SurveyContextBar'
import { Builder } from './Builder'
import type { BuilderDraft, DraftQuestion, QuestionConfig } from './types'

/**
 * The Builder route (HeiTuva.dc.html:322-690).
 *
 * Everything that decides how a question renders comes from the registry in
 * lib/questions, and the quality rules come from the `quality_rules` table, so
 * this page only loads rows and hands them over.
 */
export default async function BuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  // A malformed id is a bad URL, not a server fault. Without this the string
  // reaches Postgres, the uuid cast raises, the read throws and the route
  // answers 500 — telling a crawler or a mistyped link that something broke
  // here rather than that the address is wrong.
  if (!UUID.test(id)) notFound()
  const viewer = await requireViewer()
  const supabase = await createClient()

  const { data: survey, error } = await supabase
    .from('surveys')
    .select('id, title, audience_label, status, anonymity, org_id, engage, respondent_kind, k_threshold, policy_locked, template_pack_key, target, run_mode')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()
  if (error) throw new Error(`builder survey read failed: ${error.message}`)
  // RLS already scopes this to the viewer's org; a miss is a 404 rather than a
  // forbidden page, so the response cannot confirm another org's survey exists.
  if (!survey) notFound()

  const { data: rows, error: qError } = await supabase
    .from('survey_questions')
    .select('id, type, text, help, required, comment_mode, follow_up_on_low, config')
    .eq('survey_id', id)
    .order('position')
  if (qError) throw new Error(`builder questions read failed: ${qError.message}`)

  const questions: DraftQuestion[] = (rows ?? []).map((q) => ({
    id: q.id,
    type: q.type,
    text: q.text,
    help: q.help ?? '',
    required: q.required,
    commentMode: q.comment_mode,
    followUpOnLow: q.follow_up_on_low,
    config: (q.config ?? {}) as QuestionConfig,
  }))

  const { data: ruleRows, error: ruleError } = await supabase
    .from('quality_rules')
    .select('key, pattern, rule, message')
    .eq('lang', viewer.locale)
  if (ruleError) throw new Error(`quality_rules read failed: ${ruleError.message}`)

  // The heuristics are Norwegian-specific and only seeded for `no`. An English
  // session gets no flags rather than Norwegian ones shown to an English
  // reader; adding a language is a seed, not a code change.
  const rules: QualityRule[] = (ruleRows ?? []).map((r) => ({
    key: r.key,
    pattern: r.pattern,
    rule: r.rule,
    message: r.message,
  }))

  // The pack that governs the policy, when one does. `guard_survey_policy`
  // (M:0034:93-99) refuses a policy change for a global pack whose own policy
  // is `locked`; the panel needs the pack's legal reference to say WHICH law,
  // so it reads the same row the guard tests.
  const { data: pack } = survey.template_pack_key
    ? await supabase
        .from('template_packs')
        .select('legal_ref, policy')
        .eq('key', survey.template_pack_key)
        .is('org_id', null)
        .maybeSingle()
    : { data: null }
  const packLocks = Boolean((pack?.policy as { locked?: boolean } | null)?.locked)

  const draft: BuilderDraft = {
    title: survey.title,
    audience: survey.audience_label ?? '',
    // Every field falls back to its column default rather than to undefined —
    // a missing key must not render a switch as off and then save it off.
    engage: parseEngagement(survey.engage),
    questions,
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
        current="bygg"
      />
      <Builder
        runMode={survey.run_mode}
        surveyId={survey.id}
        initial={draft}
        rules={rules}
        anonymous={survey.anonymity === 'anonymous'}
        canEdit={viewer.role !== 'leser'}
        // A sent survey's questions are frozen: rounds snapshot their question
        // set, so editing after sending would leave the live round and the
        // Builder disagreeing.
        locked={survey.status !== 'utkast'}
        policy={{
          respondentKind: survey.respondent_kind === 'organisation' ? 'organisation' : 'person',
          anonymity: survey.anonymity,
          kThreshold: survey.k_threshold,
          // `surveys.target` is the recipient count the panel's first warning
          // needs. Nothing writes it yet — recipients are chosen on the Send
          // screen — so it is null for every real survey and the warning stays
          // silent rather than firing on an invented number (D94).
          target: survey.target ?? 0,
          // Either lock stops a policy change, and the guard raises the same
          // error for both; the pack's legal reference is what distinguishes
          // the two sentences the panel shows.
          locked: survey.policy_locked || packLocks || survey.status !== 'utkast',
          lockedByPackLegal: packLocks ? (pack?.legal_ref ?? null) : null,
          canEdit: viewer.role === 'administrator',
        }}
      />
    </>
  )
}
