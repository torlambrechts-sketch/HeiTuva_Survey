/**
 * VERIFY.md Gate 2b/2d — attack the access rules and the constraints, and print
 * what actually happened.
 *
 * The suites in tests/db assert these; this script exists because the gate asks
 * to *see* each outcome, and specifically to distinguish an empty result from a
 * denial. Those look identical in a passing test and are completely different
 * security claims: `[]` can mean "RLS filtered it" or "my filter was wrong and
 * there was never a row". Every probe below prints which one it observed.
 */
import { config } from 'dotenv'
import { anonClient, personaClient, serviceClient } from '../../tests/db/clients'
import { ORG_PRIMARY, ORG_OTHER } from '../../tests/db/personas'

config({ path: '.env.local', quiet: true })

type Outcome = 'DENIED' | 'EMPTY' | 'ALLOWED' | 'ERROR'

function classify(error: { message: string } | null, rows: unknown[] | null): {
  outcome: Outcome
  detail: string
} {
  if (error) return { outcome: 'DENIED', detail: error.message }
  if (!rows || rows.length === 0) return { outcome: 'EMPTY', detail: 'no error, zero rows' }
  return { outcome: 'ALLOWED', detail: `${rows.length} row(s) returned` }
}

let failures = 0

function report(label: string, expected: Outcome[], got: { outcome: Outcome; detail: string }) {
  const ok = expected.includes(got.outcome)
  if (!ok) failures++
  console.log(
    `  ${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(62)} ${got.outcome.padEnd(8)} ${got.detail.slice(0, 90)}`,
  )
}

async function main() {
  const svc = serviceClient()
  const [admin, redaktor, leser, outsider] = await Promise.all([
    personaClient('administrator'),
    personaClient('redaktor'),
    personaClient('leser'),
    personaClient('outsider'),
  ])
  const anon = anonClient()

  const { data: orgs } = await svc.from('organizations').select('id, name')
  const orgA = orgs!.find((o) => o.name === ORG_PRIMARY)!.id
  const orgB = orgs!.find((o) => o.name === ORG_OTHER)!.id
  // The demo seed gives "Annen Bedrift AS" members but no surveys, so there was
  // nothing for the cross-org probe to be refused. Arranging one with the
  // service role is fixture setup, not an assertion — every claim below is made
  // with a persona client.
  let { data: surveysB } = await svc.from('surveys').select('id').eq('org_id', orgB).limit(1)
  if (!surveysB?.length) {
    const created = await svc
      .from('surveys')
      .insert({ org_id: orgB, title: 'Org B — isolasjonsprobe' })
      .select('id')
    if (created.error) throw new Error(`could not arrange org B survey: ${created.error.message}`)
    surveysB = created.data
  }
  const surveyB = surveysB![0]!.id
  const { data: surveysA } = await svc.from('surveys').select('id').eq('org_id', orgA).limit(1)
  const surveyA = surveysA![0]!.id

  console.log('\n== 2b: the answers vault ==')
  for (const [who, c] of [
    ['leser', leser],
    ['redaktor', redaktor],
    ['administrator', admin],
    ['anon', anon],
  ] as const) {
    for (const table of ['responses', 'answers'] as const) {
      const { data, error } = await c.from(table).select('id')
      // EMPTY is the expected shape here and it is NOT a weaker result: no
      // select policy exists for these tables, so PostgREST returns an empty
      // set rather than an error. The denial is proven by the service-role
      // count below being non-zero for the same rows.
      report(`${who} selects ${table}`, ['EMPTY'], classify(error, data))
    }
  }
  const { count: realResponses } = await svc
    .from('responses')
    .select('id', { count: 'exact', head: true })
  console.log(
    `  note  service role sees ${realResponses} response row(s) — so the empty sets above are RLS, not an empty table`,
  )

  console.log('\n== 2b: cross-org isolation ==')
  report(
    "outsider reads org A's surveys",
    ['EMPTY', 'DENIED'],
    classify(...(await (async () => {
      const r = await outsider.from('surveys').select('id').eq('org_id', orgA)
      return [r.error, r.data] as const
    })())),
  )
  {
    const r = await outsider.from('org_members').select('id').eq('org_id', orgA)
    report("outsider reads org A's members", ['EMPTY', 'DENIED'], classify(r.error, r.data))
  }
  {
    const r = await outsider.from('reports').select('id')
    report("outsider reads org A's reports", ['EMPTY', 'DENIED'], classify(r.error, r.data))
  }
  {
    const r = await admin.from('surveys').select('id').eq('id', surveyB)
    report("org A admin reads org B's survey", ['EMPTY', 'DENIED'], classify(r.error, r.data))
  }
  {
    // The positive control: without this, every line above could be passing
    // because the filter is wrong rather than because RLS works.
    const r = await admin.from('surveys').select('id').eq('org_id', orgA)
    report('CONTROL: org A admin reads own surveys', ['ALLOWED'], classify(r.error, r.data))
  }

  console.log('\n== 2b: administrator-only writes ==')
  {
    const r = await redaktor
      .from('organizations')
      .update({ privacy: { ip_logging: true } })
      .eq('id', orgA)
      .select('id')
    report('redaktor writes org privacy', ['EMPTY', 'DENIED'], classify(r.error, r.data))
  }
  {
    const { data: member } = await svc
      .from('org_members')
      .select('id')
      .eq('org_id', orgA)
      .eq('role', 'leser')
      .limit(1)
      .single()
    const r = await redaktor
      .from('org_members')
      .update({ role: 'administrator' })
      .eq('id', member!.id)
      .select('id')
    report('redaktor promotes a leser', ['EMPTY', 'DENIED'], classify(r.error, r.data))
  }
  {
    const r = await redaktor
      .from('organizations')
      .update({ retention_months: 24 })
      .eq('id', orgA)
      .select('id')
    report('redaktor changes retention', ['EMPTY', 'DENIED'], classify(r.error, r.data))
  }

  console.log('\n== 2b: anon ==')
  {
    const r = await anon.rpc('aggregate_results', { p_survey: surveyA })
    report('anon calls aggregate_results', ['DENIED'], classify(r.error, null))
  }
  {
    const r = await anon.rpc('survey_response_counts', { p_org: orgA })
    report('anon calls survey_response_counts', ['DENIED'], classify(r.error, null))
  }
  // Phase 4's result RPCs. Supabase grants EXECUTE to `anon` at CREATE time, so
  // each one is revoked explicitly in the migration — and this is the probe that
  // says the revoke is real, rather than that the function happens to return
  // 'forbidden' at runtime.
  for (const [fn, args] of [
    ['get_heatmap', { p_org: orgA }],
    ['dashboard_summary', { p_org: orgA }],
    ['results_summary', { p_survey: surveyA }],
    ['get_trends', { p_survey: surveyA }],
    ['get_themes', { p_survey: surveyA }],
    ['get_benchmarks', { p_survey: surveyA }],
    ['snapshot_results', { p_survey: surveyA }],
    // Phase 5: the duty signature is a legal claim, so anon must not be able to
    // read one, make one, or publish an archive entry.
    ['duty_status', { p_duty: '00000000-0000-0000-0000-000000000000' }],
    ['sign_duty', { p_duty: '00000000-0000-0000-0000-000000000000', p_role_key: 'styre' }],
    ['publish_duty', { p_duty: '00000000-0000-0000-0000-000000000000' }],
  ] as const) {
    const r = await anon.rpc(fn as 'aggregate_results', args as never)
    report(`anon calls ${fn}`, ['DENIED'], classify(r.error, null))
  }
  for (const table of ['surveys', 'org_members', 'organizations', 'audit_events'] as const) {
    const r = await anon.from(table).select('id')
    report(`anon selects ${table}`, ['EMPTY', 'DENIED'], classify(r.error, r.data))
  }
  {
    // ui_messages is deliberately world-readable; naming it here keeps the
    // "anon sees nothing" claim honest rather than sweeping.
    const r = await anon.from('ui_messages').select('key').limit(1)
    report('anon selects ui_messages (deliberately public)', ['ALLOWED'], classify(r.error, r.data))
  }

  console.log('\n== 2d: constraint proofs ==')
  {
    // Structural anonymity: an anonymous response can never carry an invitation.
    const { data: round } = await svc.from('survey_rounds').select('id').limit(1).single()
    const { data: inv } = await svc.from('survey_invitations').select('id').limit(1).single()
    const r = await svc.from('responses').insert({
      round_id: round!.id,
      anonymity_at_submission: 'anonymous',
      invitation_id: inv!.id,
    })
    report('CHECK responses_anonymous_unlinked', ['DENIED'], classify(r.error, null))
  }
  {
    // Must target a survey with NO open round, or the D31 freeze trigger
    // rejects the insert first and this probe proves the trigger a second time
    // instead of the unique index. The identical error message is what gave
    // that away the first time it was written.
    //
    // And it must be a draft that HAS a question, because the duplicate needs a
    // position to collide with. Picking "any draft" passed on a freshly seeded
    // database and crashed after the suite had run — the tests leave behind
    // question-less drafts, and `.limit(1)` then chose one of those. Gate 5a2's
    // rule ("no assertion whose truth depends on what else exists") applies to
    // the probes as much as to the tests, so the question decides the survey
    // rather than the other way round.
    const { data: q } = await svc
      .from('survey_questions')
      .select('position, survey_id, surveys!inner(status)')
      .eq('surveys.status', 'utkast')
      .limit(1)
      .single()
    const r = await svc
      .from('survey_questions')
      .insert({ survey_id: q!.survey_id, position: q!.position, type: 'text', text: 'dupe' })
    report('UNIQUE survey_questions(survey_id, position)', ['DENIED'], classify(r.error, null))
  }
  {
    const r = await svc.from('surveys').insert({
      org_id: '00000000-0000-0000-0000-000000000000',
      title: 'orphan',
    })
    report('FK surveys.org_id', ['DENIED'], classify(r.error, null))
  }
  {
    const r = await svc
      .from('template_packs')
      .insert({ key: 'x', category: 'Ugyldig', title: 'x', questions: [] })
    report('CHECK template_packs.category', ['DENIED'], classify(r.error, null))
  }
  {
    const { data: ev } = await svc.from('audit_events').select('id').limit(1).single()
    const r = await svc.from('audit_events').update({ action: 'tampered' }).eq('id', ev!.id)
    report('TRIGGER audit_events append-only', ['DENIED'], classify(r.error, null))
  }
  {
    const { data: sent } = await svc
      .from('survey_rounds')
      .select('survey_id')
      .neq('status', 'scheduled')
      .limit(1)
      .single()
    const { data: q } = await svc
      .from('survey_questions')
      .select('id')
      .eq('survey_id', sent!.survey_id)
      .limit(1)
      .single()
    const r = await svc.from('survey_questions').update({ text: 'edited' }).eq('id', q!.id)
    report('TRIGGER D31 questions frozen after send', ['DENIED'], classify(r.error, null))
  }

  console.log(
    failures === 0
      ? '\nall probes behaved as expected'
      : `\n${failures} probe(s) did NOT behave as expected`,
  )
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack : e)
  process.exit(1)
})
