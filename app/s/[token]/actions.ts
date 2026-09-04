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
