# Operations notes

Things that must be true of a deployed environment for the app to work, and the
local commands that reproduce them.

## Supabase project settings not covered by migrations

Migrations cover schema, RLS, functions and cron. These are auth-service
settings and have to be set on the project itself.

### TOTP MFA — deferred (DECISIONS Q14)

Administrator MFA is **not enforced**: Q14 was amended to a deferral with a named
re-enable trigger (the first real organisation, or any real respondent data in
prod, whichever comes first). The `/sikkerhet` gate and the aal2 requirement in
`requireAdmin()` were removed with it (migration 0009 dropped the flag). Supabase
Auth still supports TOTP; nothing in the app requires it. When the trigger
fires, the work is: re-add the aal2 check in `app/(app)/layout.tsx` and
`requireAdmin()`, enable TOTP in Dashboard → Authentication → Multi-Factor
Authentication, and turn on leaked-password protection in the same visit — the
advisor lists it as a WARN today for the same deferral.

### The pre-launch gate (all four together)

These are deliberately off and belong to one decision, not four:

1. Administrator MFA (Q14, above).
2. Leaked-password protection (Q14; Dashboard → Authentication → Passwords).
3. Rate limiting on the public sign-up and demo endpoints (Q5 amended). The
   app-side limiter in `lib/ratelimit.ts` runs per instance; the durable limit
   is Supabase Auth's own (Dashboard → Authentication → Rate Limits: sign-ups
   per hour per IP) and must be set there.
4. Cloudflare Turnstile on `/` (Q5 amended). Set `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
   and `TURNSTILE_SECRET_KEY` on Vercel; with both present the splash renders
   the widget and the two public actions verify the token server-side. With
   either missing the widget is not rendered and the check is skipped — which
   is the correct local behaviour and the wrong production one, so the presence
   of both keys on Vercel is part of this gate.

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

Turning the org switch ON requires the administrator doing it to be signed in
through Entra themselves (docs/DEVIATIONS.md D82).

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

## Known dependency finding

`npm audit` reports `image-size` (via `pptxgenjs`) — GHSA-w3rx-r6r6-pgpr and
GHSA-5p2g-fcmc-qvqq, denial of service in the ICNS/JXL/HEIF parsers, range
`<=2.0.2` with no fixed release published at the time of writing. The vulnerable
code is reachable only from `addImage`, which the PowerPoint renderer never
calls; the library's own reference to `image-size` is inside a commented-out
function. Re-check on each dependency bump; drop this note when a fixed
`image-size` ships and the override is in place.

## Production migration ledger

The Supabase MCP applies migrations under its own timestamps. Every migration
applied that way has its repo version inserted into
`supabase_migrations.schema_migrations` afterwards, so `supabase db push` sees
the ledger the repo expects. Verified 2026-09-05: 56 repo migrations, 0 missing
on prod. If `db push` ever lists migrations as pending that are in fact applied,
that ledger row is what is missing — do not re-run the migration.
