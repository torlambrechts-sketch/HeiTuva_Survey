# Operations notes

Things that must be true of a deployed environment for the app to work, and the
local commands that reproduce them.

## Supabase project settings not covered by migrations

Migrations cover schema, RLS, functions and cron. These are auth-service
settings and have to be set on the project itself.

### The pre-launch gate — what the operator does (Phase 7c)

Everything the app cannot do for itself, in the order to do it. Each item names
where it is verified afterwards. The migrations are applied from this
repository; the settings are clicks in the Supabase and Vercel dashboards; the
two secrets are typed once and never committed.

> ## ⚠ AN APPLY IS NOT EVIDENCE. A COMPARISON IS.
>
> **Read this before running any migration against a remote project, and fingerprint
> afterwards, always.**
>
> On 2026-09-07 nineteen migrations were applied to prod and returned nineteen
> `{"success": true}` results. One of them had been **silently truncated** — its first two
> statements were cut off before it was sent, and `public.schedules.paused_at` was never
> created. Nothing failed, and nothing could have: **every later reference to that column
> lives inside a plpgsql body, and PostgreSQL does not resolve those at function creation
> time.** A schema can be missing a column for as long as nobody executes the line that
> touches it.
>
> The same run found a SECOND drift the apply could not see — `overview_activity` on prod
> was a hand-applied variant that never matched the committed migration and would have
> failed Gate 1's lint (D104).
>
> **Neither was found by applying. Both were found by comparing.** So the procedure is:
>
> 1. Apply.
> 2. **Fingerprint the remote against a freshly reset local**, and diff. Not "spot-check
>    the thing you changed" — the whole catalogue, because the failure mode is a change
>    you did not know you had made or had failed to make.
> 3. Only a matching fingerprint is evidence that the apply landed.
>
> **Normalise comments and whitespace before comparing function bodies**, or the signal
> drowns: raw `md5(prosrc)` reported 29 of 74 functions as differing, of which exactly ONE
> differed in substance. The other 28 were header comments stripped in transit.
>
> ```sql
> -- Run on BOTH, diff the JSON. Any difference is a finding until explained.
> select jsonb_build_object(
>   'n_columns',  (select count(*) from information_schema.columns
>                   where table_schema in ('public','app')),
>   'columns',    (select md5(string_agg(x,'|' order by x)) from (
>                   select c.table_schema||'.'||c.table_name||'.'||c.column_name||':'
>                          ||c.data_type||':'||c.is_nullable||':'||coalesce(c.column_default,'-') as x
>                   from information_schema.columns c
>                   where c.table_schema in ('public','app')) t),
>   'constraints',(select md5(string_agg(x,'|' order by x)) from (
>                   select n.nspname||'.'||rel.relname||'.'||con.conname||':'
>                          ||pg_get_constraintdef(con.oid) as x
>                   from pg_constraint con
>                   join pg_class rel on rel.oid = con.conrelid
>                   join pg_namespace n on n.oid = rel.relnamespace
>                   where n.nspname in ('public','app')) t),
>   'policies',   (select md5(string_agg(x,'|' order by x)) from (
>                   select schemaname||'.'||tablename||'.'||policyname||':'||cmd||':'
>                          ||coalesce(qual,'-')||':'||coalesce(with_check,'-') as x
>                   from pg_policies where schemaname in ('public','app')) t),
>   'rls_tables', (select md5(string_agg(x,'|' order by x)) from (
>                   select n.nspname||'.'||c.relname from pg_class c
>                   join pg_namespace n on n.oid=c.relnamespace
>                   where n.nspname in ('public','app')
>                     and c.relkind='r' and c.relrowsecurity) t(x)),
>   'functions',  (select md5(string_agg(x,'|' order by x)) from (
>                   select n.nspname||'.'||p.proname||'('
>                          ||pg_get_function_identity_arguments(p.oid)||'):'||p.prosecdef::text||':'
>                          ||md5(lower(regexp_replace(regexp_replace(p.prosrc,'--[^\n]*',' ','g'),
>                                                     '\s+',' ','g'))) as x
>                   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
>                   where n.nspname in ('public','app')) t),
>   'grants',     (select md5(string_agg(x,'|' order by x)) from (
>                   select grantee||':'||routine_schema||'.'||routine_name||':'||privilege_type as x
>                   from information_schema.routine_privileges
>                   where routine_schema in ('public','app')
>                     and grantee in ('anon','authenticated','service_role')) t),
>   'enums',      (select md5(string_agg(x,'|' order by x)) from (
>                   select n.nspname||'.'||t.typname||'='||e.enumlabel as x
>                   from pg_type t join pg_namespace n on n.oid=t.typnamespace
>                   join pg_enum e on e.enumtypid=t.oid
>                   where n.nspname in ('public','app')) z));
> ```
>
> **And prefer `supabase db push` over pasting file contents through a tool.** The
> truncation above was possible only because the file was read, transformed and re-sent by
> hand. `db push` sends the file.

1. **Apply the Phase 7 migrations to `heituva-prod`** — `0029_sso_break_glass`,
   `0030_split_for_all_policies`, `0031_ui_messages_org_lang_idx`. **DONE on
   2026-09-05** through the Supabase MCP (`apply_migration`), with the repo
   versions inserted into `supabase_migrations.schema_migrations` so the ledger
   matches. Confirmed: the performance advisors report no
   `multiple_permissive_policies` and no `auth_rls_initplan` rows, and the
   security advisors show only the by-design notices (no client policy on
   `answers`/`responses`/`demo_requests`; the token-validated and aggregate
   SECURITY DEFINER RPCs). Kept here as the record of what was applied and how
   to reproduce it on a fresh project: apply each file in order, then
   `insert into supabase_migrations.schema_migrations (version, name) values …`.
   **Phase 8 and 9 — DONE on 2026-09-05, same route:** `0032_threshold_policy`,
   `0033_survey_token_policy_fields`, `0034_attributed_and_org_policy` applied
   through the connector, repo versions inserted, ledger reconciled. Verified on
   prod afterwards: both statutory packs and all four duties carry their locked
   policy (the migration's UPDATE reached them because prod's packs predate it —
   D86), the two existing surveys sit at person / 5 / unlocked (no round had been
   sent, so nothing was locked), `organizations.default_k_threshold` is 5,
   `app.k_for`, `app.attributed_rows`, `attributed_results`, both survey
   triggers and the organisation⇒named CHECK exist, `anon` cannot execute
   `attributed_results`, and no function still references `app.k_threshold()`.
   Advisors unchanged apart from `attributed_results` joining the by-design
   "signed-in users can execute SECURITY DEFINER" list. The i18n reseed ran the
   same day, also through the connector: `SUPABASE_SERVICE_ROLE_KEY` is not on
   this machine (operator step 3 below is still open), so the exact upsert
   `scripts/seed-i18n.ts` performs — global rows only, `on conflict (namespace,
   key, lang, org_key)`, never an organisation's override — was issued as SQL
   from `messages/*.json`, 1342 keys per language; prod now holds 1357 global
   rows per language, the extra 15 being keys earlier phases removed from the
   files, which neither route deletes.
2. **Leaked-password protection** — Dashboard → Authentication → Passwords →
   HaveIBeenPwned on. Verified by a sign-up attempt with `password123` being
   refused. (No code reads this; Auth enforces it at sign-up and password change.)
3. **`SUPABASE_SERVICE_ROLE_KEY`, then seed i18n** — Dashboard → Project
   Settings → API → service_role, into `.env.local` on the machine that runs
   the seeds (never into Vercel for the app: the app does not use it at request
   time, only the scripts do). Then `npm run seed:i18n` against production, so
   `ui_messages` carries the Phase 6 and 7 keys. Verified by no raw
   `namespace.key` on any screen.
4. **Turnstile + sign-up rate limit** — Cloudflare → Turnstile → new widget for
   the production hostname; set `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and
   `TURNSTILE_SECRET_KEY` on Vercel (Production). With both present the splash
   renders the widget and the two public actions verify the token; with either
   missing the check is skipped, which is right locally and wrong in production.
   In the same visit set Dashboard → Authentication → Rate Limits: sign-ups per
   hour per IP (the app-side limiter is per instance, not the durable one).
   Verified by the widget appearing on `/` after the next deploy.
5. **Entra ID** — the steps under "Entra ID SSO" below: app registration,
   client id + secret + tenant into Dashboard → Authentication → Providers →
   Azure. Verified by "Logg inn med Entra ID" appearing on `/logg-inn` within
   five minutes.
6. **Production load test** — `scripts/verify/load.ts` is `--local` only
   because it submits real responses. Running it against production needs a
   throwaway survey in a throwaway organisation and an explicit go-ahead, and
   a window agreed first; it is not something to run against a live tenant. It
   gets a `--remote` mode that refuses to run without a survey id you name.

Administrator MFA (Q14) is deliberately NOT on this list: it is deferred
(docs/DEVIATIONS.md D27), so there is nothing to enable and no lockout hazard —
no "enable TOTP before the first admin signs in" step any more.

### Point-in-time recovery — NOT ENABLED. Tor to enable.

**Status 2026-09-07: off, and the substitute used on that date will not be adequate again.**

The prod sync of 0035–0053 was taken without a restore point, because this session reaches
prod only through the Supabase MCP's SQL surface — no management-API token, no database
password — so PITR could neither be taken nor its state read. What stood in was a complete
logical snapshot of every non-seed table as JSON.

**That was adequate for exactly one reason and it expires:** prod held 1 organisation, 1
member, 1 profile, 4 draft surveys and **zero responses, zero answers, zero invitations,
zero audit events**. A JSON dump through an RPC can stand in for a restore point when the
entire database is a handful of rows and everything else is regenerable from
`supabase/seed.sql`. **The moment the first real organisation answers the first real
survey, it cannot** — respondent data is the one thing in this product that cannot be
regenerated, recollected or reconstructed, and the anonymity design means nobody can be
asked to submit again.

**Enable PITR before the first real send.** It belongs above every other item on this list,
because the others fail visibly and this one fails once, silently, and permanently.

### The pre-launch gate — why (Q5, Q14)

Leaked-password protection, rate limiting on the public sign-up and demo
endpoints (Q5 amended), and Turnstile on `/` (Q5 amended) belong to one
decision. Administrator MFA (Q14) was part of it until Phase 7 deferred it
again (D27); its re-enable trigger — the first real organisation, or real
respondent data in prod — is unchanged and recorded in DECISIONS.md, so it
rejoins this gate when the code is restored.

### Entra ID SSO (Phase 6)

The app reads `/auth/v1/settings` and offers "Logg inn med Entra ID" and the
admin SSO switch only when Auth reports `external.azure`. To enable it:

1. Entra admin centre → App registrations → new registration. Redirect URI
   (Web): `https://jmhhszsnjfqgclxzhciq.supabase.co/auth/v1/callback`.
   Note the Application (client) ID and create a client secret.
2. Supabase Dashboard → Authentication → Providers → Azure: enable, paste the
   client id and secret, set the Azure tenant URL for single-tenant
   registrations. Save.
3. Nothing to deploy. The button appears on the next request after the settings
   cache expires (five minutes) or a redeploy.

Turning the org switch ON has two preconditions the screen states when they
fail (docs/DEVIATIONS.md D82, migration 0029):

- at least one active administrator must be marked "Kan logge inn uten Entra
  ID" on the same card — the break-glass administrator, who can still sign in
  with a password or magic link if the directory or the app registration
  fails. The database refuses the switch otherwise, and refuses removing,
  demoting or deactivating the last such administrator while the switch is on;
- the administrator flipping it must be signed in through Entra themselves, or
  be that exempt administrator — otherwise their next request would sign them
  out.

Recovering an organisation whose Entra tenant is broken: the break-glass
administrator signs in with a password (or asks for a magic link), turns the
switch off, and everyone can sign in with passwords again. Nobody at HeiTuva
needs to touch the database.

### Leaked-password protection (Phase 7, DECISIONS Q14)

Dashboard → Authentication → Passwords → Leaked password protection
(HaveIBeenPwned) → on. No code reads this; Auth refuses a password that appears
in a known breach at sign-up and at password change. Verified on production by
attempting a sign-up with `password123` and confirming it is refused. HIBP is a
hosted feature, so it is verified on production only.

Administrator MFA (Q14) was to sit beside this control, but it is deferred
again (docs/DEVIATIONS.md D27): no `/sikkerhet` gate, nothing to enable in Auth,
and Supabase Auth's TOTP capability is left available but not required. When
Q14 is re-enabled, this is where the "enable TOTP enrolment before the first
administrator signs in" step returns.

### SMS via LINK Mobility (Phase 6)

Set on Vercel (and for any worker process): `LINK_MOBILITY_USER`,
`LINK_MOBILITY_PASSWORD`, `LINK_MOBILITY_PLATFORM_ID`,
`LINK_MOBILITY_PARTNER_ID`, optional `SMS_SENDER` (alphanumeric sender, default
"HeiTuva") and `LINK_MOBILITY_URL` (default `https://n-eu.linkmobility.io/sms/send`).
The channel stays hidden per org until `feature_flags.sms_channel` is on for
that org (a row, not a deploy). Locally `SMS_PROVIDER=capture` with
`SMS_CAPTURE_FILE=<path>` writes one JSON line per message; `verify:send` uses
it.

### Security headers (Phase 6)

`next.config.ts` sends a CSP, HSTS (two years, preload), nosniff, `X-Frame-Options:
DENY`, a referrer policy and a permissions policy on every route. The CSP names
exactly the hosts the app talks to (Supabase, Cloudflare Turnstile, Sentry's EU
ingest) and refuses the rest; inline styles and Next's hydration scripts are
allowed because the design and the framework need them.

It deliberately does NOT send `upgrade-insecure-requests`. Vercel is HTTPS-only
and HSTS covers the rest, and the directive broke the local stack in a way only
the WebKit pixel tests caught: WebKit honours it on `http://127.0.0.1`
(Chromium exempts loopback), upgraded the stylesheet request to an https port
nobody listens on, and every mobile screenshot rendered unstyled while every
desktop one passed. Do not add it back for tidiness.

### Sentry (EU)

`instrumentation.ts` initialises Sentry only when `SENTRY_DSN` /
`NEXT_PUBLIC_SENTRY_DSN` is set, with an EU-region DSN (`ingest.de.sentry.io`).
The `beforeSend` scrubber drops request bodies, cookies and any string field
longer than 200 characters — respondent free text must never reach an error
payload (CLAUDE.md rule 7). Without a DSN the hooks are inert.

## Local development loop

```
npx supabase start          # Postgres + Auth + REST on 127.0.0.1:54321
npm run seed:demo           # personas, orgs, surveys above and below k=5
npm run seed:mfa            # TOTP factors for the administrator personas
npm run seed:i18n -- --local
npm run verify:db           # invariants + access + administration suites
npm run verify:browser      # captures every route/state in the manifest
```

`seed:mfa` writes `.mfa-secrets.json` (gitignored). Without it the browser
harness cannot get past `/sikkerhet` and every administrator route fails.

Expect `verify:browser` to take about twenty minutes. Supabase refuses a TOTP
code it has already accepted, and each capture signs in for itself, so every
administrator state waits out a 30-second code window. Reusing one signed-in
session per persona was tried and reverted — see the note in
`scripts/verify/capture.ts`.

Run `seed:demo` before a run you intend to compare screenshots from: the
captures drive the real UI, so states like the privacy toggles and the DSR list
leave the demo data changed for the next run.

## Two traps the harness now guards against

Both of these produced *green* verification runs that were not verifying the
code under review, so the guards matter more than they look.

1. **`NEXT_PUBLIC_*` is inlined at build time**, in server code as well as
   client bundles. Setting the variables on `next start` does nothing: the
   built output already contains whichever project `.env.local` named. The
   harness reads `.next/server/middleware.js` back and rebuilds if the URL in
   it is not the local stack.
2. **A stale build passes as the new one.** The harness compares the newest
   mtime under `app/`, `components/`, `lib/`, `messages/`, `types/` against
   `.next/BUILD_ID` and rebuilds when sources are newer. It also refuses to
   reuse a server someone else started if either check fails.

A third guard covers the same class of problem in the browser: after
navigating, the harness asserts the browser actually stayed on the requested
path. An unexpected redirect used to be captured as a clean screenshot of a
completely different screen.

## Supabase advisors on heituva-prod — expected findings

Run 2026-09-03 after migration 0016. No ERROR-level findings. Every remaining
one is intentional, so they should not be "fixed" in a later phase without
reading this first.

| Finding | Level | Why it stands |
|---|---|---|
| `rls_enabled_no_policy` on `responses`, `answers` | INFO | This is CLAUDE.md invariant 1 working. RLS is on and there is deliberately no SELECT policy, so the tables are default-deny to every client. Reads go through the k-gated RPCs. Adding a policy to silence the advisor would be the security regression. |
| `anon` can execute `get_survey_for_token`, `submit_response` | WARN | The respondent surface is unauthenticated by design — a respondent has no account. Both are token-validated and `submit_response` is the only write path into `responses`. |
| `authenticated` can execute `aggregate_results`, `get_quotes` | WARN | They must be SECURITY DEFINER: that is how k≥5 is enforced above RLS rather than trusting the caller. |
| `authenticated` can execute `claim_membership` | WARN | Intended. It can only attach the caller to a row already naming their own verified email, and only while unclaimed — covered by four tests in tests/db/administration.test.ts. |

| `rls_enabled_no_policy` on `demo_requests` | INFO | Same shape as `responses`/`answers`: inbound demo requests belong to no organisation; the only write path is `request_demo` (SECURITY DEFINER) and no application role may read them (Phase 6b). |
| `anon` can execute `request_demo` | WARN | The splash is public. Validates its own input, returns no row handle. On the Gate 5a3 anon allowlist with its reason. |
| `anon` can execute `get_peer_results`, `report_for_share_token`, `compose_report` | WARN | Token-authorised inside the function; the share link and the thank-you page have no session. |

The advisor cannot distinguish "no policy because nobody may read" from "no
policy because someone forgot", which is exactly why this table exists.

### Performance advisors on heituva-prod — run 2026-09-05 after migration 0027

137 findings, none at ERROR level, none introduced by Phase 6 except that
`ui_messages` now follows the same pattern as every other table. Recorded here
so they are worked deliberately, not "fixed" one at a time:

| Finding | Count | Why it stands for now |
|---|---|---|
| `multiple_permissive_policies` | 75 (15 tables × 5 roles) | The Phase 0 pattern is one `*_sel` policy for SELECT and one `*_cud for all` policy; Postgres evaluates both permissive policies on SELECT, OR-ed. Both predicates are org-scoped, and the OR of two correct predicates cannot widen access beyond either — this is a query-cost note, not a security one. The fix is one migration rewriting every `for all` into insert/update/delete policies; a next-phase item, done for all tables at once. |
| `auth_rls_initplan` | 6 (`profiles_own`, `quality_sel`, `dutydef_sel`, `sect_sel`, `bench_sel`, `audit_ins`) | Policies call `auth.uid()` per row instead of `(select auth.uid())`. Same next-phase migration. |
| `unindexed_foreign_keys` | 48 | Every `org_id`/`survey_id` FK without its own index. Real at scale, irrelevant at current row counts; add indexes with the policy rewrite so they are measured together. |
| `unused_index` | 7 | Expected on a database with seed-sized data. Re-read after the first months of production traffic before dropping anything. |
| `no_primary_key` on `feature_flags` | 1 | It has `unique (key, org_id)` semantics through the seed but no PK; Gate 5a3 carries it on the public-by-design allowlist. Give it a surrogate `id` in the same next-phase migration. |

### Security advisor additions from Phase 6

`function_search_path_mutable` on `app.normalize_phone` — migration 0027
forgot the `set search_path` every other function carries. Fixed by migration
0028. The function touches no table; the exposure was nil, the standard is
what mattered.

## Known dependency findings

**`image-size` — absent by construction.** pptxgenjs declares it and never
loads it (its bundle's only reference is a commented-out `require('sizeof')`,
a different name). The real package carries GHSA-w3rx-r6r6-pgpr and
GHSA-5p2g-fcmc-qvqq (denial of service in ICNS/JXL/HEIF parsers) with no fixed
release. Rather than argue it is unreachable, `package.json` `overrides` points
the dependency at `stubs/image-size`, which npm resolves by omitting the package
from the tree entirely; `tests/unit/absent-deps.test.ts` asserts it cannot be
resolved and that a deck still renders. pptxgenjs is neither pinned nor forked.
If a future pptxgenjs ever loads it, the require fails loudly at startup.

**`postcss` `<=8.5.22` (high) under `next`, and `next` itself (moderate, via
it)** — GHSA-qx2v-qp2m-jg93, GHSA-6g55-p6wh-862q, GHSA-fxqj-rqcc-2cmp,
GHSA-r28c-9q8g-f849: XSS through unescaped `</style>` in stringified output,
and source-map path traversal / file read when PostCSS processes
attacker-controlled CSS or source maps. In this product PostCSS runs at build
time over our own stylesheets only; no user input reaches it. The only fix npm
offers is Next 16.3.4, a major upgrade, which is a decision rather than a
hardening chore and is recorded as open for Tor.

## Production migration ledger

The Supabase MCP applies migrations under its own timestamps. Every migration
applied that way has its repo version inserted into
`supabase_migrations.schema_migrations` afterwards, so `supabase db push` sees
the ledger the repo expects. Verified 2026-09-05 (after 0034): 62 repo migrations,
0 missing on prod. If `db push` ever lists migrations as pending that are in fact applied,
that ledger row is what is missing — do not re-run the migration.

---

## Prod sync, 2026-09-07 — migrations 0035–0053 applied to `heituva-prod`

**Authorised by Tor** as one deliberate pass, after V1-6's close-out reported that prod
was nineteen migrations behind. `heituva-prod` = `jmhhszsnjfqgclxzhciq`, eu-central-1.

### 1. The snapshot, and what it was NOT

**PITR was not taken and could not be.** This session reaches prod only through the
Supabase MCP's SQL surface; there is no management-API token and no database password, so
neither a PITR restore point nor a `pg_dump` was available, and PITR's enablement state
could not even be read. **Stated rather than worked around.**

What was taken instead:

- A **complete logical snapshot** of every non-seed table (`organizations`, `org_members`,
  `profiles`, `surveys`, `survey_questions`, `groups`, `share_links`, `schedules`) plus the
  full migration ledger, as JSON. Complete because prod is small: **1 organisation, 1
  member, 1 profile, 4 draft surveys, 10 questions.** Everything else is regenerable from
  `supabase/seed.sql` and `scripts/seed-i18n.ts`.
- **`responses` = 0, `answers` = 0, `survey_invitations` = 0, `audit_events` = 0.** There
  is no respondent data on prod and never has been. That is what made this safe to do
  without PITR, and it will not be true again.
- A **destructive-statement scan** of all nineteen files, comments stripped and multiline:
  zero `DROP TABLE`, `DROP COLUMN`, `TRUNCATE` or `DELETE FROM`. Every `drop` is a
  constraint, policy, trigger, function or index recreated in the same file.

**Next time this is done, prod will hold answers, and a logical snapshot through an RPC is
not an adequate substitute for PITR.** Enabling PITR belongs on the launch list.

### 2. Applied

All nineteen, in order, via `apply_migration`, **zero failures**: 0035 `peer_results_org_rule`
· 0036 `survey_threshold_ceiling` · 0037 `quality_rules_lang_key` · 0038
`per_virksomhet_share_scope` · 0039 `survey_target_from_round` · 0040 `pack_question_roles`
· 0041 `empty_group_is_not_a_number` · 0042 `empty_cell_sweep` · 0043 `cadence_values` ·
0044 `recurrence` · 0045 `send_round_interval` · 0046 `dashboard_layouts` · 0047
`panel_registry` · 0048 `preset_title_unique` · 0049 `use_cases` · 0050 `trends_count` ·
0051 `org_timezone` · 0052 `timezone_sites` · 0053 `trends_participation`.

0043 was applied alone before 0044, as its own header requires — `ALTER TYPE … ADD VALUE`
cannot be used in the transaction that adds it.

### 3. The ledger

`apply_migration` stamps its OWN version (a fresh timestamp), not the file's, so the
nineteen landed as `20260907132222`…`20260907133104`. Rewritten to the repository's
filename versions in one statement keyed on the migration name, so `supabase db push` now
sees a ledger that matches `supabase/migrations/` exactly.

### 4. TWO DRIFTS FOUND, and neither could have been found by any gate

A full schema fingerprint of prod against local — columns, constraints, policies, RLS
tables, functions, grants, enums — found two differences. **This comparison is the actual
deliverable of the exercise**, and it is why "apply the migrations" was not the whole job.

**(a) `public.schedules.paused_at` was missing. MY ERROR, made during this very pass.**
Migration 0044's header was stripped with a hard-coded `lines[20:]` offset instead of the
comment-detecting scan used for every other file, cutting off its first two statements —
`add column paused_at` and its comment. **Nothing failed at apply time**, because every
later reference to the column lives inside a plpgsql body and PostgreSQL does not resolve
those at creation. Repaired by re-applying the lost statements.

> The general form, and it is the same shape as every other finding this project has
> turned on: **a mechanical shortcut that succeeds is more dangerous than one that fails.**
> Nineteen `{"success": true}` results said nothing about whether nineteen files had
> actually been applied.

**(b) `public.overview_activity` on prod was never the committed version, and predates
this session.** Prod's body declared `i int`; the committed migration
(`20260904000013`) deliberately does not, and carries a comment saying why — `for i in
reverse …` declares its own loop variable, and declaring one shadows it, which
`supabase db lint` reports twice. The file has ONE commit in git history, so it was not
edited after the fact: **prod carried a hand-applied variant that never matched the
repository.** Prod would have failed Gate 1's lint. Re-applied verbatim from the committed
file.

Found by normalising away comments and whitespace: 29 of 74 function bodies differed raw
(expected — headers are stripped when applying through the MCP), and exactly **one**
differed in substance. The raw hash alone would have buried it in noise.

**After both repairs every fingerprint matches local byte for byte**: columns (367),
constraints, policies, RLS tables (45), normalised function bodies (74), grants, enums.

### 5. Invariants verified ON PROD (read-only)

First time any of these has been checked against prod rather than local.

| Invariant | Result on prod |
|---|---|
| No SELECT policy on `responses` / `answers` | **none** — `[]` |
| RLS on the vault | `responses` true, `answers` true |
| Anonymity CHECK | `CHECK ((anonymity_at_submission <> 'anonymous') OR (invitation_id IS NULL))` present |
| Tables without RLS | **none** — `[]` |
| `app.k_threshold()` | 5; the one organisation's default is 5 |
| `anon`-executable functions | exactly the six by-design: `compose_report`, `get_peer_results`, `get_survey_for_token`, `report_for_share_token`, `request_demo`, `submit_response` |
| SECURITY DEFINER without a pinned `search_path` | **none** — `[]` |

### 6. Advisors, re-read against the synced schema

**No new security finding.** Every one matches the expected-findings table above:
`rls_enabled_no_policy` on `responses`/`answers`/`demo_requests` (INFO — invariant 1
working), the six `anon` SECURITY DEFINER executables, and the `authenticated` SECURITY
DEFINER executables (lint 0029 now enumerates all of them rather than the three recorded
in 2026-09-03; same class, same rationale). One WARN that is not in the table and is
already on the launch list: **`auth_leaked_password_protection` is disabled.**

### 7. NOT DONE, and why — the invariant suite against prod

Tor asked for the invariant suite to run against prod. **It was not run, and this is a
decision to take rather than an omission to fix.**

The suite is a fixture GENERATOR, not a read-only checker: 28 `asUser` call sites create
real `auth.users` rows through `auth.admin.createUser`, and there are 70 `organizations`
inserts plus surveys, rounds, invitations, responses and answers. Pointing it at prod is
one environment variable, and it would write all of that into the production database
permanently. Teardown is known to be imperfect — V1-5's own finding, now standing question
4 in `tests/db/clients.ts`, was a test that leaked exactly the rows it existed to prevent.

Cleaning up afterwards would itself be bulk row deletion on the remote project, which
CLAUDE.md makes a stop-and-ask.

**What was done instead answers most of the question**: the schema is now proven identical
to local byte for byte, so a suite green on local is green on this schema; and the seven
invariants above were checked on prod directly. What remains unproven on prod is
BEHAVIOUR under real RLS with real JWTs — cross-org isolation, leser refusals, token
replay. **The clean way to get that is a disposable database, not production.**

---

## 2026-09-08 — `M:0059` applied to prod out of order, and fingerprinted

**One migration, applied ahead of its phase closing, on Tor's instruction.** The trade was
the reasoning, not the severity: `report_shares.group_id ON DELETE SET NULL` widens a share
link's access when a group is deleted (see `M:0059`'s header), and every day it stood was a
day an administrator could trigger it by tidying up.

**Prod's head before: `20260908063553` (`k_for_honours_q91` = `M:0057`).** `M:0058`
(segments) is deliberately NOT applied — it belongs to V2-3a and had not been asked for.
`M:0059` is standalone: it touches `report_shares`, `survey_invitations`, `responses` and
`org_members`, none of which `M:0058` creates. It is also idempotent throughout —
`drop constraint if exists` + `add`, `add column if not exists`, `create index if not
exists` — so a later `db push` re-applying it by filename is safe.

**Prod's scale, measured rather than assumed, because the trade rests on it:**

```
orgs 1 · members 1 · groups 0 · surveys 4 · rounds 2 · invitations 2
responses 1 · reports 0 · report_shares 0
```

**Two corrections to the premise the apply was authorised on, neither of which changes the
decision.** It was put as «zero rounds sent and no share links»: there are **2 rounds, 2
invitations and 1 response**. There are indeed **0 report_shares and 0 groups** — which
makes the trade better than stated, not worse: with no groups, the FK changes cannot block
anything and the widening is currently unreachable. Recorded because a premise that is
right by luck is not a premise anyone can reuse.

### The comparison, which is the evidence — the apply is not

A whole-catalogue fingerprint against a freshly reset local **could not simply be run**: the
working local carries `M:0058` and `M:0060`, which prod does not. Comparing them would have
produced differences that had to be *explained away* one by one, and explaining differences
away is exactly the judgement this procedure exists to remove.

So the local was reset to **prod's intended state instead** — `M:0058` and `M:0060` moved
aside, `supabase db reset`, confirmed by `to_regclass`: no `segments`, no `suppressions`,
`member_id` present. Then both sides ran the fingerprint query above.

| | local mirror (0001–0057 + 0059) | heituva-prod |
|---|---|---|
| `n_columns` | **377** | **377** |
| `columns` | `87e247298a31738957623bcf52200c36` | `87e247298a31738957623bcf52200c36` |
| `constraints` | `8e28e5c47e10ab7f5d7f00012416fd4d` | `8e28e5c47e10ab7f5d7f00012416fd4d` |
| `policies` | `7cb901e38a1323eddb8e119cce430eaf` | `7cb901e38a1323eddb8e119cce430eaf` |
| `rls_tables` | `bfa0167f3e2e4d8cffb9e38237199ee6` | `bfa0167f3e2e4d8cffb9e38237199ee6` |
| `functions` | `d2a01215aad5d525e98db6f867b63767` | `d2a01215aad5d525e98db6f867b63767` |
| `grants` | `bc62f5373760c4061353280a314bf3f1` | `bc62f5373760c4061353280a314bf3f1` |
| `enums` | `3daa7a71b419145535d7e7349d55b318` | `3daa7a71b419145535d7e7349d55b318` |

**All eight match.** That is a stronger result than the apply's `{"success": true}`: it says
prod's entire catalogue is identical to a clean build of the same migration set — which also
re-confirms that the two prod-only repair migrations (`recurrence_paused_at_repair`,
`overview_activity_repair_to_committed`) really did return prod to the committed state.

The specific change, read back from prod's own catalogue:

```
org_members.group_id           n  (SET NULL, deliberately unchanged)
report_shares.group_id         c  (CASCADE — the widening is closed)
responses.respondent_group_id  a  deferrable, deferred
survey_invitations.group_id    a  deferrable, deferred
```

**Advisors re-read after the apply: no new finding.** The three `rls_enabled_no_policy`
entries are `answers`, `responses` and `demo_requests` — CLAUDE.md invariant 1 says clients
never select from the first two and no select policy exists by design. The
SECURITY DEFINER executables are the set `verify:policy` enumerates and allowlists.
Leaked-password protection is still disabled and is still on the launch list.

**Reversal, if it is ever wanted:** the three constraints go back with the same
`drop constraint if exists` / `add constraint … on delete set null` shape. `member_id` would
be dropped. Nothing in prod's data depends on either — 0 groups, and `member_id` is null on
both existing invitations, since it is written only by `send_round`'s group loop, which
`M:0060` introduces and prod does not have.

---

## 2026-09-09 — `M:0058`, `M:0060`, `M:0061` applied to prod (Q103, partial)

**Tor authorised all thirty (`M:0058`, `M:0060`–`M:0088`) and then, on the method question
below, narrowed this run to the article 21 machinery. Twenty-seven remain unapplied.**

### Why it stopped at three, and it was a method decision rather than a failure

The MCP's `apply_migration` takes SQL as a **tool parameter**, so every migration must be
read, retyped through the agent's own output, and re-sent — which is precisely what this
document already warns about:

> «prefer `supabase db push` over pasting file contents through a tool. The truncation above
> was possible only because the file was read, transformed and re-sent by hand.»

Doing that thirty times, across full rewrites of `send_round`, `run_due_schedules` and
`submit_response`, is the 2026-09-07 failure mode repeated at scale. It was put to Tor with
the alternative — a connection string, which would let `supabase db push` send the files
themselves — and he chose: **apply the article 21 machinery now, hold the remaining 27 for the
safer method.** `supabase db push --db-url` is what unblocks them.

### What was applied

| | | |
|---|---|---|
| `M:0058` | `segments_and_group_source` | `segments`, `segment_fields`, `groups.source`/`synced_at`, Q94's policy fix |
| `M:0060` | `suppressions` | **GDPR art. 21** — the table, `app.is_suppressed`, the raising guard, and the skip in all three insertion points |
| `M:0061` | `lift_audit_carries_who_entered` | Q96 — `created_by` default, the lift audit carrying who entered |

A fourth ledger row, `segments_predicate_verbatim_body`, restores
`app.validate_segment_predicate` with its comments intact. It exists because the first apply
of `M:0058` was sent with the function's `--` comments stripped: **the eight-hash fingerprint
normalises comments away and would not have caught it.** Corrected deliberately rather than
left to a gate that cannot see it.

### THE COUNT WAS DERIVED FROM A DOCUMENT AND THEN VERIFIED TWO WAYS

The remainder document computed «thirty» from this file's 2026-09-08 fingerprint, because the
agent's environment has no Supabase credentials (`env | grep -c SUPABASE` → 0). Before
applying anything, that number was checked against prod itself:

1. **`list_migrations` reconciled by NAME** — 116 repo migrations against prod's 89 ledger
   names: exactly the same thirty missing, plus the three prod-only repairs this document
   already records (`recurrence_paused_at_repair`,
   `overview_activity_repair_to_committed`, `overview_activity_revoke_public`).
2. **A BEFORE fingerprint** — all eight hashes matched the 2026-09-08 table exactly
   (`n_columns` 377, `columns` `87e2472…`). Prod had not moved since.

### THE AFTER FINGERPRINT — mirror method, per Tor's instruction

The local was reset to prod's **intended** state (`0001`–`0061`, the 27 later migrations moved
aside) rather than compared against a working tree carrying V2-4 to V2-10.

| | local mirror (0001–0061) | heituva-prod |
|---|---|---|
| `n_columns` | **398** | **398** |
| `columns` | `7d764ab9fd4e695953b39677bf9ae979` | `7d764ab9fd4e695953b39677bf9ae979` |
| `constraints` | `997b76933d1341141ea21543f59a60cb` | `997b76933d1341141ea21543f59a60cb` |
| `policies` | `710457fd73c628416285a1b945e984d3` | `710457fd73c628416285a1b945e984d3` |
| `rls_tables` | `da070624b46147256c48066b10d4b9b6` | `da070624b46147256c48066b10d4b9b6` |
| `functions` | `81795168d824af4365aca00a2028abd9` | `81795168d824af4365aca00a2028abd9` |
| `grants` | `bc62f5373760c4061353280a314bf3f1` | `bc62f5373760c4061353280a314bf3f1` |
| `enums` | `3daa7a71b419145535d7e7349d55b318` | `3daa7a71b419145535d7e7349d55b318` |

**All eight match.**

### A NINTH CHECK, AND IT FOUND SOMETHING THE EIGHT CANNOT SEE

The `functions` hash strips `--` comments and collapses whitespace, by design. So a raw
`md5(prosrc)` aggregate was compared as well:

| | local mirror | heituva-prod |
|---|---|---|
| raw `prosrc` aggregate | `dfc4418833360fb92c57d55d912ad5cc` | `047931e0c5122f11df000d8ed3001375` |
| **normalised aggregate** | **`0cc580252dc9909fb76acc061ca532f3`** | **`0cc580252dc9909fb76acc061ca532f3`** |

**The normalised aggregate is identical across all 79 functions — the raw one is not.**
Twenty-seven functions differ in **comment text and whitespace only**, and the six touched
today are byte-identical. **This divergence PREDATES today**: it comes from the earlier
hand-applies of 2026-09-05/07/08, which the eight-hash fingerprint was never able to see.

**It is a documentation-fidelity divergence, not a behavioural one.** Prod's stored function
source is not a faithful copy of the repo's prose, and in a project where the comments carry
the reasoning that is worth knowing. Recorded rather than repaired: repairing it means
re-sending 27 function bodies by hand, which is the risk this run was narrowed to avoid.
**`supabase db push` would close it as a side effect of applying the remaining 27.**

### THE ARTICLE 21 MACHINERY, PROVEN ON PROD

A probe created an organisation, a survey, a round and an objection, exercised the guard and
the skip, and then **aborted with a RAISE so the whole block rolled back** — verified after:
`__art21_probe__` organisations left = 0, `suppressions` rows = 0.

```
PROBE_RESULT guard_raised=t skip_excluded=t invitations_for_objector=0
```

- `app.is_suppressed` matches case-insensitively (`Objector@Example.Test` → `objector@…`).
- A direct insert of a suppressed address **raises `recipient_suppressed`**.
- `send_round` **skips** the objector: zero invitations, nothing queued.

**Prod can no longer send to someone who has objected.** That was the reason this moved to the
front and it is now discharged.

### Invariants read directly on prod

| Invariant | Prod |
|---|---|
| 1 — no client SELECT policy on `responses`/`answers` | **0 policies** |
| 2 — the anonymity CHECK | `CHECK (((anonymity_at_submission <> 'anonymous'::app.anonymity_mode) OR (invitation_id IS NULL)))` |
| 3 — RLS on every `public` table | **0 tables without RLS** |
| Q96 — `created_by` has a writer | default `auth.uid()` |
| guard + lift-audit triggers | both present and enabled (`tgenabled = 'O'`) |

**What could NOT be run:** the Vitest invariant suite itself, which needs a Postgres connection
string this environment does not have. The checks above are its structural assertions
re-expressed as SQL; the role-based ones (a `leser` reading `answers`, cross-org isolation
through a persona client) need authenticated sessions and were **not** run against prod. Said
plainly rather than reported as a green suite.

### Advisors, after the apply

`get_advisors(security)` returns **no new finding**. Everything reported is the known,
by-design set:

- `rls_enabled_no_policy` on `answers` and `responses` — **that IS invariant 1**, and on
  `demo_requests`, which `request_demo` writes and no role reads.
- `anon_security_definer_function_executable` ×6 and the `authenticated` equivalent ×26 — the
  architecture itself; Gate 5a3 governs which are allowlisted and why.
- `auth_leaked_password_protection` — launch-gate item 2, unchanged.

**Nothing was reported against `segments`, `segment_fields` or `suppressions`.**

### Prod's head after this run

`20260909125210`, 133 ledger rows. **Twenty-seven migrations remain unapplied:**
`M:0062`–`M:0088`. What is still absent from prod is listed by capability in
`docs/v2/06-remainder.md § 2.2`; the two entries that matter most are unchanged from that
document — **`M:0068`, the round-freeze data-loss repair, is still not applied.**
