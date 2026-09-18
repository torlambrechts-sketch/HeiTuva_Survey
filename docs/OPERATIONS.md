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
> **4. AND «HOW FAR BEHIND IS PROD» IS THE SAME QUESTION, WITH THE SAME ONLY ANSWER.**
> `mcp__Supabase__apply_migration` stamps its OWN timestamp into
> `supabase_migrations.schema_migrations`, not the repo filename's version, so a migration
> applied through MCP is genuinely applied and its ledger row will never match its file.
> **A version string is therefore not an identity, and the ledger cannot be diffed against
> filenames** — not approximately, not as a lower bound. Measured 2026-09-10: 54 of prod's
> 170 versions had no repo file and 7 repo files had no prod version, and those are ONE
> artefact seen from two sides, not two findings. All seven were present on prod when
> probed by object.
>
> This was not a hypothetical either. `docs/v2/06-remainder.md` carried «THIRTY MIGRATIONS
> STAND UNAPPLIED» for a day, derived that way, describing a database that no longer
> existed — under its own footnote saying to re-run the fingerprint rather than trust the
> count. **A footnote is not a guard.** The guard is the command sitting where the number
> is: fingerprint, or an existence probe written from what the migration CREATES, read out
> of the file rather than guessed. A first probe guessed three object names and returned
> three zeroes; **a negative from a probe written from memory is not evidence of absence.**
> `06-remainder.md § 2.0` carries the worked query.
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

---

### THE LIMIT OF THIS FINGERPRINT, WRITTEN DOWN — added 2026-09-09 (Tor)

**The `functions` hash strips `--` comments and collapses whitespace. That was the right
decision and its price was never recorded.**

It normalises because a raw `md5(prosrc)` diff reported **29 of 74 functions as differing, of
which exactly ONE mattered** — a signal that drowns, and a check nobody would keep running.
Normalising made the fingerprint usable.

**The price is that the fingerprint cannot see documentation drift at all**, and on 2026-09-09
that drift was measured for the first time: all eight hashes matched between prod and a clean
local mirror, **and twenty-seven of seventy-nine functions differed in comment text.** It had
accumulated across twelve migrations applied by hand since 2026-09-05 with nothing in the
apparatus able to catch it — the 2026-09-08 table's «all eight match» was true, and did not
mean what a reader would assume it meant.

**Same shape as D110's «interpolates {k}» addition: a control exactly true about what it
measures and silent about a room it never claimed to cover.** The difference, and why it
belongs here rather than in the deviations log: **this one was deliberate, and the
deliberation was not written down.** A limit chosen on purpose and left unrecorded is
indistinguishable, later, from a limit nobody noticed.

> **The normalised hash proves BEHAVIOUR is identical and proves nothing whatever about
> comments. When what you are checking is whether the SOURCE is the source, run the raw
> per-function `md5(prosrc)` as well.**

Run both, side by side — the normalised one to know the code is the same, the raw one to know
the file is:

```sql
with fn as (
  select n.nspname||'.'||p.proname as f,
         md5(lower(regexp_replace(regexp_replace(p.prosrc,'--[^\n]*',' ','g'),'\s+',' ','g'))) as norm,
         md5(p.prosrc) as raw
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public','app')
)
select count(*)                                     as fns,
       md5(string_agg(f||'='||norm,'|' order by f)) as normalised_aggregate,
       md5(string_agg(f||'='||raw ,'|' order by f)) as raw_aggregate
  from fn;
```

A raw mismatch with a matching normalised aggregate means **comments and whitespace only** —
by construction, since the normalisation removes exactly those. Report it as a documentation
divergence, not as drift.

**THE CONTROL EARNED ITSELF ON ITS FIRST RUN, ON THE WORK OF THE PERSON RUNNING IT.** The
first apply of `M:0058` on 2026-09-09 went out with `app.validate_segment_predicate`'s
comments stripped — the migration was retyped through a tool parameter and the prose was
dropped on the way. **The eight-hash fingerprint passed it.** The raw per-function hash showed
it, and a fourth ledger row (`segments_predicate_verbatim_body`) restored the body verbatim
before anything else was applied. A check that catches its own operator, on its first use, is
the kind worth keeping.

**Standing consequence:** `apply_migration` retypes migrations, so it will keep producing this
drift. `supabase db push` sends the files and does not — a second reason to prefer it, beyond
the truncation risk named just above.

---

### A STALE CAPABILITY NOTICE READS EXACTLY LIKE A CURRENT ONE — added 2026-09-09 (Tor)

The 2026-09-09 session opened with a system notice saying the Supabase MCP **required
authentication and could not be used**. It was stale: the MCP was authenticated and working,
and one `list_projects` call established that in a single round.

**Only a call distinguishes a stale capability notice from a current one.** They are the same
sentence. This is D110's rule applied to an environment fact rather than to a document — *an
apply is not evidence, a comparison is* — and the cost is asymmetric: believing a false
«unavailable» stops work that could proceed, and is **invisible, because nothing fails**.

**Try the tool before reporting it unavailable.** Report unavailability from a failed call,
naming the call and the error — never from a notice alone.

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

### VERIFYING BEFORE APPLYING, WHEN THE ANSWER IS «NO CHANGE»

The thirty came from a document — `docs/v2/06-remainder.md`, computed from this file's
2026-09-08 fingerprint, because the agent's environment had no credentials. It was checked
against prod two ways before anything was applied, **and both said «no change».**

**That is the case where nobody bothers**, and it is the case the rule is for. A count carried
forward from a document is a claim about a database, and it stays a claim until something asks
the database. The check cost two calls and the answer being «unchanged» is not evidence the
check was unnecessary — it is the only way to know it was.

### Prod's head after this run

`20260909125210`, 133 ledger rows. **Twenty-seven migrations remain unapplied:**
`M:0062`–`M:0088`.

**`M:0068` GOES IN THE FIRST BATCH.** It is the round-freeze repair, and until it is applied
**prod still destroys a round's aggregates on the retention schedule** while the bundle
promises «Summerte tall beholdes». It is not a feature and it is not waiting on a decision; it
is waiting on a connection string. What is still absent from prod is listed by capability in
`docs/v2/06-remainder.md § 2.2`; the two entries that matter most are unchanged from that
document — **`M:0068`, the round-freeze data-loss repair, is still not applied.**

---

## 2026-09-09 — the remaining twenty-seven applied; prod is at the repository head

**`M:0062`–`M:0088` applied to `heituva-prod` (`jmhhszsnjfqgclxzhciq`) in filename order,
through `mcp__Supabase__apply_migration`, each file sent verbatim.** All twenty-seven returned
`{"success": true}`. With the three from earlier the same day (`M:0058`, `M:0060`, `M:0061`)
and the prod-only `segments_predicate_verbatim_body` repair, **Q103's thirty are complete.**

**`supabase db push` was not the route, and the reason is an environment fact rather than a
preference.** `db.jmhhszsnjfqgclxzhciq.supabase.co` does not resolve from this container and
the poolers that do resolve have 5432/6543 blocked — only 443 is open, through
`HTTPS_PROXY`. The command's own error is `LegacyDbConnectError … getaddrinfo ENOTFOUND`.
The connection string exists and is unusable from here; the MCP is the only path, and it was
authorised. **The standing preference for `db push` is unchanged and so is its reason — it
sends the file, and `apply_migration` retypes it.**

**The capability notice at the top of this session said the Supabase MCP required
authentication and could not be used. It was stale.** One `list_migrations` call settled it,
which is the rule recorded above applied for the second time in two days.

### The fingerprint — mirror method, both hashes

The local was `supabase db reset` to a clean build of all 116 files immediately before the
comparison, so the mirror is prod's intended state and not a working tree carrying something
else.

| | local mirror (0001–0088) | heituva-prod |
|---|---|---|
| `n_columns` | **452** | **452** |
| `columns` | `cb777034252616e1880ce470ff13c082` | `cb777034252616e1880ce470ff13c082` |
| `constraints` | `c6958ca034dfb7bd77d491b713e79bb3` | `c6958ca034dfb7bd77d491b713e79bb3` |
| `policies` | `cfa9f6f9db325495b3006698f5539da0` | `cfa9f6f9db325495b3006698f5539da0` |
| `rls_tables` | `cb5cf4623fdd6ef241a935afc0426afd` | `cb5cf4623fdd6ef241a935afc0426afd` |
| `functions` | `5a3cca176199c50d23be31cfcec54532` | `5a3cca176199c50d23be31cfcec54532` |
| `grants` | `eb550ec99d7a02b2a3fa018d97b00dc3` | `eb550ec99d7a02b2a3fa018d97b00dc3` |
| `enums` | `113b10fde591212cbecd19621b2afca5` | `113b10fde591212cbecd19621b2afca5` |

**All eight match.** The ninth check — the raw per-function `md5(prosrc)` — was run beside it,
as the section above now requires:

```
fns  normalised_aggregate              raw_aggregate
94   059cc13d4f347642ebcc11460931d881  ed2448faff77bf418d2522957d702da8   local
94   059cc13d4f347642ebcc11460931d881  d96841c2bbf87e9dc828d3ad39c223ca   prod
```

**Normalised identical, raw different: twenty-four of ninety-four functions differ in comment
text only** — by construction, since the normalisation removes exactly comments and
whitespace. Enumerated: `cadence_interval`, `forbid_translation_edit_after_send`,
`forbid_version_mutation`, `guard_sso_break_glass`, `map_pack_use_cases`, `preset_title_free`,
`report_quotes`, `resolve_token`, `resume_schedule`, `suppress_partition`, `sync_survey_target`
(app); `claim_membership`, `dashboard_summary`, `get_benchmarks`, `get_heatmap`, `get_quotes`,
`get_themes`, `get_trends`, `quote_candidates`, `results_summary`, `sign_duty`,
`snapshot_report`, `snapshot_results`, `survey_response_counts` (public).

**None of the twenty-seven this run applied is in that list.** Every function this run
created or replaced matches local byte for byte, because every file was pasted verbatim
rather than summarised. **The divergence is the older debt** — the hand-applies of
2026-09-05/07/08, which the eight-hash fingerprint was never able to see and which the ninth
check made visible for the first time yesterday.

**IT IS NOT SAFE TO REPAIR BY RE-APPLYING THE DEFINING MIGRATION, AND THAT IS WORTH WRITING
DOWN BEFORE SOMEBODY TRIES.** Four of the twenty-four — `results_summary`,
`dashboard_summary`, `get_benchmarks`, `sync_survey_target` — were later rewritten in place by
`M:0077`, which patches `pg_get_functiondef` output rather than shipping a body. Re-applying
their original file would restore the comments **and silently remove V2-7's `is_test`
filter**, putting the editor's own preview back into every participation denominator. A repair
has to re-apply the base file and then every patching migration after it, in order. It is a
reconstruction, not a re-run, and it is not urgent: behaviour is provably identical.

### Ledger, reconciled

Thirty-five rows carried MCP-assigned versions rather than the repository's filename versions.
Rewritten keyed on name, each one checked first for a unique name and a free target:

```
repo_files 116 · repo_versions_missing_from_ledger 0
```

**Every one of the 116 files is present at its own version; `supabase db push` would now see
nothing pending.** Forty-six ledger rows remain that no repo file matches: forty-two are the
2026-09-04/05 double-apply duplicates (each of those names also carries its repo version, so
nothing is missing), three are prod-only repairs
(`recurrence_paused_at_repair`, `overview_activity_repair_to_committed`,
`segments_predicate_verbatim_body`) and one is `overview_activity_revoke_public`. **Clearing
the forty-two is a bulk delete on the remote ledger, which CLAUDE.md says is stop-and-ask —
so they stand, harmlessly: an extra row never causes a re-apply.**

### Invariants, read from prod's own catalogue

| Invariant | Result on prod |
|---|---|
| SELECT policy on `responses` / `answers` | **none** — `[]` |
| RLS on the vault | `responses` true, `answers` true |
| Anonymity CHECK | `CHECK ((anonymity_at_submission <> 'anonymous') OR (invitation_id IS NULL))` |
| Tables without RLS | **none** — `[]` |
| Functions inserting into `responses` | **exactly one: `submit_response`** |
| `app.k_threshold()` | 5 |
| k floor / ceiling | `k_threshold >= 2 or respondent_kind = 'organisation'`; `<= 10`; org default 2–10 |
| `anon`-executable | the six by design **plus `redeem_live_voucher`** (V2-9's voucher, allowlisted in 5a3) |
| SECURITY DEFINER without a pinned `search_path` | **none** — `[]` |

**The role-based half of the invariant suite did not run against prod and is not claimed.**
Cross-org isolation, «leser cannot read answers» and token replay need real persona sessions
over a Postgres connection, and neither is reachable from this container. What stands in for
them is the `policies` hash: prod's RLS predicates are byte-identical to the local build the
suite passes against. That is a strong argument and it is not the measurement, and the
difference is the point of this file.

### Advisors, re-read against the synced schema

**No new security class.** `rls_enabled_no_policy` on `answers`/`responses`/`demo_requests`
(invariant 1, by design); the anon-executable SECURITY DEFINER list is now **seven**, the six
plus `redeem_live_voucher`; `auth_leaked_password_protection` is still the launch-gate item.

**Two WARNs that are new since the 2026-09-05 reading, and BOTH ARE IN THE COMMITTED
MIGRATIONS RATHER THAN IN PROD.** Verified against the freshly reset local, where they are
identical:

1. `function_search_path_mutable` × 6 — `app.task_step_index`, `app.below_threshold`,
   `app.live_word_floor`, `app.guard_live_is_anonymous`, `app.guard_run_mode_anonymous`,
   `app.guard_quiz_policy`. **None is SECURITY DEFINER** (the invariant table above reads
   zero), and all six are in `app`, which PostgREST does not expose.
2. `auth_rls_initplan` × 1 — `dashboard_presets_sel` is `auth.role() = 'authenticated'`
   rather than `(select auth.role()) = …`, from `M:0047`.

**Both have been true in the repository since V1-4 and nothing saw them, because the advisors
are only ever read against prod and prod was nineteen migrations behind.** That is the same
shape as every finding this project has turned on — a control that was exactly true about what
it measured, and silent about a room it never reached. Logged for the remainder, not fixed:
the apparatus is frozen and the sequencing is Tor's.

### Prod's head after this run

**116 of 116 repository migrations applied**, the last being `20260909000088`
(`token_carries_run_mode`). 162 ledger rows. `max(version)` is **not** that file: it is
`20260909125210`, the prod-only `segments_predicate_verbatim_body` repair, which sorts above
every filename version because it was stamped with a clock rather than a filename. Worth
knowing before reading a head off `max(version)` again — **a repair row is the newest thing in
that table and it is not the newest migration.** `M:0068` — the round-freeze repair — is applied: every path that closes
a round now freezes its numbers, and the retention job no longer destroys a round's aggregates
before anything wrote them down.

---

## 2026-09-09 (later) — S3's six migrations applied to prod, and the ninth check earning itself again

Applied through the Supabase MCP, in order: `M:0089` (compose_report role rules), `M:0090`
(member group tenancy), `M:0091` (who-writes-this-column comments), `M:0092` (the BLOCKER's
composite key), `M:0093` (guards over state), `M:0094` (snapshot reads + the retention switch).
All six returned `{"success": true}`, **which is exactly the evidence this file says is worth
nothing on its own.**

### The fingerprint — mirror method, both hashes

Local was `supabase db reset` to a clean build of all 122 files immediately before the
comparison.

| | local mirror (0001–0094) | heituva-prod |
|---|---|---|
| `n_columns` | **453** | **453** |
| `columns` | `cd512378848b4aabd5ed4f7e7b5603e8` | `cd512378848b4aabd5ed4f7e7b5603e8` |
| `constraints` | `42c1580de9a92cbf88858a3ca1f595d7` | `42c1580de9a92cbf88858a3ca1f595d7` |
| `policies` | `41561d3cd6c37005513a4a6b5d87ee51` | `41561d3cd6c37005513a4a6b5d87ee51` |
| `rls_tables` | `cb5cf4623fdd6ef241a935afc0426afd` | `cb5cf4623fdd6ef241a935afc0426afd` |
| `functions` | `f04ad84f6296a8616aa43d0031751a46` | `f04ad84f6296a8616aa43d0031751a46` |
| `grants` | `eb550ec99d7a02b2a3fa018d97b00dc3` | `eb550ec99d7a02b2a3fa018d97b00dc3` |
| `enums` | `113b10fde591212cbecd19621b2afca5` | `113b10fde591212cbecd19621b2afca5` |

**All eight match.**

### AND THE NINTH CHECK CAUGHT ME, WHICH IS THE POINT OF IT

```
fns  normalised                        raw
95   59caa27182dd587f09448637cabb945f  86d6a19e64374638a221621bbbb1b78e   local
95   59caa27182dd587f09448637cabb945f  c0218485b1e4e14f987eee7e0c664b54   prod
```

Twenty-**six** functions differed on the raw hash, against the twenty-four this file recorded
yesterday. **Two of the extra were mine, and both were functions this run had just replaced:**
`app.redact_for_role` and `app.guard_survey_policy`.

The cause is the sentence this file already contains — *«every file was pasted verbatim rather
than summarised»* — and I did not follow it. Retyping the migrations for the MCP payload, I
**abridged comment blocks to keep the payload small**. `public.compose_report` and
`app.apply_retention` came out byte-identical because their bodies were pasted whole; the two
that were shortened did not.

**Repaired the same way it was found: by taking the definition from the local CATALOGUE rather
than from my hands.** `pg_get_functiondef` on local, sent verbatim to prod. Both now match byte
for byte (`63be805f…` and `dc747774…` on both sides), and the differing set is back to the
pre-existing twenty-four.

> **The rule, sharpened by its second instance.** «Paste verbatim» is not about laziness, it is
> about the transformation: **any hand-editing of a migration between the file and the wire is a
> place where local and prod stop being the same thing**, and comment text is the half no
> behavioural test can see. If the payload is too large to send whole, the answer is more calls,
> not shorter comments.

### What the fingerprint cannot see, checked separately

`grants` in the eight-hash query covers `information_schema.routine_privileges` only — FUNCTION
privileges. `M:0094` changes **table and column** privileges, which that hash is blind to. Checked
directly on prod:

| | prod |
|---|---|
| table-level SELECT on `result_snapshots` for `authenticated`/`anon` | **0** |
| column SELECT for `authenticated` | `content_hash, created_at, id, org_id, round_id, scope, survey_id` — **`aggregates` absent** |
| `snaps_sel` qual | `app.has_role(org_id, ARRAY['administrator','redaktor'])` |
| `guard_invitation_not_suppressed` events | INSERT + UPDATE |
| `report_section_types where names_individuals` | 2 |

**A ninth blind spot, recorded rather than fixed:** the eight-hash fingerprint would not have
noticed if the column revoke had failed. It is not widened here — the apparatus is frozen — but
the next migration that changes a table grant should check it by hand, as this one did.

### Advisors

Re-read after the applies: unchanged from the audit's baseline. `rls_enabled_no_policy` on
`answers` and `responses` is CLAUDE.md invariant 1 working as designed; `demo_requests` is the
third. Six `function_search_path_mutable`, all `app`-schema triggers. The SECURITY DEFINER
executable warnings are the architecture. `auth_leaked_password_protection` remains disabled and
is the owner's to enable. **No new advisor was introduced by any of the six.**

### Ledger note

`apply_migration` stamps its own version timestamp, so prod's ledger rows for these six do not
carry the repository's filenames. That drift already existed (the 2026-09-09 prod-only repair
row) and is why the fingerprint, not the ledger, is the evidence.

## 2026-09-10 — the mail worker on prod, and the ninth check used outside Postgres for the first time

`M:0095` applied (as `mail_worker_schedule`), the `mail-worker` Edge Function deployed at
version 2, and the two Vault rows created. What was **not** achieved: delivery. The reason is
named in § below.

### THE NINTH CHECK, MOVED FROM SCHEMA TO CODE

The eight-hash fingerprint compares the CATALOGUE; the ninth check compares raw
`md5(prosrc)` per function, and it exists because the eight hashes cannot see a
comment. **Both are about Postgres. An Edge Function is neither** — it is a file
uploaded through an API — and until this run there was no equivalent for it.

`mcp__Supabase__get_edge_function` returns the deployed file contents, so there
is one: **fetch the deployed source and compare it against what you meant to
send.** That is the same discipline in a different substrate, and it is now part
of the procedure rather than a thing someone might think of.

**Use it whenever a function is deployed by pasting content into a tool call**,
which is the whole risk: the CLI bundles from the repository and cannot mistype,
while an MCP payload is transcribed. This run supplied the proof that the risk is
real, twice over:

| What | Result |
|---|---|
| `M:0095`'s three function bodies, first apply | `mail_worker_secret` MATCH, `run_mail_worker` MATCH, **`mail_outbox_depth` DIFFERED** — repo 619 bytes, prod 304 |
| Cause | I dropped two inline `--` comments from the body while retyping for the payload. The two I pasted whole matched. |
| Fix | Re-applied the exact body; all three then byte-identical to the repository |
| The Edge Function, deployed v2 | Fetched back and read: entrypoint, provider, copy and env all as intended |

**This is the SECOND time in two sessions that comments were abridged on the way
to an MCP payload** — 2026-09-09 caught `app.redact_for_role` and
`app.guard_survey_policy` the same way. Two instances in two sessions is not a
coincidence, it is a property of the medium: **any hand-transcription between the
file and the wire is where local and prod stop being the same thing**, and
comments are the half no behavioural test can see. If a payload is too large, the
answer is more calls, not shorter comments.

### One divergence deliberately NOT closed

The deployed function has `// eslint-disable-next-line` above `svc: any`; the
repository now has `type ServiceClient = any` with the pragma on the alias,
because a multi-line signature made the old pragma attach to the wrong line and
the rule fired. **Types are erased by Deno — the emitted JavaScript is
identical.** A third production deploy to change a lint comment is a change to
production with no behavioural difference, which is risk without fidelity. It is
recorded in `supabase/functions/README.md` and reconciles on the next deploy that
carries real code. Same judgement as the applied migrations whose comments name
D125/D126: the divergence is known and written down rather than papered over.

### What is on prod now, and the one thing that is not

| | State |
|---|---|
| `M:0095` | applied; `mail_outbox_depth`, `mail_worker_secret`, `app.run_mail_worker` present, all three byte-identical to the repo |
| `mail-worker` function | version 2, ACTIVE, `verify_jwt: false` (it authenticates its own caller) |
| Vault | `mail_worker_url`, `mail_worker_secret` (32 random bytes generated in-database; no human or agent has seen its value) |
| cron `mail-worker-minutely` | active, firing every minute |
| Auth, end to end | **works** — 0 responses with status 403 |
| Brevo secrets | **readable from the function's own environment** — `configured()` returns null, so `BREVO_API_KEY` and `MAIL_FROM` are present |
| The queue | **still 2 queued, 0 archived, `max_read_ct` 0 — never even read** |
| `sent_at` | still NULL on both invitations |

**The one failing precondition: `NEXT_PUBLIC_APP_URL` is not set as an Edge
Function secret.** The worker refuses to drain, by design, because the invitation
body contains `<origin>/s/<token>` and nothing else identifies the survey — an
origin of `''` would send a real invitation whose only link is relative, dead in
every mail client, and would delete it from the queue and write `sent_at` while
doing so. A message spent on nothing.

That guard was added in this same run, minutes before it fired. Before it, this
deployment would have sent both invitations with a dead link.

**It is not the missing bounce webhook.** The bounce path is blocked on the
provider (D133) and touches nothing in the send path.

### Advisors after the DDL

Re-read. Everything flagged is pre-existing and either by design — RLS enabled
with no policy on `responses`/`answers` IS security invariant 1, and the
SECURITY DEFINER lints are the architecture — or already recorded as the owner's
(leaked-password protection). **One is new and mine:** `extension_in_public`,
because `create extension if not exists pg_net` named no schema and it landed in
`public` rather than `extensions`. Recorded, not fixed: pg_net's functions
resolve as `net.http_post`, the live cron job depends on them, and moving an
extension's schema while a scheduled job calls into it is not a change to make
casually for a lint. Fix it in a migration that can be tested first.

### The credential hunt, and what the probe was worth

Seven diagnostic rounds were needed to find out why nothing sent. In order,
each killing one hypothesis by measurement rather than argument:

| # | Established |
|---|---|
| 1 | The origin was missing — `NEXT_PUBLIC_APP_URL` not set. Fixed. |
| 2 | Past the origin check, Brevo refused both messages: `brevo 401`. |
| 3 | Brevo's own words: `unauthorized: Key not found`. Not permissions, not sender validation. |
| 4 | A fresh deploy (v5, guaranteed cold start) still failed — **a warm instance holding a stale secret is ruled out.** |
| 5 | The fingerprint: `len=90 xkeysib=false` — **the value present is not an API key at all.** |
| 6 | Fingerprint identical on the next run — **the value had never changed; the save was not landing.** |
| 7 | Cause: Brevo's API-keys page read «You do not have any API keys», so there was no new value to paste. |

**THOSE SEVEN ROUNDS COST THE TWO QUEUED INVITATIONS NOTHING.** The queue ended
where it started: 2 queued, 0 archived, `read_ct` 2. `?probe=1` validates the
credential against the provider's account endpoint and touches neither the queue
nor an invitation.

**Diagnosed the obvious way — run the worker and see — the same seven rounds
would have spent five attempts and DESTROYED THE MESSAGES BEING DIAGNOSED**,
because `MAX_ATTEMPTS` is five and every real send attempt increments
`read_ct`.

And the wreckage would have lied about itself. **An archived queue reads as a
DELIVERY failure**: messages tried, messages dead-lettered, addresses
presumably bad. The actual fault was a CREDENTIAL — one field in one dashboard —
and the evidence that would have said so is precisely the evidence the diagnosis
would have consumed. The investigation would have destroyed its own subject and
then pointed at the wrong suspect.

That is the general argument for a read-only diagnostic beside any queue whose
retry budget is finite: **the thing you are debugging must not be the thing you
spend to debug it.** Pausing cron when `read_ct` began climbing is the same
principle applied to time rather than to attempts.

## 2026-09-10, later — EMAIL IS LIVE IN PRODUCTION

Two real invitations delivered to a real inbox from the cron-scheduled run, and
`sent_at` written on both rows. The full sequence, with the numbers, because
«email works» is the kind of claim this project requires evidence for.

| | before (11:28:38Z) | after (11:29:40Z) |
|---|---|---|
| `mail_outbox_depth()` | `queued 2, archived 0, invisible 0, max_read_ct 2` | `queued 0, archived 0, invisible 0, max_read_ct 0` |
| `15c1b8a2…` (anonymous) | `sent_at NULL` | `sent_at 2026-09-10 11:29:01.27+00` |
| `bf43e859…` (named) | `sent_at NULL` | `sent_at 2026-09-10 11:29:01.46+00` |
| cron `mail-worker-minutely` | `active false` | `active true` |

The before-row was read in the same statement that unpaused the job, so there is
no window between the reading and the change. `cron.job_run_details` shows the
run starting `11:29:00.057933+00`, status `succeeded`; the worker returned
`{"ok":true,"sent":2,"left":0,"archived":0}`. **`archived: 0` is the good number
and not a missing one** — the success path calls `mail_outbox_delete`, and
`archive` is the dead-letter path, so zero means nothing was destroyed. Confirmed
from the inbox by Tor, which is the check that is not in the system.

### The last blocker was an IP allowlist, and the 401 carried it

After the API key was moved to `BREVO_API_KEY`, the probe still returned 401 —
with a completely different body:

```
unauthorized: We have detected you are using an unrecognised IP address
2a05:d014:61b:2708:3bd0:e8ce:5e7b:4dd1. If you performed this action make
sure to add the new IP address in this link: https://a…
```

Brevo's account had IP restriction enabled on API usage. **`brevo 401` has now
meant three different things in this one effort** — wrong key type (the SMTP
password), key not found, and caller not allowlisted — none of them about the
message. DECISIONS Q6b held through all three: `retryable`, `left: 2`, nothing
archived.

**Allowlisting was ruled out by measurement, not by argument.** Four probes one
minute apart reported four distinct egress addresses across three distinct /64
subnets — `…:2708:3bd0:e8ce:5e7b:4dd1`, `…:270a:3901:6ddc:ac2a:7f3f`,
`…:2709:92de:14fd:4f73:bc67`, `…:270a:2346:f742:91cc:97d2` — from four
consecutive calls to one function. Edge Functions egress from a shared AWS pool
with no stable address, so an allowlist entry fixes the instance that just failed
and breaks on the next cold start; the addresses are also IPv6, which the
allowlist may not accept at all. Tor turned the restriction off, and the next
probe returned `{"ok":true,"status":200,"detail":"account …"}`.

Worth keeping as a procedure: **four cheap probes turned «which of my guesses is
right» into «this option cannot work», and a table of four addresses is an
argument nobody has to take on trust.**

### The probe's final tally

Twelve diagnostic rounds across the whole credential hunt, and the queue ended
them at `max_read_ct` 2 of 5 — unchanged from where it started. Run through the
worker instead, those twelve would have dead-lettered both invitations twice
over, and the wreckage would have read as a DELIVERY failure rather than a
credential one. `?probe=1` costs nothing and answers the only question that
mattered.

### What the comparison found that the deploy log did not

`get_edge_function` was read after the send, as the ninth check applied to a
function. Three things came back that reading the log would not have given:

1. **The platform reports version 11; `supabase/functions/README.md` records
   six.** Both are right — Supabase redeploys a function when the project's
   secrets change, and this hunt involved several saves. The log's numbers are
   deploys, not platform versions, and that is now written down before someone
   reads the gap as a missing entry.
2. **`env-check` is deleted**, confirmed by `list_edge_functions` returning
   `mail-worker` alone — by listing, not by the report that it had been done.
3. **`scripts/edge-bundle.ts` would have broken production on its first use.**
   `lib/mail/brevo.ts` is written `from './env'`; Deno needs `./env.ts`. The
   running function has the extension only because it was typed in by hand during
   transcription, so the generator written to guarantee fidelity would have
   regressed the one thing hand-transcription got right — and `./env` is a value
   import, so the failure is module resolution on the first request, not a failed
   type-check. Its assertion covered the entry point's imports and was silent
   about the imports inside the files it copies. Now stated as the property (no
   relative specifier in the bundle may lack an explicit extension), asserted
   over the whole bundle, and proven to fire before being trusted.

The third is the one to remember: **the tool built to prevent transcription error
contained the same class of error, and only a comparison against the running
system found it.** An apply is not evidence.

### Still open after this

- **`bounced_at` has no writer** (D133) — no Transactional → Webhooks on this
  account. Unchanged.
- **The provider's `messageId` is discarded** (D134, found in this send) — so
  nothing joins a row to Brevo's own delivery view, which was the implicit
  compensating control for D133. The two should be revisited together.
- **`pg_net` is installed into `public`** — a new advisor, mine. Not moved while
  `app.run_mail_worker()` depends on `net.http_post`.
- **A minutely cron now runs in production**, ~1440 invocations a day, most
  finding an empty queue and returning `sent: 0`. Within limits, but it also
  writes a row to `net._http_response` each time; pg_net's own retention governs
  that. Logged rather than tuned.
- **`personvern@heituva.no`** in `legal.privacy6P` / `privacy8P` — held until the
  replacement mailbox is confirmed to RECEIVE.

## 2026-09-10 — the two advisor categories, classified once

`get_advisors(type: security)` reports `anon_security_definer_function_executable` (7) and
`authenticated_security_definer_function_executable` (31). **Neither is a defect list.** Both
are the advisor observing this product's central architecture: CLAUDE.md invariant 1 says
clients never select from `responses`/`answers` and every result read goes through a
SECURITY DEFINER RPC, so a long list of callable definer functions is what compliance with
that invariant LOOKS like from outside.

Which is exactly why it needed classifying once and writing down. **A category that is
mostly by-design and nobody's to own is a category that stays unread**, and the one real
finding inside it stays unread with it.

**Derived, not asserted.** Every public SECURITY DEFINER function was asked whether its body
carries an authorisation predicate or validates a token, and what `anon`/`authenticated` may
actually execute:

```sql
select p.proname,
       (p.prosrc ~ 'app\.(is_|has_|can_)') as authz_predicate,
       (p.prosrc ~ 'p_token|token_hash')   as token_validated,
       has_function_privilege('anon', p.oid, 'EXECUTE')          as anon_can_call,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_can_call
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef order by 1;
```

**29 of 36 carry an authorisation predicate or validate a token.** The seven that carry
neither, each classified:

| Function | anon | auth | Classification |
|---|---|---|---|
| `mail_outbox_read` / `_delete` / `_archive` / `_depth` | ✗ | ✗ | **By design.** Service-role only; EXECUTE is revoked from both roles, so they appear in neither advisor category. `mail_worker_secret` is 5a3-CHECKED |
| `mail_worker_secret` | ✗ | ✗ | **By design**, as above |
| `claim_membership` | ✗ | ✓ | **By design, and it CANNOT check membership** — it is how a signed-in user claims an invited membership, so it necessarily runs before one exists. The check it does carry is on the invitation |
| `request_demo` | **✓** | ✓ | **By design that it is public** — the splash form — **but see below** |

**`request_demo` IS THE ONE THING THIS PASS FOUND.** It is anon-callable by design, writes
`demo_requests`, and carries no authorisation predicate and no token, which is correct for a
public form. Its abuse control is Cloudflare Turnstile — **and the Turnstile keys are not
configured in production** (`NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`; launch
readiness item 3, still open). The code is written and reads them; until they are set, the
form's only protection is absent. **Not a code defect and not a new item** — it is the
already-known launch item, but nobody had connected it to the fact that it leaves an
anon-writable RPC unprotected on a live origin, and that connection is the reason to raise
its priority above «a click Tor owes us».

### A note on the probe, because it was wrong first

The first pass matched `is_org_member|has_role|can_edit_survey|auth\.uid` and reported
`get_trends` as having no membership check — a cross-org aggregate leak, if true. It was
false: `get_trends` calls **`app.can_view_survey`**, which that alternation does not contain.
**My classification predicate was itself an enumeration** — the four helpers I could think
of, standing in for «an authorisation helper» — which is the shape this repository has now
recorded eight times, committed here inside the pass written to close a security category.
Re-derived as `app\.(is_|has_|can_)`, a property rather than a list.

Same lesson as the migration probe two hours earlier that returned three false zeroes from
guessed object names: **a negative from a predicate you wrote from memory is not evidence.**

## 2026-09-16 — prod sync: the distance was SIX migrations, not three, and the ninth check earned itself again

**The instruction said production was at M:0119 and the distance was M:0120–M:0122.** Measured, it
was at **M:0113** — the ledger's last row was `20260912171153 worklist_notes` — and the whole **I2
tranche (M:0114–M:0118) plus M:0119** had never been applied.

### HOW THE WRONG DISTANCE SURVIVED THE FIRST PROBE, WHICH IS THE LESSON

The first probe was BY OBJECT, exactly as instructed, and it was still wrong:

```
method_rules                         absent   ✓ M:0120 missing
organizations.survey_view            absent   ✓ M:0122 missing
position('retention' in get_survey_for_token)  0   ✓ M:0121 missing
```

All three true. All three applied. All three returned `{"success":true}`. **And the probe was an
enumeration of the migrations I expected to be missing, read as the distance** — CLAUDE.md's own
shape, committed by the person following the instruction that says to avoid it. «By object» fixes
the *method*; it does nothing about the *scope*, and the scope was taken from the instruction.

**What caught it was the fingerprint, because a fingerprint cannot be scoped to an expectation:**

```
rls_tables   local e7c079c7…   prod 1c6ff3c9…
  < public.entra_connections    (local only — I2 never landed)
  > public.scim_credentials     (prod only — I2 removed it)
```

**So the rule that generalises: an existence probe answers the question you ASKED. A whole-catalogue
comparison answers the question you did not.** Run the probe to know what to apply; run the
fingerprint to know what you missed. This is the same relationship as «an apply is not evidence, a
comparison is», one level out — the probe is the apply's cousin, not the comparison's.

### THE OUT-OF-ORDER APPLY HAD A REAL COST, NOT A COSMETIC ONE

`M:0119` and `M:0121` both `create or replace public.get_survey_for_token`, and **M:0121's body is
written on top of M:0119's** — it contains `has_thread`. Applying M:0119 after M:0121 would have
silently reverted the retention payload F1 shipped for the respondent's anonymity sheet: no error,
no failed check, a green apply, and a respondent sheet that stops being able to state a duration.

Order run: M:0115 → M:0116 → M:0117 → M:0118 → M:0119, then **M:0121 re-applied**, then M:0114.
Each file verbatim through `apply_migration`. Every call succeeded; nothing failed.

### THE MIRROR FINGERPRINT — ALL EIGHT MATCH

| hash | value (both sides) |
|---|---|
| `n_columns` | 523 |
| `columns` | `3719a0c3d5b48fd88f72847469c5dc18` |
| `constraints` | `ba316160fb14b620994474e3ef8bc1fc` |
| `policies` | `66e6ab6b199c475f8dedafe2af077568` |
| `rls_tables` | `e7c079c751cb3238eb774346fd820bb5` |
| `functions` | `09d52577bb6a077ad3455cd0fd2ff00a` |
| `grants` | `b568f7e603b7321a682432283bd64ba7` |
| `enums` | `113b10fde591212cbecd19621b2afca5` |

### THE NINTH CHECK SPLITS, AND THAT IS WHAT IT IS FOR

```
fns                     local 118                                 prod 118          same
normalised_aggregate    aac5eef35c147865b5b336b24d73232d          same              MATCH
raw_aggregate           5f0ccf85b424b58a6304819dd9ed9444          a270ffe903b777d4e81be0d5f2dd62c1   DIFFER
```

A raw mismatch under a matching normalised aggregate means **comments and whitespace only**, by
construction. **24 of 118 functions differ**, and the direction is not ambiguous — prod's bodies are
the stripped ones, every time:

```
chars           local 51 806   prod 42 093    9 713 lost
`--` markers    local    144   prod      7      137 lost
functions with ZERO comment markers left on prod:  22 of 24
```

The worst individually: `public.get_trends` 3025 chars / 15 markers → **1967 / 0**;
`public.get_benchmarks` 5186 / 11 → 4339 / 0; `app.resolve_token` 2637 / 11 → 1890 / 0. Two are
partial rather than total — `app.report_quotes` 8 → 3, `public.snapshot_report` 7 → 4.

**This is the drift this file already recorded on 2026-09-09** («twenty-seven of seventy-nine
functions differed in comment text»), still standing, now re-measured at 24 of 118 against a larger
catalogue. It is the hand-transcription signature of the 2026-09-05/07/08 applies, and **none of
today's ten applies added to it** — the ten migrations applied here are not in the list.

**NOT REPAIRED, and that is a decision rather than an oversight.** It is behaviour-neutral by
construction, the eight-hash fingerprint and every gate are clean, and repairing it means
re-applying 24 function bodies to production for prose. The cost of leaving it is real and worth
naming: **a future session reading `get_trends` on prod finds no reasoning at all**, in a project
whose reasoning lives in its comments. The repair, when someone wants it, is mechanical —
`create or replace` each of the 24 from its own migration file, then re-run the ninth check and
require `raw_aggregate` to match.

### LEDGER AND WHAT IS NOW TRUE THERE THAT WAS NOT

Ledger: **198 rows**, head `20260916074942`. It carries MCP's own timestamps, so it cannot be
diffed against filenames — the eight hashes are the evidence, not the row count. Ten rows added:

```
20260915084444 method_rules                      20260915085347 status_source_names_a_side
20260915084509 token_carries_retention           20260915085408 entra_sync_schedule
20260915084527 survey_default_view               20260915085430 token_has_thread
20260915085246 entra_connection                  20260915085454 token_carries_retention_reapply
20260915085328 entra_sync                        20260916074942 remove_scim_push
```

New in production, none of it previously there:

- **`entra_connections`** — the first long-lived third-party credential this schema holds, the token
  in `vault` and only its handle in the row. RLS on with NO policy, grants revoked explicitly.
- **Eleven Entra functions** — two `app` sync functions, `entra_connection_status`,
  `disconnect_entra`, `store_entra_connection`, and the five worker wrappers.
- **A new cron job, `entra-sync-nightly`, `0 3 * * *`, active.** It is a no-op until
  `entra_sync_url` and `entra_sync_secret` exist in the vault — and it RAISES A WARNING naming the
  missing one rather than passing silently, which is the difference between «not set up» and «ran
  and found nothing».
- **SCIM is gone**: `scim_credentials` 0, `%scim%` functions 0. The one row was HeiTuva AS's own,
  never used, and `count(external_id) = 0` — SCIM provisioned nobody, ever.
- **`org_members.status_source`** is now `('local','directory')` rather than `('local','scim')`.
- **`method_rules`**, **`organizations.survey_view`**, and `get_survey_for_token` carrying both
  `has_thread` and the retention pair.

Cron now: `entra-sync-nightly`, `mail-worker-minutely`, `reminders-hourly`, `retention-daily`,
`schedules-hourly` — all active.

Advisors re-read: nothing new is wrong. `entra_connections` appears under `rls_enabled_no_policy`,
which is **by design** and stated in `M:0115`'s own comment. One pre-existing item, unrelated to
this sync and not acted on: **leaked-password protection is disabled** in Supabase Auth.

PITR not raised (Q131).

### A DISTANCE MEASURED AGAINST A LIST OF EXPECTED ABSENCES IS THE LIST, NOT THE DISTANCE

**Tor, 2026-09-16, on the sync above.** This is why the fingerprint is EIGHT HASHES and not a
checklist, and it is the sentence to read before any remote apply.

«Probe by object» is already in this file, and it is a rule about METHOD. It says nothing about
SCOPE — and the scope comes from whoever states the task. The 2026-09-16 sync probed three objects,
got three correct answers, applied three migrations successfully, and was six migrations wrong,
because the three objects were the ones the instruction named.

> **A probe can only report on what you thought to ask for. Only a whole-catalogue comparison can
> report on what you did not.** So: fingerprint FIRST whenever the distance is asserted rather than
> measured, then probe to decide the order.

### «IN ORDER» IS NOT SUFFICIENT WHEN TWO MIGRATIONS REPLACE ONE FUNCTION

**Its own entry, at Tor's instruction, because the failure mode leaves nothing to find.**

`M:0119` (`token_has_thread`) and `M:0121` (`token_carries_retention`) both
`create or replace public.get_survey_for_token`. **M:0121's body is written on top of M:0119's** —
it contains `has_thread` as well as the retention pair. So the two are not independent: the LATER
one is a superset, and applying them in filename order after the fact is only correct if the later
one is applied last.

The 2026-09-16 sync applied M:0121 first (believing prod to be at M:0119). Catching up on the
missing six «in order» afterwards would have run M:0119 last and **silently reverted F1's retention
payload on the respondent's anonymity sheet.**

**Why that is worse than an error:** the apply returns success, no gate fails, no test is red — the
respondent surface simply stops being able to state a duration, and the sentence it used to render
is gone. There is no artefact to find later. The only signal would have been a human noticing an
absent paragraph on a page they had no reason to re-read.

**So before applying a catch-up set, group the files by the OBJECT they replace.** Where two touch
the same function, read both bodies and apply the superset last — filename order is a proxy for
dependency order and it is the wrong proxy exactly when one migration was written against another.
The sync above did this: M:0115..M:0119 in order, then **M:0121 re-applied** as the last word on
`get_survey_for_token`.

## 2026-09-17 — G5 + G6 prod sync: nothing to apply, and the ledger said 38

**Prod head: `jmhhszsnjfqgclxzhciq`, ACTIVE_HEALTHY, eu-central-1.** The sync was
authorised as one piece for G5 and G6; **no migration was applied, because measurement
says none is outstanding.** The evidence, in the order the procedure asks for it.

### The distance, measured by whole-catalogue comparison rather than by a version string

| fingerprint | local | prod | |
|---|---|---|---|
| `fn_names` (app+public) | `779e19b4…` / **124** | `779e19b4…` / **124** | **identical** |
| `fn_bodies` | `c57c1e16…` | `dd5774d6…` | 27 differ |
| **`fn_bodies_nc`** (comments stripped) | **`0cb3b28d…`** | **`0cb3b28d…`** | **identical** |
| `rls_tables` | `68561ab7…` / 93 | `c8968025…` / 91 | 2 differ |
| ledger | `23fde276…` / 154 | `3ac735fc…` / 202 | — |

**The two RLS tables are `storage.iceberg_namespaces` and `storage.iceberg_tables`** — a
difference between the local CLI's storage-api and prod's, in a schema that is not ours.
Every `public` and `app` table matches.

**The 27 differing bodies are all comment residue**, which is what the third fingerprint is
for: `fn_bodies_nc` matching exactly means no function differs in anything but comments.
Verified on an instance rather than inferred from the aggregate — local
`app.cadence_interval` carries **3** `--` comments, prod's carries **0**, and the SQL between
them is identical. Last sync this was 25 of which 24 were residue; here it is 27 of 27.

### THE LEDGER SAID 38 BEHIND AND THE LEDGER IS NOT THE MEASUREMENT

`comm` against the repo's filenames: **38 repo versions absent from prod's ledger, and 86
prod ledger rows that are not repo filenames at all.** Both numbers are artefacts — MCP
`apply_migration` writes its own timestamp (`20260916134956`) rather than the file's — and
this is the sharpest available demonstration of *«the ledger cannot be diffed against
filenames»*. A sync driven off that number would have re-applied thirty-eight migrations
over a database that already has them.

### THE TWO FUNCTIONS THAT TWO PENDING MIGRATIONS EACH REPLACE

Derived over every migration rather than from the instruction: **36 functions are defined by
more than one migration, and 6 have at least one definer among the 38 the ledger called
pending.** Two of those are last sync's trap:

```
public.get_survey_for_token   …0902000009 …0903000007 …0903000012 …0904000033 *M:0119 *M:0121
app.enqueue_reminders         …0903000010 …0903000012 …0904000027 *M:0108 *M:0126
```

Probed on prod, both carry their LATEST definition — `get_survey_for_token` holds M:0119's
thread key **and** M:0121's retention payload together, and `app.enqueue_reminders` holds
M:0126's `'reminders'` join. **Had the ledger been believed, applying M:0119 after M:0121
would have reverted F1's retention payload with a green apply and no error.**

### Object probes for the rest of the window

`method_rules` 1 · `organizations.survey_view` 1 · the closed-loop pair 2 ·
`app.guard_run_mode_allowed` 1 · `tasks_source_ref_needs_kind` **0** (M:0123 removed it) ·
`organizations.options` default =
`jsonb_build_object('tuva',true,'quiz',true,'live',true,'klarsprak',true,'reminders',true,'sso',false,'brand_mail',true)`.

### The data side the fingerprint cannot see — read, not accepted

- **1 organisation, 1 of 1 carrying all seven option keys.** M:0125's merge backfill landed.
- **1 of 1 still carrying `weekly_digest` and `allow_self_serve`.** That is Q216 working as
  decided: the column KEEPS them and nothing reads them. Read rather than assumed, because
  «the removal was non-destructive» is a claim about rows.
- `survey_view` null: **0**. `retention_months` null: **0**.
- **The load-bearing trigger order is `organizations_aa_merge_options`** — BEFORE UPDATE OF
  `options`, and the `aa_` prefix is what makes it fire before `guard_sso` and
  `mode_in_use`, since Postgres orders triggers by name. Present, correctly named, correctly
  scoped. `guard_invitation_not_suppressed` is `BEFORE INSERT OR UPDATE OF email` — Q137's
  column scope, intact. 5 cron jobs.

### `ui_messages`: the value-changed set is EMPTY, so there was nothing to ask prod for

Derived from git across `3be5fe4..HEAD` (G5 + G6), per key and per language:

```
messages/no.json:  added=43  VALUE-CHANGED=0  removed=0
messages/en.json:  added=43  VALUE-CHANGED=0  removed=0
```

All 43 are in the `tuva` namespace. Prod holds **4252 rows and 0 in `tuva`**, one scope
(global), langs da/en/no/sv. By D217/D218's overlay model a MISSING row falls through to the
compiled bundle and is harmless; only a DIFFERING row overrides. **No key changed value, so
no row can have gone stale, and no reseed is owed.** The procedure terminates here rather
than being skipped.

### Advisors — no new CATEGORY, and the counts grew by design

Against the 2026-09-10 baseline in this file:

| category | then | now |
|---|---|---|
| `anon_security_definer_function_executable` | 7 | **10** |
| `authenticated_security_definer_function_executable` | 31 | **38** |
| `rls_enabled_no_policy` | 4 | 4 (`answers`, `responses` — invariant 1; `demo_requests`, `entra_connections`) |
| `extension_in_public` | 1 | 1 (`pg_net`) |
| `auth_leaked_password_protection` | 1 | 1 (owner's to enable) |

The three new anon-executable functions, derived from the migration that created each rather
than from a diff of the old list: **`get_comment_thread`** (`M:0099`, C1) and
**`get_closed_loop_for_token`** + **`set_result_optin`** (`M:0123`, G1). All three are
token-validated — a respondent holds a link, never a session — and all three are 5a3
allowlisted beside `submit_response` with reasons that cite numbered tests.

### What is now true on prod that was not

**Nothing.** That is the finding, and it is the correct outcome rather than a skipped step:
G5 and G6 touched no `supabase/` path — verified per commit — and the schema was already in
step through M:0126 from the previous sync. **The application code is what changes with G5
and G6, and that ships with the Vercel deploy, not with a migration.**

---

## RUNBOOK — `verify:responsive` requires a database reset before it runs

**Added 2026-09-18, Phase A5 (D249).**

```bash
supabase db reset && npx tsx scripts/seed-i18n.ts --local && npm run seed:demo && npm run seed:help
npm run verify:responsive
```

**Why.** Eleven manifest labels declare `route: '/undersokelser'` and reach their screen by clicking
a row in the survey list. `verify:roundtrip`, `verify:send`, `verify:load`, the full vitest suite and
`verify:hermetic` all create surveys in the demo organisation. Run after them without a reset, the
list is long enough that `.first()` on the row locator times out, and the gate exits 1 with
«could not be measured» on up to 26 combinations — none of which is about a screen.

**Reading rule:** a red from this gate is a question about the database first. Check the control
count on `undersokelser` — a seeded baseline is ~35; 112 means the fixture grew.
