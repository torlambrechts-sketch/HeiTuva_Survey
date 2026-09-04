'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireViewer } from '@/lib/auth/session'
import { LOCALES } from '@/lib/i18n/locales'
import { audit } from '@/lib/auth/audit'

const LocaleSchema = z.enum(LOCALES)

/** Persists the viewer's UI language on their profile. RLS restricts profiles
 *  to `user_id = auth.uid()`, so this can only ever write the caller's own row. */
export type SetLocaleResult = { ok: true } | { ok: false; error: string }

export async function setLocale(next: string): Promise<SetLocaleResult> {
  const parsed = LocaleSchema.safeParse(next)
  if (!parsed.success) return { ok: false, error: 'invalid_locale' }

  const viewer = await requireViewer()
  const supabase = await createClient()
  const { error } = await supabase
    .from('profiles')
    .upsert({ user_id: viewer.userId, lang: parsed.data }, { onConflict: 'user_id' })

  // Previously discarded. A silent failure here looks to the user like the
  // language simply refused to change, with nothing to report.
  if (error) {
    console.error(`setLocale(${parsed.data}) failed: ${error.message}`)
    return { ok: false, error: 'save_failed' }
  }

  revalidatePath('/', 'layout')
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Oversikt
// ---------------------------------------------------------------------------

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
