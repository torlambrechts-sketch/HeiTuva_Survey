/**
 * Seeds the deterministic demo org used by the verification harness.
 * Local/CI only — never point this at a real project.
 *
 * Idempotent: drops and recreates the two demo orgs each run so captures are
 * reproducible. Auth users are reused, so their ids stay stable.
 */
import { config } from 'dotenv'
import {
  createOrg,
  createRound,
  createShareLink,
  createSurvey,
  dropOrg,
  inviteTo,
  submitResponses,
} from '../tests/db/factories'
import { personaClient, serviceClient } from '../tests/db/clients'
import {
  DEMO_SHARE_TOKEN,
  GROUP_PRIMARY,
  GROUP_SECONDARY,
  ORG_OTHER,
  ORG_PRIMARY,
  PERSONAS,
} from '../tests/db/personas'

if (!process.argv.includes('--local')) config({ path: '.env.local' })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321'
if (!url.includes('127.0.0.1') && !url.includes('localhost') && !process.env.ALLOW_REMOTE_SEED) {
  console.error(`Refusing to seed demo data into ${url}. Set ALLOW_REMOTE_SEED=1 to override.`)
  process.exit(1)
}

async function main() {
  await dropOrg(ORG_PRIMARY)
  await dropOrg(ORG_OTHER)

  const org = await createOrg(
    ORG_PRIMARY,
    [
      { email: PERSONAS.administrator.email, role: 'administrator', name: PERSONAS.administrator.name },
      { email: PERSONAS.redaktor.email, role: 'redaktor', name: PERSONAS.redaktor.name },
      { email: PERSONAS.leser.email, role: 'leser', name: PERSONAS.leser.name },
    ],
    { groupName: GROUP_PRIMARY },
  )

  const other = await createOrg(ORG_OTHER, [
    { email: PERSONAS.outsider.email, role: 'administrator', name: PERSONAS.outsider.name },
  ])

  // One survey above the k threshold and one below, so screens can be captured
  // in both their real-data and insufficient-data states.
  // A second team, so the heatmap and the team rows have the case the k gate
  // exists for: one group above the threshold beside one below it. A seed with
  // a single group can only ever photograph the happy path.
  const svc = serviceClient()
  const { data: secondGroup } = await svc
    .from('groups')
    .insert({ org_id: org.id, name: GROUP_SECONDARY })
    .select('id')
    .single()

  const above = await createSurvey(org.id, 'Arbeidsmiljø — månedlig', [
    { type: 'scale', text: 'Hvordan har uken på jobb vært?' },
    { type: 'text', text: 'Hva bør vi endre?' },
  ], { audience: 'Hele selskapet', langs: ['no', 'en'], templatePackKey: 'arbeidsmiljo-manedlig' })

  // Free text that the seeded theme rules actually match, so the themes panel
  // and the theme-filtered quote list have something real to show. Six people
  // write about "tid", which clears the contributor threshold; two write about
  // "møter", which does not — and must therefore never appear.
  const freeText = [
    'Vi trenger mer sammenhengende tid til dypt arbeid',
    'For lite tid mellom leveransene',
    'Tid til å tenke ville hjulpet mest',
    'Mer tid til fagarbeid, mindre kontekstbytte',
    'Vi mangler tid i kalenderen til å planlegge',
    'Tid er den største flaskehalsen akkurat nå',
  ]

  const aboveRound = await createRound(above, 8, { groupId: org.groupId })
  await submitResponses(
    aboveRound.tokens,
    (i) => ({
      [above.questions[0]!.id]: { value: 3 + (i % 3) },
      [above.questions[1]!.id]: { value: freeText[i] ?? freeText[0]! },
    }),
    6, // > k = 5
  )

  // The second team answers the same round and stays at four: every cell of its
  // heatmap row must come back gated while the first team's shows real numbers.
  const secondTeamText = [
    'For mange møter — møtekulturen må endres',
    'Møtene spiser opp dagen',
    'Færre og kortere møter, takk',
    'Vi bruker for mye av uka i møter',
  ]
  const secondTeamTokens = await inviteTo(aboveRound.id, 5, secondGroup?.id ?? null)
  await submitResponses(
    secondTeamTokens,
    (i) => ({
      // Low scores on purpose: they pull the question's average under 3,6 so the
      // insight panel has a real finding to show rather than an empty box.
      [above.questions[0]!.id]: { value: 1 + (i % 2) },
      [above.questions[1]!.id]: { value: secondTeamText[i] ?? secondTeamText[0]! },
    }),
    4, // < k = 5
  )

  // A second round, so "Mot forrige runde" and the trend panel compare two real
  // numbers rather than the prototype's placeholder `avg - 0.3`.
  const aboveRound2 = await createRound(above, 8, { groupId: org.groupId, roundNo: 2 })
  await submitResponses(
    aboveRound2.tokens,
    (i) => ({
      [above.questions[0]!.id]: { value: 4 + (i % 2) },
      [above.questions[1]!.id]: { value: freeText[(i + 2) % freeText.length]! },
    }),
    6,
  )

  const below = await createSurvey(org.id, 'Psykososial kartlegging', [
    { type: 'likert', text: 'Jeg vet hva som forventes av meg i jobben min' },
  ], { audience: 'Alle ansatte · årlig', templatePackKey: 'psykososial-kartlegging' })
  const belowRound = await createRound(below, 6, { groupId: org.groupId })
  await submitResponses(
    belowRound.tokens,
    (i) => ({ [below.questions[0]!.id]: { value: 4 - (i % 2) } }),
    3, // < k = 5, so aggregates must report insufficient_data
  )

  // A reusable respondent URL for the harness: /s/<DEMO_SHARE_TOKEN>. An
  // invitation token would answer once and then show the thank-you screen for
  // every later capture.
  await createShareLink(aboveRound.id, DEMO_SHARE_TOKEN)

  const draft = await createSurvey(org.id, 'Utkast uten svar', [
    { type: 'scale', text: 'Et spørsmål som ikke er sendt ennå' },
  ], { status: 'utkast', audience: 'Hele selskapet' })

  // --- Phase 5: the duty engine, in every state the card can be in ----------
  // Four cards, four different states, so a capture shows the ladder rather
  // than four copies of "Mangler". `apenhet` goes all the way to a published
  // archive entry, which is the only state that proves signing works end to
  // end — and it is signed through the RPC as a real signed-in persona,
  // because the trigger refuses any other path (migration 20260904000004).
  const { data: adminMember } = await svc
    .from('org_members')
    .select('id')
    .eq('org_id', org.id)
    .eq('email', PERSONAS.administrator.email)
    .single()

  async function seedDuty(key: string, ticks: number) {
    const { data: def } = await svc
      .from('duty_definitions')
      .select('default_interval_months, checks, signer_roles, title')
      .eq('key', key)
      .single()

    const { data: duty } = await svc
      .from('duties')
      .insert({
        org_id: org.id,
        definition_key: key,
        owner_member_id: adminMember!.id,
        interval_months: def!.default_interval_months,
        // A deadline in the near future, so the Oversikt chips have something
        // real to count down to rather than a null.
        next_due_at: new Date(Date.now() + 45 * 86_400_000).toISOString().slice(0, 10),
      })
      .select('id')
      .single()

    const checks = (def!.checks ?? []) as { key: string }[]
    await svc.from('duty_checks').insert(
      checks.map((c, i) => ({ duty_id: duty!.id, key: c.key, done: i < ticks })),
    )

    const roles = (def!.signer_roles ?? []) as { key: string; label: string }[]
    await svc.from('duty_signers').insert(
      roles.map((r) => ({
        duty_id: duty!.id,
        role_key: r.key,
        label: r.label,
        // Everything is assigned to the one administrator persona, so the seed
        // can sign as them. A real org spreads these across people.
        member_id: adminMember!.id,
      })),
    )
    return { id: duty!.id, roles, title: def!.title as string }
  }

  const apenhet = await seedDuty('apenhet', 4)
  await seedDuty('arbeidsmiljo', 2)

  await svc.from('reports').insert({
    org_id: org.id,
    title: `${apenhet.title} ${new Date().getFullYear()}`,
    kind: 'lov',
    status: 'klar',
    base_template: 'styresak',
    duty_id: apenhet.id,
    sections: ['method', 'participation', 'summary', 'actions'],
  })

  // Sign and publish through the real path, as the assigned signer.
  const asAdmin = await personaClient('administrator')
  for (const r of apenhet.roles) {
    const { data } = await asAdmin.rpc('sign_duty', { p_duty: apenhet.id, p_role_key: r.key })
    const signed = data as { ok?: boolean; error?: string }
    if (signed?.error) throw new Error(`seed sign_duty(${r.key}): ${signed.error}`)
  }
  const { data: publishResult } = await asAdmin.rpc('publish_duty', { p_duty: apenhet.id })
  const published = publishResult as { ok?: boolean; error?: string }
  if (published?.error) throw new Error(`seed publish_duty: ${published.error}`)

  // ---------------------------------------------------------------------
  // Surfaces Gate 5a3 could not prove
  // ---------------------------------------------------------------------
  // policy-coverage.ts measures protection by attempting a cross-org read. An
  // EMPTY table passes that trivially — the fixture, not the policy, does the
  // work — so it reports those surfaces as PROTECTED BUT UNPROVEN. Each row
  // below comes from the surface's REAL producer wherever one exists, so the
  // fixture doubles as a check that the producing path still works.

  // result_snapshots — produced by snapshot_results, the only writer.
  const { data: snapResult } = await asAdmin.rpc('snapshot_results', { p_survey: above.id })
  const snapped = snapResult as { snapshot_id?: string; error?: string }
  if (snapped?.error) throw new Error(`seed snapshot_results: ${snapped.error}`)

  // question_translations — produced by the builder's language tab, written by
  // a member so `qt_cud` is what admits it. It has to be the DRAFT survey: D31
  // freezes translations once a survey has a round, and it refused this on the
  // sent survey exactly as designed.
  const { data: draftQuestion } = await svc
    .from('survey_questions').select('id').eq('survey_id', draft.id).order('position').limit(1).single()
  if (draftQuestion) {
    const { error: trError } = await asAdmin.from('question_translations').insert({
      question_id: draftQuestion.id, lang: 'en', text: 'How has the week been?',
    })
    if (trError) throw new Error(`seed question_translations: ${trError.message}`)
  }

  // schedules — produced by send_round when a cadence is asked for. After the
  // translation above, because sending gives the survey a round and freezes it.
  const { data: schedResult } = await asAdmin.rpc('send_round', {
    p_survey: draft.id,
    p_channels: ['link'],
    p_recipients: [],
    p_cadence: 'monthly',
    p_runs: 3,
    p_test_only: true,
  })
  const scheduled = schedResult as { error?: string }
  if (scheduled?.error) throw new Error(`seed send_round(schedule): ${scheduled.error}`)

  // survey_editors — produced by sharing a survey with a colleague. Written
  // through a member client so `editors_cud` is what admits it, not the service
  // role. The ADMINISTRATOR does it: `can_edit_survey` admits the creator, an
  // existing editor, or an administrator, and the redaktør is none of those for
  // this survey — the policy refused them, correctly, on the first attempt.
  const leserMember = org.members.find((m) => m.role === 'leser')
  if (leserMember) {
    const { error: editorError } = await asAdmin
      .from('survey_editors')
      .insert({ survey_id: above.id, member_id: leserMember.memberId })
    if (editorError) throw new Error(`seed survey_editors: ${editorError.message}`)
  }

  // dsr_requests has no producer yet, so this is a direct row — and it is made
  // UNMISTAKABLY SYNTHETIC on purpose. A realistic-looking data-subject request
  // is the row that later gets counted in a compliance report or answered by
  // someone who believes it. The test is about access, never about content.
  await svc.from('dsr_requests').insert({
    org_id: org.id,
    type: 'innsyn',
    status: 'mottatt',
    subject_email: 'dsr-fixture@example.invalid',
    resolution: 'SYNTHETIC FIXTURE — not a real data-subject request. Exists only '
      + 'so Gate 5a3 can prove the dsr_requests policy refuses a cross-org read.',
  })

  console.log(`seeded:
  ${ORG_PRIMARY} (${org.id}) — ${org.members.length} members, group ${GROUP_PRIMARY}
  ${ORG_OTHER} (${other.id}) — cross-org isolation fixture
  "${above.title}" 6 responses (above k=5)
  "${below.title}" 3 responses (below k=5)
  "${draft.title}" draft, no round\n  share link /s/${DEMO_SHARE_TOKEN}`)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
