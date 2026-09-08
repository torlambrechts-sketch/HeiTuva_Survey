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
  inviteOrganisations,
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

  // Phase 6: the demo organisation has SMS and PowerPoint switched on, so the
  // captures photograph the channel card enabled and the export as a link.
  // Rows for THIS org, not the global defaults, which stay off (seed.sql): the
  // gates that prove the flags turn the rows off and on again.
  await svc.from('feature_flags').insert([
    { key: 'sms_channel', org_id: org.id, enabled: true },
    { key: 'pptx_export', org_id: org.id, enabled: true },
  ])

  const { data: secondGroup } = await svc
    .from('groups')
    .insert({ org_id: org.id, name: GROUP_SECONDARY })
    .select('id')
    .single()

  // V2-3a — one segment, so the Målgrupper screen renders a rule rather than an
  // empty card, and one whose match count is genuinely below the organisation's
  // threshold so the Q95 badge is REACHABLE. The seed reaching only the states
  // the current code creates is the failure CLAUDE.md names six times over.
  await svc.from('segments').insert([
    {
      org_id: org.id,
      name: 'Kun lesere',
      predicate: [{ field: 'role', op: 'eq', value: 'leser' }],
      source: 'Manuell',
    },
  ])

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

  // --- V1-2: the attributed path needs a survey that HAS one ----------------
  // Until now the demo organisation held only person surveys, so every screen
  // and every check that reads `attributed_results` had nothing to read and
  // "no rows" was indistinguishable from "the gate refused". This is the
  // Åpenhetsloven supplier survey: `respondent_kind = 'organisation'`, which
  // makes `app.k_for` return 0 — no threshold, because attribution is the
  // point (Q17 §5) — and named invitations, because the row heading IS the
  // supplier's name.
  //
  // The pack is applied so the questions carry Q35's `role`, and so the policy
  // arrives locked from the law rather than being set here.
  const suppliers = await createSurvey(org.id, 'Aktsomhetsvurdering leverandør', [
    // Q35: the roles are the pack's, copied here because this fixture builds the
    // questions directly rather than going through `createSurveyFromPack`.
    { type: 'yesno', text: 'Har virksomheten en policy for menneskerettigheter og anstendige arbeidsforhold?',
      config: { role: 'policy', short: 'Policy' } },
    { type: 'yesno', text: 'Gjennomfører dere egne aktsomhetsvurderinger av deres leverandørkjede?',
      config: { role: 'key', short: 'Egen vurdering' } },
    {
      type: 'choice',
      text: 'Hvor mange ledd bakover i kjeden har dere oversikt over?',
      config: { options: ['Ingen', 'Ett ledd', 'To ledd', 'Tre eller flere'] },
    },
    { type: 'yesno', text: 'Har dere avdekket brudd eller risiko siste 12 måneder?',
      config: { role: 'brudd', short: 'Brudd/risiko' } },
    { type: 'yesno', text: 'Har dere en varslingskanal som er åpen for arbeidere i kjeden?',
      config: { role: 'key', short: 'Varslingskanal' } },
    { type: 'text', text: 'Beskriv tiltakene dere har iverksatt' },
  ], {
    respondentKind: 'organisation',
    audience: 'Leverandører og forretningspartnere',
    templatePackKey: 'leverandor-apenhetsloven',
  })

  const supplierRound = await createRound(suppliers, 0)
  // Five suppliers in three states, because the register's whole job is to show
  // WHO has not answered — a table where everyone answered proves nothing about
  // the two states that need chasing.
  const supplierInvites = await inviteOrganisations(supplierRound.id, [
    'Nordvest Tekstil AS',
    'Bergen Logistikk AS',
    'Sørlandet Emballasje AS',
    'Fjordfrakt AS',
    'Trøndelag Komponent AS',
  ])

  // Three answer. One reports a breach and one has no policy, so the register's
  // two filters — «Har avdekket brudd» and «Mangler policy» — each match a real
  // row rather than rendering an empty table that looks broken.
  const supplierAnswers: Record<string, string>[] = [
    { policy: 'Ja', egen: 'Ja', ledd: 'Tre eller flere', brudd: 'Nei', varsling: 'Ja',
      tiltak: 'Årlig revisjon av alle leverandører i kategori A.' },
    { policy: 'Ja', egen: 'Ja', ledd: 'Ett ledd', brudd: 'Ja', varsling: 'Ja',
      tiltak: 'Avdekket overtidsbrudd hos underleverandør; handlingsplan med frist i mars.' },
    { policy: 'Nei', egen: 'Nei', ledd: 'Ingen', brudd: 'Nei', varsling: 'Nei',
      tiltak: 'Har startet arbeidet med en policy.' },
  ]
  const supplierQ = suppliers.questions
  await submitResponses(
    supplierInvites.slice(0, 3).map((i) => i.token),
    (i) => {
      const a = supplierAnswers[i]!
      return {
        [supplierQ[0]!.id]: { value: a.policy! },
        [supplierQ[1]!.id]: { value: a.egen! },
        [supplierQ[2]!.id]: { value: a.ledd! },
        [supplierQ[3]!.id]: { value: a.brudd! },
        [supplierQ[4]!.id]: { value: a.varsling! },
        [supplierQ[5]!.id]: { value: a.tiltak! },
      }
    },
  )

  // The fourth was reminded and still has not answered; the fifth has not been
  // chased at all. `reminded_at` is an array — one entry per reminder sent.
  await svc
    .from('survey_invitations')
    .update({ reminded_at: [new Date(Date.now() - 6 * 864e5).toISOString()] })
    .eq('round_id', supplierRound.id)
    .eq('name', supplierInvites[3]!.name)

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
      checks.map((c, i) => ({
        duty_id: duty!.id,
        key: c.key,
        done: i < ticks,
        // A ticked checklist item that names nobody is a state the product
        // cannot produce — `toggleDutyCheck` always writes who and when — and
        // it is a state a statutory checklist must not be in, because the
        // attribution IS the evidence. Seeded ticks are attributed to the same
        // administrator the signers are, for the same reason.
        done_by: i < ticks ? adminMember!.id : null,
        done_at: i < ticks ? new Date(Date.now() - (i + 1) * 86_400_000).toISOString() : null,
      })),
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

  // schedules — produced by send_round when a cadence is asked for.
  //
  // On its OWN survey, not on `draft`. Sending flips a survey to `aktiv`, so
  // scheduling the draft consumed the one fixture whose entire purpose is to
  // be unsent — `verify:send` re-seeded, found "Utkast uten svar" already
  // active, and failed with "no seeded draft to send" while the seed's summary
  // line went on claiming it had made one.
  const schedSurvey = await createSurvey(org.id, 'Planlagt utsending', [
    { type: 'scale', text: 'Hvordan går det?' },
  ], { status: 'utkast', audience: 'Hele selskapet' })

  const { data: schedResult } = await asAdmin.rpc('send_round', {
    p_survey: schedSurvey.id,
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

  // Phase 7a: the four tables 5a3 still reported as PROTECTED BUT UNPROVEN on a
  // freshly reset stack. Earlier runs happened to leave rows in them; a count
  // that depends on what the previous run left behind is not a count.

  // dashboard_pins — produced by togglePin, written by the member so
  // `dashboard_pins_ins` is what admits it.
  const adminUser = org.members.find((m) => m.role === 'administrator')
  if (adminUser) {
    const { error: pinError } = await asAdmin
      .from('dashboard_pins')
      .insert({ org_id: org.id, user_id: adminUser.userId, panel_key: 'summary' })
    if (pinError) throw new Error(`seed dashboard_pins: ${pinError.message}`)
  }

  // dashboard_layouts — V1-4/Q25. Two rows, because the table has two shapes
  // and 5a3 can only prove a policy that was asked to refuse a real row:
  // one ORGANISATION preset (user_id null, readable by every member) and one
  // PERSONAL layout (the administrator's own, invisible to a colleague). The
  // personal one is what makes `dashboard_layouts_sel`'s user check provable.
  //
  // Written as the administrator, so `dashboard_layouts_ins` is what admits
  // them — a service-role insert would seed the row while proving nothing
  // about the policy that is supposed to guard it.
  if (adminUser) {
    const { error: layoutError } = await asAdmin.from('dashboard_layouts').insert([
      {
        org_id: org.id,
        user_id: null,
        // NOT «Arbeidsmiljø»: that is a SHIPPED preset's name, and migration
        // 0048 refuses an organisation preset that takes one — the collision
        // this fixture originally created is what found the defect.
        title: 'Ledergruppa',
        panels: [
          { key: 'drivers', wide: false },
          { key: 'themes', wide: false },
        ],
        // No group_id: an organisation preset may not carry one (Q51) — the
        // seed obeys the constraint rather than working around it.
        filters: { period: 'y', group_id: null, survey_ids: [] },
      },
      {
        org_id: org.id,
        user_id: adminUser.userId,
        title: 'Mitt oppsett',
        // The member's WORKING layout, so this is what the demo dashboard
        // draws: the four panels the bundle's default board has
        // (`dashLayout` = ["trend","heatmap","drivers","themes"], NEW:3045),
        // with the heatmap full width as `wideDefault` gives it.
        panels: [
          { key: 'trend', wide: false },
          { key: 'heatmap', wide: true },
          { key: 'drivers', wide: false },
          { key: 'themes', wide: false },
        ],
        filters: { period: 'q', group_id: null, survey_ids: [] },
      },
    ])
    if (layoutError) throw new Error(`seed dashboard_layouts: ${layoutError.message}`)
  }

  // loop_actions — produced by "Lukket sløyfen" on Oversikt, written by the
  // member so `loop_cud_ins` is what admits it.
  const { error: loopError } = await asAdmin.from('loop_actions').insert({
    org_id: org.id,
    survey_id: above.id,
    text: 'Sette av tid til dypt arbeid på tirsdager',
    owner_member_id: adminMember!.id,
  })
  if (loopError) throw new Error(`seed loop_actions: ${loopError.message}`)

  // import_jobs and notifications have no producer that a seed can call
  // (imports are parsed client-side, notifications are not yet emitted), so
  // these are direct rows, and unmistakably synthetic for the same reason the
  // DSR row is.
  await svc.from('import_jobs').insert({
    org_id: org.id,
    source: 'csv',
    status: 'done',
    total_rows: 0,
    ok_rows: 0,
    error_rows: [{ note: 'SYNTHETIC FIXTURE — exists so Gate 5a3 can prove import_jobs refuses a cross-org read.' }],
    created_by: adminMember!.id,
  })
  await svc.from('notifications').insert({
    org_id: org.id,
    member_id: adminMember!.id,
    kind: 'fixture',
    payload: { note: 'SYNTHETIC FIXTURE — exists so Gate 5a3 can prove notifications refuses a cross-org read.' },
  })

  console.log(`seeded:
  ${ORG_PRIMARY} (${org.id}) — ${org.members.length} members, group ${GROUP_PRIMARY}
  ${ORG_OTHER} (${other.id}) — cross-org isolation fixture
  "${above.title}" 6 responses (above k=5)
  "${below.title}" 3 responses (below k=5)
  "${draft.title}" draft, no round
  "${suppliers.title}" organisation survey — ${supplierInvites.length} suppliers, 3 answered, no threshold
  share link /s/${DEMO_SHARE_TOKEN}`)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
