'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireViewer } from '@/lib/auth/session'
import { ANONYMITY_MODES, CADENCES, CHANNELS } from '@/lib/send/registry'

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
  email: z.string().trim().toLowerCase().email().max(320),
  name: z.string().trim().max(200).optional(),
  lang: z.enum(['no', 'en', 'sv', 'da']).optional(),
})

const SendInput = z.object({
  surveyId: z.string().uuid(),
  channels: z.array(z.enum(CHANNELS)).min(1),
  recipients: z.array(Recipient).max(5000),
  groupIds: z.array(z.string().uuid()).max(200),
  anonymity: z.enum(ANONYMITY_MODES),
  cadence: z.enum(CADENCES),
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
      error: 'invalid' | 'forbidden' | 'not_found' | 'no_questions' | 'no_recipients' | 'failed'
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
