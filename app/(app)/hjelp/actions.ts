'use server'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireViewer } from '@/lib/auth/session'

/**
 * The contact form writes a real row.
 *
 * The prototype's `onContactSend` (V2:5158-5160) is `setState` plus a 2.6-second
 * timer — a confirmation for something that never happened. **Shipping that is
 * worse than shipping no form**: a user who believes they have reported a
 * problem stops reporting it.
 *
 * CLAUDE.md invariant 7 governs `body`: it is free text a person typed, so it
 * must not reach a log, an error payload or analytics. Nothing here logs it, and
 * the failure path returns a KEY rather than the message — an error payload
 * carrying the user's own words back through a logger is the way that invariant
 * is usually broken.
 */
const Message = z.object({
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(5000),
})

export type SupportResult = { ok: true } | { ok: false; error: 'invalid' | 'save_failed' }

export async function sendSupportMessage(input: {
  subject: string
  body: string
}): Promise<SupportResult> {
  const viewer = await requireViewer()
  const parsed = Message.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid' }

  const supabase = await createClient()
  const { error } = await supabase.from('support_messages').insert({
    org_id: viewer.orgId,
    member_id: viewer.memberId,
    subject: parsed.data.subject,
    body: parsed.data.body,
    lang: 'no',
  })
  // Deliberately not `error.message`: PostgREST echoes the offending row in some
  // constraint failures, and that row contains what the person wrote.
  if (error) return { ok: false, error: 'save_failed' }
  return { ok: true }
}
