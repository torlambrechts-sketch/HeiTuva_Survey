/**
 * Q177 — demo data for an EXISTING organisation, safe to point at production.
 *
 * `scripts/seed-demo.ts` must never be aimed at a real project: its first act
 * is `dropOrg('Nordisk Studio')` and `dropOrg('Annen Bedrift AS')`, it creates
 * three `@nordiskstudio.test` auth users, and it refuses a non-local URL for
 * exactly that reason. This script is the other thing — it ADDS to an
 * organisation that already exists and removes nothing.
 *
 * ── WHY THERE ARE NO INVITATIONS, WHICH IS THE WHOLE SAFETY ARGUMENT ───────
 *
 * Production runs two cron jobs that send real email:
 *
 *     reminders-hourly      7 * * * *   select app.enqueue_reminders()
 *     mail-worker-minutely  * * * * *   select app.run_mail_worker()
 *
 * `app.enqueue_reminders` selects `from survey_invitations where not is_test`
 * with `r.status = 'open'`, `responded_at is null`, `sent_at is not null` and
 * `email is not null`, and `pgmq.send`s each one. **So a demo seeder that
 * created invitations with invented addresses would have the live worker
 * emailing them within the hour.** Not hypothetically — that is the predicate,
 * read from the deployed function.
 *
 * So this script creates NO `survey_invitations` at all. Responses arrive
 * through a SHARE LINK, which is how an anonymous respondent answers anyway:
 * `share_links` carries no address, the sweep cannot see it, and a share token
 * accepts repeated submissions (verified: 12 → 15 responses on one round).
 *
 * It also creates NO `schedules` rows, because `schedules-hourly` runs
 * `app.run_due_schedules()` and that sends too.
 *
 * ── WHAT IT WILL NOT DO ───────────────────────────────────────────────────
 *   · delete or update anything that already exists — every statement is an insert
 *   · create auth users or org_members — task owners are members you already have
 *   · create invitations or schedules — see above
 *   · guess the organisation — `--org <uuid>` is required and must exist
 *   · write at all without `--apply`; the default is a dry run that prints the plan
 *
 * Usage:
 *   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… \
 *     npx tsx scripts/seed-org-demo.ts --org <uuid>            # dry run
 *     npx tsx scripts/seed-org-demo.ts --org <uuid> --apply    # writes
 */
import { randomUUID, createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const list = args.includes('--list')
const orgArg = args.includes('--org') ? args[args.indexOf('--org') + 1] : undefined
const nameArg = args.includes('--org-name') ? args[args.indexOf('--org-name') + 1] : undefined

/*
  Three ways in, and none of them guesses.

  `--list` prints the organisations so the id can be SEEN rather than looked up
  somewhere else; `--org-name` resolves an EXACT name and refuses on zero or
  more than one match, so a near-miss can never silently pick a neighbour;
  `--org` takes the uuid. The point of all three is the same: the organisation
  this writes to is always something the operator said out loud.
*/
if (!list && !orgArg && !nameArg) {
  console.error(
    [
      'Refusing to run: name the organisation explicitly. One of:',
      '  --list                      print the organisations and their ids',
      '  --org-name "Firma AS"       resolve an exact name (refuses if not unique)',
      '  --org <uuid>                the id itself',
      '',
      'Add --apply to write; without it this is a dry run.',
    ].join('\n'),
  )
  process.exit(1)
}
if (orgArg && !/^[0-9a-f-]{36}$/i.test(orgArg)) {
  console.error(`Refusing to run: «${orgArg}» is not a uuid. Use --org-name for a name.`)
  process.exit(1)
}

/**
 * Both are required EXPLICITLY. Falling back to a default URL is how a script
 * meant for one database ends up pointed at another, and this one is expected
 * to be aimed at production on purpose.
 */
const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Refusing to run: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY explicitly.')
  process.exit(1)
}
const svc = createClient<Database>(url, key, { auth: { persistSession: false } })
const anon = createClient<Database>(url, process.env.SUPABASE_ANON_KEY ?? key, {
  auth: { persistSession: false },
})

const hash = (raw: string) => createHash('sha256').update(raw).digest('hex')
const say = (s: string) => console.log(s)
const plan: string[] = []

/**
 * The question shape, taken from the TABLE rather than described again — so a
 * type the column accepts is a type this script can seed, and `as const` does
 * not make the configs deeply readonly (which `Json` refuses).
 */
type SeedQuestion = {
  type: Database['public']['Tables']['survey_questions']['Insert']['type']
  text: string
  config: Database['public']['Tables']['survey_questions']['Insert']['config']
}

/** Every title/key this script owns, so a second run can recognise its own work. */
const PULSE = 'Medarbeiderpuls høst'
const SIGNUP = 'Påmelding til fagdag'
const PACK_PREFIX = 'demo-egen-'

async function main() {
  if (list) {
    const { data, error } = await svc
      .from('organizations')
      .select('id, name, created_at')
      .order('created_at')
    if (error) throw new Error(`listing organisations: ${error.message}`)
    say(`\n  ${new URL(url!).host}\n`)
    for (const o of data ?? []) say(`  ${o.id}  ${o.name}`)
    say(`\n  ${(data ?? []).length} organisation(s). Nothing was written.\n`)
    return
  }

  let orgId = orgArg
  if (!orgId) {
    const { data: matches, error: nameErr } = await svc
      .from('organizations')
      .select('id, name')
      .eq('name', nameArg!)
    if (nameErr) throw new Error(`resolving «${nameArg}»: ${nameErr.message}`)
    if ((matches ?? []).length === 0) {
      throw new Error(`No organisation named exactly «${nameArg}». Run --list to see the names.`)
    }
    if ((matches ?? []).length > 1) {
      throw new Error(
        `«${nameArg}» matches ${matches!.length} organisations — use --org <uuid> to say which.`,
      )
    }
    orgId = matches![0]!.id
  }

  const { data: org, error: orgErr } = await svc
    .from('organizations')
    .select('id, name')
    .eq('id', orgId)
    .maybeSingle()
  if (orgErr) throw new Error(`reading the organisation: ${orgErr.message}`)
  if (!org) throw new Error(`No organisation with id ${orgId} — nothing was written.`)

  const { data: members } = await svc
    .from('org_members')
    .select('id, name, email, role, status')
    .eq('org_id', orgId)
  const active = (members ?? []).filter((m) => m.status === 'active')
  if (active.length === 0) {
    throw new Error('That organisation has no active members, so a task would have no owner.')
  }

  say(`\n  target   ${new URL(url!).host}`)
  say(`  org      ${org.name}  (${org.id})`)
  say(`  members  ${active.length} active — task owners come from these, none are created`)
  say(`  mode     ${apply ? 'APPLY — this writes' : 'DRY RUN — nothing will be written'}\n`)

  const { data: existing } = await svc
    .from('surveys')
    .select('id, title')
    .eq('org_id', orgId)
    .in('title', [PULSE, SIGNUP])
  const have = new Set((existing ?? []).map((s) => s.title))

  // ── the surveys ────────────────────────────────────────────────────────
  const pulseQuestions: SeedQuestion[] = [
    { type: 'smiley', text: 'Hvordan er stemningen i teamet denne måneden?', config: {} },
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
    { type: 'image', text: 'Hvor jobber du best?', config: { options: ['På kontoret', 'Hjemme', 'Blandet'] } },
    {
      type: 'ranking',
      text: 'Ranger godene etter hva som betyr mest for deg',
      config: { options: ['Fleksitid', 'Hjemmekontor', 'Kompetansebudsjett', 'Ekstra fridager'] },
    },
    {
      type: 'matrix',
      text: 'Hvor godt stemmer disse for deg?',
      config: { statements: ['Jeg får tydelige mål', 'Jeg har tid nok', 'Jeg får hjelp når jeg trenger det'] },
    },
    { type: 'enps', text: 'Hvor sannsynlig er det at du vil anbefale oss som arbeidsgiver?', config: {} },
    { type: 'scale', text: 'Hvor godt fungerer samarbeidet på tvers?', config: { points: 5, low_label: '', high_label: '' } },
    { type: 'likert', text: 'Jeg vet hva som forventes av meg', config: {} },
    {
      type: 'choice',
      text: 'Hva vil du ha mer av?',
      config: { options: ['Fagtid', 'Sosialt', 'Opplæring'], multi: false, randomize: false },
    },
    { type: 'yesno', text: 'Har du hatt en samtale om utvikling i høst?', config: {} },
    { type: 'text', text: 'Hva er det viktigste vi kan endre?', config: {} },
  ]

  /*
    `field` collects a name and an address, the registry marks it
    `breaksAnonymity`, and the Builder refuses to call an ANONYMOUS survey ready
    while it carries one. Nothing in the database enforces that, so it goes in
    the named survey — where a sign-up form is what the type is for.
  */
  const signupQuestions: SeedQuestion[] = [
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
  ]

  for (const [title, questions, anonymity, responses] of [
    [PULSE, pulseQuestions, 'anonymous', 7],
    [SIGNUP, signupQuestions, 'named', 5],
  ] as const) {
    if (have.has(title)) {
      say(`  skip     «${title}» already exists in this organisation`)
      continue
    }
    plan.push(`survey «${title}» (${questions.length} questions, ${anonymity}) + ${responses} responses via a share link`)
    if (!apply) continue

    const { data: survey, error: sErr } = await svc
      .from('surveys')
      .insert({
        org_id: orgId,
        title,
        status: 'aktiv',
        anonymity,
        // `audience_label` is the COLUMN; `audience` is only `createSurvey`'s
        // option name, and using it here typed the whole insert as `never`.
        audience_label: anonymity === 'named' ? 'Alle som vil delta' : 'Hele selskapet',
        langs: ['no'],
      })
      .select('id')
      .single()
    if (sErr) throw new Error(`survey «${title}»: ${sErr.message}`)

    const rows = questions.map((q, i) => ({
      survey_id: survey!.id,
      type: q.type,
      text: q.text,
      config: q.config,
      // `position`, not `sort_order` — tsc caught it once the `as never` cast
      // came off, which is the argument against the cast.
      position: i,
    }))
    const { data: qs, error: qErr } = await svc
      .from('survey_questions')
      .insert(rows)
      .select('id, type, text, config')
    if (qErr) throw new Error(`questions for «${title}»: ${qErr.message}`)

    const { data: round, error: rErr } = await svc
      .from('survey_rounds')
      .insert({
        survey_id: survey!.id,
        round_no: 1,
        status: 'open',
        question_snapshot: qs as never,
      })
      .select('id')
      .single()
    if (rErr) throw new Error(`round for «${title}»: ${rErr.message}`)

    // A share link — NOT invitations. See the header.
    const token = `demo-${randomUUID()}`
    const { error: lErr } = await svc
      .from('share_links')
      .insert({ round_id: round!.id, kind: 'link', token_hash: hash(token), active: true })
    if (lErr) throw new Error(`share link for «${title}»: ${lErr.message}`)

    const ids = (qs ?? []).map((q) => q.id)
    const texts = [
      'Vi trenger færre parallelle prosjekter',
      'Mer tid til fagarbeid',
      'Tydeligere prioritering fra ledelsen',
      'Bedre onboarding for nye',
      'Mindre kontekstbytte i uken',
      'Flere faglige samlinger',
      'Raskere beslutninger',
    ]
    for (let i = 0; i < responses; i++) {
      // The value shapes are the ones QuestionInput.tsx emits: smiley/dropdown/
      // image are indices, ranking an ORDER, matrix one number per statement.
      const answers: Record<string, { value: unknown }> =
        title === PULSE
          ? {
              [ids[0]!]: { value: 3 + (i % 3) },
              [ids[1]!]: { value: 20 + i * 9 },
              [ids[2]!]: { value: i % 5 },
              [ids[3]!]: { value: i % 3 },
              [ids[4]!]: { value: [0, 1, 2, 3].map((k) => (k + i) % 4) },
              [ids[5]!]: { value: [3 + (i % 3), 2 + (i % 4), 4 - (i % 3)] },
              [ids[6]!]: { value: [9, 6, 10, 3, 8, 9, 7][i] ?? 8 },
              [ids[7]!]: { value: 3 + (i % 3) },
              [ids[8]!]: { value: 2 + (i % 4) },
              [ids[9]!]: { value: i % 3 },
              [ids[10]!]: { value: i % 2 === 0 },
              [ids[11]!]: { value: texts[i] ?? texts[0]! },
            }
          : {
              [ids[0]!]: {
                value: {
                  Navn: ['Ida Moen', 'Jonas Berg', 'Sara Lind', 'Tom Aas', 'Nora Vik'][i] ?? 'Kari Nordmann',
                  'E-post': `deltaker${i + 1}@example.test`,
                  'Dato du kan': '2026-10-22',
                },
              },
              [ids[1]!]: { value: i % 3 },
            }
      const { data: res, error: subErr } = await anon.rpc('submit_response', {
        p_token: token,
        p_lang: 'no',
        p_answers: answers as never,
        ...(i === 0 && title === PULSE
          ? { p_comments: [{ question_id: null, text: 'Kan vi få flere fagdager til våren?' }] }
          : {}),
      } as never)
      if (subErr) throw new Error(`response ${i + 1} for «${title}»: ${subErr.message}`)
      const payload = (res ?? {}) as { error?: string }
      if (payload.error) throw new Error(`response ${i + 1} for «${title}» refused: ${payload.error}`)
    }
    say(`  made     «${title}» — ${questions.length} questions, ${responses} responses`)
    say(`           share link: /s/${token}`)
  }

  // ── the organisation's own templates ───────────────────────────────────
  const { data: packs } = await svc
    .from('template_packs')
    .select('key')
    .eq('org_id', orgId)
    .like('key', `${PACK_PREFIX}%`)
  if ((packs ?? []).length) {
    say('  skip     own templates already present')
  } else {
    plan.push('2 own template packs (one shared, one private)')
    if (apply) {
      const author = active.find((m) => m.role === 'redaktor') ?? active[0]!
      const { error } = await svc.from('template_packs').insert([
        {
          org_id: orgId,
          key: `${PACK_PREFIX}onboarding-${orgId.slice(0, 8)}`,
          category: 'Ansatte',
          use_case: null,
          title: 'Onboarding uke 1',
          audience: 'Nyansatte',
          private: false,
          author_member_id: author.id,
          questions: [
            { type: 'scale', text: 'Hvor godt forberedt følte du deg første dag?' },
            { type: 'text', text: 'Hva manglet i introduksjonen?' },
          ],
        },
        {
          org_id: orgId,
          key: `${PACK_PREFIX}ledergruppe-${orgId.slice(0, 8)}`,
          category: 'Ansatte',
          use_case: null,
          title: 'Temperaturmåling ledergruppen',
          audience: 'Ledergruppen',
          private: true,
          author_member_id: author.id,
          questions: [{ type: 'likert', text: 'Vi tar beslutninger raskt nok' }],
        },
      ])
      if (error) throw new Error(`template_packs: ${error.message}`)
      say('  made     2 own templates')
    }
  }

  // ── own bank questions ─────────────────────────────────────────────────
  const { data: bank } = await svc.from('question_bank').select('id').eq('org_id', orgId)
  if ((bank ?? []).length) {
    say('  skip     own bank questions already present')
  } else {
    plan.push('2 own bank questions')
    if (apply) {
      const author = active.find((m) => m.role === 'redaktor') ?? active[0]!
      // Every row carries `config`: the column is NOT NULL with a default, and
      // PostgREST unions the keys across a bulk insert, so one row mentioning
      // it makes the others send NULL. That is D173, and it cost weeks.
      const { error } = await svc.from('question_bank').insert([
        { org_id: orgId, text: 'Hva bør vi slutte å gjøre?', type: 'text', category: 'Egne', used_count: 1, config: {}, author_member_id: author.id },
        { org_id: orgId, text: 'Hvilken samling vil du ha mer av?', type: 'choice', category: 'Egne', used_count: 0, config: { options: ['Fagdag', 'Workshop', 'Allmøte'] }, author_member_id: author.id },
      ])
      if (error) throw new Error(`question_bank: ${error.message}`)
      say('  made     2 own bank questions')
    }
  }

  // ── the worklist ───────────────────────────────────────────────────────
  const { data: tasks } = await svc.from('tasks').select('id').eq('org_id', orgId)
  if ((tasks ?? []).length) {
    say(`  skip     ${(tasks ?? []).length} task(s) already in the register`)
  } else {
    plan.push('4 tasks, owners spread across your existing members')
    if (apply) {
      const seed = [
        { title: 'Kartlegge ytringsklima', kind: 'risikovurdering', status: 'foreslatt', due: '2026-11-01' },
        { title: 'Møtefrie torsdager', kind: 'tiltak', status: 'pagar', due: '2026-10-15' },
        { title: 'Oppdatere personvernerklæringen', kind: 'tiltak', status: 'besluttet', due: '2026-10-20' },
        { title: 'Rydde i tilgangene til rapportene', kind: 'tiltak', status: 'foreslatt', due: null },
      ]
      const { error } = await svc.from('tasks').insert(
        seed.map((t, i) => ({
          org_id: orgId,
          title: t.title,
          kind: t.kind,
          // Round-robin across REAL members, so «Eiere» shows more than one
          // chip and «Mine» excludes something.
          owner_member_id: active[i % active.length]!.id,
          due_at: t.due,
          status: t.status,
        })) as never,
      )
      if (error) throw new Error(`tasks: ${error.message}`)
      say('  made     4 tasks')
    }
  }

  if (!apply) {
    say('  would create:')
    for (const p of plan) say(`    · ${p}`)
    say('\n  Nothing was written. Re-run with --apply to write.\n')
    return
  }

  /*
    ── THE POST-CONDITION, MEASURED RATHER THAN TRUSTED ────────────────────
    The safety argument is «this creates nothing the mail crons can see». That
    is a claim about rows, so it is checked against the rows after the fact —
    the same discipline as «an apply is not evidence, a comparison is».
  */
  const { count: invCount } = await svc
    .from('survey_invitations')
    .select('id', { count: 'exact', head: true })
    .in(
      'round_id',
      (
        await svc
          .from('survey_rounds')
          .select('id, surveys!inner(org_id, title)')
          .eq('surveys.org_id', orgId)
          .in('surveys.title', [PULSE, SIGNUP])
      ).data?.map((r) => r.id) ?? ['00000000-0000-0000-0000-000000000000'],
    )
  say(`\n  check    invitations created by this script: ${invCount ?? 0} (must be 0)`)
  if ((invCount ?? 0) > 0) {
    throw new Error('POST-CONDITION FAILED: invitations exist, so the reminder sweep can reach them.')
  }
  say('  check    schedules created by this script: 0 (none are inserted anywhere above)')
  say('\n  Done.\n')
}

main().catch((e) => {
  console.error(`\n  ${e instanceof Error ? e.message : String(e)}\n`)
  process.exit(1)
})
