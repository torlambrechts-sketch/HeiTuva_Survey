/**
 * Seeds the demo content into "HeiTuva AS" — the product owner's own
 * organisation, shared with whatever is already in it.
 *
 * IT DOES NOT CREATE AN ORGANISATION OF ITS OWN, and the reason is in
 * `lib/auth/session.ts`: `readViewer` resolves a person's organisation with
 * `.eq(user_id).eq(status,'active').limit(1).maybeSingle()` and no ORDER BY,
 * and there is no organisation switcher. Somebody active in two organisations
 * lands in an arbitrary one, and which one can change between requests. So the
 * demo moves in with the real content and marks every row it writes with the
 * `DEMO – ` prefix or an `@example.invalid` address — the same strings the
 * purge uses to find them again.
 *
 * This is NOT the fixture seed. `scripts/seed-demo.ts` (Nordisk Studio) stays
 * exactly as it is: it is what the verification harness and CI assert against,
 * and its row shapes are load-bearing. This script exists so a human can sign
 * in and look at a product that has something in it. It is run by hand and by
 * nothing else — never from `verify:all`, never from CI.
 *
 *   npx tsx scripts/seed-heituva-demo.ts --local            # local stack
 *   npx tsx scripts/seed-heituva-demo.ts --local --purge    # remove it again
 *   npx tsx scripts/seed-heituva-demo.ts --dry-run          # counts only
 *
 * ---------------------------------------------------------------------------
 * THE TWO RULES THIS FILE IS BUILT AROUND
 * ---------------------------------------------------------------------------
 * 1. NO MAIL MAY LEAVE THE SYSTEM. Every address except the one administrator
 *    is `@example.invalid`, a TLD RFC 6761 guarantees can never resolve. The
 *    send worker is never started, and the queue messages this seed causes are
 *    read and deleted through the same three-verb outbox API the worker uses —
 *    so even someone who later runs `npm run mail:worker` finds nothing of the
 *    demo's to send. `survey_invitations.sent_at` is left NULL, which is what
 *    `app.enqueue_reminders` keys off, so the hourly reminder job will never
 *    pick these invitations up either.
 *
 * 2. DATA ARRIVES THROUGH THE REAL PRODUCERS. Responses go through
 *    `rpc.submit_response`, which is the only write path to `responses` and the
 *    only one the anonymity CHECK is written against — a direct insert could
 *    manufacture a linked anonymous row the RPC would have refused, and the
 *    demo would then be evidence of a property the product does not have.
 *    Rounds, invitations and schedules come from `send_round`; snapshots from
 *    `close_round`; duty archive versions from `sign_duty` + `publish_duty`.
 *    Where a table genuinely has no producer yet (dsr_requests) the row is
 *    written as the signed-in administrator and marked SYNTHETIC in a field a
 *    human reads.
 *
 * A few writes are made with the service role because no member client can make
 * them, and each says why at the call site: the organisation itself (there is no
 * INSERT policy on `organizations` — a real org is born at signup), the seed
 * operator's own membership, and the real administrator's pins and working
 * layout (both are keyed `user_id = auth.uid()`, and this script does not hold
 * that person's session).
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import type { Database } from '../types/database'
import { LOCAL_SUPABASE } from './verify/local-env'

// ---------------------------------------------------------------------------
// Who and what
// ---------------------------------------------------------------------------

/**
 * The demo lives INSIDE the real organisation, not beside it.
 *
 * It used to build its own "HeiTuva AS (DEMO)" org, and that was wrong for a
 * reason the schema makes plain: `readViewer` picks a member's organisation
 * with `.eq(user_id).eq(status,'active').limit(1).maybeSingle()` and NO ORDER BY
 * (lib/auth/session.ts), and there is no organisation switcher. A person active
 * in two organisations lands in an arbitrary one, and which one can change
 * between requests. A demo you cannot reliably reach is not a demo.
 *
 * Adopted if it already exists, created if it does not, so the same script
 * works against a local stack and against the real project.
 */
const ORG_NAME = 'HeiTuva AS'

/**
 * What marks the demo now that the organisation name cannot.
 *
 * The brief asked for a marker "in the organisation name or a visible field so
 * nobody mistakes it for a customer in a list". Sharing the real organisation
 * spends the first option, so the marker moves to every row a human reads: the
 * survey titles on Undersøkelser, the report titles on Rapporter, the group
 * names down the heatmap, the library template, the shared dashboard preset.
 *
 * It is also the purge key. That is deliberate: a marker a person can see and a
 * marker the cleanup can find should be the same string, or one of them drifts.
 */
const DEMO = 'DEMO – '

/** The only deliverable address anywhere in this seed. */
const REAL_ADMIN_EMAIL = 'tor.lambrechts@gmail.com'
const REAL_ADMIN_NAME = 'Tor Lambrechts'

/**
 * The synthetic administrator the script acts as.
 *
 * Almost everything here has to be done by a signed-in member: `send_round`,
 * `close_round`, `sign_duty` and `publish_duty` all check `auth.uid()` against
 * the organisation, and `sign_duty` in particular refuses anyone but the
 * assigned signer. The real administrator's password is not ours to hold, so
 * the seed creates its own operator, does the work as them, and leaves the
 * human's membership alone.
 */
const OPERATOR_EMAIL = 'demo.operator@example.invalid'
const OPERATOR_NAME = 'Demo Operatør (SYNTETISK)'
const OPERATOR_PASSWORD = process.env.HEITUVA_DEMO_PASSWORD ?? 'heituva-demo-password-1!'

/** Every synthetic address is on this domain. Nothing here can be delivered. */
const SYNTHETIC_DOMAIN = 'example.invalid'

type Client = SupabaseClient<Database>

// ---------------------------------------------------------------------------
// People — synthetic, Norwegian-looking, undeliverable
// ---------------------------------------------------------------------------

type GroupSpec = { name: string; members: string[] }

/**
 * Six teams. Five are comfortably above the k threshold; "Ledergruppen" has
 * four people on purpose.
 *
 * A group of four is the only way a screen can show what the threshold is FOR.
 * With every group above it, the heatmap photographs a happy path and the "—"
 * treatment never renders — which is how a broken gate ships unnoticed.
 */
const GROUPS: GroupSpec[] = [
  {
    name: 'Produkt',
    members: [
      'Sigrid Aalberg', 'Henrik Dalgard', 'Maja Fredriksen', 'Oskar Lind',
      'Ingrid Vetle', 'Kasper Rønning', 'Live Sandnes', 'Aksel Bjørge',
      'Nora Haugland', 'Emil Storaker', 'Tuva Kildal', 'Jonas Brekke',
    ],
  },
  {
    name: 'Kundeservice',
    members: [
      'Amalie Furuseth', 'Sander Kvamme', 'Thea Lundgren', 'Mathias Grønvold',
      'Selma Ryland', 'Elias Tofte', 'Hedda Wiik', 'Filip Nordstrand',
      'Vilde Aasen', 'Isak Mjelde', 'Frida Solheimen', 'Theodor Rustad',
      'Alma Bergerud', 'Noah Kjelland',
    ],
  },
  {
    name: 'Salg og marked',
    members: [
      'Mari Ekeland', 'Sondre Vangen', 'Julie Rimestad', 'Adrian Holtan',
      'Sofie Grimsrud', 'Markus Trydal', 'Leah Onsrud', 'Ulrik Fagerheim',
      'Ada Slettemark',
    ],
  },
  {
    name: 'Teknologi',
    members: [
      'Jakob Melby', 'Sara Vollan', 'Odin Brattlie', 'Iben Krogstad',
      'Herman Sylte', 'Amanda Røsvik', 'Kristian Aunevik', 'Ella Bråten',
      'Magnus Dyrhaug', 'Oda Ringstad', 'Vetle Hovden',
    ],
  },
  {
    name: 'Økonomi og HR',
    members: [
      'Ane Gullhaug', 'Sindre Kolstad', 'Marte Veum', 'Simen Aarvik',
      'Kaja Nordbø', 'Erlend Tveita', 'Guro Skjelbred', 'Håkon Myklebust',
    ],
  },
  {
    // Four. Deliberately below k=5, so every cell of this row is suppressed and
    // the design's "—" treatment is reachable from the seeded data.
    name: 'Ledergruppen',
    members: ['Kristin Vedvik', 'Are Fossheim', 'Benedikte Løvaas', 'Trond Askeland'],
  },
]

/**
 * The suppliers answering the Åpenhetslov survey.
 *
 * `respondent_kind = 'organisation'`, so these are named on purpose: the
 * attributed register exists precisely because a supplier answering a due
 * diligence questionnaire was never promised anonymity. Company names are
 * invented; the addresses are undeliverable like every other one here.
 */
const SUPPLIERS = [
  'Nordvest Tekstil AS', 'Fjordfrakt Logistikk AS', 'Bergen Komponent AS',
  'Sunnmøre Emballasje AS', 'Trondheim Renhold AS', 'Vestland Elektro AS',
  'Innlandet Trevare AS', 'Sørlandet Plast AS', 'Finnmark Marine AS',
  'Romsdal Metallverk AS',
]

/** Which suppliers answered, and which of them reported a breach. */
const SUPPLIERS_ANSWERED = 6
const SUPPLIER_WITH_BREACH = 'Sunnmøre Emballasje AS'

// ---------------------------------------------------------------------------
// Deterministic noise
// ---------------------------------------------------------------------------

/**
 * A seeded LCG, so two runs of this script produce the same demo.
 *
 * `Math.random()` would make every re-seed a slightly different screenshot and
 * every "did this change?" question unanswerable.
 */
function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0x1_0000_0000
  }
}

/** `Sigrid Aalberg` -> `sigrid.aalberg@example.invalid`. */
function emailFor(name: string, taken: Set<string>): string {
  const slug = name
    .toLowerCase()
    .replace(/æ/g, 'ae').replace(/ø/g, 'oe').replace(/å/g, 'aa')
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
  let candidate = `${slug}@${SYNTHETIC_DOMAIN}`
  let n = 2
  while (taken.has(candidate)) candidate = `${slug}${n++}@${SYNTHETIC_DOMAIN}`
  taken.add(candidate)
  return candidate
}

// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2)
const useLocal = argv.includes('--local')
const purgeOnly = argv.includes('--purge')
const dryRun = argv.includes('--dry-run')

if (!useLocal) config({ path: '.env.local' })

const URL = useLocal
  ? LOCAL_SUPABASE.NEXT_PUBLIC_SUPABASE_URL
  : process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON = useLocal
  ? LOCAL_SUPABASE.NEXT_PUBLIC_SUPABASE_ANON_KEY
  : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE = useLocal
  ? LOCAL_SUPABASE.SUPABASE_SERVICE_ROLE_KEY
  : process.env.SUPABASE_SERVICE_ROLE_KEY

const isLocalTarget = !!URL && (URL.includes('127.0.0.1') || URL.includes('localhost'))

const svc = () => createClient<Database>(URL!, SERVICE!, { auth: { persistSession: false } })
const anon = () => createClient<Database>(URL!, ANON!, { auth: { persistSession: false } })

/** A real signed-in session for the seed operator: a genuine JWT, so every RPC
 *  and every policy sees exactly what it would see for a person in a browser. */
async function operatorClient(): Promise<Client> {
  const c = createClient<Database>(URL!, ANON!, { auth: { persistSession: false } })
  const { error } = await c.auth.signInWithPassword({
    email: OPERATOR_EMAIL,
    password: OPERATOR_PASSWORD,
  })
  if (error) throw new Error(`sign in as ${OPERATOR_EMAIL}: ${error.message}`)
  return c
}

/**
 * Throws on a Supabase error rather than letting a seed carry on half-built,
 * and on a missing row, which is the same failure wearing a different hat: a
 * read that returned nothing is a fixture that was never built.
 */
function ok<T>(what: string, res: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (res.error) throw new Error(`${what}: ${res.error.message}`)
  if (res.data === null || res.data === undefined) throw new Error(`${what}: no rows returned`)
  return res.data as NonNullable<T>
}

/** For a write whose result is not read back — only the error matters. */
function done(what: string, res: { error: { message: string } | null }): void {
  if (res.error) throw new Error(`${what}: ${res.error.message}`)
}

/** RPCs return their refusals in the payload, not as a transport error. */
function rpcOk(what: string, data: unknown): Record<string, unknown> {
  const payload = (data ?? {}) as Record<string, unknown>
  if (payload.error) throw new Error(`${what} refused: ${String(payload.error)}`)
  return payload
}

// ---------------------------------------------------------------------------
// The mail queue — drained, never delivered
// ---------------------------------------------------------------------------

type QueuedMail = { email: string; token: string; roundId: string }

/**
 * Takes this organisation's messages out of `mail_outbox` and deletes them.
 *
 * `send_round` mints the raw invitation tokens inside Postgres and does NOT
 * return them — by design, so they exist in no HTTP response. The only
 * legitimate consumer is the mail worker, which reads them off the queue. This
 * function is that worker with the send removed: it takes the token so the
 * demo's respondents can answer, and deletes the message so nobody can ever
 * post it. Messages belonging to another organisation are left alone; their
 * lease expires and they return to the queue untouched.
 */
async function drainOutbox(orgId: string, expected: number): Promise<QueuedMail[]> {
  // The outbox API is granted to `service_role` alone — the raw invitation
  // tokens live in these messages, and no browser session may reach them. That
  // grant IS the worker's identity, so this is the one place the seed borrows
  // it, and it borrows it to delete mail rather than to send any.
  const s = svc()
  const found: QueuedMail[] = []
  // Bounded: a queue holding another org's backlog must not spin here forever.
  for (let pass = 0; pass < 40 && found.length < expected; pass++) {
    const batch = ok(
      'mail_outbox_read',
      await s.rpc('mail_outbox_read', { p_batch: 100, p_visibility: 5 }),
    ) as { msg_id: number; message: Record<string, unknown> }[]
    if (!batch.length) break
    for (const row of batch) {
      if (row.message?.org_id !== orgId) continue
      found.push({
        email: String(row.message.email ?? ''),
        token: String(row.message.token ?? ''),
        roundId: String(row.message.round_id ?? ''),
      })
      done('mail_outbox_delete', await s.rpc('mail_outbox_delete', { p_msg_id: row.msg_id }))
    }
  }
  if (found.length < expected) {
    throw new Error(
      `mail queue held ${found.length} of ${expected} expected messages for this org — ` +
        `refusing to continue, because the missing tokens would leave invitations that can ` +
        `never be answered and messages that could still be sent.`,
    )
  }
  return found
}

// ---------------------------------------------------------------------------
// Purge
// ---------------------------------------------------------------------------

/**
 * Removes the demo content from the shared organisation.
 *
 * This used to be one statement — delete the organisation, let the cascade do
 * the rest. Sharing the real organisation takes that away: the org row, the
 * human's membership and the four surveys that were already there must all
 * survive, so the cleanup has to find exactly its own rows instead of trusting
 * a foreign key to know what belongs to it.
 *
 * Two rules make that safe rather than clever:
 *
 *   1. EVERY seeded row is findable by something the seed itself wrote — the
 *      `DEMO – ` title prefix, an `@example.invalid` address, or the synthetic
 *      operator's id. Nothing is deleted by position, by recency, or by "all
 *      rows in this table".
 *   2. Where a row carries no marker of its own (a `duties` row has no title —
 *      the duties are registry-driven and the same for every employer) the
 *      cleanup REFUSES rather than guesses, and says which row it refused.
 *
 * Afterwards it re-counts what it promised not to touch and throws if the
 * number moved. A cleanup inside somebody's real organisation should not be
 * taken on trust, including from itself.
 */
async function purge(s: Client): Promise<void> {
  const org = (ok('lookup org', await s.from('organizations').select('id').eq('name', ORG_NAME)))[0]
  if (!org) return

  // What must survive, counted before anything is deleted.
  const survivors = async () => ({
    members: (await s.from('org_members').select('*', { count: 'exact', head: true })
      .eq('org_id', org.id).not('email', 'like', `%@${SYNTHETIC_DOMAIN}`)).count ?? 0,
    surveys: (await s.from('surveys').select('*', { count: 'exact', head: true })
      .eq('org_id', org.id).not('title', 'like', `${DEMO}%`)).count ?? 0,
    reports: (await s.from('reports').select('*', { count: 'exact', head: true })
      .eq('org_id', org.id).not('title', 'like', `${DEMO}%`)).count ?? 0,
    groups: (await s.from('groups').select('*', { count: 'exact', head: true })
      .eq('org_id', org.id).not('name', 'like', `${DEMO}%`)).count ?? 0,
  })
  const before = await survivors()

  // Queued mail for this organisation. The queue holds no foreign key, so
  // nothing cascades here — and a message left behind is an invitation into a
  // survey that is about to stop existing.
  for (let pass = 0; pass < 40; pass++) {
    const batch = ok(
      'mail_outbox_read',
      await s.rpc('mail_outbox_read', { p_batch: 100, p_visibility: 5 }),
    ) as { msg_id: number; message: Record<string, unknown> }[]
    if (!batch.length) break
    let mine = 0
    for (const row of batch) {
      if (row.message?.org_id !== org.id) continue
      mine++
      done('mail_outbox_delete', await s.rpc('mail_outbox_delete', { p_msg_id: row.msg_id }))
    }
    if (mine === 0) break
  }

  const synthetic = ok('synthetic members', await s.from('org_members')
    .select('id, user_id, email').eq('org_id', org.id).like('email', `%@${SYNTHETIC_DOMAIN}`))
  const syntheticIds = new Set(synthetic.map((m) => m.id))
  const operator = synthetic.find((m) => m.email === OPERATOR_EMAIL)

  // Duties: the one table whose rows carry no marker. A duty is the seed's only
  // if every trace of activity on it — owner, ticked checks, assigned signers,
  // published versions — belongs to a synthetic member. One real signature and
  // it is somebody's statutory record, not ours to delete.
  const duties = ok('duties', await s.from('duties')
    .select('id, definition_key, owner_member_id').eq('org_id', org.id))
  const refused: string[] = []
  for (const duty of duties) {
    const actors: (string | null)[] = [duty.owner_member_id]
    for (const row of ok('duty checks', await s.from('duty_checks')
      .select('done_by').eq('duty_id', duty.id).not('done_by', 'is', null))) actors.push(row.done_by)
    for (const row of ok('duty signers', await s.from('duty_signers')
      .select('member_id').eq('duty_id', duty.id).not('member_id', 'is', null))) actors.push(row.member_id)
    for (const row of ok('duty versions', await s.from('duty_versions')
      .select('archived_by').eq('duty_id', duty.id).not('archived_by', 'is', null))) actors.push(row.archived_by)

    const named = actors.filter((id): id is string => id !== null)
    // No named actor at all means an untouched card the seed did not create.
    if (!named.length || !named.every((id) => syntheticIds.has(id))) {
      refused.push(duty.definition_key)
      continue
    }
    // The archive goes with the duty: `duty_versions` is append-only, and D50
    // wrote the cascade exemption that lets the parent delete take it along.
    done(`purge duty ${duty.definition_key}`, await s.from('duties').delete().eq('id', duty.id))
  }

  // Everything else, by the marker it was written with. Surveys cascade to
  // rounds, invitations, responses, answers, snapshots, schedules and editors.
  done('purge reports', await s.from('reports').delete()
    .eq('org_id', org.id).like('title', `${DEMO}%`))
  done('purge surveys', await s.from('surveys').delete()
    .eq('org_id', org.id).like('title', `${DEMO}%`))
  done('purge template packs', await s.from('template_packs').delete()
    .eq('org_id', org.id).like('title', `${DEMO}%`))
  done('purge loop actions', await s.from('loop_actions').delete()
    .eq('org_id', org.id).like('text', `${DEMO}%`))
  done('purge dsr', await s.from('dsr_requests').delete()
    .eq('org_id', org.id).like('subject_email', `%@${SYNTHETIC_DOMAIN}`))
  done('purge shared presets', await s.from('dashboard_layouts').delete()
    .eq('org_id', org.id).is('user_id', null).like('title', `${DEMO}%`))
  if (operator?.user_id) {
    done('purge operator layouts', await s.from('dashboard_layouts').delete()
      .eq('org_id', org.id).eq('user_id', operator.user_id))
    done('purge operator pins', await s.from('dashboard_pins').delete()
      .eq('org_id', org.id).eq('user_id', operator.user_id))
  }
  done('purge synthetic members', await s.from('org_members').delete()
    .eq('org_id', org.id).like('email', `%@${SYNTHETIC_DOMAIN}`))
  // Groups last: `org_members.group_id` is ON DELETE SET NULL, so a group
  // dropped while a real person still sits in it would silently unfile them.
  for (const g of ok('demo groups', await s.from('groups')
    .select('id, name').eq('org_id', org.id).like('name', `${DEMO}%`))) {
    const { count } = await s.from('org_members').select('*', { count: 'exact', head: true })
      .eq('group_id', g.id)
    if ((count ?? 0) > 0) {
      refused.push(`group ${g.name} (still has members)`)
      continue
    }
    done(`purge group ${g.name}`, await s.from('groups').delete().eq('id', g.id))
  }

  const operatorUser = await findAuthUser(s, OPERATOR_EMAIL)
  if (operatorUser) {
    const { error } = await s.auth.admin.deleteUser(operatorUser)
    if (error) throw new Error(`purge operator user: ${error.message}`)
  }

  const after = await survivors()
  for (const [what, n] of Object.entries(before)) {
    const now = after[what as keyof typeof after]
    if (now !== n) {
      throw new Error(
        `purge removed something it does not own: ${what} went ${n} -> ${now}. ` +
          `The organisation is shared with real content — inspect before running again.`,
      )
    }
  }
  if (refused.length) {
    console.log(`\n  Left alone (not attributable to the seed): ${refused.join(', ')}`)
  }
}

/** Finds an auth user by address, paging — `listUsers()` returns page one only,
 *  and a stack with more than a page of users silently stops finding people. */
async function findAuthUser(s: Client, email: string): Promise<string | null> {
  const perPage = 200
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await s.auth.admin.listUsers({ page, perPage })
    if (error) throw new Error(`listUsers(${email}): ${error.message}`)
    const hit = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
    if (hit) return hit.id
    if (data.users.length < perPage) break
  }
  return null
}

// ---------------------------------------------------------------------------
// Answer generation
// ---------------------------------------------------------------------------

/** Where each team sits on a 1–5 scale, before the per-round drift. */
const TONE: Record<string, number> = {
  Produkt: 3.9,
  Kundeservice: 3.1,
  'Salg og marked': 4.1,
  Teknologi: 3.6,
  'Økonomi og HR': 4.3,
  Ledergruppen: 4.0,
}

/** Successive rounds improve slightly, so the trend line has a direction. */
const DRIFT = [0, 0.2, 0.35, 0.5]

/**
 * What each team writes in the free-text box.
 *
 * Written to match the seeded `theme_rules` patterns (tid|fokus|kalender,
 * møte, verktøy, prioriter, prosess|leveranse, samarbeid|team|design), because
 * a themes panel with nothing in it says nothing about whether themes work.
 * Each team's pool is on one theme, so contributors accumulate per theme rather
 * than scattering below the k gate.
 */
const FREE_TEXT: Record<string, string[]> = {
  Produkt: [
    'Vi trenger mer sammenhengende tid til dypt arbeid',
    'For lite tid mellom leveransene til å tenke',
    'Kalenderen er så oppstykket at fokus blir umulig',
    'Mer tid til fagarbeid, mindre kontekstbytte',
    'Vi mangler tid i kalenderen til å planlegge ordentlig',
    'Tid er den største flaskehalsen akkurat nå',
    'Fokusblokker i kalenderen ville hjulpet mest',
  ],
  Kundeservice: [
    'For mange møter — møtekulturen må endres',
    'Møtene spiser opp hele dagen',
    'Færre og kortere møter, takk',
    'Vi bruker for mye av uka i møter uten agenda',
    'Halvparten av møtene kunne vært en melding',
    'Møter legges rett oppå vaktskiftet',
    'Ukentlige møter uten beslutninger tar motet fra folk',
  ],
  'Salg og marked': [
    'Uklar prioritering mellom kampanjene',
    'Vi prioriterer om hver uke og rekker aldri noe ferdig',
    'Trenger tydeligere prioritering fra ledelsen',
    'For mange parallelle prioriteringer',
    'Når alt prioriteres høyest er ingenting prioritert',
    'Prioriteringene endres raskere enn vi rekker å levere',
  ],
  Teknologi: [
    'Verktøyene våre henger ikke sammen',
    'Vi bytter verktøy for ofte',
    'Utstyret og verktøyene er trege om morgenen',
    'Bedre verktøy for feilsøking ville spart mye',
    'Verktøykjeden krever for mye manuelt arbeid',
    'Vi mangler verktøy for å teste før leveranse',
  ],
  'Økonomi og HR': [
    'Prosessene rundt attestering tar for lang tid',
    'Uklar prosess når en leveranse endrer seg',
    'Vi mangler en prosess for avvik',
    'Månedsavslutningen er en prosess ingen eier',
    'Leveransene fra andre team kommer uten forvarsel',
    'Prosessen for nyansatte er ikke skrevet ned',
  ],
  Ledergruppen: [
    'Samarbeidet på tvers av team kunne vært bedre',
    'Vi må bli bedre på samarbeid mellom produkt og salg',
  ],
}

type SeedQuestion = { id: string; type: string; config: Record<string, unknown> }
type AnswerEntry = { value: number | string | boolean | number[]; comment?: string }

/**
 * One person's answers to one round.
 *
 * The scale answers carry the team's tone plus the round's drift plus a little
 * deterministic noise, so the heatmap has real variation between teams and the
 * trend has a direction. Everything else follows from the question's own type.
 */
function answersFor(
  questions: SeedQuestion[],
  group: string,
  round: number,
  who: number,
  rand: () => number,
): Record<string, AnswerEntry> {
  const base = (TONE[group] ?? 3.5) + (DRIFT[round - 1] ?? 0.5)
  const out: Record<string, AnswerEntry> = {}
  for (const q of questions) {
    switch (q.type) {
      case 'scale':
      case 'likert':
      case 'smiley': {
        const raw = base + (rand() - 0.5) * 1.6
        out[q.id] = { value: Math.min(5, Math.max(1, Math.round(raw))) }
        break
      }
      case 'enps': {
        const raw = (base / 5) * 10 + (rand() - 0.5) * 3
        out[q.id] = { value: Math.min(10, Math.max(0, Math.round(raw))) }
        break
      }
      case 'slider': {
        out[q.id] = { value: Math.round((base / 5) * 100) }
        break
      }
      case 'yesno': {
        out[q.id] = { value: rand() > 0.75 }
        break
      }
      case 'choice': {
        // The stored value is the option INDEX, which is what the respondent UI
        // sends — a label here would be a different shape from every real answer.
        const options = Array.isArray(q.config.options) ? (q.config.options as string[]) : []
        if (!options.length) break
        out[q.id] = { value: Math.min(options.length - 1, Math.floor(rand() * options.length)) }
        break
      }
      case 'text': {
        const pool = FREE_TEXT[group] ?? []
        if (!pool.length) break
        out[q.id] = { value: pool[(who + round) % pool.length]! }
        break
      }
      default:
        break
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

type PackQuestion = { text: string; type: string; options?: string[]; help?: string; required?: boolean }

/**
 * A draft survey from a standard template pack, exactly as "Bruk mal" builds
 * one: the pack's questions are COPIED, and `template_pack_key` keeps the
 * provenance — which is also what links a survey to its statutory duty and what
 * `apply_pack_policy` reads to lock anonymity and threshold on the statutory
 * packs.
 */
async function surveyFromPack(
  s: Client,
  orgId: string,
  memberId: string,
  packKey: string,
  title: string,
): Promise<{ id: string; questions: SeedQuestion[] }> {
  const pack = ok(
    `read pack ${packKey}`,
    await s.from('template_packs').select('key, title, audience, questions')
      .is('org_id', null).eq('key', packKey).single(),
  )

  // Prefixed here rather than at each call site, so a survey added later cannot
  // arrive unmarked — and so the purge key and the thing a human reads on
  // Undersøkelser are produced by the same line.
  const survey = ok(
    `create survey ${title}`,
    await s.from('surveys').insert({
      org_id: orgId,
      title: `${DEMO}${title}`,
      audience_label: pack.audience,
      template_pack_key: pack.key,
      created_by: memberId,
    }).select('id').single(),
  )

  const packQuestions = (pack.questions ?? []) as PackQuestion[]
  ok(
    `create questions for ${title}`,
    await s.from('survey_questions').insert(
      packQuestions.map((q, i) => ({
        survey_id: survey.id,
        position: i,
        type: q.type as never,
        text: q.text,
        help: q.help ?? null,
        required: q.required ?? false,
        config: (q.options ? { options: q.options } : {}) as never,
      })),
    ).select('id'),
  )

  const rows = ok(
    `read questions for ${title}`,
    await s.from('survey_questions').select('id, type, config').eq('survey_id', survey.id)
      .order('position'),
  )
  return {
    id: survey.id,
    questions: rows.map((r) => ({
      id: r.id,
      type: r.type as string,
      config: (r.config ?? {}) as Record<string, unknown>,
    })),
  }
}

/**
 * Sends a round to whole groups and answers it as the invited people.
 *
 * `send_round` is the producer for the round, its invitations and (when a
 * cadence is asked for) its schedule. It does not return the raw tokens — they
 * go straight into the mail queue — so the tokens are taken back off that queue
 * and the messages deleted, and each token is then spent through
 * `submit_response`, the only write path to `responses`.
 */
async function sendAndAnswer(
  s: Client,
  orgId: string,
  survey: { id: string; questions: SeedQuestion[] },
  opts: {
    groupIds: { id: string; name: string; size: number }[]
    round: number
    /** Fraction of each group's invitations that answer, per group name. */
    responseRate: (group: string) => number
    cadence?: 'once' | 'weekly' | 'monthly'
    runs?: number
    channels?: string[]
    seed: number
  },
): Promise<{ roundId: string; responses: number; shareToken: string | null }> {
  const invited = opts.groupIds.reduce((n, g) => n + g.size, 0)

  const sent = rpcOk(
    `send_round(${survey.id}, round ${opts.round})`,
    ok(
      'send_round',
      await s.rpc('send_round', {
        p_survey: survey.id,
        p_channels: opts.channels ?? ['email'],
        p_recipients: [],
        p_group_ids: opts.groupIds.map((g) => g.id),
        p_cadence: opts.cadence ?? 'once',
        p_runs: opts.runs ?? 1,
      }),
    ),
  )
  const roundId = String(sent.round_id)
  const shareToken = sent.share_token ? String(sent.share_token) : null

  const queued = await drainOutbox(orgId, invited)

  // The invitations carry the group; the queue message carries only the
  // address, so the two are matched here to decide what each person writes.
  const invitations = ok(
    'read invitations',
    await s.from('survey_invitations').select('email, group_id').eq('round_id', roundId),
  )
  const groupOf = new Map<string, string>()
  for (const inv of invitations) {
    const name = opts.groupIds.find((g) => g.id === inv.group_id)?.name
    // `email` is nullable since the SMS channel landed; every invitation this
    // seed makes is an email one, so a null here means something else made it.
    if (name && inv.email) groupOf.set(inv.email, name)
  }

  const rand = rng(opts.seed)
  const respondent = anon()
  const byGroup = new Map<string, number>()
  let responses = 0

  // Sorted by address before anyone answers. The queue hands messages back in
  // whatever order it holds them, and `send_round` selects group members with
  // no ORDER BY — so without this the seeded LCG would be consumed in a
  // different order on a different run and the "deterministic" demo would drift
  // between re-seeds while still reporting the same totals.
  for (const mail of [...queued].sort((a, b) => a.email.localeCompare(b.email))) {
    const group = groupOf.get(mail.email)
    if (!group) continue
    const seen = byGroup.get(group) ?? 0
    byGroup.set(group, seen + 1)
    const size = opts.groupIds.find((g) => g.name === group)?.size ?? 1
    // A deterministic slice of each group answers, so the response rate is the
    // same on every run rather than a coin toss per person.
    if (seen >= Math.round(size * opts.responseRate(group))) continue

    const payload = answersFor(survey.questions, group, opts.round, seen, rand)
    const result = rpcOk(
      `submit_response(${group} #${seen})`,
      ok('submit_response', await respondent.rpc('submit_response', {
        p_token: mail.token,
        p_lang: 'no',
        p_answers: payload as never,
      })),
    )
    if (result.ok) responses++
  }

  return { roundId, responses, shareToken }
}

// ---------------------------------------------------------------------------
// The seed
// ---------------------------------------------------------------------------

/**
 * What a run creates. Printed by --dry-run BEFORE anything is written, so the
 * question "what would this put in my project?" can be answered without
 * pointing it at the project.
 *
 * These are the counts a run against an empty target actually produced, not
 * estimates: the response rates are deterministic and the group sizes are
 * fixed, so the only number that moves is `dashboard_pins`, which doubles if
 * the administrator's auth user already exists (they get their own four).
 */
const PLAN = [
  ['groups', GROUPS.length],
  ['org_members (synthetic)', GROUPS.reduce((n, g) => n + g.members.length, 0) + 1],
  ['auth.users (synthetic operator)', 1],
  ['surveys', 5],
  ['survey_rounds', 8],
  ['survey_invitations', 262],
  ['responses (via submit_response)', 183],
  ['schedules', 2],
  ['result_snapshots', 6],
  ['duties', 4],
  ['reports', 3],
  ['duty_versions', 1],
  ['template_packs (org-scoped)', 1],
  ['dashboard_pins', 4],
  ['dashboard_layouts', 2],
  ['dsr_requests', 2],
  ['loop_actions', 2],
] as const

async function seed(): Promise<void> {
  const s = svc()

  // Idempotence is a purge followed by a build. Anything else accumulates: a
  // second run would double the members and no screen would be readable.
  await purge(s)

  // --- the organisation ---------------------------------------------------
  // ADOPTED if it exists, created only if it does not. The real project already
  // has this organisation with the human in it, and standing up a second one is
  // the mistake this script used to make.
  //
  // Nothing about an adopted organisation is edited — not its name, not its
  // contact fields, not its threshold. Those are the customer's settings, and a
  // seed that "tidies" them has changed something nobody asked it to. The demo
  // marks the rows it creates instead.
  const existingOrg = (ok('lookup org',
    await s.from('organizations').select('id').eq('name', ORG_NAME)))[0]
  const org = existingOrg ?? ok(
    // Service role by necessity: `organizations` has no INSERT policy, because
    // a real organisation is created at signup by the platform, not by a member.
    'create org',
    await s.from('organizations').insert({
      name: ORG_NAME,
      contact_name: REAL_ADMIN_NAME,
      contact_email: REAL_ADMIN_EMAIL,
      // orgnr is left NULL on purpose: an invented organisation number is
      // indistinguishable from a real one on screen and in an export.
      default_lang: 'no',
      active_langs: ['no', 'en'],
      default_k_threshold: 5,
    }).select('id').single(),
  )

  // --- the seed operator --------------------------------------------------
  const existingOperator = await findAuthUser(s, OPERATOR_EMAIL)
  let operatorUser = existingOperator
  if (!operatorUser) {
    const created = await s.auth.admin.createUser({
      email: OPERATOR_EMAIL,
      password: OPERATOR_PASSWORD,
      email_confirm: true,
    })
    if (created.error || !created.data.user) {
      throw new Error(`create operator user: ${created.error?.message ?? 'no user returned'}`)
    }
    operatorUser = created.data.user.id
  }

  // Service role again: the first administrator of an organisation cannot be
  // added by a member, because there is no member yet to have the role.
  const operatorMember = ok(
    'create operator membership',
    await s.from('org_members').insert({
      org_id: org.id,
      user_id: operatorUser,
      email: OPERATOR_EMAIL,
      name: OPERATOR_NAME,
      role: 'administrator',
      status: 'active',
    }).select('id').single(),
  )
  done('operator profile', await s.from('profiles').upsert({
    user_id: operatorUser, display_name: OPERATOR_NAME, lang: 'no',
  }))

  // --- the real administrator --------------------------------------------
  // Attached if the address already has an auth user; otherwise left INVITED,
  // which is a first-class state: `claim_membership` binds the row to the user
  // on their first sign-in, so nothing has to be clicked in Supabase.
  // Their membership is adopted too when it already exists. Re-inserting would
  // collide with `org_members_org_id_email_key`, and overwriting would reset a
  // role or a group somebody had set.
  const realUser = await findAuthUser(s, REAL_ADMIN_EMAIL)
  const existingAdmin = (ok('lookup administrator', await s.from('org_members')
    .select('id, status').eq('org_id', org.id).eq('email', REAL_ADMIN_EMAIL)))[0]
  if (!existingAdmin) {
    ok(
      'invite real administrator',
      await s.from('org_members').insert({
        org_id: org.id,
        user_id: realUser,
        email: REAL_ADMIN_EMAIL,
        name: REAL_ADMIN_NAME,
        role: 'administrator',
        status: realUser ? 'active' : 'invited',
        invited_by: operatorMember.id,
      }).select('id').single(),
    )
  }

  // Everything from here runs as a signed-in administrator, so each write goes
  // past the same RLS policy a person's browser would.
  const as = await operatorClient()

  // --- teams and people ---------------------------------------------------
  const taken = new Set<string>([OPERATOR_EMAIL, REAL_ADMIN_EMAIL])
  const groups: { id: string; name: string; size: number }[] = []

  for (const spec of GROUPS) {
    const group = ok(
      `create group ${spec.name}`,
      await as.from('groups').insert({ org_id: org.id, name: `${DEMO}${spec.name}` }).select('id').single(),
    )
    ok(
      `add members to ${spec.name}`,
      await as.from('org_members').insert(
        spec.members.map((name) => ({
          org_id: org.id,
          email: emailFor(name, taken),
          name,
          // Employees are respondents, not editors. `leser` is the least
          // privilege that still lets `send_round` find them by group.
          role: 'leser' as const,
          group_id: group.id,
          status: 'active',
        })),
      ).select('id'),
    )
    groups.push({ id: group.id, name: spec.name, size: spec.members.length })
  }

  const leadership = groups.find((g) => g.name === 'Ledergruppen')!

  // --- 1. the person survey: four rounds, three of them closed ------------
  const pulse = await surveyFromPack(
    as, org.id, operatorMember.id, 'arbeidsmiljo-manedlig', 'Arbeidsmiljø — månedlig',
  )

  const closedRounds: string[] = []
  let pulseResponses = 0
  let shareToken: string | null = null

  for (let round = 1; round <= 4; round++) {
    const sent = await sendAndAnswer(as, org.id, pulse, {
      groupIds: groups,
      round,
      // Ledergruppen answers only the most recent round — four responses in
      // total, which is what actually keeps it under the threshold.
      //
      // The gate counts RESPONSES, not people: four people answering four
      // rounds is sixteen rows, and an unfiltered heatmap adds them up and
      // shows a number. A demo whose small team answers every round therefore
      // photographs the gate NOT firing, which is the opposite of the point.
      responseRate: (g) =>
        g === 'Ledergruppen' ? (round === 4 ? 1 : 0)
        : g === 'Kundeservice' ? 0.64
        : 0.78,
      cadence: round === 1 ? 'monthly' : 'once',
      runs: round === 1 ? 6 : 1,
      channels: round === 1 ? ['email', 'link'] : ['email'],
      seed: 1000 + round,
    })
    pulseResponses += sent.responses
    shareToken ??= sent.shareToken
    // Closing freezes the round's aggregates into `result_snapshots`, which is
    // what lets a trend line outlive the retention deletion of its answers.
    // The last round stays open, so the survey is live rather than finished.
    if (round < 4) {
      rpcOk(`close_round(${round})`, ok('close_round', await as.rpc('close_round', { p_round: sent.roundId })))
      closedRounds.push(sent.roundId)
    }
  }

  // The schedule row came from `send_round` on round 1 with `runs_done = 1`.
  // Four rounds have since gone out, and in production `app.run_due_schedules`
  // would have written that down as it opened each one. This is that
  // bookkeeping — the same two columns the cron job sets — so the Send screen
  // shows a series in the middle rather than one that never advanced.
  done(
    'advance pulse schedule',
    await as.from('schedules')
      .update({ runs_done: 4, next_run_at: new Date(Date.now() + 21 * 86_400_000).toISOString() })
      .eq('survey_id', pulse.id),
  )

  // --- 2. multi-round, below the threshold --------------------------------
  // The gap the fixture seed leaves: it has a below-threshold survey, but with
  // ONE round, so nothing ever renders a trend whose every point is gated.
  // Two closed rounds, two answers each — four in total, under k=5 whether a
  // screen reads one round or all of them.
  const psyk = await surveyFromPack(
    as, org.id, operatorMember.id, 'psykososial-kartlegging', 'Psykososial kartlegging 2026',
  )
  let psykResponses = 0
  for (let round = 1; round <= 2; round++) {
    const sent = await sendAndAnswer(as, org.id, psyk, {
      groupIds: [leadership],
      round,
      responseRate: () => 0.5, // 2 of 4
      seed: 2000 + round,
    })
    psykResponses += sent.responses
    rpcOk('close_round(psyk)', ok('close_round', await as.rpc('close_round', { p_round: sent.roundId })))
  }

  // --- 3. the organisation survey -----------------------------------------
  // `respondent_kind = 'organisation'` and `k = 0` come from the pack's locked
  // policy, not from anything set here — which is the point: the law sets the
  // policy and the seed cannot talk it out of it.
  const supplier = await surveyFromPack(
    as, org.id, operatorMember.id, 'leverandor-apenhetsloven', 'Aktsomhetsvurdering leverandører 2026',
  )
  const supplierEmails = new Map<string, string>()
  const supplierTaken = new Set<string>()
  for (const name of SUPPLIERS) supplierEmails.set(name, emailFor(`post ${name}`, supplierTaken))

  const supplierSend = rpcOk(
    'send_round(suppliers)',
    ok('send_round', await as.rpc('send_round', {
      p_survey: supplier.id,
      p_channels: ['email'],
      p_recipients: SUPPLIERS.map((name) => ({
        email: supplierEmails.get(name), name, lang: 'no',
      })) as never,
      p_cadence: 'once',
    })),
  )
  const supplierRound = String(supplierSend.round_id)
  const supplierMail = await drainOutbox(org.id, SUPPLIERS.length)
  const supplierByEmail = new Map(
    [...supplierEmails.entries()].map(([name, email]) => [email, name]),
  )

  const supplierRand = rng(3000)
  const respondent = anon()
  let supplierResponses = 0
  let answeredSoFar = 0
  // Sorted for the same reason as the employee rounds: which six of the ten
  // suppliers answered must not depend on queue order.
  for (const mail of [...supplierMail].sort((a, b) => a.email.localeCompare(b.email))) {
    const name = supplierByEmail.get(mail.email)
    if (!name) continue
    if (answeredSoFar >= SUPPLIERS_ANSWERED) break
    answeredSoFar++

    const payload: Record<string, AnswerEntry> = {}
    for (const [i, q] of supplier.questions.entries()) {
      // Q4 of the Åpenhetslov pack is "Har dere avdekket brudd eller risiko
      // siste 12 måneder?" — one supplier answers yes, so the register has a
      // designated breach to filter for rather than ten clean rows.
      const isBreachQuestion = i === 3 && q.type === 'yesno'
      if (isBreachQuestion) {
        payload[q.id] = { value: name === SUPPLIER_WITH_BREACH }
        continue
      }
      const one = answersFor([q], 'Produkt', 1, i, supplierRand)
      const entry = one[q.id]
      if (entry) payload[q.id] = entry
    }
    // The free-text answer is about due diligence, not about a workplace.
    const freeText = supplier.questions.find((q) => q.type === 'text')
    if (freeText) {
      payload[freeText.id] = {
        value: name === SUPPLIER_WITH_BREACH
          ? 'Avdekket avvik hos underleverandør i 2025. Tiltak: revisjon på stedet, '
            + 'ny kontraktsklausul om arbeidsforhold, og kvartalsvis oppfølging.'
          : 'Årlig egenrapportering fra underleverandører og varslingskanal på nettsidene våre.',
      }
    }

    rpcOk(
      `submit_response(${name})`,
      ok('submit_response', await respondent.rpc('submit_response', {
        p_token: mail.token, p_lang: 'no', p_answers: payload as never,
      })),
    )
    supplierResponses++
  }

  // --- 4. a paused recurring series ---------------------------------------
  const weekly = await surveyFromPack(
    as, org.id, operatorMember.id, 'ukentlig-puls', 'Ukespuls — Produkt',
  )
  const weeklySend = await sendAndAnswer(as, org.id, weekly, {
    groupIds: [groups.find((g) => g.name === 'Produkt')!],
    round: 1,
    responseRate: () => 0.75,
    cadence: 'weekly',
    runs: 12,
    seed: 4000,
  })
  // Paused: `active = false` is what stops `app.run_due_schedules` picking it
  // up, and it is the state the Send screen calls "satt på pause".
  done(
    'pause weekly schedule',
    await as.from('schedules').update({ active: false, runs_done: 3 }).eq('survey_id', weekly.id),
  )

  // --- 5. a draft that has never been sent --------------------------------
  const draft = await surveyFromPack(
    as, org.id, operatorMember.id, 'sluttsamtale', 'Sluttsamtale (utkast)',
  )

  return finish(s, as, {
    org,
    operatorMember,
    operatorUser,
    realUser,
    groups,
    pulse,
    psyk,
    supplier,
    weekly,
    draft,
    supplierRound,
    counts: {
      pulseResponses,
      psykResponses,
      supplierResponses,
      weeklyResponses: weeklySend.responses,
      shareToken,
      closedRounds: closedRounds.length,
    },
  })
}

// ---------------------------------------------------------------------------
// Duties, reports, and the surfaces that hang off them
// ---------------------------------------------------------------------------

type DutyDefinition = {
  checks: { key: string }[]
  signer_roles: { key: string; label: string }[]
  title: string
  default_interval_months: number
}

/**
 * Creates a duty exactly as the Rapporter screen's `ensureDuty` does: the row
 * appears on first write, with its checklist and its signer slots taken from
 * the registry, unassigned.
 *
 * The duties themselves are law and are the same for every Norwegian employer,
 * so what belongs to an organisation is only its own state on top.
 */
async function ensureDuty(
  s: Client,
  orgId: string,
  key: string,
): Promise<{ id: string; def: DutyDefinition; adopted: boolean }> {
  const def = ok(
    `read duty definition ${key}`,
    await s.from('duty_definitions')
      .select('checks, signer_roles, title, default_interval_months').eq('key', key).single(),
  ) as unknown as DutyDefinition

  // Adopt rather than insert, exactly as the screen's own `ensureDuty` does —
  // and here it is load-bearing for a second reason. `duties` is unique on
  // (org, definition_key), so a card the purge deliberately left behind (one a
  // real person had signed) would otherwise make the next run die on a
  // constraint violation with nothing useful to say. `adopted` tells the caller
  // to keep its hands off: a duty somebody real has touched is their statutory
  // record, and the demo does not get to tick its boxes.
  const existing = (ok(`lookup duty ${key}`, await s.from('duties')
    .select('id').eq('org_id', orgId).eq('definition_key', key)))[0]
  if (existing) return { id: existing.id, def, adopted: true }

  const duty = ok(
    `create duty ${key}`,
    await s.from('duties').insert({
      org_id: orgId,
      definition_key: key,
      interval_months: def.default_interval_months,
    }).select('id').single(),
  )

  ok(`duty checks ${key}`, await s.from('duty_checks').insert(
    (def.checks ?? []).map((c) => ({ duty_id: duty.id, key: c.key, done: false })),
  ).select('key'))

  ok(`duty signers ${key}`, await s.from('duty_signers').insert(
    (def.signer_roles ?? []).map((r) => ({ duty_id: duty.id, role_key: r.key, label: r.label })),
  ).select('role_key'))

  return { id: duty.id, def, adopted: false }
}

/**
 * Ticks the first `n` checklist items, attributed.
 *
 * A ticked check that names nobody is a state the product cannot produce —
 * `toggleDutyCheck` always writes who and when — and it is a state a statutory
 * checklist must not be in, because the attribution IS the evidence.
 */
async function tickChecks(
  s: Client, duty: { id: string; def: DutyDefinition }, n: number, memberId: string,
): Promise<void> {
  const checks = (duty.def.checks ?? []).slice(0, n)
  for (const [i, c] of checks.entries()) {
    done(`tick ${c.key}`, await s.from('duty_checks').update({
      done: true,
      done_by: memberId,
      done_at: new Date(Date.now() - (i + 3) * 86_400_000).toISOString(),
    }).eq('duty_id', duty.id).eq('key', c.key))
  }
}

type FinishArgs = {
  org: { id: string }
  operatorMember: { id: string }
  operatorUser: string
  realUser: string | null
  groups: { id: string; name: string; size: number }[]
  pulse: { id: string }
  psyk: { id: string }
  supplier: { id: string }
  weekly: { id: string }
  draft: { id: string }
  supplierRound: string
  counts: {
    pulseResponses: number
    psykResponses: number
    supplierResponses: number
    weeklyResponses: number
    shareToken: string | null
    closedRounds: number
  }
}

async function finish(s: Client, as: Client, a: FinishArgs): Promise<void> {
  const { org, operatorMember } = a
  const deadline = (days: number) =>
    new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10)

  /**
   * A duty the seed did not create is left exactly as it is.
   *
   * The only way one can be adopted is if a previous purge refused to delete it
   * because a real person had signed or ticked it. Writing the demo's state over
   * that would be overwriting somebody's statutory evidence with fixture data —
   * the one thing this seed must never do — so it is reported and skipped, and
   * the demo simply has one card fewer.
   */
  const adopted: string[] = []
  const mine = (duty: { id: string; def: DutyDefinition; adopted: boolean }, key: string) => {
    if (duty.adopted) adopted.push(key)
    return !duty.adopted
  }

  // --- duty 1: nothing done yet -------------------------------------------
  // No ticks, no signatures, no deadline. This is the state every duty starts
  // in and the one a compliance screen must be able to show without pretending.
  //
  // It DOES get an owner, and that is a concession to sharing the organisation:
  // `duties` is unique on (org, definition_key) and carries no title, so a card
  // with no named actor anywhere on it is one the purge cannot prove is the
  // seed's — it would refuse to delete it, and the next run would then collide
  // with its own leftover. An assigned owner who has done nothing is a real
  // state and an honest one; an unattributable row in someone's statutory
  // register is not.
  const arbeidsmiljo = await ensureDuty(as, org.id, 'arbeidsmiljo')
  if (mine(arbeidsmiljo, 'arbeidsmiljo')) {
    done('arbeidsmiljo owner', await as.from('duties')
      .update({ owner_member_id: operatorMember.id }).eq('id', arbeidsmiljo.id))
  }

  // --- duty 2: started ----------------------------------------------------
  const trakassering = await ensureDuty(as, org.id, 'trakassering')
  if (mine(trakassering, 'trakassering')) {
    done('trakassering settings', await as.from('duties').update({
      owner_member_id: operatorMember.id, next_due_at: deadline(38),
    }).eq('id', trakassering.id))
    await tickChecks(as, trakassering, 2, operatorMember.id)
    done('trakassering signer', await as.from('duty_signers')
      .update({ member_id: operatorMember.id }).eq('duty_id', trakassering.id))
  }

  // --- duty 3: complete and signed, not published -------------------------
  const likestilling = await ensureDuty(as, org.id, 'likestilling')
  let readyReport: string | null = null
  if (mine(likestilling, 'likestilling')) {
    done('likestilling settings', await as.from('duties').update({
      owner_member_id: operatorMember.id, next_due_at: deadline(96),
    }).eq('id', likestilling.id))

    // The report is created BEFORE the checks are ticked and the signatures
    // taken, because `app.duty_content_hash` covers the report's title, sections
    // and filters. Sign first and the signature is stale before anyone reads it.
    readyReport = ok('ready report', await as.from('reports').insert({
      org_id: org.id,
      title: `${DEMO}Likestillingsredegjørelse 2026 (ARP)`,
      kind: 'lov',
      status: 'klar',
      base_template: 'styresak',
      duty_id: likestilling.id,
      created_by: operatorMember.id,
      // A narrative statutory report with no survey behind it: the ARP
      // redegjørelse is largely prose, and `publish_duty` tolerates `no_survey`
      // for exactly this shape.
      sections: ['method', 'actions'] as never,
    }).select('id').single()).id

    await tickChecks(as, likestilling, 4, operatorMember.id)
    done('likestilling signer', await as.from('duty_signers')
      .update({ member_id: operatorMember.id }).eq('duty_id', likestilling.id))
    for (const role of likestilling.def.signer_roles ?? []) {
      rpcOk(`sign_duty(likestilling, ${role.key})`, ok('sign_duty',
        await as.rpc('sign_duty', { p_duty: likestilling.id, p_role_key: role.key })))
    }
  }

  // --- duty 4: published, with an archive version -------------------------
  const apenhet = await ensureDuty(as, org.id, 'apenhet')
  let publishedReport: string | null = null
  if (mine(apenhet, 'apenhet')) {
    done('apenhet settings', await as.from('duties').update({
      owner_member_id: operatorMember.id, next_due_at: deadline(12), publish: true,
    }).eq('id', apenhet.id))

    publishedReport = ok('published report', await as.from('reports').insert({
      org_id: org.id,
      title: `${DEMO}Aktsomhetsvurdering 2026 — Åpenhetsloven §§ 4–5`,
      kind: 'lov',
      status: 'klar',
      base_template: 'styresak',
      duty_id: apenhet.id,
      created_by: operatorMember.id,
      // Every source is an organisation survey, which is the only condition
      // under which «Svar per virksomhet» is allowed to render at all.
      filters: { surveys: [a.supplier.id], rounds: [a.supplierRound] } as never,
      sections: ['method', 'participation', 'per_virksomhet', 'actions', 'summary'] as never,
    }).select('id').single()).id

    await tickChecks(as, apenhet, 4, operatorMember.id)
    done('apenhet signers', await as.from('duty_signers')
      .update({ member_id: operatorMember.id }).eq('duty_id', apenhet.id))
    for (const role of apenhet.def.signer_roles ?? []) {
      rpcOk(`sign_duty(apenhet, ${role.key})`, ok('sign_duty',
        await as.rpc('sign_duty', { p_duty: apenhet.id, p_role_key: role.key })))
    }
  }
  // Publishing freezes the document into a snapshot, writes the archive
  // version, and flips the report to `publisert`. It is the only path that
  // produces a `duty_versions` row.
  rpcOk('publish_duty', ok('publish_duty',
    await as.rpc('publish_duty', { p_duty: apenhet.id, p_label: 'Aktsomhetsvurdering 2026' })))

  // --- the third report: a draft ------------------------------------------
  ok('draft report', await as.from('reports').insert({
    org_id: org.id,
    title: `${DEMO}Arbeidsmiljø — status Q3`,
    kind: 'egen',
    status: 'utkast',
    base_template: 'kort',
    created_by: operatorMember.id,
    filters: { surveys: [a.pulse.id] } as never,
    sections: ['summary', 'participation', 'teams', 'trend', 'themes', 'quotes'] as never,
  }).select('id').single())

  // --- the organisation's own template pack -------------------------------
  // "Lagre som mal" is the only path that creates a row in Firmaets maler, and
  // it stores a SNAPSHOT of the questions rather than a reference — a later
  // edit to the survey must not rewrite a template someone else is about to use.
  const pulseQuestions = ok('read pulse questions', await as.from('survey_questions')
    .select('type, text, help, required, config').eq('survey_id', a.pulse.id).order('position'))
  ok('org template pack', await as.from('template_packs').insert({
    org_id: org.id,
    key: `${a.pulse.id}-demo`,
    category: 'Ansatte',
    title: `${DEMO}Vår månedlige arbeidsmiljøpuls`,
    audience: 'Hele selskapet',
    questions: pulseQuestions.map((q) => ({
      text: q.text,
      type: q.type,
      help: q.help ?? undefined,
      required: q.required,
      ...((q.config ?? {}) as Record<string, unknown>),
    })) as never,
    private: false,
    author_member_id: operatorMember.id,
  }).select('id').single())

  // --- a saved dashboard layout and an organisation preset -----------------
  // Three rows, three different things (lib/dashboard/layout.ts): the WORKING
  // layout is one member's own and reappears next time; an ORGANISATION preset
  // has `user_id NULL` and is shared; the six SHIPPED presets live in
  // `dashboard_presets` and this seed does not touch them.
  //
  // Panels are `{key, wide}` objects whose keys must be `on_dashboard` registry
  // rows — a layout SELECTS AMONG GATED READERS, it never introduces a query —
  // and `wide` follows the bundle's default of a full-width heatmap.
  const WORKING_TITLE = 'Mitt oppsett'
  const WORKING_PANELS = [
    { key: 'trend', wide: false },
    { key: 'heatmap', wide: true },
    { key: 'themes', wide: false },
  ]

  // An organisation preset may not carry a group filter: one saved by an
  // administrator with a group selected, then picked by a leser, would send
  // p_group to get_quotes and be refused — correctly — and present as a broken
  // panel. `group_id` therefore stays null, as the constraint and
  // `filtersForPreset` both require.
  ok('organisation preset', await as.from('dashboard_layouts').insert({
    org_id: org.id,
    user_id: null,
    // Not one of the six shipped titles: `app.preset_title_free` refuses a
    // shared preset that takes a shipped preset's name.
    title: `${DEMO}Månedlig ledergjennomgang`,
    panels: [
      { key: 'trend', wide: false },
      { key: 'heatmap', wide: true },
      { key: 'drivers', wide: false },
      { key: 'duties', wide: false },
    ] as never,
    filters: { period: 'h', group_id: null, survey_ids: [] } as never,
  }).select('id').single())

  ok('operator working layout', await as.from('dashboard_layouts').insert({
    org_id: org.id,
    user_id: a.operatorUser,
    title: WORKING_TITLE,
    panels: WORKING_PANELS as never,
    filters: { period: 'q', group_id: null, survey_ids: [] } as never,
  }).select('id').single())

  // --- the pinned panels ---------------------------------------------------
  // The operator's own, through the operator's own session, which is the real
  // path (`dashboard_pins_ins` is `user_id = auth.uid()`).
  //
  // NOTHING is written into the human's personal state any more. While the demo
  // had its own organisation, seeding their pins and working layout was the only
  // way their dashboard would not be empty, and it cost a service-role write
  // standing in for a click. Inside their REAL organisation that trade is a bad
  // one twice over: it manufactures UI state on somebody's live account, and
  // the purge would later delete a layout they may have since edited by hand.
  // The shared preset above is readable by every member, so it reaches them
  // without anything of theirs being written or removed.
  const PANELS = ['summary', 'trend', 'heatmap', 'themes']
  ok('operator pins', await as.from('dashboard_pins').insert(
    PANELS.map((panel_key) => ({ org_id: org.id, user_id: a.operatorUser, panel_key })),
  ).select('id'))

  // --- two data-subject requests ------------------------------------------
  // No producer exists for these yet, so they are written as the signed-in
  // administrator — `dsr_cud_ins` is what admits them, not the service role —
  // and they are marked SYNTHETIC in the field a human reads. A realistic
  // looking data-subject request is the row somebody later answers believing it.
  ok('dsr requests', await as.from('dsr_requests').insert([
    {
      org_id: org.id,
      type: 'innsyn',
      status: 'under_behandling',
      subject_email: `innsyn.demo@${SYNTHETIC_DOMAIN}`,
      handled_by: operatorMember.id,
      resolution: 'SYNTETISK DEMODATA — ikke en reell forespørsel fra en registrert.',
    },
    {
      org_id: org.id,
      type: 'sletting',
      status: 'mottatt',
      subject_email: `sletting.demo@${SYNTHETIC_DOMAIN}`,
      resolution: 'SYNTETISK DEMODATA — ikke en reell forespørsel fra en registrert.',
    },
  ]).select('id'))

  // --- two closed loops ---------------------------------------------------
  ok('loop actions', await as.from('loop_actions').insert([
    {
      org_id: org.id, survey_id: a.pulse.id, owner_member_id: operatorMember.id,
      text: `${DEMO}Fokusblokker i kalenderen tirsdag og torsdag formiddag`,
    },
    {
      org_id: org.id, survey_id: a.pulse.id, owner_member_id: operatorMember.id,
      text: `${DEMO}Kutte ukentlig statusmøte i Kundeservice til 20 minutter`,
    },
  ]).select('id'))

  if (adopted.length) {
    console.log(
      `\n  Left as they were (a real person had touched them, so the demo did not` +
        `\n  write its state over theirs): ${adopted.join(', ')}`,
    )
  }

  await summarise(s, a, { published: publishedReport, ready: readyReport })
}

// ---------------------------------------------------------------------------
// What the run actually produced
// ---------------------------------------------------------------------------

/**
 * Counts the rows that now exist, by reading them back rather than by adding
 * up what the script believes it inserted.
 *
 * A summary computed from intentions is the same class of defect as a test that
 * passes for the wrong reason: it reports the plan, not the result, and it goes
 * on reporting it after the plan stops being true.
 */
async function summarise(
  s: Client, a: FinishArgs, reports: { published: string | null; ready: string | null },
): Promise<void> {
  const count = async (table: string, column: string, value: string): Promise<number> => {
    const { count: n, error } = await s
      .from(table as 'organizations')
      .select('*', { count: 'exact', head: true })
      .eq(column as 'id', value)
    if (error) throw new Error(`count ${table}: ${error.message}`)
    return n ?? 0
  }

  // Everything below counts DEMO rows, never the organisation's totals. The
  // organisation is shared now, so `count(*) where org_id = …` would quietly
  // credit the seed with the human's own surveys and members — a summary that
  // reports somebody else's rows as its own is exactly the fabricated number
  // this project forbids on screen, and a terminal is not an exemption.
  const surveys = ok('surveys', await s.from('surveys')
    .select('id').eq('org_id', a.org.id).like('title', `${DEMO}%`))
  const surveyIds = surveys.map((r) => r.id)
  const rounds = ok('rounds', await s.from('survey_rounds').select('id, status').in('survey_id', surveyIds))
  const roundIds = rounds.map((r) => r.id)
  const { count: invitations } = await s.from('survey_invitations')
    .select('*', { count: 'exact', head: true }).in('round_id', roundIds)
  const { count: responses } = await s.from('responses')
    .select('*', { count: 'exact', head: true }).in('round_id', roundIds)
  const { count: linkedAnon } = await s.from('responses')
    .select('*', { count: 'exact', head: true })
    .in('round_id', roundIds).eq('anonymity_at_submission', 'anonymous')
    .not('invitation_id', 'is', null)

  // The demo data is itself the proof: every anonymous response in it went
  // through `submit_response`, and not one of them carries an invitation.
  if ((linkedAnon ?? 0) !== 0) {
    throw new Error(
      `${linkedAnon} anonymous responses carry an invitation id. The anonymity CHECK, ` +
        `submit_response, or this seed is wrong — do not use this data.`,
    )
  }

  const demoRows = async (table: string, column: string): Promise<number> => {
    const { count: n, error } = await s
      .from(table as 'surveys')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', a.org.id)
      .like(column as 'title', `${DEMO}%`)
    if (error) throw new Error(`count ${table}: ${error.message}`)
    return n ?? 0
  }
  const { count: synthetic } = await s.from('org_members')
    .select('*', { count: 'exact', head: true })
    .eq('org_id', a.org.id).like('email', `%@${SYNTHETIC_DOMAIN}`)
  const untouched = (await count('org_members', 'org_id', a.org.id)) - (synthetic ?? 0)

  const lines: [string, string | number][] = [
    ['organisation', `${ORG_NAME} (shared with its real content)`],
    ['synthetic members', `${synthetic ?? 0} (all @${SYNTHETIC_DOMAIN})`],
    ['real members left alone', untouched],
    ['groups', a.groups.map((g) => `${g.name} (${g.size})`).join(', ')],
    ['surveys', surveys.length],
    ['rounds', `${rounds.length} (${rounds.filter((r) => r.status === 'closed').length} closed)`],
    ['invitations', invitations ?? 0],
    ['responses', `${responses ?? 0}, none of the anonymous ones linked to an invitation`],
    ['snapshots', await count('result_snapshots', 'org_id', a.org.id)],
    ['duties', await count('duties', 'org_id', a.org.id)],
    ['reports', await demoRows('reports', 'title')],
    ['dsr requests', await count('dsr_requests', 'org_id', a.org.id)],
    ['org template packs', await demoRows('template_packs', 'title')],
    ['dashboard pins', await count('dashboard_pins', 'org_id', a.org.id)],
    ['dashboard layouts', await count('dashboard_layouts', 'org_id', a.org.id)],
    ['loop actions', await demoRows('loop_actions', 'text')],
    ['published report', reports.published ?? '— (its duty was left alone)'],
    ['report ready for review', reports.ready ?? '— (its duty was left alone)'],
  ]

  console.log(`\nSeeded the demo into ${ORG_NAME}\n`)
  for (const [k, v] of lines) console.log(`  ${String(k).padEnd(22)} ${v}`)

  if (a.counts.shareToken) {
    console.log(`\n  respondent share link      /s/${a.counts.shareToken}`)
  }
  console.log(`\n  operator (synthetic)       ${OPERATOR_EMAIL} / ${OPERATOR_PASSWORD}`)
  console.log(
    a.realUser
      ? `  ${REAL_ADMIN_EMAIL} keeps the membership they already had — nothing\n` +
        `  about it was changed, and there is one organisation to land in.`
      : `  ${REAL_ADMIN_EMAIL} has no Supabase Auth user yet, so the membership is\n` +
        `  INVITED. Sign in once with that address (magic link or password) and\n` +
        `  claim_membership attaches it automatically. Nothing to click in Supabase.`,
  )
  console.log('\n  No mail was queued: every message this run produced was deleted from')
  console.log('  mail_outbox, and sent_at is NULL, so the reminder job will never see it.\n')
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

function printPlan(): void {
  console.log(`\nWhat a seed run creates in ${ORG_NAME}:\n`)
  let total = 0
  for (const [table, n] of PLAN) {
    console.log(`  ${table.padEnd(34)} ${String(n).padStart(5)}`)
    total += n
  }
  console.log(`  ${'—'.repeat(34)} ${String(total).padStart(5)}`)
  console.log(`\n  Plus one org_members row if ${REAL_ADMIN_EMAIL} is not already`)
  console.log(`  a member. NOTHING EXISTING IS CHANGED: the organisation is adopted, not`)
  console.log(`  created, its settings are left as they are, an existing membership is left`)
  console.log(`  as it is, and no personal pin or layout is written for a real person.`)
  console.log('  Nothing outside the organisation is touched either — no row is added to')
  console.log('  template_packs, question_bank, duty_definitions or report_section_types')
  console.log('  with org_id NULL, so the standard content CI counts does not move.')
  console.log('\n  Every address except the administrator is @example.invalid, which RFC 6761')
  console.log('  guarantees can never resolve. No mail is sent and none is left queued.\n')
}

async function main(): Promise<void> {
  // Printed before the credential check on purpose: "what would this create?"
  // is a question you ask BEFORE pointing it at a project, and refusing to
  // answer it until the keys are configured gets the order backwards.
  if (dryRun) {
    printPlan()
    console.log(`  Target that WOULD have been written: ${URL ?? '(no URL configured)'}\n`)
    return
  }

  if (!URL || !ANON || !SERVICE) {
    console.error(
      'Missing Supabase URL, anon key or service-role key. Pass --local for the local\n' +
        'stack, or put NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and\n' +
        'SUPABASE_SERVICE_ROLE_KEY in .env.local.',
    )
    process.exit(1)
  }

  // A demo organisation in a customer's project is a support ticket, so the
  // remote case is opt-in and loud rather than a flag away.
  if (!isLocalTarget && !process.env.ALLOW_REMOTE_SEED) {
    console.error(
      `Refusing to touch ${URL}.\n\n` +
        `This seed writes a demo organisation with ~60 synthetic people into whatever\n` +
        `project it is pointed at. Run it with --dry-run first to see the row counts,\n` +
        `then set ALLOW_REMOTE_SEED=1 if that is really where it should go.`,
    )
    process.exit(1)
  }

  const s = svc()
  if (purgeOnly) {
    await purge(s)
    console.log(`Purged the demo content from ${ORG_NAME} on ${URL}:`)
    console.log(`everything titled "${DEMO}…", every @${SYNTHETIC_DOMAIN} member, the duties`)
    console.log(`only synthetic members had touched, the queued mail, and the operator's`)
    console.log(`auth user. The organisation itself, ${REAL_ADMIN_EMAIL}'s`)
    console.log(`membership and auth user, and every unprefixed row were left alone —`)
    console.log(`re-counted afterwards, and the run fails if any of those numbers moved.`)
    return
  }

  await seed()
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
