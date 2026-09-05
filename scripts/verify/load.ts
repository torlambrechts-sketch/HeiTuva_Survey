/**
 * Load test for the respondent flow (Phase 6 hardening).
 *
 * The one path with real users behind it and no session in front of it:
 * `get_survey_for_token` and `submit_response`, hit through PostgREST exactly as
 * /s/[token] hits them, at concurrency, against the LOCAL stack. What this
 * measures is the database and the RPCs, not Vercel; what it proves is that the
 * anonymity write path holds its invariants under contention — every response
 * still lands unlinked, and no request is served a wrong answer.
 *
 * No dependency: Node's fetch and a Promise pool. Reports p50/p95/max and the
 * error count, and fails on any error or a p95 over the budget.
 *
 *   npx tsx scripts/verify/load.ts --local [--n 300] [--c 25]
 */
import { LOCAL_SUPABASE } from './local-env'
import { serviceClient } from '../../tests/db/clients'

const arg = (k: string, d: number) => {
  const i = process.argv.indexOf(`--${k}`)
  return i > 0 ? Number(process.argv[i + 1]) : d
}
const N = arg('n', 300)
const C = arg('c', 25)
const P95_BUDGET_MS = 400
const TOKEN = 'demo-share-link-token-for-local-verification'

if (!process.argv.includes('--local')) {
  console.error('load.ts runs against the local stack only (--local): it writes responses.')
  process.exit(1)
}
const URL = LOCAL_SUPABASE.NEXT_PUBLIC_SUPABASE_URL
const ANON = LOCAL_SUPABASE.NEXT_PUBLIC_SUPABASE_ANON_KEY

async function rpc<T>(name: string, body: unknown): Promise<T> {
  const res = await fetch(`${URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: ANON, authorization: `Bearer ${ANON}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${name} ${res.status}`)
  return (await res.json()) as T
}

function pct(sorted: number[], p: number) {
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0
}

async function main() {
  const svc = serviceClient()

  // A share link is not consumed by answering, so one token carries the whole
  // run. The questions come from the same RPC the page calls.
  const survey = await rpc<{ questions?: { id: string; type: string }[]; round_id?: string; error?: string }>(
    'get_survey_for_token', { p_token: TOKEN, p_lang: 'no' },
  )
  if (survey.error || !survey.questions?.length) {
    throw new Error(`share token did not resolve (${survey.error ?? 'no questions'}); run seed:demo`)
  }
  const scale = survey.questions.find((q) => q.type === 'scale')
  const text = survey.questions.find((q) => q.type === 'text')
  const roundId = survey.round_id!
  const { count: before } = await svc.from('responses').select('id', { count: 'exact', head: true }).eq('round_id', roundId)

  const reads: number[] = []
  const writes: number[] = []
  let errors = 0
  let next = 0

  const worker = async () => {
    for (;;) {
      const i = next++
      if (i >= N) return
      try {
        let t = performance.now()
        const s = await rpc<{ error?: string }>('get_survey_for_token', { p_token: TOKEN, p_lang: 'no' })
        reads.push(performance.now() - t)
        if (s.error) throw new Error(s.error)

        t = performance.now()
        const answers: Record<string, unknown> = {}
        if (scale) answers[scale.id] = { value: 1 + (i % 5) }
        if (text) answers[text.id] = { value: `load ${i}` }
        const r = await rpc<{ ok?: boolean; error?: string }>('submit_response', {
          p_token: TOKEN, p_lang: 'no', p_answers: answers, p_anon_choice: null,
        })
        writes.push(performance.now() - t)
        if (!r.ok) throw new Error(r.error ?? 'submit failed')
      } catch {
        errors++
      }
    }
  }

  const started = performance.now()
  await Promise.all(Array.from({ length: C }, worker))
  const wall = performance.now() - started

  const { count: after } = await svc.from('responses').select('id', { count: 'exact', head: true }).eq('round_id', roundId)
  // The invariant under load: not one of the new rows carries a link to a person.
  const { count: linked } = await svc
    .from('responses').select('id', { count: 'exact', head: true })
    .eq('round_id', roundId).not('invitation_id', 'is', null)

  reads.sort((a, b) => a - b); writes.sort((a, b) => a - b)
  const line = (label: string, xs: number[]) =>
    console.log(`  ${label.padEnd(22)} p50 ${pct(xs, 0.5).toFixed(0).padStart(4)} ms  p95 ${pct(xs, 0.95).toFixed(0).padStart(4)} ms  max ${(xs[xs.length - 1] ?? 0).toFixed(0).padStart(5)} ms  (${xs.length})`)

  console.log(`\n${N} respondents at concurrency ${C} — ${(N / (wall / 1000)).toFixed(0)} submissions/s over ${(wall / 1000).toFixed(1)} s`)
  line('get_survey_for_token', reads)
  line('submit_response', writes)
  console.log(`  errors                 ${errors}`)
  console.log(`  responses written      ${(after ?? 0) - (before ?? 0)} of ${N}`)
  console.log(`  linked to a person     ${linked ?? 0}`)

  const p95 = Math.max(pct(reads, 0.95), pct(writes, 0.95))
  const ok = errors === 0 && (after ?? 0) - (before ?? 0) === N && (linked ?? 0) === 0 && p95 <= P95_BUDGET_MS
  console.log(ok ? '\nload: within budget, invariants held' : `\nload: FAILED (errors=${errors}, p95=${p95.toFixed(0)}ms, budget ${P95_BUDGET_MS}ms)`)
  process.exit(ok ? 0 : 1)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack : e)
  process.exit(1)
})
