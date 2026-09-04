/**
 * Gate 2b probe — attack the Phase 4/5 access rules with persona clients.
 *
 * The point is the distinction the protocol insists on: an EMPTY RESULT is not
 * a DENIAL. RLS filters rather than refuses, so a select that returns `[]` with
 * no error has been filtered; a write that returns a policy error has been
 * refused. Both are correct outcomes for different operations, and reporting
 * one as the other hides which control is actually holding.
 */
import { config } from 'dotenv'
import { serviceClient, personaClient, anonClient } from '../../tests/db/clients'
import { ORG_PRIMARY, ORG_OTHER } from '../../tests/db/personas'

config({ path: '.env.local', quiet: true })

let failures = 0

type Outcome = 'DENIED' | 'FILTERED' | 'ALLOWED'

function classify(error: { message: string } | null, rows: unknown[] | null): Outcome {
  if (error) return 'DENIED'
  if (!rows || rows.length === 0) return 'FILTERED'
  return 'ALLOWED'
}

function ok(label: string, pass: boolean, outcome: Outcome, detail: string) {
  if (!pass) failures++
  console.log(
    `  ${pass ? 'ok  ' : 'FAIL'} ${label.padEnd(52)} ${outcome.padEnd(9)} ${detail.slice(0, 78)}`,
  )
}

async function main() {
  const svc = serviceClient()
  const leser = await personaClient('leser')
  const redaktor = await personaClient('redaktor')
  const outsider = await personaClient('outsider')
  const anon = anonClient()

  const { data: orgA } = await svc.from('organizations').select('id').eq('name', ORG_PRIMARY).single()
  const { data: orgB } = await svc.from('organizations').select('id').eq('name', ORG_OTHER).single()
  if (!orgA || !orgB) throw new Error('both fixture organisations must exist')

  console.log('\n== leser cannot reach raw response data ==')
  for (const table of ['responses', 'answers'] as const) {
    const { data, error } = await leser.from(table).select('*').limit(1)
    const outcome = classify(error, data)
    // No SELECT policy exists at all, so PostgREST returns an empty set rather
    // than an error. That is still a complete denial of data — but it is a
    // FILTER, and calling it a denial would misdescribe the mechanism.
    ok(`leser select ${table}`, outcome !== 'ALLOWED', outcome, error?.message ?? `${data?.length ?? 0} rows`)
  }

  console.log('\n== cross-organisation reads ==')
  for (const table of ['surveys', 'org_members', 'reports', 'duties', 'loop_actions', 'result_snapshots'] as const) {
    const { data, error } = await outsider.from(table).select('*').eq('org_id', orgA.id)
    const outcome = classify(error, data)
    ok(`org B member reads org A ${table}`, outcome !== 'ALLOWED', outcome,
      error?.message ?? `${data?.length ?? 0} rows`)
  }

  // report_shares is org-scoped through a helper rather than a column.
  {
    const { data: report } = await svc.from('reports').select('id').eq('org_id', orgA.id).limit(1).maybeSingle()
    if (report) {
      const { data, error } = await outsider.from('report_shares').select('*').eq('report_id', report.id)
      ok('org B member reads org A report_shares', classify(error, data) !== 'ALLOWED',
        classify(error, data), error?.message ?? `${data?.length ?? 0} rows`)
    }
  }

  console.log('\n== redaktor cannot make administrator-only writes ==')
  {
    const { error } = await redaktor
      .from('organizations')
      .update({ retention_months: 6 })
      .eq('id', orgA.id)
      .select()
    // An UPDATE filtered to zero rows by RLS reports no error. Read back to see
    // whether the value actually moved — that is the only honest test.
    const { data: after } = await svc.from('organizations').select('retention_months').eq('id', orgA.id).single()
    ok('redaktor writes organizations.retention_months',
      after?.retention_months !== 6, error ? 'DENIED' : 'FILTERED',
      error?.message ?? `retention_months=${after?.retention_months}`)
  }
  {
    const { data: member } = await svc
      .from('org_members').select('id, role').eq('org_id', orgA.id).eq('role', 'leser').limit(1).single()
    if (!member) throw new Error('fixture: no leser member in the primary org')
    const { error } = await redaktor
      .from('org_members').update({ role: 'administrator' }).eq('id', member.id).select()
    const { data: after } = await svc.from('org_members').select('role').eq('id', member.id).single()
    ok('redaktor promotes a member to administrator',
      after?.role === 'leser', error ? 'DENIED' : 'FILTERED',
      error?.message ?? `role=${after?.role}`)
  }

  console.log('\n== anon ==')
  {
    const { data: survey } = await svc.from('surveys').select('id').eq('org_id', orgA.id).limit(1).single()
    if (!survey) throw new Error('fixture: no survey in the primary org')
    const { data, error } = await anon.rpc('aggregate_results', { p_survey: survey.id })
    const denied = !!error || (data as { error?: string })?.error === 'forbidden'
    ok('anon calls aggregate_results', denied, error ? 'DENIED' : 'FILTERED',
      error?.message ?? JSON.stringify(data).slice(0, 70))
  }
  {
    const { data, error } = await anon.rpc('overview_activity', { p_org: orgA.id })
    ok('anon calls overview_activity', !!error, error ? 'DENIED' : 'ALLOWED',
      error?.message ?? JSON.stringify(data).slice(0, 70))
  }
  for (const table of ['responses', 'answers', 'surveys', 'reports', 'org_members', 'duties'] as const) {
    const { data, error } = await anon.from(table).select('*').limit(1)
    const outcome = classify(error, data)
    ok(`anon selects ${table}`, outcome !== 'ALLOWED', outcome,
      error?.message ?? `${data?.length ?? 0} rows`)
  }

  console.log('\n== leser cannot write Phase 5 state ==')
  {
    const { data: duty } = await svc.from('duties').select('id').eq('org_id', orgA.id).limit(1).maybeSingle()
    if (duty) {
      // Flip the value first with the service role, so the leser's attempt is
      // always an attempt to CHANGE something. Asserting on the final value
      // instead would pass whenever the seed already left it where we wanted.
      await svc.from('duty_checks').update({ done: false }).eq('duty_id', duty.id).eq('key', 'k1')
      const { error } = await leser.from('duty_checks')
        .update({ done: true }).eq('duty_id', duty.id).eq('key', 'k1').select()
      const { data: after } = await svc.from('duty_checks')
        .select('done').eq('duty_id', duty.id).eq('key', 'k1').maybeSingle()
      ok('leser ticks a duty check', after?.done === false,
        error ? 'DENIED' : 'FILTERED', error?.message ?? `done stayed ${after?.done}`)
    }
  }
  {
    const { error } = await leser.from('loop_actions')
      .insert({ org_id: orgA.id, text: 'leser skal ikke kunne dette' }).select()
    ok('leser inserts a loop action', !!error, error ? 'DENIED' : 'ALLOWED',
      error?.message ?? 'INSERTED')
  }
  {
    const { error } = await leser.from('reports')
      .insert({ org_id: orgA.id, title: 'leser rapport', sections: [], filters: {} }).select()
    ok('leser inserts a report', !!error, error ? 'DENIED' : 'ALLOWED',
      error?.message ?? 'INSERTED')
  }

  console.log(failures === 0 ? '\nall probes behaved as expected' : `\n${failures} probe(s) failed`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
