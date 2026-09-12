'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

/**
 * V2-9 — the presenter's three actions. Zod at the boundary (CLAUDE.md
 * invariant 6); every authority check lives in the database, not here.
 */
const Uuid = z.string().uuid()

function randomCode(): string {
  // No I, O, 0 or 1: a code is read aloud in a room and typed by someone at the
  // back of it. Six characters from a 32-symbol alphabet is ~30 bits, and the
  // code is not a secret on its own — it mints a token for whoever is holding
  // it, which is the point, and it expires with the session.
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
}

export async function openLiveSession(
  surveyId: string,
  roundId: string,
  orgId: string,
): Promise<{ error?: string }> {
  const parsed = z.object({ surveyId: Uuid, roundId: Uuid, orgId: Uuid })
    .safeParse({ surveyId, roundId, orgId })
  if (!parsed.success) return { error: 'invalid' }

  const supabase = await createClient()
  // Four hours: long enough for any meeting, short enough that a code on a
  // slide deck is dead by the next one. `close_live_session` ends it sooner.
  const expires = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString()

  const { error } = await supabase.from('live_sessions').insert({
    org_id: parsed.data.orgId,
    survey_id: parsed.data.surveyId,
    round_id: parsed.data.roundId,
    code: randomCode(),
    expires_at: expires,
  })
  // The RLS policy and `app.guard_live_is_anonymous` are the authority here.
  // The message is named rather than generic where the trigger names it, so the
  // presenter learns the rule instead of being stopped by a shrug.
  if (error) {
    return { error: error.message.includes('live_requires_anonymous') ? 'namedSurvey' : 'failed' }
  }
  revalidatePath(`/undersokelser/${parsed.data.surveyId}/live`)
  return {}
}

export async function closeLiveSession(sessionId: string, surveyId: string): Promise<{ error?: string }> {
  const parsed = z.object({ sessionId: Uuid, surveyId: Uuid }).safeParse({ sessionId, surveyId })
  if (!parsed.success) return { error: 'invalid' }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('close_live_session', { p_id: parsed.data.sessionId })
  if (error) return { error: 'failed' }
  if (data && typeof data === 'object' && 'error' in data) return { error: 'forbidden' }
  revalidatePath(`/undersokelser/${parsed.data.surveyId}/live`)
  return {}
}

export async function setRevealed(
  sessionId: string,
  surveyId: string,
  revealed: boolean,
): Promise<{ error?: string }> {
  const parsed = z.object({ sessionId: Uuid, surveyId: Uuid, revealed: z.boolean() })
    .safeParse({ sessionId, surveyId, revealed })
  if (!parsed.success) return { error: 'invalid' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('live_sessions')
    .update({ revealed: parsed.data.revealed })
    .eq('id', parsed.data.sessionId)
  if (error) return { error: 'failed' }
  revalidatePath(`/undersokelser/${parsed.data.surveyId}/live`)
  return {}
}

