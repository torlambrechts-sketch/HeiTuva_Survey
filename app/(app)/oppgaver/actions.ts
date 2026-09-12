'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireViewer } from '@/lib/auth/session'
import { WORKLIST_COOKIE, WORKLIST_VIEWS } from '@/lib/worklist/view'
import { TASK_STEPS, nextStep, type TaskStatus } from '@/lib/tasks/lifecycle'

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

/* ═══════════════════════════════════════════════════════════════════════════
   V5-2 — the Arbeidsliste's writers.

   v5 replaces C4's two panels with ONE list over tasks and comments together,
   and it draws four controls C4 had no writer for: a note on any row, a new
   task, per-row assignment and deadline, and a bulk bar. Each one is an action
   here; none of them is a table write the screen does after the fact.
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * «Interne notater» (v5:3324-3348) — the writer M:0113's table comment names.
 *
 * One action for both halves of the list, because a note is one concept: the
 * subject is whichever of the two ids arrives, and the database's
 * `worklist_notes_one_subject` refuses both or neither rather than this
 * function deciding it twice.
 *
 * The body is team-written and may well discuss a respondent's comment, so it
 * never reaches a log — the same rule as `replyToComment`, for the same reason.
 */
const NoteInput = z
  .object({
    taskId: z.string().uuid().optional(),
    commentId: z.string().uuid().optional(),
    body: z.string().trim().min(1).max(2000),
  })
  .refine((v) => (v.taskId === undefined) !== (v.commentId === undefined), {
    // The same exclusive-or the CHECK holds. Stated here so a malformed call is
    // `invalid` rather than a database error the user reads as a save failure.
    message: 'exactly one subject',
  })

export async function addWorklistNote(input: unknown): Promise<TaskResult> {
  const viewer = await requireViewer()
  if (viewer.role === 'leser') return { ok: false, error: 'forbidden' }

  const parsed = NoteInput.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid' }

  const supabase = await createClient()
  const { data: member } = await supabase
    .from('org_members')
    .select('id')
    .eq('org_id', viewer.orgId)
    .eq('user_id', viewer.userId)
    .maybeSingle()

  const { error } = await supabase.from('worklist_notes').insert({
    task_id: parsed.data.taskId ?? null,
    comment_id: parsed.data.commentId ?? null,
    body: parsed.data.body,
    author_member_id: member?.id ?? null,
  })
  if (error) {
    // The note's own text is not in the message we keep, but the message could
    // quote a constraint's failing row, so only the code is logged.
    console.error(`worklist note insert failed: ${error.code ?? 'unknown'}`)
    return { ok: false, error: 'save_failed' }
  }

  revalidatePath('/oppgaver')
  return { ok: true }
}

/**
 * «Ny oppgave» (v5:3195-3216).
 *
 * The bundle's form has five controls; four of them land in a column and the
 * fifth does not. `ntSource` offers «Uten kobling til undersøkelse» or a survey
 * TITLE, and a title is not a key — the option value carries the survey's id
 * here, because `tasks.source_ref` is a real FK to `public.surveys` and a task
 * cannot reference another organisation's row even by mistake (M:0062's own
 * comment).
 *
 * `law_ref` is NOT in this form, and that is Q70 rather than an omission: the
 * hjemmel references `duty_definitions`, and a manually created tiltak has none
 * until a duty is what produced it. Letting an operator pick a paragraph from a
 * dropdown is how a task ends up filed under a law it has nothing to do with.
 */
const NewTask = z.object({
  title: z.string().trim().min(1).max(200),
  kind: z.string().trim().min(1).max(60),
  ownerMemberId: z.string().uuid().nullable().optional(),
  dueAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  surveyId: z.string().uuid().nullable().optional(),
})

export async function createWorklistTask(input: unknown): Promise<TaskResult> {
  const viewer = await requireViewer()
  if (viewer.role === 'leser') return { ok: false, error: 'forbidden' }

  const parsed = NewTask.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid' }

  const supabase = await createClient()
  const surveyId = parsed.data.surveyId ?? null
  const { error } = await supabase.from('tasks').insert({
    org_id: viewer.orgId,
    title: parsed.data.title,
    kind: parsed.data.kind,
    // `tasks_source_ref_needs_kind`: the two move together or the row is
    // refused, so they are derived from one value rather than passed in two.
    source_kind: surveyId ? 'survey' : 'manuell',
    source_ref: surveyId,
    owner_member_id: parsed.data.ownerMemberId ?? null,
    due_at: parsed.data.dueAt ?? null,
  })
  if (error) return { ok: false, error: fromDatabase(error.message) }

  revalidatePath('/oppgaver')
  revalidatePath('/oversikt')
  return { ok: true }
}

/**
 * Per-row assignment and deadline (v5:3285-3295).
 *
 * `app.guard_task_close` fires only on a status change — «anything that is not
 * a status change passes through» in its own words — so these are plain
 * updates and the guard is not in their way.
 */
const Assign = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200),
  ownerMemberId: z.string().uuid().nullable(),
})

export async function assignTasks(input: unknown): Promise<TaskResult> {
  const viewer = await requireViewer()
  if (viewer.role === 'leser') return { ok: false, error: 'forbidden' }

  const parsed = Assign.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('tasks')
    .update({ owner_member_id: parsed.data.ownerMemberId })
    .in('id', parsed.data.ids)
    .eq('org_id', viewer.orgId)
  if (error) return { ok: false, error: fromDatabase(error.message) }

  revalidatePath('/oppgaver')
  return { ok: true }
}

const SetDue = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200),
  dueAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
})

export async function setTaskDue(input: unknown): Promise<TaskResult> {
  const viewer = await requireViewer()
  if (viewer.role === 'leser') return { ok: false, error: 'forbidden' }

  const parsed = SetDue.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('tasks')
    .update({ due_at: parsed.data.dueAt })
    .in('id', parsed.data.ids)
    .eq('org_id', viewer.orgId)
  if (error) return { ok: false, error: fromDatabase(error.message) }

  revalidatePath('/oppgaver')
  return { ok: true }
}

/**
 * «Flytt ett steg» (v5:3230) — the bulk bar's one lifecycle action, and the
 * only one of the bundle's three that survives.
 *
 * ── WHY IT REFUSES THE STEP INTO `lukket`, WHICH IS NOT WHAT THE BUNDLE DRAWS
 *
 * Tor's decision on «Lukk valgte» was that a bulk button closing a selection is
 * Q69's rule — a task cannot close before its effect is assessed, under aml.
 * § 3-1 and ldl. § 26 fjerde ledd — bypassed for n rows at once, and worse than
 * bypassing it once because it makes the bypass the fast path. That button is
 * not built.
 *
 * **The same reasoning applies one step down and it is the thing I would
 * otherwise have got wrong.** A task sitting at `effektvurdert` has its
 * assessment, so the database WOULD allow «Flytt ett steg» to close it — and
 * closing would then have happened in bulk, without Q97's terminal-state
 * confirmation, through the button that was kept. So this action advances every
 * selected task by one step EXCEPT into `lukket`, and reports how many it left
 * alone. Closing stays per task, with its confirmation and its assessment.
 *
 * ── PARTIAL FAILURE IS REPORTED, NOT SWALLOWED ─────────────────────────────
 *
 * The rows in a selection are at different steps, and `app.guard_task_close`
 * refuses `gjennomfort -> effektvurdert` without an assessment row. So this
 * cannot be one UPDATE: it is one per task, and the result says how many moved,
 * how many need an assessment first, and how many were at the end already.
 * A catch-all counting them as «done» is the shape CLAUDE.md's catch-all rule
 * is about — the class that lands inside is the one the operator needed to
 * know.
 */
export type BulkAdvanceResult =
  | { ok: true; moved: number; needsAssessment: number; atClose: number; failed: number }
  | { ok: false; error: TaskError }

const BulkAdvance = z.object({ ids: z.array(z.string().uuid()).min(1).max(200) })

export async function advanceTasks(input: unknown): Promise<BulkAdvanceResult> {
  const viewer = await requireViewer()
  if (viewer.role === 'leser') return { ok: false, error: 'forbidden' }

  const parsed = BulkAdvance.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid' }

  const supabase = await createClient()
  const { data: rows, error: readError } = await supabase
    .from('tasks')
    .select('id, status')
    .in('id', parsed.data.ids)
    .eq('org_id', viewer.orgId)
  if (readError) return { ok: false, error: 'save_failed' }

  let moved = 0
  let needsAssessment = 0
  let atClose = 0
  let failed = 0

  for (const row of rows ?? []) {
    const to = nextStep(row.status as TaskStatus)
    if (to === null || to === 'lukket') {
      atClose += 1
      continue
    }
    const { error } = await supabase
      .from('tasks')
      .update({ status: to })
      .eq('id', row.id)
      .eq('org_id', viewer.orgId)
    if (!error) moved += 1
    else if (fromDatabase(error.message) === 'needs_effect_assessment') needsAssessment += 1
    else failed += 1
  }

  revalidatePath('/oppgaver')
  revalidatePath('/oversikt')
  return { ok: true, moved, needsAssessment, atClose, failed }
}

/**
 * The view mode (v5:3183-3188), per person.
 *
 * Q152: a cookie plus a column, the mechanism Q122 settled for the workspace —
 * the per-person choice in the cookie, the organisation's default in
 * `organizations.worklist_view`. The cookie is written HERE because the screen
 * is a server component and cannot set one during render.
 *
 * No database write: choosing «Tavle» for yourself is not a change to the
 * organisation's default, and the two are stored apart precisely so that one
 * person's preference cannot become everybody's.
 */
const ViewInput = z.object({ view: z.enum(WORKLIST_VIEWS) })

export async function setWorklistView(input: unknown): Promise<{ ok: boolean }> {
  await requireViewer()
  const parsed = ViewInput.safeParse(input)
  if (!parsed.success) return { ok: false }

  const store = await cookies()
  store.set(WORKLIST_COOKIE, parsed.data.view, {
    path: '/',
    sameSite: 'lax',
    httpOnly: false,
    maxAge: 60 * 60 * 24 * 365,
  })
  revalidatePath('/oppgaver')
  return { ok: true }
}
