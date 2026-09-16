'use server'

import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { AnswerMap } from '@/lib/respondent/answers'
import { LOCALES } from '@/lib/i18n/locales'

/**
 * The only write path a respondent has.
 *
 * CLAUDE.md invariant 2: `rpc.submit_response` is the single entry point, and
 * it does the whole thing in one transaction — validate the token, mark
 * `responded_at`, insert an UNLINKED response. Nothing here writes a table
 * directly, and nothing here has the service-role key.
 *
 * The client is built with the ANON key and no session. That is not a
 * limitation to work around: the respondent has no account, the RPC is SECURITY
 * DEFINER precisely so it can do its work without one, and handing this path a
 * privileged key would put an RLS-bypassing client on a public URL.
 */

const SubmitInput = z.object({
  token: z.string().min(16).max(512),
  lang: z.enum(LOCALES),
  answers: AnswerMap,
  /** Only meaningful when the survey's anonymity is 'optional'. */
  anonChoice: z.boolean().nullable().optional(),
  /** Q76 — a preview. Validated like every other boundary value (invariant 6). */
  dryRun: z.boolean().optional(),
  /**
   * C3 — the comments, carried in the SAME call as the answers so the database
   * writes them in one transaction (Q112/Q113).
   *
   * NOTE WHAT IS NOT HERE: a per-comment anonymity flag. `submit_response`
   * derives `is_anonymous` from the submission's own mode and `p_anon_choice`,
   * so there is exactly one choice and nothing can disagree with it. A field
   * here would be a control over something the database does not read, which is
   * worse than no control at all.
   *
   * Bounded at both ends. 4000 matches the CHECK on `survey_comments.body`, so
   * an over-long comment is refused HERE with a named error rather than aborting a real
   * submission at the constraint.
   */
  comments: z
    .array(
      z.object({
        questionId: z.string().uuid().nullable(),
        text: z.string().trim().min(1).max(4000),
      }),
    )
    .max(50)
    .optional(),
})

export type SubmitResult =
  | { ok: true }
  | { ok: false; error: 'invalid' | 'closed' | 'already' | 'failed' }

export async function submitResponse(input: unknown): Promise<SubmitResult> {
  const parsed = SubmitInput.safeParse(input)
  // Note what is NOT logged on the invalid branch: the payload. It is
  // respondent free text, and CLAUDE.md keeps that out of logs and error
  // payloads entirely — including the ones we write ourselves.
  if (!parsed.success) return { ok: false, error: 'invalid' }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )

  const { data, error } = await supabase.rpc('submit_response', {
    p_token: parsed.data.token,
    p_lang: parsed.data.lang,
    p_answers: parsed.data.answers as never,
    p_anon_choice: parsed.data.anonChoice ?? null,
    // Q76 — test mode. The flag changes what happens AFTER validation and never
    // whether validation runs, so a preview exercises the same refusals a
    // respondent would meet. Default false: an omitted flag is a real
    // submission, which is the safe direction for a boolean nobody set.
    p_dry_run: parsed.data.dryRun ?? false,
    p_comments: (parsed.data.comments ?? []).map((c) => ({
      question_id: c.questionId,
      text: c.text,
    })) as never,
  })

  if (error) {
    // The message may quote the statement, which can contain the answers, so
    // only the error code is recorded.
    console.error(`submit_response failed: ${error.code ?? 'unknown'}`)
    return { ok: false, error: 'failed' }
  }

  // The RPC reports its own refusals in the payload rather than by raising, so
  // a caller that only checked `error` would treat a closed round as a success.
  const result = (data ?? {}) as { error?: string; ok?: boolean }
  if (result.error === 'already_responded') return { ok: false, error: 'already' }
  if (result.error) return { ok: false, error: 'closed' }

  return { ok: true }
}

/**
 * Peer results for the thank-you screen (migration 0011).
 *
 * The token is the authorisation and the RPC enforces the k-anonymity floor
 * itself, so this action only shapes the payload. It is a server action rather
 * than a client fetch so the token stays out of a browser network call that a
 * shared screen or an extension could read.
 */
export type PeerResults =
  | { hidden: true }
  | { insufficientData: true; k: number; question: string }
  | { question: string; n: number; buckets: { value: number; count: number }[] }

export async function peerResults(token: unknown): Promise<PeerResults> {
  const parsed = z.string().min(16).max(512).safeParse(token)
  if (!parsed.success) return { hidden: true }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )

  const { data, error } = await supabase.rpc('get_peer_results', { p_token: parsed.data })
  if (error) {
    console.error(`get_peer_results failed: ${error.code ?? 'unknown'}`)
    return { hidden: true }
  }

  const r = (data ?? {}) as {
    error?: string
    hidden?: boolean
    insufficient_data?: boolean
    k?: number
    question?: string
    n?: number
    buckets?: { value: number; count: number }[]
  }
  // A refusal and a not-found both render as nothing: the thank-you screen is
  // not the place to explain why an aggregate is unavailable.
  if (r.error || r.hidden) return { hidden: true }
  if (r.insufficient_data) {
    return { insufficientData: true, k: r.k ?? 5, question: r.question ?? '' }
  }
  return { question: r.question ?? '', n: r.n ?? 0, buckets: r.buckets ?? [] }
}

/**
 * C5/Q111 — the respondent reads her own thread, after submitting.
 *
 * The whole capability in one call: `get_comment_thread` resolves the token,
 * refuses a closed round, matches on `invitation_id`, names neither
 * `public.responses` nor `public.answers`, and writes nothing — so none of the
 * five properties needs enforcing here. What this wrapper adds is the Zod
 * boundary and the rule that a failure is INDISTINGUISHABLE from an empty
 * thread: a respondent who is told «that token is not valid» has been told
 * something about a token she may not hold.
 */
export type Thread = {
  comments: {
    id: string
    question_id: string | null
    text: string
    is_anonymous: boolean
    created_at: string
    replies: { text: string; created_at: string }[]
  }[]
}

export async function commentThread(token: unknown): Promise<Thread> {
  const parsed = z.string().min(16).max(512).safeParse(token)
  if (!parsed.success) return { comments: [] }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )

  const { data, error } = await supabase.rpc('get_comment_thread', { p_token: parsed.data })
  if (error) {
    // The code only — never the payload, which is a respondent's own words
    // coming back (invariant 7).
    console.error(`get_comment_thread failed: ${error.code ?? 'unknown'}`)
    return { comments: [] }
  }
  const payload = (data ?? {}) as { error?: string; comments?: Thread['comments'] }
  if (payload.error) return { comments: [] }
  return { comments: payload.comments ?? [] }
}

/**
 * G1 — the closed loop, and her own opt-in state, in one call.
 *
 * ── WHAT THE RPC WILL NOT RETURN, AND WHY IT IS THE RPC THAT DECIDES ───────
 *
 * `get_closed_loop_for_token` returns a task's TITLE and the day it was done,
 * and nothing else — no `law_ref` (which names a statutory duty this
 * organisation is under), no owner, no status, no id. That is enforced in the
 * function body rather than by this wrapper picking fields, because a wrapper
 * that narrows a wide payload is one edit away from forwarding it.
 *
 * The bundle pairs each action with a QUOTE («{{ s6.said }}», v6:5539). That
 * half is not built: it is one respondent's own free text rendered to another
 * respondent, on a page whose reader has no role, no session, and — for a share
 * link — no relationship to the organisation. Q72's sentence covers it exactly.
 * Show what was DONE, never what was found; a quote IS the finding (D199).
 */
export type ClosedLoop = {
  items: { title: string; when: string | null }[]
  wantsResult: boolean
  canOptIn: boolean
}

const EMPTY_LOOP: ClosedLoop = { items: [], wantsResult: false, canOptIn: false }

function loopClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}

export async function closedLoop(token: unknown): Promise<ClosedLoop> {
  const parsed = z.string().min(16).max(512).safeParse(token)
  if (!parsed.success) return EMPTY_LOOP

  const { data, error } = await loopClient().rpc('get_closed_loop_for_token', {
    p_token: parsed.data,
  })
  if (error) {
    console.error(`get_closed_loop_for_token failed: ${error.code ?? 'unknown'}`)
    return EMPTY_LOOP
  }
  const r = (data ?? {}) as {
    items?: { title: string; when: string | null }[]
    wants_result?: boolean
    can_opt_in?: boolean
  }
  return {
    items: r.items ?? [],
    wantsResult: r.wants_result === true,
    canOptIn: r.can_opt_in === true,
  }
}

/**
 * G1 — «Send meg det samlede resultatet».
 *
 * ── THE WHOLE SECURITY ARGUMENT, BECAUSE IT IS SHORT ───────────────────────
 *
 * This is an address against an anonymous response, so the question is whether
 * it writes anything that links her to her answers. It does not, and the reason
 * is structural rather than careful:
 *
 *   - the write is ONE BOOLEAN on the invitation she already holds;
 *   - that row already carries her address and already carries `responded_at`,
 *     written at full precision by `submit_response` while the response itself
 *     gets `date_trunc('hour', now())`. The strongest temporal link that will
 *     ever exist is already there, by a design reminders require;
 *   - the column has NO TIMESTAMP, so it adds no ordering that hour-truncation
 *     removed;
 *   - nothing in `responses` or `answers` is touched — asserted field by field
 *     in `tests/db/closed-loop.test.ts` test 11, which is green only because
 *     the write is confirmed to have happened first.
 *
 * Where there is no invitation — a share link, a QR voucher — there is nothing
 * to write and nowhere to send it, so the RPC refuses and the control is never
 * rendered. Same predicate F-02 established for the reply box.
 */
export async function setResultOptIn(token: unknown, want: unknown): Promise<boolean> {
  const parsed = z
    .object({ token: z.string().min(16).max(512), want: z.boolean() })
    .safeParse({ token, want })
  if (!parsed.success) return false

  const { data, error } = await loopClient().rpc('set_result_optin', {
    p_token: parsed.data.token,
    p_want: parsed.data.want,
  })
  if (error) {
    console.error(`set_result_optin failed: ${error.code ?? 'unknown'}`)
    return false
  }
  const r = (data ?? {}) as { ok?: boolean; wants_result?: boolean }
  return r.ok === true && r.wants_result === true
}
