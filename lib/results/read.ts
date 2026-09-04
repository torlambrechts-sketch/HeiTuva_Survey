import 'server-only'

import { createClient } from '@/lib/supabase/server'
import {
  isRefusal,
  type Aggregate,
  type Benchmarks,
  type DashboardSummary,
  type Heatmap,
  type Quotes,
  type ResultsSummary,
  type Themes,
  type Trends,
} from './types'

/**
 * Typed reads of the Phase 4 result RPCs.
 *
 * Every one of these is a `jsonb` function, so the generated client type is
 * `Json`; this module is where that widens back into the shapes in `types.ts`,
 * once, instead of at every call site. It also normalises the two ways a read
 * can come back empty — a Postgres error and an in-payload `{error}` refusal —
 * into `null`, so a page renders its empty state rather than a stack trace.
 *
 * `server-only`: these run as the signed-in member through the cookie-bound
 * anon client, which is what makes RLS and `auth.uid()` apply. Importing them
 * into a client component would send the whole result payload to the browser.
 */
async function call<T>(fn: string, args: Record<string, unknown>): Promise<T | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc(fn as 'aggregate_results', args as never)
  if (error) {
    // The token is never in these args, but the survey id is — and an error
    // string is the one place a stray value gets logged, so log the function
    // and the code, never the payload.
    console.error(`results: ${fn} failed (${error.code ?? 'unknown'})`)
    return null
  }
  if (data === null || data === undefined) return null
  if (isRefusal(data)) return null
  return data as T
}

export const readSummary = (survey: string, round?: string | null, group?: string | null) =>
  call<ResultsSummary>('results_summary', { p_survey: survey, p_round: round ?? null, p_group: group ?? null })

export const readAggregate = (survey: string, group?: string | null, round?: string | null) =>
  call<Aggregate>('aggregate_results', { p_survey: survey, p_group: group ?? null, p_round: round ?? null })

export const readQuotes = (
  survey: string,
  question: string,
  opts: { group?: string | null; theme?: string | null; limit?: number } = {},
) =>
  call<Quotes>('get_quotes', {
    p_survey: survey,
    p_question: question,
    p_group: opts.group ?? null,
    p_theme: opts.theme ?? null,
    p_limit: opts.limit ?? 4,
  })

export const readTrends = (survey: string, group?: string | null) =>
  call<Trends>('get_trends', { p_survey: survey, p_group: group ?? null })

export const readThemes = (survey: string, rounds?: string[] | null, group?: string | null) =>
  call<Themes>('get_themes', { p_survey: survey, p_rounds: rounds ?? null, p_group: group ?? null })

export const readBenchmarks = (survey: string, industry: string, round?: string | null, group?: string | null) =>
  call<Benchmarks>('get_benchmarks', { p_survey: survey, p_industry: industry, p_round: round ?? null, p_group: group ?? null })

export const readHeatmap = (
  org: string,
  surveys?: string[] | null,
  group?: string | null,
  rounds?: string[] | null,
) =>
  call<Heatmap>('get_heatmap', {
    p_org: org, p_surveys: surveys ?? null, p_group: group ?? null, p_rounds: rounds ?? null,
  })

export const readDashboard = (
  org: string,
  surveys?: string[] | null,
  group?: string | null,
  rounds?: string[] | null,
) =>
  call<DashboardSummary>('dashboard_summary', {
    p_org: org, p_surveys: surveys ?? null, p_group: group ?? null, p_rounds: rounds ?? null,
  })
