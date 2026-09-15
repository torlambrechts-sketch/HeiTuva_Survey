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

  /* F4 — THE OWNERS THE «Eier» COLUMN READS.
     `surveys.created_by` gained writers at Q96 (three sites in
     `undersokelser/actions.ts`, one in `bibliotek/actions.ts`), so the column
     has a real producer in the product — and the FACTORY was the one path that
     still left it null, which is why a bare seed produced ten surveys and zero
     owners. Measured before the fix: `count(created_by) = 0` in the demo org.

     Two owners rather than one, because «Mine» is a filter: with a single owner
     it selects everything and demonstrates nothing. */
  const ownerAdmin = org.members.find((m) => m.role === 'administrator')!.memberId
  const ownerRedaktor = org.members.find((m) => m.role === 'redaktor')!.memberId

  // W2 · Q122 — THE ORG DEFAULT IS SEEDED, and the two organisations get
  // DIFFERENT ones on purpose.
  //
  // Oversikt under a non-default workspace is a state no fixture reached
  // before this line, and it is the surface where the failure mode is a blank
  // screen: `wsShow` gates four cards, so a wrong resolution renders nothing
  // and looks like a page that failed to load rather than a page obeying a
  // setting. A seed that only ever carries the DB default ('hr') can never
  // photograph that.
  //
  // Nordisk Studio keeps 'hr' — it is the statutory-compliance demo and its
  // modules are the four that exist. The other organisation takes 'cx', whose
  // set is `nps, activity, action`: TWO of those have no card yet, so it also
  // seeds the case where a workspace legitimately shows less than it names.
  await serviceClient().from('organizations').update({ workspace: 'hr' }).eq('id', org.id)

  const other = await createOrg(ORG_OTHER, [
    { email: PERSONAS.outsider.email, role: 'administrator', name: PERSONAS.outsider.name },
  ])

  await serviceClient().from('organizations').update({ workspace: 'cx' }).eq('id', other.id)

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
  const { error: bankError } = await svc.from('question_bank').insert([
    /*
      **EVERY ROW CARRIES `config`, AND THE OMISSION WAS A SILENT FAILURE.**

      `question_bank.config` is `not null default '{}'`, so a row without the
      key should take the default — and would, inserted alone. PostgREST
      UNIONS THE KEYS ACROSS A BULK INSERT: the one row below that sets
      `config` gave every other row `config: null`, which the NOT NULL then
      refused. The whole five-row insert failed, the error was never read, and
      the seed shipped an empty «Egne» chip and no shared bank rows on every
      reset. Found by making the insert speak (Q175), not by any gate.

      The lesson is the column default's: a default only applies to a key the
      statement does not mention, and in a bulk insert «mentioned» is decided
      by the widest row.
    */
    { org_id: null, text: 'Jeg har det jeg trenger for å gjøre jobben min godt',
      type: 'scale', category: 'Arbeidsmiljø', used_count: 4, config: {} },
    { org_id: null, text: 'Hvor sannsynlig er det at du vil anbefale oss som arbeidsgiver?',
      type: 'enps', category: 'Engasjement', used_count: 9, config: {} },
    { org_id: null, text: 'Har du opplevd eller sett trakassering de siste tolv månedene?',
      type: 'yesno', category: 'Lovpålagt', used_count: 2, config: {} },
    { org_id: org.id, text: 'Hva bør vi slutte å gjøre?',
      type: 'text', category: 'Egne', used_count: 1, config: {},
      author_member_id: org.members.find((m) => m.role === 'redaktor')?.memberId ?? null },
    { org_id: org.id, text: 'Hvilken samling vil du ha mer av?',
      type: 'choice', category: 'Egne', used_count: 0,
      config: { options: ['Fagdag', 'Workshop', 'Allmøte'] },
      author_member_id: org.members.find((m) => m.role === 'redaktor')?.memberId ?? null },
  ])
  // Q175: CHECKED. This insert had no error check and the rows had stopped
  // landing — `question_bank` held zero org-owned rows and the «Egne» chip was
  // empty on every reset, silently. An insert whose failure nobody reads is
  // the seed's own version of a swallowed exception.
  if (bankError) throw new Error(`seed question_bank: ${bankError.message}`)

  /*
    ── Q175 · «Firmaets maler»: two templates this organisation owns ────────

    THE SEED HAS NEVER SHIPPED ONE, and `tests/routes.manifest.ts` said so in
    its own comment — the `bibliotek-firmaets-maler` state produces one by
    driving the Builder's «Lagre som mal», deliberately, so that the capture
    proves the BUTTON works. That proof is untouched: the state still clicks it
    and still waits for «Lagret som mal ✓». What changes is that the section
    exists on a bare reset, so every other capture of the library sees the
    screen a real organisation has rather than an empty one.

    One private and one shared, because `TemplateCard`'s eyebrow reads
    «Privat mal» or «Firmaets mal · {owner}» and a fixture with one of them
    leaves the other branch undrawn.

    `use_case` is null on both: the wizard does not tag an organisation's own
    templates, so tagging them here would model a state the product cannot
    produce — and `annet` is the chip that exists for exactly this.
  */
  const redaktorMember = org.members.find((m) => m.role === 'redaktor')
  const { error: packError } = await svc.from('template_packs').insert([
    {
      org_id: org.id,
      key: `egen-onboarding-${org.id.slice(0, 8)}`,
      // `template_packs.category` is CHECK-constrained to Ansatte/Kunder/
      // Lovpålagt/Annet — «Egne» is the BANK's category vocabulary and is not
      // this column's. Both of these are employee-facing, so «Ansatte» is the
      // true one; the customer-facing axis is `use_case`, which an
      // organisation's own templates do not carry (Q45).
      category: 'Ansatte',
      use_case: null,
      title: 'Onboarding uke 1',
      audience: 'Nyansatte',
      private: false,
      author_member_id: redaktorMember?.memberId ?? null,
      questions: [
        { type: 'scale', text: 'Hvor godt forberedt følte du deg første dag?' },
        { type: 'text', text: 'Hva manglet i introduksjonen?' },
      ],
    },
    {
      org_id: org.id,
      key: `egen-ledergruppe-${org.id.slice(0, 8)}`,
      category: 'Ansatte',
      use_case: null,
      title: 'Temperaturmåling ledergruppen',
      audience: 'Ledergruppen',
      private: true,
      author_member_id: redaktorMember?.memberId ?? null,
      questions: [{ type: 'likert', text: 'Vi tar beslutninger raskt nok' }],
    },
  ])
  if (packError) throw new Error(`seed template_packs: ${packError.message}`)

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
  ], { audience: 'Hele selskapet', langs: ['no', 'en'], templatePackKey: 'arbeidsmiljo-manedlig', createdBy: ownerAdmin })

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
  ], { audience: 'Alle ansatte · årlig', templatePackKey: 'psykososial-kartlegging', createdBy: ownerRedaktor })
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
  ], { status: 'utkast', audience: 'Hele selskapet', createdBy: ownerRedaktor })

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
  ], { audience: GROUP_SECONDARY, createdBy: ownerAdmin })

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
  ], { audience: GROUP_PRIMARY, createdBy: ownerRedaktor })
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

    /*
      ── F5-1 · THE STATES THE FILTERS FILTER FOR ──────────────────────────

      Measured before this existed: across the whole demo organisation,
      `count(*) filter (where handled_at is not null)` over `survey_comments`
      was **0**, every survey-scoped task was `status <> 'lukket'`, and every
      one of them had a `law_ref`. So all three comment sub-tabs and all three
      task sub-tabs returned IDENTICAL rows, and six filters were green
      against a fixture that could not tell them apart.

      That is the shape CLAUDE.md records six times — «the seed reaches only
      states the current code creates» — arriving in a phase whose entire
      subject is filters. A filter whose branches cannot differ is not a
      filter that works; it is one nothing has asked a question of.

      Through the RPC rather than an UPDATE, for `set_comment_handled`'s own
      reason (M:0101): the column has one writer and a fixture that bypasses it
      is a second.
    */
    const { error: handledError } = await asAdmin.rpc('set_comment_handled', {
      p_comment: firstComment.id,
      p_handled: true,
    })
    if (handledError) throw new Error(`seed set_comment_handled: ${handledError.message}`)
  }

  /*
    The task half of the same measurement. `app.generate_blind_spot_tasks` is
    the only writer of a SURVEY-SCOPED task, and it produces exactly one shape:
    `undersokelsesplikt` · `foreslatt` · with a `law_ref`. Measured —
    `select distinct kind, status, (law_ref is not null) from tasks where
    source_round_id is not null` returned ONE row — so «Åpne», «Alle» and «Med
    hjemmel» selected the same set on every survey in the organisation.

    Two rows fix that, and they are chosen so each filter lands differently
    rather than merely differing from the default: with these, Alle is four,
    Åpne is three (the closed one drops out) and Med hjemmel is three (the
    other one drops out). Three filters, three different answers, none of them
    a subset of the answer next to it by accident.

    `source_kind`/`source_ref`/`source_round_id` together satisfy the composite
    FK to `survey_rounds (id, survey_id)`; `kind` is deliberately NOT
    `undersokelsesplikt`, because `tasks_blind_spot_once` is a partial unique
    index over exactly that kind and these are not blind-spot rows.
  */
  const filterTasks = [
    { title: 'Lukket tiltak fra denne runden', kind: 'tiltak', status: 'lukket', law: 'arbeidsmiljo' },
    { title: 'Oppfølging uten hjemmel', kind: 'risikovurdering', status: 'pagar', law: null },
  ] as const
  for (const ft of filterTasks) {
    const { data: row, error: ftError } = await svc
      .from('tasks')
      .insert({
        org_id: org.id,
        title: ft.title,
        kind: ft.kind,
        status: ft.status,
        law_ref: ft.law,
        source_kind: 'survey',
        source_ref: above.id,
        source_round_id: aboveRound.id,
      })
      .select('id')
      .single()
    if (ftError) throw new Error(`seed filterTasks(${ft.title}): ${ftError.message}`)
    // The closed one carries the row the close guard requires, so the
    // register's own rule is satisfied by the fixture rather than bypassed.
    if (ft.status === 'lukket') {
      const { error: aError } = await svc.from('task_effect_assessments').insert({
        task_id: row.id,
        note: 'Tiltaket ble gjennomført og runden etter viste utslag.',
      })
      if (aError) throw new Error(`seed task_effect_assessments: ${aError.message}`)
    }
  }

  /*
    ── Q175 · the seven question types no seed had ever reached ────────────

    Walk finding W-12: the registry declares THIRTEEN types and the seed
    produced six — `scale`, `yesno`, `text`, `enps`, `choice`, `likert`. The
    other seven had no row anywhere, so seven renderers were unreachable by any
    browser gate, and «all thirteen types render» was a claim nobody could check
    without hand-building a survey.

    **THE VALUES ARE THE SHAPES THE RENDERERS ACTUALLY EMIT**, read off
    `QuestionInput.tsx` rather than guessed: smiley/dropdown/image are indices
    (smiley 1-based, the other two 0-based), slider a number inside its own
    min/max, ranking an ORDER of option indices, matrix one number per
    statement. A fixture in the wrong shape would render — and would be showing
    the product data it can never produce.

    `field` is NOT here. It is the one type the registry marks
    `breaksAnonymity`, and the Builder refuses to call a survey ready while an
    anonymous one carries it. Nothing in the DATABASE enforces that, so a seed
    could quietly create the state the product forbids; it goes in the named
    survey below instead, where a name-and-e-post question is what the type is
    for.
  */
  const types = await createSurvey(
    org.id,
    // **THE TITLE MAKES NO CLAIM, DELIBERATELY.** It read «alle spørsmålstyper»
    // first, and that was false in the row itself: `field` cannot be here (see
    // below), so the survey could never carry all thirteen and the title
    // promised a completeness the data did not have. Between this survey and
    // «Påmelding til fagdag» every type is reachable; neither title says so.
    'Medarbeiderpuls høst',
    [
      { type: 'smiley', text: 'Hvordan er stemningen i teamet denne måneden?' },
      {
        type: 'slider',
        text: 'Hvor stor del av uken går til avbrudd?',
        config: { min: 0, max: 100, low_label: 'Ingenting', high_label: 'All tiden' },
      },
      {
        type: 'dropdown',
        text: 'Hvilket fagområde jobber du mest med?',
        config: { options: ['Produkt', 'Design', 'Utvikling', 'Ledelse', 'Annet'] },
      },
      {
        type: 'image',
        text: 'Hvor jobber du best?',
        config: { options: ['På kontoret', 'Hjemme', 'Blandet'] },
      },
      {
        type: 'ranking',
        text: 'Ranger godene etter hva som betyr mest for deg',
        config: { options: ['Fleksitid', 'Hjemmekontor', 'Kompetansebudsjett', 'Ekstra fridager'] },
      },
      {
        type: 'matrix',
        text: 'Hvor godt stemmer disse for deg?',
        config: {
          statements: ['Jeg får tydelige mål', 'Jeg har tid nok', 'Jeg får hjelp når jeg trenger det'],
        },
      },
      // The six that were already reachable, gathered here too, so ONE survey
      // renders every type an anonymous survey may carry. `enps` in particular
      // existed only as a bank row — a type with a renderer, a bank entry and
      // no question anywhere.
      { type: 'enps', text: 'Hvor sannsynlig er det at du vil anbefale oss som arbeidsgiver?' },
      { type: 'scale', text: 'Hvor godt fungerer samarbeidet på tvers?' },
      { type: 'likert', text: 'Jeg vet hva som forventes av meg' },
      {
        type: 'choice',
        text: 'Hva vil du ha mer av?',
        config: { options: ['Fagtid', 'Sosialt', 'Opplæring'], multi: false, randomize: false },
      },
      { type: 'yesno', text: 'Har du hatt en samtale om utvikling i høst?' },
      { type: 'text', text: 'Hva er det viktigste vi kan endre?' },
    ],
    { audience: 'Hele selskapet', langs: ['no'] },
  )
  const typesRound = await createRound(types, 9, { groupId: org.groupId })
  await submitResponses(
    typesRound.tokens,
    (i) => ({
      [types.questions[0]!.id]: { value: 3 + (i % 3) },
      [types.questions[1]!.id]: { value: 20 + i * 9 },
      [types.questions[2]!.id]: { value: i % 5 },
      [types.questions[3]!.id]: { value: i % 3 },
      // An ORDER, not a score: each respondent ranks the same four options
      // differently, rotated so no option is always first.
      [types.questions[4]!.id]: { value: [0, 1, 2, 3].map((k) => (k + i) % 4) },
      [types.questions[5]!.id]: { value: [3 + (i % 3), 2 + (i % 4), 4 - (i % 3)] },
      // enps is 0-10; the mix gives detractors, passives and promoters so the
      // score is a real calculation rather than one bucket.
      [types.questions[6]!.id]: { value: [9, 6, 10, 3, 8, 9, 7][i] ?? 8 },
      [types.questions[7]!.id]: { value: 3 + (i % 3) },
      [types.questions[8]!.id]: { value: 2 + (i % 4) },
      [types.questions[9]!.id]: { value: i % 3 },
      [types.questions[10]!.id]: { value: i % 2 === 0 },
      [types.questions[11]!.id]: {
        value:
          [
            'Vi trenger færre parallelle prosjekter',
            'Mer tid til fagarbeid',
            'Tydeligere prioritering fra ledelsen',
            'Bedre onboarding for nye',
            'Mindre kontekstbytte i uken',
            'Flere faglige samlinger',
            'Raskere beslutninger',
          ][i] ?? 'Mer tid til fagarbeid',
      },
    }),
    7, // > k = 5, so every one of these renders a real aggregate rather than a gate
  )

  /*
    ── Q175 · `field`, where it belongs ─────────────────────────────────────

    A named sign-up. `field` collects a name, an address and a date, which is
    precisely why it may not sit in an anonymous survey — and precisely what an
    event registration is. `anonymity: 'named'` says so in the row rather than
    leaving it to the fixture's good manners.
  */
  const signup = await createSurvey(
    org.id,
    'Påmelding til fagdag',
    [
      {
        type: 'field',
        text: 'Meld deg på',
        config: { fields: [['Navn', 'text'], ['E-post', 'email'], ['Dato du kan', 'date']] },
      },
      {
        type: 'choice',
        text: 'Hvilken bolk vil du delta på?',
        config: { options: ['Formiddag', 'Ettermiddag', 'Begge'], multi: false, randomize: false },
      },
    ],
    { audience: 'Alle som vil delta', anonymity: 'named', langs: ['no'] },
  )
  const signupRound = await createRound(signup, 6, { groupId: org.groupId })
  await submitResponses(
    signupRound.tokens,
    (i) => ({
      [signup.questions[0]!.id]: {
        value: {
          Navn: ['Ida Moen', 'Jonas Berg', 'Sara Lind', 'Tom Aas', 'Nora Vik'][i] ?? 'Kari Nordmann',
          'E-post': `deltaker${i + 1}@nordiskstudio.test`,
          'Dato du kan': '2026-10-22',
        },
      },
      [signup.questions[1]!.id]: { value: i % 3 },
    }),
    5,
  )

  /* F4 — A CLOSED SURVEY, because the demo organisation had none.
     Measured on a bare reset: ten surveys, nine `aktiv` and one `utkast`. The
     mix bar draws three dots (aktive · utkast · lukket, v6:2229-2231) and the
     status rail offers four filters, so a third of both controls had nothing
     to show and a screenshot of them could not be told from a control that
     cannot count.

     A NEW survey rather than closing an existing one: `above` carries the live
     session, the share link and the results captures, and moving a fixture
     every other state depends on to satisfy this one is how a seed acquires
     couplings nobody can see. It has real responses first, because a closed
     survey with none is the empty state of a different screen.

     `status: 'lukket'` is set through the same column `closeSurvey`
     (`undersokelser/actions.ts:266`) writes, so `app.close_rounds_with_survey`
     (M:0068) fires here exactly as it does in the product — the round closes
     and the snapshot is taken by the trigger, not by this script. */
  const closed = await createSurvey(
    org.id,
    'Medarbeiderpuls vår',
    [
      { type: 'likert', text: 'Jeg får brukt styrkene mine i jobben' },
      { type: 'scale', text: 'Hvor godt fungerer samarbeidet i teamet?' },
    ],
    { audience: 'Hele selskapet', templatePackKey: 'arbeidsmiljo-manedlig', createdBy: ownerAdmin },
  )
  const closedRound = await createRound(closed, 9, { groupId: org.groupId })
  await submitResponses(
    closedRound.tokens,
    (i) => ({
      [closed.questions[0]!.id]: { value: 3 + (i % 3) },
      [closed.questions[1]!.id]: { value: 6 + (i % 4) },
    }),
    7,
  )
  await svc.from('surveys').update({ status: 'lukket' }).eq('id', closed.id)

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

  /* I1-2 — a SCIM connector, so the Integrasjoner screen has a state to render
     and `verify:policy` has a row to refuse.

     THE TOKEN IS A KNOWN DEV VALUE AND THAT IS WHY IT IS HERE RATHER THAN IN
     `seed.sql`. seed.sql builds EVERY database including production; this script
     refuses to run against a remote URL without ALLOW_REMOTE_SEED (line 46). A
     credential with a published secret belongs only in a database that is
     disposable by construction.

     `entra_connections` has RLS on and no policy, so without a row the policy is
     never actually asked to refuse anything and 5a3 reports PROTECTED BUT
     UNPROVEN — a green that means «nothing could be seen», which is the shape
     this project has hit six times. */
  const { data: entraAdmin } = await svc
    .from('org_members')
    .select('id')
    .eq('org_id', org.id)
    .eq('email', PERSONAS.administrator.email)
    .maybeSingle()

  /*
    I2 — a demo Entra connection, planted THROUGH THE WRITE PATH.

    `app.entra_store_connection` puts the refresh token in `vault.secrets` and
    the handle in `entra_connections`, so the fixture exercises the same code an
    administrator's consent would. Inserting the row by hand would leave the
    vault empty and every screen reading a connection whose token does not
    exist — and the denial tests would then be denying access to nothing (D158).

    The token is UNMISTAKABLY SYNTHETIC. A fixture that looks like a credential
    is one somebody later tries to use, which is the same reason the DSR row
    says so in its own resolution text.
  */
  const { error: entraError } = await svc.rpc('store_entra_connection' as never, {
    p_org: org.id,
    p_tenant: 'demo-tenant.invalid',
    p_scopes: ['User.Read.All'],
    p_token: 'SYNTHETIC-DEMO-REFRESH-TOKEN-NOT-VALID-ANYWHERE',
    p_by: entraAdmin?.id ?? null,
  } as never)
  if (entraError) throw new Error(`seed entra_connections: ${entraError.message}`)

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
    /** V5-2: `null` is a real state — an open tiltak nobody has dated — and the
     *  Arbeidsliste groups by deadline, so «Uten frist» needs a row in it.
     *
     *  MEASURED RATHER THAN ASSUMED, and the first version of this comment was
     *  wrong: it said this was the only way that bucket becomes reachable.
     *  `app.generate_blind_spot_tasks` already produces two dateless tasks on
     *  this fixture (`select count(*) filter (where due_at is null)` returns
     *  3 of 10). What the row below adds is the COMBINATION the generated ones
     *  do not have — no deadline, no hjemmel, kind `tiltak` — which is the
     *  ordinary manual case. */
    due: string | null
    /** Whose task it is. Absent means the default owner, as every row did
     *  before Q175 — kept as the default so the eight rows above read
     *  unchanged. */
    owner?: 'redaktor'
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
    // V5-2 — no deadline, so «Uten frist» has a task in it. An open tiltak
    // nobody has dated is an ordinary state of a register, not an error.
    { title: 'Rydde i tilgangene til rapportene', kind: 'tiltak', status: 'foreslatt', due: null },
    /*
      Q175 — TWO OWNERS, BECAUSE ONE IS NOT A PANEL.

      Every row above takes `ownerMember`, so «Eiere» rendered a single chip
      and its count line read «1» on a register of ten tasks. The panel exists
      to show how the work is distributed; with one owner it cannot be wrong
      and cannot be informative either. These two are the redaktør's, so the
      chip row has two initials, two counts, and a «Mine» filter that actually
      excludes something when the administrator is signed in.
    */
    { title: 'Oppdatere personvernerklæringen', kind: 'tiltak', status: 'besluttet', owner: 'redaktor', due: '2026-10-20' },
    { title: 'Gjennomgang av varslingsrutinen', kind: 'risikovurdering', status: 'pagar', law: 'trakassering', owner: 'redaktor', due: '2026-11-14' },
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
        owner_member_id:
          t.owner === 'redaktor'
            ? (org.members.find((m) => m.role === 'redaktor')?.memberId ?? null)
            : (ownerMember?.id ?? null),
        due_at: t.due,  // null where the fixture has no deadline (V5-2)
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

  /*
    V5-2 — «Interne notater» (M:0113), one on each half of the Arbeidsliste.

    Two rows, not one, because `hasNotes` renders on a task row AND on a comment
    row and the two go through different halves of `worklist_notes_sel`: the
    task branch is `is_org_member`, the comment branch defers to the comment's
    own policy. A fixture with only a task note would leave the comment branch
    unproven on a bare reset, and Gate 5a3 counts a surface as proven only when
    there was a real row for the policy to refuse.

    The text is deliberately ordinary internal bookkeeping. A note is the one
    place on this screen where a colleague writes freely NEXT TO a respondent's
    words, so the fixture must not model guessing who wrote a comment — a demo
    that shows the habit teaches it.
  */
  const { data: noteTask } = await svc
    .from('tasks')
    .select('id')
    .eq('org_id', org.id)
    .eq('title', 'Revisjon hos leverandør')
    .maybeSingle()
  if (noteTask) {
    const { error: noteError } = await asAdmin.from('worklist_notes').insert({
      task_id: noteTask.id,
      body: 'Avtalt oppstartsmøte med innkjøp i uke 41. Sjekklisten ligger i mappen.',
      author_member_id: ownerMember?.id ?? null,
    })
    if (noteError) throw new Error(`seed worklist_notes(task): ${noteError.message}`)
  }
  if (firstComment) {
    const { error: noteError } = await asAdmin.from('worklist_notes').insert({
      comment_id: firstComment.id,
      body: 'Tatt opp i ledermøtet 10. september. Verneombudet følger opp.',
      author_member_id: ownerMember?.id ?? null,
    })
    if (noteError) throw new Error(`seed worklist_notes(comment): ${noteError.message}`)
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
