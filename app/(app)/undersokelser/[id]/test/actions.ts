'use server'

import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { ACTIVE_LOCALES, SOURCE_LOCALE, isLocale, type Locale } from '@/lib/i18n/locales'
import type { RespondentQuestion } from '@/lib/respondent/answers'

/**
 * Load the survey the way a RESPONDENT loads it — through
 * `get_survey_for_token`, with the anon key and no session.
 *
 * Reading it any other way would be the shortcut Q76's whole shape avoids: the
 * preview must exercise the respondent's own path, including the token
 * resolution, or it is a preview of a different program.
 */
const Token = z.string().min(16).max(200)

export type LoadResult =
  | { ok: true; survey: {
      title: string
      orgName: string
      anonymity: 'anonymous' | 'named' | 'optional'
      /** V2-10: the preview draws the same chrome a respondent gets. */
      run_mode: string | null
      /** M:0119, and carried for the same reason as `run_mode`: the preview
       *  must say what a REAL respondent on this token would be told about a
       *  reply, not a default chosen here. */
      hasThread: boolean
      kThreshold: number
      respondentKind: 'person' | 'organisation'
      engage: Record<string, unknown>
      questions: RespondentQuestion[]
      locale: Locale
      offeredLocales: Locale[]
    } }
  | { ok: false; error: string }

export async function loadTestSurvey(token: string): Promise<LoadResult> {
  const parsed = Token.safeParse(token)
  if (!parsed.success) return { ok: false, error: 'invalid' }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
  const { data, error } = await supabase.rpc('get_survey_for_token', { p_token: parsed.data })
  // The token is never logged — the same rule the respondent route follows.
  if (error) return { ok: false, error: 'unavailable' }

  const s = data as {
    error?: string
    title: string
    org_name: string | null
    anonymity: 'anonymous' | 'named' | 'optional'
    // V2-10: carried by `get_survey_for_token` (M:0088) so the preview draws the
    // same chrome a respondent gets — Q76's «all logikk kjører som for en ekte
    // respondent», applied to the tiles.
    run_mode?: string
    has_thread?: boolean
    k_threshold?: number
    respondent_kind?: string
    engage: Record<string, unknown> | null
    langs: string[] | null
    questions: RespondentQuestion[]
  } | null
  if (!s || s.error) return { ok: false, error: s?.error ?? 'unavailable' }

  const offered = (s.langs ?? [SOURCE_LOCALE]).filter(
    (l): l is Locale => isLocale(l) && (ACTIVE_LOCALES as readonly string[]).includes(l),
  )
  return {
    ok: true,
    survey: {
      title: s.title,
      orgName: s.org_name ?? '',
      anonymity: s.anonymity,
      run_mode: s.run_mode ?? null,
      hasThread: s.has_thread === true,
      kThreshold: s.k_threshold ?? 5,
      respondentKind: (s.respondent_kind === 'organisation' ? 'organisation' : 'person'),
      engage: s.engage ?? {},
      questions: s.questions ?? [],
      locale: (offered[0] ?? SOURCE_LOCALE) as Locale,
      offeredLocales: offered.length ? offered : [SOURCE_LOCALE as Locale],
    },
  }
}
