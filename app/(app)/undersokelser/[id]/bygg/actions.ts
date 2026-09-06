'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireViewer } from '@/lib/auth/session'
import { QUESTION_TYPE_KEYS, specOf } from '@/lib/questions/registry'
import { isNewQuestion } from './types'

export type BuilderResult =
  | { ok: true; ids: Record<string, string> }
  | { ok: false; error: 'forbidden' | 'invalid' | 'locked' | 'failed' }

const QuestionInput = z.object({
  id: z.string().min(1).max(80),
  type: z.enum(QUESTION_TYPE_KEYS as [string, ...string[]]),
  text: z.string().max(500),
  help: z.string().max(500),
  required: z.boolean(),
  commentMode: z.enum(['arv', 'pa', 'av']),
  followUpOnLow: z.boolean(),
  // The per-type shape is documented on the column and enforced by the
  // registry, not here: a config key this version does not know must survive a
  // round trip rather than be stripped by an older deploy.
  config: z.record(z.string(), z.unknown()),
})

/**
 * The engagement settings, validated field by field rather than passed through
 * as opaque jsonb: this object reaches Phase 3's respondent renderer and the
 * invitation mailer, so an unvalidated string here is an unvalidated string
 * there.
 */
const EngagementInput = z.object({
  audience: z.enum(['ansatte', 'kunder']),
  incentive: z.enum(['ingen', 'lotteri', 'alle', 'veldedig']),
  prize: z.string().max(200),
  charity: z.string().max(200),
  comments: z.enum(['ingen', 'lav', 'alle']),
  thank_you: z.string().max(500),
  personal: z.boolean(),
  deadline: z.boolean(),
  show_progress: z.boolean(),
  one_question: z.boolean(),
  reveal_results: z.boolean(),
  follow_up: z.boolean(),
  mobile_first: z.boolean(),
})

const DraftInput = z.object({
  surveyId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  audience: z.string().trim().max(200),
  engage: EngagementInput,
  questions: z.array(QuestionInput).max(200),
})

/**
 * Saves the whole draft in one call.
 *
 * The Builder edits a question set, not one field at a time — a reorder touches
 * every position, and a type change rewrites config. Sending the set means the
 * server never has to reconstruct intent from a stream of patches.
 *
 * Returns the database ids for questions that were created, so the client can
 * swap its temporary `new:` ids without a refetch. Without that, a second save
 * would insert the same question again.
 */
export async function saveDraft(input: unknown): Promise<BuilderResult> {
  const viewer = await requireViewer()
  if (viewer.role === 'leser') return { ok: false, error: 'forbidden' }

  const parsed = DraftInput.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid' }
  const { surveyId, title, audience, engage, questions } = parsed.data

  const supabase = await createClient()

  /**
   * A sent survey's questions are frozen. Rounds snapshot their question set,
   * so editing after sending would leave the live round and the Builder saying
   * different things — and RLS would happily allow it, because can_edit_survey
   * is about who, not about when.
   */
  const { data: survey, error: readError } = await supabase
    .from('surveys')
    .select('status')
    .eq('id', surveyId)
    .single()
  if (readError || !survey) return { ok: false, error: 'forbidden' }
  if (survey.status !== 'utkast') return { ok: false, error: 'locked' }

  const { error: titleError } = await supabase
    .from('surveys')
    .update({ title, audience_label: audience || null, engage: engage as never })
    .eq('id', surveyId)
  if (titleError) {
    console.error(`saveDraft: survey update failed: ${titleError.message}`)
    return { ok: false, error: 'failed' }
  }

  const { data: existing, error: existingError } = await supabase
    .from('survey_questions')
    .select('id')
    .eq('survey_id', surveyId)
  if (existingError) {
    console.error(`saveDraft: existing read failed: ${existingError.message}`)
    return { ok: false, error: 'failed' }
  }

  const keptIds = new Set(questions.filter((q) => !isNewQuestion(q.id)).map((q) => q.id))
  const removed = (existing ?? []).map((r) => r.id).filter((id) => !keptIds.has(id))
  if (removed.length) {
    const { error } = await supabase.from('survey_questions').delete().in('id', removed)
    if (error) {
      console.error(`saveDraft: delete failed: ${error.message}`)
      return { ok: false, error: 'failed' }
    }
  }

  const ids: Record<string, string> = {}

  // Positions are unique per survey (deferrable), so a reorder that swaps two
  // rows is fine inside one statement but not across separate ones. Updates go
  // first to a temporary negative position, then to the real one.
  for (const [i, q] of questions.entries()) {
    if (isNewQuestion(q.id)) continue
    const { error } = await supabase
      .from('survey_questions')
      .update({ position: -(i + 1) })
      .eq('id', q.id)
      .eq('survey_id', surveyId)
    if (error) {
      console.error(`saveDraft: reposition failed: ${error.message}`)
      return { ok: false, error: 'failed' }
    }
  }

  for (const [i, q] of questions.entries()) {
    const row = {
      survey_id: surveyId,
      position: i,
      type: q.type as never,
      text: q.text,
      help: q.help || null,
      required: q.required,
      comment_mode: q.commentMode as never,
      follow_up_on_low: q.followUpOnLow,
      config: q.config as never,
    }

    if (isNewQuestion(q.id)) {
      const { data, error } = await supabase
        .from('survey_questions')
        .insert(row)
        .select('id')
        .single()
      if (error || !data) {
        console.error(`saveDraft: insert failed: ${error?.message}`)
        return { ok: false, error: 'failed' }
      }
      ids[q.id] = data.id
    } else {
      const { error } = await supabase
        .from('survey_questions')
        .update(row)
        .eq('id', q.id)
        .eq('survey_id', surveyId)
      if (error) {
        console.error(`saveDraft: update failed: ${error.message}`)
        return { ok: false, error: 'failed' }
      }
    }
  }

  /**
   * logic_rules mirrors the follow-up-on-low flags.
   *
   * Phase 2's scope says the toggle "writes logic_rules", and Phase 3's
   * respondent flow reads that table rather than the question column — a
   * follow-up prompt is a rule about the survey, not a property of one
   * question's rendering. Keeping the flag as the only record would leave the
   * respondent flow with nothing to read.
   *
   * Rewritten wholesale for this survey and kind, because the set is derived:
   * reconciling row by row would mean tracking which rule belongs to which
   * question through a reorder, and the derivation already knows the answer.
   */
  const numericFollowUps = questions
    .filter((q) => q.followUpOnLow && specOf(q.type as never).numeric)
    .map((q) => (isNewQuestion(q.id) ? ids[q.id] : q.id))
    .filter((id): id is string => Boolean(id))

  const { error: clearError } = await supabase
    .from('logic_rules')
    .delete()
    .eq('survey_id', surveyId)
    .eq('kind', 'low_score_follow_up')
  if (clearError) {
    console.error(`saveDraft: logic_rules clear failed: ${clearError.message}`)
    return { ok: false, error: 'failed' }
  }
  if (numericFollowUps.length) {
    const { error: logicError } = await supabase.from('logic_rules').insert(
      numericFollowUps.map((questionId) => ({
        survey_id: surveyId,
        kind: 'low_score_follow_up',
        // The threshold is the design's own: a follow-up fires at or below 2
        // on the question's scale (HeiTuva.dc.html's low-score prompt).
        config: { question_id: questionId, threshold: 2 } as never,
      })),
    )
    if (logicError) {
      console.error(`saveDraft: logic_rules insert failed: ${logicError.message}`)
      return { ok: false, error: 'failed' }
    }
  }

  revalidatePath(`/undersokelser/${surveyId}/bygg`)
  revalidatePath('/undersokelser')
  return { ok: true, ids }
}

const BankInput = z.object({
  text: z.string().trim().min(1).max(500),
  type: z.enum(QUESTION_TYPE_KEYS as [string, ...string[]]),
  category: z.string().trim().max(80),
  config: z.record(z.string(), z.unknown()),
})

/** "Lagre i banken" — copy one question into the org's own question bank. */
export async function saveQuestionToBank(input: unknown): Promise<BuilderResult> {
  const viewer = await requireViewer()
  if (viewer.role === 'leser') return { ok: false, error: 'forbidden' }

  const parsed = BankInput.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid' }

  const supabase = await createClient()
  const { error } = await supabase.from('question_bank').insert({
    org_id: viewer.orgId,
    text: parsed.data.text,
    type: parsed.data.type as never,
    category: parsed.data.category || 'Annet',
    config: parsed.data.config as never,
    author_member_id: viewer.memberId,
  })
  if (error) {
    console.error(`saveQuestionToBank: insert failed: ${error.message}`)
    return { ok: false, error: 'failed' }
  }

  revalidatePath('/bibliotek')
  return { ok: true, ids: {} }
}

const TemplateInput = z.object({
  surveyId: z.string().uuid(),
  category: z.enum(['Ansatte', 'Kunder', 'Lovpålagt', 'Annet']),
})

/**
 * "Lagre som mal" — the Builder's third action, and the only path that creates
 * a row in Firmaets maler.
 *
 * Bibliotek could already flip a company template private and delete one, but
 * nothing created one, so that whole section of the library was unreachable.
 *
 * The pack stores a snapshot of the questions rather than referencing them: a
 * template is a starting point, and a later edit to this survey must not
 * silently rewrite a template someone else is about to use — the same reasoning
 * that makes `createSurveyFromPack` copy rather than link.
 */
export async function saveSurveyAsTemplate(input: unknown): Promise<BuilderResult> {
  const viewer = await requireViewer()
  if (viewer.role === 'leser') return { ok: false, error: 'forbidden' }

  const parsed = TemplateInput.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid' }
  const { surveyId, category } = parsed.data

  const supabase = await createClient()
  const { data: survey, error: readError } = await supabase
    .from('surveys')
    .select('title, audience_label')
    .eq('id', surveyId)
    .single()
  if (readError || !survey) return { ok: false, error: 'forbidden' }

  const { data: questions, error: qError } = await supabase
    .from('survey_questions')
    .select('type, text, help, required, config')
    .eq('survey_id', surveyId)
    .order('position')
  if (qError) {
    console.error(`saveSurveyAsTemplate: questions read failed: ${qError.message}`)
    return { ok: false, error: 'failed' }
  }

  const config = (q: (typeof questions)[number]) => (q.config ?? {}) as Record<string, unknown>

  const { data: pack, error } = await supabase
    .from('template_packs')
    .insert({
      org_id: viewer.orgId,
      // `unique nulls not distinct (org_id, key)` means the key only has to be
      // unique within this organisation, but a second "Lagre som mal" on the
      // same survey must not collide with the first.
      key: `${surveyId}-${Date.now()}`,
      category,
      title: survey.title,
      audience: survey.audience_label,
      questions: (questions ?? []).map((q) => ({
        text: q.text,
        type: q.type,
        help: q.help ?? undefined,
        required: q.required,
        ...config(q),
      })) as never,
      // Shared with the company, as the design saves it
      // (HeiTuva.dc.html:3825 sets `private:false`) — the section is called
      // "Firmaets maler" and the card's own toggle is what makes one private.
      // Both states stay inside the org either way; RLS scopes the row to it.
      private: false,
      author_member_id: viewer.memberId,
    })
    .select('id')
    .single()
  if (error || !pack) {
    console.error(`saveSurveyAsTemplate: insert failed: ${error?.message}`)
    return { ok: false, error: 'failed' }
  }

  revalidatePath('/bibliotek')
  return { ok: true, ids: { template: pack.id } }
}

/**
 * Q17 — set the survey's display threshold and respondent type.
 *
 * Administrator-only: the threshold is a personvern decision, so it does not
 * sit with the redaktør who may otherwise edit the survey. The database is the
 * real enforcement — `app.guard_survey_policy` refuses a non-administrator,
 * refuses any change once the policy is locked (sent, or set by a statutory
 * pack), and writes the audit row — so this action surfaces those refusals to
 * the UI rather than re-implementing them. The "Hvem svarer og hva vises" panel
 * is this action's caller and, per Q36, its only one.
 */
const PolicyInput = z.object({
  surveyId: z.string().uuid(),
  // 3-10 per DECISIONS Q36, matching `organizations.default_k_threshold` and the
  // panel's top chip. The 50 this replaces predated Q17 and was never a decided
  // ceiling. The real enforcement is the CHECK on the column (migration 0036) —
  // this bound exists so the panel gets `invalid` back instead of a database
  // error it would have to translate.
  kThreshold: z.number().int().min(3).max(10),
  respondentKind: z.enum(['person', 'organisation']),
})

export type PolicyResult =
  | { ok: true }
  | { ok: false; error: 'forbidden' | 'invalid' | 'locked' | 'failed' }

export async function setSurveyPolicy(input: unknown): Promise<PolicyResult> {
  const viewer = await requireViewer()
  if (viewer.role !== 'administrator') return { ok: false, error: 'forbidden' }

  const parsed = PolicyInput.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid' }
  const { surveyId, kThreshold, respondentKind } = parsed.data

  const supabase = await createClient()
  const { error } = await supabase
    .from('surveys')
    .update({ k_threshold: kThreshold, respondent_kind: respondentKind })
    .eq('id', surveyId)
    .eq('org_id', viewer.orgId)
  if (error) {
    // The guard raises 'policy_locked' / 'threshold_admin_only'; a locked or
    // pack-governed survey is the common, expected refusal.
    if (/policy_locked|statutory|pack/i.test(error.message)) return { ok: false, error: 'locked' }
    if (/admin/i.test(error.message)) return { ok: false, error: 'forbidden' }
    console.error(`setSurveyPolicy failed: ${error.message}`)
    return { ok: false, error: 'failed' }
  }

  revalidatePath(`/undersokelser/${surveyId}/bygg`)
  return { ok: true }
}
