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
