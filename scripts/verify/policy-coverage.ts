/**
 * VERIFY.md Gate 5a3 — policy coverage by ENUMERATION.
 *
 * Gate 5b samples three behaviours per phase. A table introduced later can miss
 * every sample while the suite reports green, which is exactly what happened:
 * `reports` RLS could be opened completely — leser writes, cross-org reads, anon
 * reads — with 165 tests still passing, because not one of them touched it.
 *
 * So the list of protected surfaces is derived from the DATABASE CATALOG, not
 * from a list somebody maintains. Every RLS-enabled table in `public` and every
 * SECURITY DEFINER function in `public` is a surface, and each is checked twice:
 *
 *   PROTECTED — measured now, by actually attempting the access as `anon` and as
 *   a member of another organisation. A declaration cannot fake this.
 *
 *   GUARDED — some file under tests/ names the surface, so a regression is
 *   caught by the suite rather than by whoever next runs this script.
 *
 * A surface can be protected and unguarded: correct today, with nothing to stop
 * tomorrow's migration opening it silently. That is precisely the state
 * `reports` was in, so it is a failure here, not a warning.
 *
 * The catalog is read through `psql` rather than PostgREST because pg_catalog
 * is not exposed over the API — and adding a SECURITY DEFINER helper to read it
 * would create another surface for this very script to audit.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { config } from 'dotenv'
import { serviceClient, personaClient, anonClient } from '../../tests/db/clients'
import { ORG_PRIMARY } from '../../tests/db/personas'

config({ path: '.env.local', quiet: true })

const DB_URL = process.env.LOCAL_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

/** Registries and public surfaces: no tenant data, readable by design. Each
 *  needs a reason, not just an entry — an allowlist without reasons becomes the
 *  place findings go to be forgotten. */
const PUBLIC_BY_DESIGN: Record<string, string> = {
  ui_messages: 'UI copy; i18n_sel is using(true) so a signed-out page renders',
  duty_definitions: 'the four statutory duties; identical for every organisation',
  report_section_types: 'section registry; data-not-code',
  dashboard_presets: 'the six shipped dashboard presets; data-not-code, DECISIONS Q25/Q27 — a preset names panel keys and carries no org id, no survey id and no number',
  report_templates: 'the five standard templates; data-not-code',
  quality_rules: 'question-quality heuristics; data-not-code',
  method_rules:
    'V6-3 (`M:0120`): the Metodikk check\u2019s eleven rules; data-not-code, same shape as `quality_rules` \u2014 a row carries a key, a severity, an evaluator kind and its copy, and no org id, no survey id and no count. It is ADVISORY by construction (Q178): the severity CHECK admits only `advarsel` and `forslag`, so a blocking severity is unrepresentable rather than merely absent. `tests/db/method-rules.test.ts` CHECKS that claim against the column list and against the constraint itself rather than repeating it here',
  theme_rules: 'free-text theme stems; data-not-code',
  benchmarks: 'seeded Norwegian reference values; DECISIONS Q8',
  task_kinds:
    'the five kinds a task may have (V2-4, Q70); data-not-code, same shape as `use_cases`, `brand_accents` and `segment_fields` — a row carries a key and a sort order, and no org id, no survey id and no count. The LABEL for each kind lives in `messages/*.json` under the key, so the registry itself is language-free and carries nothing about anyone. `tests/db/tasks.test.ts` CHECKS that claim against the column list rather than repeating it here',
  help_articles:
    'Q75: the help-article registry; data-not-code, same shape as `use_cases`, `brand_accents`, `segment_fields` and `task_kinds` — a row carries a slug, a category key, a read time, a tint, a sort order, a related-slug list and an optional feature-flag name, and NO org id, no survey id and no count. It is read before a session exists on the support links, and it carries no prose at all: the language-specific document lives in `help_article_translations`. `tests/db/help.test.ts` CHECKS the column list against that claim, and separately checks that NO write policy exists — help text is a surface users trust to learn how the product behaves',
  help_article_translations:
    'the per-language document for the above. Same reason and the same absence of a write policy; the only identifying thing it could hold is prose somebody wrote about the product',
  segment_fields:
    'the fields a segment rule may name (Q65); data-not-code, same shape as `use_cases` and `brand_accents` — a row carries a key, a column name and an availability flag, and no org id, no survey id and no count. The `available = false` rows exist so the editor can SAY a field is unavailable rather than being silently shorter than the design. `tests/db/segments.test.ts` CHECKS the claim against the column list rather than repeating it here',
  brand_accents:
    'the five accents the design offers (V2:4898); data-not-code, same shape as `use_cases` — a row carries a hex, a name key and a contrast ratio, and no org id, no survey id and no number. `tests/db/branding.test.ts` CHECKS that claim against the column list rather than repeating it here',
  use_cases: 'the six shipped use cases; data-not-code, DECISIONS Q24 — a use case carries no org id, no survey id and no number, and the wizard and library read it before a session exists',
  workspaces:
    'W0/Q122: the four arbeidsflater; data-not-code, same shape as `use_cases`, `brand_accents`, `segment_fields`, `task_kinds` and `live_stopwords` — a row carries a key, a label, a hint, two theme tokens, three vocabulary words, a `dashboard_presets` key and a sort order, and NO org id, no survey id and no count. The organisation\'s CHOICE of workspace is `organizations.workspace`, which is org-scoped and RLS-protected; this table is only the menu. `tests/db/workspaces.test.ts` CHECKS the column list against that claim rather than repeating it here, and separately checks that NO column could be a survey default — which is Q119 written as a property of the table',
  workspace_modules:
    'W0: the six Oversikt modules a workspace can switch on; data-not-code, same shape and same reason as `workspaces` above — a row carries a key, a label and a sort order. CHECKED against that claim in `tests/db/workspaces.test.ts` rather than trusted',
  workspace_use_case_lifts:
    'W3: which use cases a workspace sorts first in the template library (V4:4444-4456 `lifts`); data-not-code, same reason as `workspaces` — a row carries two REGISTRY keys and a rank, and nothing org-scoped. The FK to `use_cases` is Q45\'s shape reused: a lift cannot name a use case that does not exist, so the library cannot be asked to sort by something it has never heard of. CHECKED against the column list in `tests/db/workspaces.test.ts`, which also asserts the mapping is TOTAL the way V1-5 asserted the pack mapping',
  workspace_module_links:
    'W0: which modules each workspace shows by default; data-not-code, same reason as `workspaces` — a row carries two registry keys and a sort order, and NOTHING org-scoped. The per-person override is deliberately NOT here: Q122 puts the per-device choice in a cookie, so there is no table for it to leak from. CHECKED against the column list in `tests/db/workspaces.test.ts`',
  live_stopwords:
    'Q79 (V2-9): per-language stopwords for the live word cloud; data-not-code, same shape as `use_cases`, `task_kinds`, `segment_fields` and `help_articles` — a row carries a language and a word, and NOTHING else: no org id, no survey id, no count. `tests/db/live.test.ts` test 13 CHECKS that against the column list rather than repeating it here. Read-only to everyone and writable by nobody, for `help_articles`\' reason: a client that could write this could hide a word from every cloud in the product',
  feature_flags: 'global flags; per-org rows are org-scoped by policy',
  question_bank: 'org_id NULL rows are the shared bank; org rows are org-scoped',
  template_packs: 'org_id NULL rows are the statutory packs; org rows org-scoped',
}

/** Functions anon MUST be able to execute: the respondent surface and the share
 *  link, each of which authorises itself from a token INSIDE the function. */
const ANON_BY_DESIGN: Record<string, string> = {
  report_for_share_token: 'resolves a share token to its report id; returns an id or nothing, never content',
  submit_response: 'the only respondent write path; token-validated',
  get_survey_for_token: 'renders /s/[token]; token-validated',
  get_peer_results: 'thank-you peer results; token-validated and k-gated',
  compose_report: 'a share link has no session; token or membership checked inside',
  redeem_live_voucher:
    'Q79/the QR join path (V2-9), Tor 2026-09-09: THE CODE IS A VOUCHER, NOT A TICKET. A room scans one code and each device redeems it for its own single-use token, then enters the ordinary `submit_response` path — so invariant 2 stays «the only write path is submit_response» rather than becoming «the only write path for this kind». Anon by necessity: there is no session when someone scans. It authorises itself from the code INSIDE the function, exactly as `submit_response` and `get_survey_for_token` do from a token, and it refuses a wrong, closed and expired code with ONE indistinguishable answer so the refusal cannot enumerate sessions. It writes an invitation and never a response',
  request_demo:
    'the splash is public; validates its own input, writes a table no role can read, returns no row handle',
  get_closed_loop_for_token:
    "G1: the respondent's «Du sa · vi gjorde» card, and her own opt-in state. Anon by NECESSITY, the same way `get_comment_thread` and `get_peer_results` are — a respondent holds a link, never a session, and the function authorises itself from the token INSIDE. WHAT MAKES THE GRANT SAFE IS WHAT IT REFUSES TO RETURN, and every clause is checked in tests/db/closed-loop.test.ts rather than trusted: the payload object carries exactly two keys, `title` and `when`, asserted as a KEY SET so a later edit that adds `law_ref`, an owner or a status fails there and not on a respondent's screen (4); it names neither public.responses nor public.answers; it reaches only tasks an administrator explicitly flagged, which defaults false, so a fresh organisation returns nothing (5); a generated blind-spot task can never be flagged at all, refused by the `tasks_shared_is_manual` CHECK because such a task's title IS the finding, which is Q72's own sentence (3); a task not yet at a done status is withheld (6); no other organisation's task appears (7); and an unknown token is indistinguishable from an empty loop (2)",
  set_result_optin:
    "G1: «Send meg det samlede resultatet», the one control on the thanks screen that writes. Anon by necessity for the same reason, token-validated inside, and its safety is that the write is ONE BOOLEAN on the invitation she already holds — no new row, no timestamp, and nothing in `responses` or `answers`. The invitation already carries her address and already carries `responded_at` at full precision, written by `submit_response` in the same transaction as the response, so this adds no linkage that answering did not. tests/db/closed-loop.test.ts test 11 is the negative test: the response row and its answers are compared FIELD BY FIELD across the opt-in and must be identical, and the write is confirmed to have happened first so the comparison cannot pass vacuously; test 12 asserts from information_schema that the column is boolean and that no new timestamp appeared on the invitation. Where there is no invitation — a share link, a QR voucher — it refuses and the control is never rendered (9)",
  get_comment_thread:
    "C1/Q111: a used invitation token's read-after-submit capability. Anon by NECESSITY and not by preference — a respondent holds a link, never a session, exactly as for `submit_response` and `get_survey_for_token`, and it authorises itself from the token INSIDE the function. THE ALTERNATIVE WAS MEASURABLY WORSE: revoking the anon grant and calling it with the service role from the respondent server action would have satisfied this gate by putting the service-role key into the respondent request path, which is a real weakening bought for a metric. Every clause of this reason is CHECKED rather than trusted, in tests/db/comments.test.ts: it writes nothing and cannot re-open submission (6, 7); it names neither public.responses nor public.answers, so it reads no results (10); it matches on invitation_id, so it cannot reach another respondent's thread, in the same round or another organisation (8, 9); app.resolve_token refuses a closed round, so it expires with the round (11); and a share-link token gets an empty thread, because every holder of that link is the same principal (26)",
}

function sql(query: string): string[][] {
  const out = execFileSync('psql', [DB_URL, '-tAF\t', '-c', query], { encoding: 'utf8' })
  return out.split('\n').filter(Boolean).map((l) => l.split('\t'))
}

function testSources(): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry)
      if (statSync(p).isDirectory()) walk(p)
      else if (/\.(ts|tsx)$/.test(p)) out.push(readFileSync(p, 'utf8'))
    }
  }
  walk('tests')
  return out
}

let failures = 0
const uncovered: string[] = []
const unproven: string[] = []

function line(flag: string, kind: string, name: string, detail: string) {
  console.log(`  ${flag.padEnd(8)} ${kind.padEnd(8)} ${name.padEnd(28)} ${detail.slice(0, 56)}`)
}

/**
 * `proven` separates "the policy refused a real row" from "there was no row to
 * refuse". An empty table passes a cross-org read check trivially, and counting
 * that as protection is the same false confidence this gate exists to remove —
 * the fixture, not the policy, would be doing the work.
 */
function judge(
  kind: string, name: string, isProtected: boolean, guarded: boolean, proven: boolean, detail: string,
) {
  if (!isProtected || !guarded) {
    failures++
    uncovered.push(`${kind} ${name} — ${!isProtected ? 'NOT PROTECTED' : 'protected but UNGUARDED'} (${detail})`)
  } else if (!proven) {
    unproven.push(`${kind} ${name} — ${detail}`)
  }
  line(!isProtected ? 'OPEN' : !guarded ? 'UNTESTED' : !proven ? 'NO DATA' : 'ok', kind, name, detail)
}

async function main() {
  const svc = serviceClient()
  const anon = anonClient()
  const outsider = await personaClient('outsider')
  const sources = testSources()
  const named = (n: string) => sources.some((t) => t.includes(`'${n}'`))

  const tables = sql(`
    select c.relname
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
    order by c.relname;`).map((r) => r[0]!)

  const functions = sql(`
    select p.proname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
    group by p.proname order by p.proname;`).map((r) => r[0]!)

  // `bool_or(...)::text` renders 'true'/'false', not psql's 't'/'f'. Comparing
  // to 't' made every function read as revoked, which silently made the whole
  // function half of this gate vacuous — it could never have reported a
  // function granted to anon. Both spellings are accepted now.
  const anonExec = new Map(
    sql(`
      select p.proname, bool_or(has_function_privilege('anon', p.oid, 'execute'))::text
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosecdef
      group by p.proname;`).map((r) => [r[0]!, r[1] === 'true' || r[1] === 't']),
  )

  const { data: primary } = await svc
    .from('organizations').select('id').eq('name', ORG_PRIMARY).single()
  const primaryOrg = primary!.id

  const orgScoped = new Set(
    sql(`select c.relname
           from pg_class c
           join pg_namespace n on n.oid = c.relnamespace
           join pg_attribute a on a.attrelid = c.oid and a.attname = 'org_id' and a.attnum > 0
          where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity;`).map((r) => r[0]!),
  )

  console.log(`\n== RLS tables (${tables.length} enumerated from pg_class) ==`)
  for (const t of tables) {
    if (PUBLIC_BY_DESIGN[t]) {
      line('--', 'table', t, `public by design: ${PUBLIC_BY_DESIGN[t]}`)
      continue
    }

    const a = await anon.from(t as never).select('*').limit(1)
    const anonBlocked = !!a.error || ((a.data as unknown[]) ?? []).length === 0

    // The cross-org check must name a row belonging to the OTHER organisation.
    // Reading `limit(1)` unscoped lets the outsider return their OWN row and
    // reports a breach that is not one — this probe did exactly that on
    // organizations, org_members and profiles before it was corrected.
    let crossBlocked: boolean
    let detail: string
    let proven = true
    if (orgScoped.has(t)) {
      const ids = sql(`select id::text from public.${t} where org_id = '${primaryOrg}' limit 1;`)
      if (!ids.length) {
        crossBlocked = true
        proven = false
        detail = 'NO ROW in the primary org — nothing was actually refused'
      } else {
        const target = ids[0]![0]!
        const o = await outsider.from(t as never).select('id').eq('id', target)
        crossBlocked = !!o.error || ((o.data as unknown[]) ?? []).length === 0
        detail = 'refused a real primary-org row'
      }
    } else {
      // No org_id column: compare what the outsider sees against the whole
      // table. Seeing everything the service role sees is the failure.
      const total = Number(sql(`select count(*)::text from public.${t};`)[0]![0])
      const o = await outsider.from(t as never).select('*')
      const seen = ((o.data as unknown[]) ?? []).length
      crossBlocked = !!o.error || seen === 0 || seen < total
      proven = total > 0
      detail = `outsider sees ${seen}/${total}${total === 0 ? ' — table empty, nothing refused' : ''}`
    }

    judge('table', t, anonBlocked && crossBlocked, named(t), proven,
      `anon=${anonBlocked ? 'blocked' : 'READS'} ${detail}`)
  }

  console.log(`\n== SECURITY DEFINER functions (${functions.length} enumerated from pg_proc) ==`)
  for (const f of functions) {
    if (ANON_BY_DESIGN[f]) {
      line('--', 'function', f, `anon by design: ${ANON_BY_DESIGN[f]}`)
      continue
    }
    const grantedToAnon = anonExec.get(f) === true
    // A revoked EXECUTE grant is a fact about the catalog, not about a fixture,
    // so a function needs no data to prove it.
    judge('function', f, !grantedToAnon, named(f), true,
      `anon execute=${grantedToAnon ? 'GRANTED' : 'revoked'}`)
  }

  console.log('')
  if (uncovered.length) {
    console.log(`${uncovered.length} uncovered surface(s):`)
    for (const u of uncovered) console.log(`  - ${u}`)
    console.log('\nA new table arrives here failing until someone writes its denial test.')
  }
  if (unproven.length) {
    console.log(`\n${unproven.length} surface(s) PROTECTED BUT UNPROVEN — the table was empty, so`)
    console.log('the policy was never actually asked to refuse anything:')
    for (const u of unproven) console.log(`  - ${u}`)
  } else {
    console.log('every protected surface is both protected and guarded by a test')
  }
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
