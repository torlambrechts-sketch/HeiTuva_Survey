'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireViewer } from '@/lib/auth/session'
import { QUESTION_TYPE_KEYS } from '@/lib/questions/registry'
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

const DraftInput = z.object({
  surveyId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  audience: z.string().trim().max(200),
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
  const { surveyId, title, audience, questions } = parsed.data

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
    .update({ title, audience_label: audience || null })
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
