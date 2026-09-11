'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireViewer } from '@/lib/auth/session'
import { TASK_STEPS } from '@/lib/tasks/lifecycle'

/**
 * V2-4 — advancing a task, and recording an effect assessment.
 *
 * ── THE REFUSAL MUST REACH THE USER, WHICH IS GATE 4's OWN QUESTION ─────────
 *
 * The plan's test 2: closing without an assessment «→ refused, and the error
 * SURFACES to the user rather than being swallowed». So the named exceptions
 * from `app.guard_task_close` are mapped to their own results here rather than
 * collapsed into `save_failed` — V2-3a's defect 5 was exactly that collapse one
 * screen over, and it is the mistake this action is written to avoid repeating.
 */
export type TaskError =
  | 'forbidden'
  | 'invalid'
  | 'needs_effect_assessment'
  | 'step_skipped'
  | 'step_backwards'
  | 'save_failed'

export type TaskResult = { ok: true } | { ok: false; error: TaskError }

/** Message key per refusal, so every one of them has copy and none can be added
 *  without noticing that it does not. */
export const TASK_ERROR_KEY: Record<TaskError, string> = {
  forbidden: 'taskErrForbidden',
  invalid: 'taskErrInvalid',
  needs_effect_assessment: 'taskErrNeedsEffect',
  step_skipped: 'taskErrStepSkipped',
  step_backwards: 'taskErrStepBackwards',
  save_failed: 'taskErrSaveFailed',
}

const fromDatabase = (message: string): TaskError => {
  if (/task_close_needs_effect_assessment/.test(message)) return 'needs_effect_assessment'
  if (/task_step_skipped/.test(message)) return 'step_skipped'
  if (/task_step_backwards/.test(message)) return 'step_backwards'
  return 'save_failed'
}

const Advance = z.object({
  id: z.string().uuid(),
  to: z.enum(TASK_STEPS),
})

export async function advanceTask(input: unknown): Promise<TaskResult> {
  const viewer = await requireViewer()
  // The database refuses a leser through `tasks_upd`, and RLS FILTERS rather
  // than errors — so without this the caller would see «saved» and nothing
  // would have moved. The same reasoning `AdminResult.forbidden` carries.
  if (viewer.role === 'leser') return { ok: false, error: 'forbidden' }

  const parsed = Advance.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('tasks')
    .update({ status: parsed.data.to })
    .eq('id', parsed.data.id)
    .eq('org_id', viewer.orgId)
  if (error) return { ok: false, error: fromDatabase(error.message) }

  revalidatePath('/oppgaver')
  revalidatePath('/oversikt')
  return { ok: true }
}

const Assess = z.object({
  id: z.string().uuid(),
  note: z.string().trim().max(400).optional(),
})

/**
 * Recording that the effect was assessed. Deliberately NOT part of advancing:
 * the assessment is the evidence a duty was discharged, and a single button
 * that both records it and closes the task would let a click stand in for the
 * assessment. V2:5203 says «Vurder effekten før du lukker oppgaven», and two
 * actions is what that sentence describes.
 */
export async function assessTaskEffect(input: unknown): Promise<TaskResult> {
  const viewer = await requireViewer()
  if (viewer.role === 'leser') return { ok: false, error: 'forbidden' }

  const parsed = Assess.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid' }

  const supabase = await createClient()
  const { data: member } = await supabase
    .from('org_members')
    .select('id')
    .eq('org_id', viewer.orgId)
    .eq('user_id', viewer.userId)
    .maybeSingle()

  const { error } = await supabase.from('task_effect_assessments').insert({
    task_id: parsed.data.id,
    assessed_by: member?.id ?? null,
    note: parsed.data.note || null,
  })
  if (error) return { ok: false, error: fromDatabase(error.message) }

  revalidatePath('/oppgaver')
  return { ok: true }
}

const Correction = z.object({
  correctsTaskId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
})

/**
 * Q97's remedy, and the reason it is built rather than only described.
 *
 * `lukket` is terminal, so the close confirmation tells the operator that an
 * error is corrected by a new task referencing the closed one. **A screen
 * promising a remedy the schema cannot express is the defect this phase has
 * already hit twice** — Teams, and the weekly digest — so the reference is a
 * real column with a composite key behind it (`M:0066`), not a sentence.
 *
 * The new task inherits KIND and LAW_REF from the one it corrects, because a
 * correction of a statutory duty is the same duty: making the operator retype
 * the hjemmel is how a correction ends up filed under the wrong law.
 */
export async function createCorrectingTask(input: unknown): Promise<TaskResult> {
  const viewer = await requireViewer()
  if (viewer.role === 'leser') return { ok: false, error: 'forbidden' }

  const parsed = Correction.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid' }

  const supabase = await createClient()
  const { data: old } = await supabase
    .from('tasks')
    .select('kind, law_ref, owner_member_id, org_id')
    .eq('id', parsed.data.correctsTaskId)
    .eq('org_id', viewer.orgId)
    .maybeSingle()
  if (!old) return { ok: false, error: 'invalid' }

  const { error } = await supabase.from('tasks').insert({
    org_id: viewer.orgId,
    title: parsed.data.title,
    kind: old.kind,
    law_ref: old.law_ref,
    owner_member_id: old.owner_member_id,
    corrects_task_id: parsed.data.correctsTaskId,
  })
  if (error) return { ok: false, error: fromDatabase(error.message) }

  revalidatePath('/oppgaver')
  return { ok: true }
}

/**
 * C4 — the writer for `survey_comments.handled_at`.
 *
 * Through `set_comment_handled` (M:0101) rather than a table update, because
 * `survey_comments` has NO update policy: «nobody may change this content» is a
 * property of the schema, and widening it to reach one bookkeeping column would
 * open `body` with it.
 *
 * The function refuses a comment in another organisation with the same answer it
 * gives for one that does not exist, so nothing here needs to distinguish them
 * either — and must not, or the refusal would enumerate ids.
 */
const CommentHandledInput = z.object({
  commentId: z.string().uuid(),
  handled: z.boolean(),
})

export async function setCommentHandled(
  input: unknown,
): Promise<{ ok: true } | { ok: false; error: 'forbidden' | 'invalid' | 'failed' }> {
  const viewer = await requireViewer()
  if (viewer.role === 'leser') return { ok: false, error: 'forbidden' }

  const parsed = CommentHandledInput.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid' }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('set_comment_handled', {
    p_comment: parsed.data.commentId,
    p_handled: parsed.data.handled,
  })
  if (error) {
    console.error(`set_comment_handled failed: ${error.code ?? 'unknown'}`)
    return { ok: false, error: 'failed' }
  }
  if ((data as { error?: string } | null)?.error) return { ok: false, error: 'failed' }

  revalidatePath('/oppgaver')
  return { ok: true }
}

/**
 * C5 — the manager's reply.
 *
 * Through `reply_to_comment` (M:0102) rather than a direct insert. The insert
 * POLICY already admits an administrator or redaktør, so a table write would
 * work; the function exists for the column the policy cannot fill —
 * `author_member_id` is the caller's member id, and a client that supplies its
 * own is supplying a claim.
 *
 * It also marks the comment handled, because replying IS handling it. Two
 * controls meaning one thing is how a queue fills with rows that were answered
 * and still look untouched.
 */
const ReplyInput = z.object({
  commentId: z.string().uuid(),
  body: z.string().trim().min(1).max(4000),
})

export async function replyToComment(
  input: unknown,
): Promise<{ ok: true } | { ok: false; error: 'forbidden' | 'invalid' | 'failed' }> {
  const viewer = await requireViewer()
  if (viewer.role === 'leser') return { ok: false, error: 'forbidden' }

  const parsed = ReplyInput.safeParse(input)
  // The body is respondent-adjacent free text and never reaches a log, here or
  // on the failure branch below (invariant 7).
  if (!parsed.success) return { ok: false, error: 'invalid' }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('reply_to_comment', {
    p_comment: parsed.data.commentId,
    p_body: parsed.data.body,
  })
  if (error) {
    console.error(`reply_to_comment failed: ${error.code ?? 'unknown'}`)
    return { ok: false, error: 'failed' }
  }
  if ((data as { error?: string } | null)?.error) return { ok: false, error: 'failed' }

  revalidatePath('/oppgaver')
  return { ok: true }
}
