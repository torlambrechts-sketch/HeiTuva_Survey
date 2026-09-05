'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireViewer } from '@/lib/auth/session'
import { audit } from '@/lib/auth/audit'

export type OverviewResult = { ok: true } | { ok: false; error: 'forbidden' | 'invalid' | 'failed' }

const LoopInput = z.object({
  text: z.string().trim().min(1).max(280),
  surveyId: z.string().uuid().nullable().optional(),
})

/**
 * A "sløyfen lukket" entry: something the organisation actually did in response
 * to what people said. `loop_cud` already restricts writes to administrator and
 * redaktør; the role check here is so a leser gets a refusal rather than a
 * silent RLS no-op that looks to them like a save.
 */
export async function addLoopAction(input: z.input<typeof LoopInput>): Promise<OverviewResult> {
  const parsed = LoopInput.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid' }

  const viewer = await requireViewer()
  if (viewer.role === 'leser') return { ok: false, error: 'forbidden' }

  const supabase = await createClient()
  const { data: member } = await supabase
    .from('org_members')
    .select('id')
    .eq('org_id', viewer.orgId)
    .eq('user_id', viewer.userId)
    .maybeSingle()

  const { error } = await supabase.from('loop_actions').insert({
    org_id: viewer.orgId,
    text: parsed.data.text,
    survey_id: parsed.data.surveyId ?? null,
    owner_member_id: member?.id ?? null,
  })
  if (error) return { ok: false, error: 'failed' }

  await audit(viewer.orgId, 'loop_action.create')
  revalidatePath('/')
  return { ok: true }
}
