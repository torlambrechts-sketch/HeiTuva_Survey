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
import { anonClient, personaClient, serviceClient } from '../tests/db/clients'
import {
  DEMO_SHARE_TOKEN,
  GROUP_PRIMARY,
  GROUP_SECONDARY,
  ORG_OTHER,
  ORG_PRIMARY,
  PERSONAS,
} from '../tests/db/personas'

if (!process.argv.includes('--local')) config({ path: '.env.local' })

/**
 * A submission through the respondent path, as a respondent makes it — the anon
 * key, not the service role. `submitResponses` covers the ordinary case; this
 * exists for the ones that carry a payload it does not model, and it throws on
 * the refusals that would otherwise leave the seed quietly short of a row.
 */
async function anonRpc(fn: 'submit_response', args: Record<string, unknown>) {
  const { data, error } = await anonClient().rpc(fn, args as never)
  if (error) throw new Error(`seed ${fn}: ${error.message}`)
  const payload = (data ?? {}) as { ok?: boolean; error?: string }
  if (payload.error) throw new Error(`seed ${fn} refused: ${payload.error}`)
  return payload
}

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

  // V2-3b — the Reservasjonsliste and the member-status vocabulary need states
  // to be IN. Q61 derives all four statuses from data that already exists, so
  // the seed's job is to make each one reachable:
  //
  //   Aktiv     the three personas, already seeded
  //   Ny        `status = 'invited'` — a member who has not signed in
  //   Reservert a row in `suppressions` for that member's address
  //   Bounce    `bounced_at` on that member's latest invitation
  //
  // Without them the Medlemmer card photographs one status four times, which is
  // the fixture gap CLAUDE.md names six times over — the seed reaching only the
  // states the current code happens to create.
  await svc
    .from('org_members')
    .insert([
      { org_id: org.id, email: 'nora@nordiskstudio.test', name: 'Nora Lie',
        role: 'leser', group_id: secondGroup!.id, status: 'active' },
      { org_id: org.id, email: 'petter@nordiskstudio.test', name: 'Petter Holm',
        role: 'leser', group_id: secondGroup!.id, status: 'invited' },
      // Active AND unsuppressed, so the group send below has somebody to reach.
      // Without a third member it invited nobody — Nora is on the list and
      // Petter is `invited`, which the group loop filters out — and a send that
      // reaches nobody is indistinguishable from suppression working.
      { org_id: org.id, email: 'sofie@nordiskstudio.test', name: 'Sofie Dahl',
        role: 'leser', group_id: secondGroup!.id, status: 'active' },
    ])

  await svc.from('suppressions').insert({
    org_id: org.id,
    email: 'nora@nordiskstudio.test',
    reason: 'har sagt nei til undersøkelser',
    source: 'manuell',
  })

  // B3: THE QUESTION BANK, which the demo seed carried none of.
  //
  // The picker overlay's entire content is bank rows, so on a bare reset it
  // would open empty — a screen that renders, reports built, and shows nothing.
  // That is the shape CLAUDE.md names six times, and the overlay is exactly the
  // kind of surface it happens to: nothing about an empty modal looks broken.
  //
  // Both KINDS are seeded, because the row renders differently for each and the
  // difference is a policy fact rather than a style: `bank_sel` is
  // `org_id is null or app.is_org_member(org_id)`, so a NULL org_id is the
  // shared standard bank (badge «benchmark», not deletable) and an org_id is
  // this organisation's own (badge = author, deletable). One of each means the
  // delete affordance has a subject and the badge has both states.
  //
  // Categories are spread, because `pickCats`/`bankCats` are BUILT from the
  // distinct categories present (V2:6204, V2:6343) — with one category the chip
  // row is a single chip and proves nothing about filtering.
  await svc.from('question_bank').insert([
    { org_id: null, text: 'Jeg har det jeg trenger for å gjøre jobben min godt',
      type: 'scale', category: 'Arbeidsmiljø', used_count: 4 },
    { org_id: null, text: 'Hvor sannsynlig er det at du vil anbefale oss som arbeidsgiver?',
      type: 'enps', category: 'Engasjement', used_count: 9 },
    { org_id: null, text: 'Har du opplevd eller sett trakassering de siste tolv månedene?',
      type: 'yesno', category: 'Lovpålagt', used_count: 2 },
    { org_id: org.id, text: 'Hva bør vi slutte å gjøre?',
      type: 'text', category: 'Egne', used_count: 1,
      author_member_id: org.members.find((m) => m.role === 'redaktor')?.memberId ?? null },
    { org_id: org.id, text: 'Hvilken samling vil du ha mer av?',
      type: 'choice', category: 'Egne', used_count: 0,
      config: { options: ['Fagdag', 'Workshop', 'Allmøte'] },
      author_member_id: org.members.find((m) => m.role === 'redaktor')?.memberId ?? null },
  ])

  // V2-6: one support message, for the same reason the objection above exists —
  // `verify:policy` reports a table PROTECTED BUT UNPROVEN when it is empty,
  // because an empty table is never asked to refuse anything. With this row
  // `support_messages` reports `ok` on a BARE reset rather than only inside
  // `verify:all`, where the db suite happens to populate it first.
  await svc.from('support_messages').insert({
    org_id: org.id,
    subject: 'Får ikke sendt til hele Utvikling',
    body: 'To av mottakerne mangler e-post i importen. Hva gjør vi?',
    lang: 'no',
  })

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
  // V2-9: the survey that runs live. Without this the «Kjør live» button never
  // renders, and the capture's `live` route would have nothing to click — the
  // screen was first photographed after setting this by hand in psql, which is
  // a state no reset reaches and therefore not a state at all.
  await svc.from('surveys').update({ run_mode: 'live' }).eq('id', above.id)

  /*
    THE QUIZ, seeded 2026-09-10 — the first state in this file that the product
    could not reach until the same commit.

    V2-10 built quiz end to end (`M:0085`–`M:0088`, the answer key, the k-gated
    `quiz_leaderboard`, tiles on `/s/[token]`, the Lagtavle on Resultater) and
    the run-mode card stayed locked behind «Quiz er ikke bygget ennå». So no
    seed could honestly carry a quiz: setting `run_mode` in SQL would have been
    a fixture reaching a state no customer could — DEVIATIONS D139, deliberately.
    The card is unlocked now, so this is a state a customer reaches, which is
    the whole difference.

    NAMED and non-statutory, because `app.guard_quiz_policy` refuses both — a
    quiz awards points to a person, and a duty under the law has no correct
    answers. The seed does not work around either guard; it satisfies them.

    SIX answer, one over k, so the Lagtavle returns real rows instead of its
    gated shape. That is what moves `quiz_leaderboard` from CHECKED to PROVEN in
    `verify:policy`: a k-gated RPC with no data is never asked to refuse.
  */
  const quiz = await createSurvey(
    org.id,
    'Personvern for nyansatte',
    [
      {
        type: 'choice',
        text: 'Hvor lenge kan vi lagre svar fra en undersøkelse?',
        config: { options: ['Så lenge vi vil', 'Så lenge formålet varer', 'For alltid'] },
      },
      {
        type: 'choice',
        text: 'Hva gjør du hvis en kollega ber om innsyn i egne data?',
        config: { options: ['Sier nei', 'Sender saken til personvernombudet', 'Ignorerer den'] },
      },
    ],
    { anonymity: 'named', audience: 'Nyansatte', langs: ['no'] },
  )

  // The fasit. `points` defaults to 100; `answer_index` is what makes a question
  // scorable and is CHECK-constrained to types that can carry one.
  for (const [i, q] of quiz.questions.entries()) {
    await svc.from('survey_questions').update({ answer_index: 1 }).eq('id', q.id)
    void i
  }

  await svc.from('surveys').update({ run_mode: 'quiz' }).eq('id', quiz.id)

  const quizRound = await createRound(quiz, 8, { groupId: org.groupId })
  await submitResponses(
    quizRound.tokens,
    (i) => ({
      // Four of six get the first right, five of six the second: a leaderboard
      // where every team scores identically shows nothing about the feature.
      [quiz.questions[0]!.id]: { value: i < 4 ? 1 : 0 },
      [quiz.questions[1]!.id]: { value: i < 5 ? 1 : 2 },
    }),
    6, // > k = 5, so the Lagtavle is not gated
  )

  // V2-9: one live session on the round above, for the reason the objection and
  // the support message above exist — `verify:policy` reports a table PROTECTED
  // BUT UNPROVEN when it is empty, because an empty table is never asked to
  // refuse anything. This is also the only state in the seed where a word cloud
  // has enough distinct respondents to clear `app.live_word_floor()`: six people
  // wrote about «tid», which is what makes the cloud reachable at all.
  //
  // CLOSED, not open. A demo database with a live voucher that still redeems is
  // a working token in a fixture, and `close_live_session`'s whole point is that
  // a code on a slide stops working — a seed that left one open would contradict
  // the guarantee the phase is about.
  await svc.from('live_sessions').insert({
    org_id: org.id,
    survey_id: above.id,
    round_id: aboveRound.id,
    code: 'DEMO01',
    status: 'closed',
    revealed: true,
    closed_at: new Date().toISOString(),
    expires_at: new Date(Date.now() - 3600_000).toISOString(),
  })

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

  // V2-3b — a REAL group-targeted send, because three things are otherwise
  // invisible to every gate:
  //
  //   `survey_invitations.member_id` (Q64 gap 1) is written only by the group
  //   loop, and the seed's other 32 invitations are inserted directly, so the
  //   column would be 0-of-32 and no capture would ever show it working.
  //
  //   The suppression skip has nothing to skip. `verify:policy` reports
  //   `suppressions` PROTECTED BUT UNPROVEN on a bare reset for the same
  //   reason: an empty table is never asked to refuse anything.
  //
  //   `bounced_at` needs an invitation to sit on, and Bounce is one of Q61's
  //   four statuses.
  const bounceSurvey = await createSurvey(org.id, 'Pulssjekk utvikling', [
    { type: 'scale', text: 'Hvordan er arbeidsmengden?' },
  ], { audience: GROUP_SECONDARY })

  const { data: groupSend } = await asAdmin.rpc('send_round', {
    p_survey: bounceSurvey.id,
    p_channels: ['email'],
    p_group_ids: [secondGroup!.id],
  })
  const sent = groupSend as { error?: string; invited?: number }
  if (sent?.error) throw new Error(`seed send_round(group): ${sent.error}`)
  // Nora is in this group and on the Reservasjonsliste, so the send reaches
  // Sofie and not her. Asserted rather than assumed: a seed that quietly sent
  // to both would leave every suppression capture photographing nothing.
  if (sent?.invited !== 1) {
    throw new Error(`seed: expected 1 invited (Nora is suppressed), got ${sent?.invited}`)
  }

  await svc
    .from('survey_invitations')
    .update({ bounced_at: new Date(Date.now() - 2 * 864e5).toISOString() })
    .eq('email', 'sofie@nordiskstudio.test')

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

  /*
    C1 — COMMENTS, seeded through the ONE write path.

    Two things depend on this existing after a bare reset, and both are the
    shape this project has hit six times — green for something that
    structurally could not be seen:

      `verify:policy` reports a table PROTECTED BUT UNPROVEN when it is empty,
      because an empty table is never asked to refuse anything. `survey_comments`
      and `survey_comment_replies` are new RLS tables and both must be PROVEN,
      not merely protected.

      C4's whole surface is comments. On a reset without these it opens empty,
      and every capture of it would photograph the empty state while reporting
      the screen as built.

    Written through `submit_response` with `p_comments`, never inserted
    directly: a direct insert would bypass the mode enforcement and the
    anonymity derivation, so a seed built that way would pass against a write
    path that is actually broken. Two of the eight `aboveRound` tokens are
    unused by the submissions above, which is where these come from.
  */
  await svc.from('surveys').update({ feedback_mode: 'anonymous' }).eq('id', above.id)
  const commentTokens = aboveRound.tokens.slice(6)
  const seededComment = await anonRpc('submit_response', {
    p_token: commentTokens[0]!,
    p_lang: 'no',
    p_answers: { [above.questions[0]!.id]: { value: 2 } },
    p_anon_choice: null,
    p_comments: [
      {
        question_id: above.questions[0]!.id,
        text: 'Det er ikke mengden, det er at prioriteringene endres midt i uken.',
      },
      {
        question_id: null,
        text: 'Fint at den tar under to minutter. Skulle gjerne sett resultatet for hele avdelingen.',
      },
    ],
  })
  if ((seededComment as { comments?: number }).comments !== 2) {
    throw new Error(
      `seed comments: expected 2 written, got ${(seededComment as { comments?: number }).comments}`,
    )
  }

  // A NAMED comment as well, on a survey whose feedback mode is «Med navn».
  // Without one, the leser policy's named-comment half is never exercised by a
  // capture or by 5a3 — the anonymous rows alone cannot show a refusal.
  const namedSurvey = await createSurvey(org.id, 'Åpen tilbakemelding', [
    { type: 'scale', text: 'Hvordan fungerer rutinene?' },
  ], { audience: GROUP_PRIMARY })
  await svc.from('surveys').update({ feedback_mode: 'named' }).eq('id', namedSurvey.id)
  const namedRound = await createRound(namedSurvey, 1, { groupId: org.groupId })
  await anonRpc('submit_response', {
    p_token: namedRound.tokens[0]!,
    p_lang: 'no',
    p_answers: { [namedSurvey.questions[0]!.id]: { value: 3 } },
    p_anon_choice: null,
    p_comments: [{ question_id: null, text: 'Jeg vet ikke hvem jeg skal gå til når noe er galt.' }],
  })

  /*
    A comment through the SHARE LINK, so C4's «no thread to reply in» row is
    reachable on a bare reset.

    Without it that state is invisible: every seeded comment has an invitation,
    the «Svar» button renders on all of them, and the one row that explains why a
    reply is sometimes impossible never appears — a capture would photograph a
    screen where the case does not exist and report the screen as built.

    The share link is on `aboveRound`, which is `above`'s round, so the comment
    lands on a survey whose feedback_mode is already `anonymous`.
  */
  await anonRpc('submit_response', {
    p_token: DEMO_SHARE_TOKEN,
    p_lang: 'no',
    p_answers: { [above.questions[0]!.id]: { value: 4 } },
    p_anon_choice: null,
    p_comments: [
      { question_id: null, text: 'QR-koden på vaktrommet var for liten til å skanne med hansker på.' },
    ],
  })

  // And one reply, so survey_comment_replies is PROVEN too and C5's screen has
  // a thread to render rather than a first message with nothing after it.
  const { data: firstComment } = await asAdmin
    .from('survey_comments')
    .select('id')
    .eq('round_id', aboveRound.id)
    .limit(1)
    .single()
  if (firstComment) {
    const adminMember = org.members.find((m) => m.role === 'administrator')
    const { error: replyError } = await asAdmin.from('survey_comment_replies').insert({
      comment_id: firstComment.id,
      body: 'Takk for at du sier det. Vi fryser prioriteringene fra mandag til torsdag fra neste uke.',
      author_member_id: adminMember?.memberId ?? null,
    })
    if (replyError) throw new Error(`seed survey_comment_replies: ${replyError.message}`)
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

  // V2-4 · Q68 (DEFAULTED): `loop_actions` is superseded by `tasks` and dropped
  // (`M:0062`). The register replaces it, and it needs a row at EVERY one of the
  // six steps plus one late and one awaiting effect — the screen has no seedable
  // state otherwise, which is the fixture gap CLAUDE.md names six times over.
  const { data: ownerMember } = await svc
    .from('org_members')
    .select('id')
    .eq('org_id', org.id)
    .eq('email', PERSONAS.administrator.email)
    .single()

  const taskSeed: {
    title: string
    kind: string
    status: 'foreslatt' | 'besluttet' | 'pagar' | 'gjennomfort' | 'effektvurdert' | 'lukket'
    law?: string
    due: string
  }[] = [
    // NOTE the sources: none of these names a group, a question or a score.
    // Q72 decided what a task may contain, and the bundle's own fixture
    // (V2:4168) breaks it — «Psykososial kartlegging · under terskel» with
    // `law: "aml. § 4-3 (3)"` discloses that a sub-threshold group scored badly.
    // The seed does not reproduce it.
    { title: 'Kartlegge ytringsklima', kind: 'risikovurdering', status: 'foreslatt', law: 'arbeidsmiljo', due: '2026-11-01' },
    { title: 'Svar på innsynskrav', kind: 'innsynskrav', status: 'besluttet', law: 'apenhet', due: '2026-10-03' },
    { title: 'Revisjon hos leverandør', kind: 'leverandoroppfolging', status: 'pagar', law: 'apenhet', due: '2026-10-01' },
    // Awaiting effect assessment — `gjennomfort` is what the stat tile counts.
    { title: 'Møtefrie torsdager', kind: 'tiltak', status: 'gjennomfort', due: '2026-10-15' },
    { title: 'Lønnskartlegging per stillingsgruppe', kind: 'tiltak', status: 'effektvurdert', law: 'likestilling', due: '2026-11-01' },
    { title: 'Ny fadderordning for nyansatte', kind: 'tiltak', status: 'lukket', due: '2026-09-01' },
    // Over frist — a past due date on an open task is the only way the «over
    // frist» tile is reachable.
    { title: 'Undersøkelse etter varsel', kind: 'undersokelsesplikt', status: 'pagar', law: 'trakassering', due: '2026-08-20' },
  ]

  for (const t of taskSeed) {
    // Inserted at the target status rather than advanced into it: the guard is
    // on UPDATE, and walking six steps per row would need six assessments this
    // fixture has no reason to invent.
    const { data: task, error: taskError } = await svc
      .from('tasks')
      .insert({
        org_id: org.id,
        title: t.title,
        kind: t.kind,
        law_ref: t.law ?? null,
        owner_member_id: ownerMember?.id ?? null,
        due_at: t.due,
        status: t.status,
      })
      .select('id')
      .single()
    if (taskError) throw new Error(`seed tasks(${t.title}): ${taskError.message}`)
    // The two terminal steps carry the row the close guard requires, so the
    // register's own rule is satisfied by the fixture rather than bypassed.
    if (t.status === 'effektvurdert' || t.status === 'lukket') {
      await svc.from('task_effect_assessments').insert({
        task_id: task!.id,
        assessed_by: ownerMember?.id ?? null,
        note: 'Effekten er vurdert i neste runde.',
      })
    }
  }

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
