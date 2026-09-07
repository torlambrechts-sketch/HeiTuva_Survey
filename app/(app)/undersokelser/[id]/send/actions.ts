'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireViewer } from '@/lib/auth/session'
import { audit } from '@/lib/auth/audit'
import { ANONYMITY_MODES, CADENCES, CHANNELS, CUSTOM_UNITS } from '@/lib/send/registry'

/**
 * Sending is one RPC call (migration 0008), not a sequence of writes from here.
 *
 * Everything the action does is validate, delegate, and translate the RPC's
 * refusals into something the screen can say. The reason the whole thing lives
 * in Postgres is that a send touches five tables and mints one secret per
 * recipient: half a send is worse than none, and the raw tokens must never come
 * back up the wire.
 */

const Recipient = z.object({
  email: z.string().trim().toLowerCase().email().max(320).optional(),
  // Loosely shaped here; `app.normalize_phone` in the RPC is what decides
  // whether it is a number, and a recipient it cannot read is skipped there.
  phone: z.string().trim().min(8).max(20).optional(),
  name: z.string().trim().max(200).optional(),
  lang: z.enum(['no', 'en', 'sv', 'da']).optional(),
}).refine((r) => Boolean(r.email || r.phone), { message: 'unreachable' })

const SendInput = z.object({
  surveyId: z.string().uuid(),
  channels: z.array(z.enum(CHANNELS)).min(1),
  recipients: z.array(Recipient).max(5000),
  groupIds: z.array(z.string().uuid()).max(200),
  anonymity: z.enum(ANONYMITY_MODES),
  cadence: z.enum(CADENCES),
  /**
   * Q20's custom settings. Bounded here to the same ranges as
   * `schedules_custom_shape` (M:0044) — not as a second opinion but so the
   * action answers `invalid` instead of handing the caller a constraint
   * violation it would have to translate. The CHECK is the enforcement.
   */
  customEvery: z.number().int().min(1).max(52).optional(),
  customUnit: z.enum(CUSTOM_UNITS).optional(),
  customWeekday: z.number().int().min(1).max(5).optional(),
  sendAtLocal: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  runs: z.number().int().min(0).max(52),
  reminderDays: z.union([z.literal(0), z.literal(2), z.literal(5)]),
  rotate: z.boolean(),
  /** Days until the round stops accepting answers; 0 means it stays open. */
  closesInDays: z.number().int().min(0).max(365),
})

export type SendResult =
  | { ok: true; roundId: string; invited: number; shareToken: string | null }
  | {
      ok: false
      error:
        | 'invalid'
        | 'forbidden'
        | 'not_found'
        | 'no_questions'
        | 'no_recipients'
        | 'sms_not_enabled'
        | 'failed'
    }

export async function sendSurvey(input: unknown): Promise<SendResult> {
  const viewer = await requireViewer()
  if (viewer.role === 'leser') return { ok: false, error: 'forbidden' }

  const parsed = SendInput.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid' }
  const v = parsed.data

  // A send with no way to reach anybody is a mistake, not a state to record:
  // the round would open, count nobody, and look like it worked.
  const reachesSomeone =
    v.recipients.length > 0 || v.groupIds.length > 0 || v.channels.some((c) => c === 'link' || c === 'qr')
  if (!reachesSomeone) return { ok: false, error: 'no_recipients' }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('send_round', {
    p_survey: v.surveyId,
    p_channels: v.channels,
    p_recipients: v.recipients as never,
    p_group_ids: v.groupIds,
    p_anonymity: v.anonymity,
    p_cadence: v.cadence,
    // All three or none: the CHECK refuses a partial set, so a cadence that is
    // not `custom` must not carry settings that would become live if someone
    // later switched it.
    ...(v.cadence === 'custom'
      ? {
          p_custom_every: v.customEvery ?? 1,
          p_custom_unit: v.customUnit ?? 'weeks',
          p_custom_weekday: v.customWeekday ?? 1,
          p_send_at_local: v.sendAtLocal ?? '09:00',
        }
      : {}),
    p_runs: v.runs,
    p_reminder_days: v.reminderDays,
    p_rotate: v.rotate,
    // Omitted rather than null: the RPC's own default is NULL (stays open),
    // and PostgREST types an optional argument as `string | undefined`.
    ...(v.closesInDays > 0
      ? { p_closes_at: new Date(Date.now() + v.closesInDays * 86_400_000).toISOString() }
      : {}),
    p_test_only: false,
  })

  if (error) {
    // Only the code: the message can quote the statement, and the statement
    // carries recipient addresses.
    console.error(`send_round failed: ${error.code ?? 'unknown'}`)
    return { ok: false, error: 'failed' }
  }

  const result = (data ?? {}) as {
    ok?: boolean
    error?: string
    round_id?: string
    invited?: number
    share_token?: string | null
  }
  if (result.error === 'forbidden') return { ok: false, error: 'forbidden' }
  if (result.error === 'not_found') return { ok: false, error: 'not_found' }
  if (result.error === 'no_questions') return { ok: false, error: 'no_questions' }
  if (result.error === 'sms_not_enabled') return { ok: false, error: 'sms_not_enabled' }
  if (!result.ok) return { ok: false, error: 'failed' }

  revalidatePath('/undersokelser')
  revalidatePath(`/undersokelser/${v.surveyId}/send`)
  return {
    ok: true,
    roundId: result.round_id!,
    invited: result.invited ?? 0,
    shareToken: result.share_token ?? null,
  }
}

/**
 * "Send test til meg selv" — a real send, to one address, on its own round.
 *
 * Deliberately not a preview: the only way to know the invitation renders, the
 * link resolves and the provider accepts the address is to put one through the
 * same pipeline the recipients will go through.
 */
export async function sendTestToSelf(surveyId: unknown): Promise<SendResult> {
  const viewer = await requireViewer()
  if (viewer.role === 'leser') return { ok: false, error: 'forbidden' }

  const parsed = z.string().uuid().safeParse(surveyId)
  if (!parsed.success) return { ok: false, error: 'invalid' }
  if (!viewer.email) return { ok: false, error: 'failed' }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('send_round', {
    p_survey: parsed.data,
    p_channels: ['email'],
    p_recipients: [{ email: viewer.email, name: viewer.displayName }] as never,
    p_group_ids: [],
    p_cadence: 'once',
    p_runs: 1,
    p_reminder_days: 0,
    p_rotate: false,
    p_test_only: true,
  })

  if (error) {
    console.error(`send_round (test) failed: ${error.code ?? 'unknown'}`)
    return { ok: false, error: 'failed' }
  }
  const result = (data ?? {}) as { ok?: boolean; error?: string; round_id?: string }
  if (result.error === 'no_questions') return { ok: false, error: 'no_questions' }
  if (!result.ok) return { ok: false, error: 'failed' }
  return { ok: true, roundId: result.round_id!, invited: 1, shareToken: null }
}

export type ScheduleResult = { ok: true } | { ok: false; error: 'invalid' | 'forbidden' | 'failed' }

/**
 * Q22 — pause and resume a series.
 *
 * A plain UPDATE through RLS, not an RPC. `schedules_all_upd` already restricts
 * the write to editors (`app.can_edit_survey`, M:0044), so a SECURITY DEFINER
 * wrapper would add a Gate 5a3 catalogue surface to re-implement a control that
 * already exists — and every such wrapper is a place the two can disagree.
 *
 * The recomputation of `next_run_at` on resume is a TRIGGER
 * (`app.resume_schedule`), for the reason D94's writer is one: the rule belongs
 * to the column, and a rule in an action covers only the callers that go
 * through it. A future bulk resume, or a fix applied in psql, gets it too.
 */
export async function setSchedulePaused(
  surveyId: unknown,
  paused: unknown,
): Promise<ScheduleResult> {
  const id = z.string().uuid().safeParse(surveyId)
  const on = z.boolean().safeParse(paused)
  if (!id.success || !on.success) return { ok: false, error: 'invalid' }

  const viewer = await requireViewer()
  if (viewer.role === 'leser') return { ok: false, error: 'forbidden' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('schedules')
    .update({ paused_at: on.data ? new Date().toISOString() : null })
    .eq('survey_id', id.data)
    .select('id')

  if (error) {
    console.error(`setSchedulePaused failed: ${error.code ?? 'unknown'}`)
    return { ok: false, error: 'failed' }
  }
  // RLS filters rather than raising, so zero rows is the denial — and it is
  // also what a survey with no schedule looks like. Both are `forbidden` to the
  // caller: the screen only draws this control when a schedule exists, so a
  // press that matched nothing means the viewer may not write it.
  if ((data ?? []).length === 0) return { ok: false, error: 'forbidden' }

  await audit(viewer.orgId, on.data ? 'schedule.pause' : 'schedule.resume', id.data, {})
  revalidatePath(`/undersokelser/${id.data}/send`)
  revalidatePath('/undersokelser')
  return { ok: true }
}

/**
 * Q22 — stop the series. `active = false`, which the UI does not undo.
 *
 * Kept separate from pause rather than made a third state of it, because it is
 * not reversible: one control that toggles and one that ends is what makes the
 * confirmation on the second one meaningful.
 */
export async function stopSchedule(surveyId: unknown): Promise<ScheduleResult> {
  const id = z.string().uuid().safeParse(surveyId)
  if (!id.success) return { ok: false, error: 'invalid' }

  const viewer = await requireViewer()
  if (viewer.role === 'leser') return { ok: false, error: 'forbidden' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('schedules')
    // `paused_at` is cleared with it: a stopped series that is also flagged
    // paused would show «Pauset» on a survey that will never run again.
    .update({ active: false, paused_at: null })
    .eq('survey_id', id.data)
    .select('id')

  if (error) {
    console.error(`stopSchedule failed: ${error.code ?? 'unknown'}`)
    return { ok: false, error: 'failed' }
  }
  if ((data ?? []).length === 0) return { ok: false, error: 'forbidden' }

  await audit(viewer.orgId, 'schedule.stop', id.data, {})
  revalidatePath(`/undersokelser/${id.data}/send`)
  revalidatePath('/undersokelser')
  return { ok: true }
}
