import { notFound } from 'next/navigation'
import { readWorkspace } from '@/lib/workspace/current'
import { DEFAULT_VOCABULARY } from '@/lib/workspace/modules'
import { getTranslations } from 'next-intl/server'

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
 * The Builder route (L:322-690).
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
  /* W3 · Q122 — see the sibling pages: the choice is a cookie, so only a
     server render can resolve it, and the fallback is the pre-W3 copy. */
  const vocab = (await readWorkspace(viewer.orgId))?.vocabulary ?? DEFAULT_VOCABULARY
  const tQ = await getTranslations('qtype')
  const supabase = await createClient()

  const { data: survey, error } = await supabase
    .from('surveys')
    .select('id, title, audience_label, status, anonymity, org_id, engage, respondent_kind, k_threshold, policy_locked, template_pack_key, target, run_mode, quiz_time_bonus, quiz_team_board, feedback_mode')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()
  if (error) throw new Error(`builder survey read failed: ${error.message}`)
  // RLS already scopes this to the viewer's org; a miss is a 404 rather than a
  // forbidden page, so the response cannot confirm another org's survey exists.
  if (!survey) notFound()

  /*
    C2 — whether this survey can carry a THREAD at all.

    `get_comment_thread` resolves a token to an invitation; a share link resolves
    to none, because every holder of that link is the same principal. So a survey
    that has only ever gone out by link or QR can collect comments and can never
    deliver a reply, and the Builder says so beside the control rather than
    letting a respondent discover it by waiting.

    Measured as «this survey has at least one invitation», not as «a share link
    exists»: a survey with both can reply to the invited half, so the presence of
    a link is not the question. A survey with no rounds yet is NOT link-only —
    nothing has been decided, and warning about a distribution nobody has chosen
    would be the Builder telling the editor what it will refuse before they have
    asked for anything (D153).
  */
  const { data: invitedRounds } = await supabase
    .from('survey_rounds')
    .select('id, survey_invitations(id)')
    .eq('survey_id', id)
    .limit(50)
  const roundsWithInvitations = (invitedRounds ?? []).filter(
    (r) => ((r.survey_invitations as unknown[]) ?? []).length > 0,
  ).length
  const linkOnly = (invitedRounds ?? []).length > 0 && roundsWithInvitations === 0

  const { data: rows, error: qError } = await supabase
    .from('survey_questions')
    .select('id, type, text, help, required, comment_mode, follow_up_on_low, answer_index, points, config')
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
    answerIndex: q.answer_index,
    points: q.points,
    config: (q.config ?? {}) as QuestionConfig,
  }))

  /* B3 — the bank the picker overlay offers (V2:650-693).
     Read here rather than in the client so the overlay holds no query and no
     service key: `bank_sel` is `org_id is null or app.is_org_member(org_id)`,
     so this returns the shared standard bank plus THIS org's own and nothing
     else, without the page filtering by org itself. Ordered exactly as the
     Library orders it, because the category chips are derived from the order
     each category first appears in. */
  const { data: bankRows, error: bankError } = await supabase
    .from('question_bank')
    .select('id, org_id, text, type, category, sort_order, created_at')
    .order('sort_order')
    .order('created_at', { ascending: false })
  if (bankError) throw new Error(`builder question_bank read failed: ${bankError.message}`)
  const bankUnordered = (bankRows ?? []).map((q) => ({
    id: q.id,
    text: q.text,
    // The bundle shows `TYPE_LABEL[b.type]` (V2:6212), not the enum value. The
    // label is resolved here so the overlay carries no registry and no
    // translator of its own.
    typeLabel: tQ(q.type as 'scale'),
    category: q.category,
    isOwn: q.org_id === survey.org_id,
  }))
  // Own questions first, then the standard bank in its stored order — the same
  // split the Library makes, so the two surfaces cannot disagree about order.
  const bank = [...bankUnordered.filter((r) => r.isOwn), ...bankUnordered.filter((r) => !r.isOwn)]

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
      />
      <Builder
        personDef={vocab.personDef}
        runMode={survey.run_mode}
        feedbackMode={survey.feedback_mode}
        linkOnly={linkOnly}
        packLocks={packLocks}
        bank={bank}
        quizTimeBonus={survey.quiz_time_bonus}
        quizTeamBoard={survey.quiz_team_board}
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
