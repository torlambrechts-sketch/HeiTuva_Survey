# Integration architecture — the internal groundwork

Status: **PLAN.** Nothing here is built. This is the internal half of
`docs/SLACK_INTEGRATION.md` — everything HeiTuva must change in itself before it
can hold a third-party integration safely, stated without reference to any
particular provider.

The split is deliberate. The Slack plan is blocked on decisions that are not
engineering's (a legal gate, artboards, a DECISIONS entry). **None of the work
below is blocked on any of them.** Every phase here is worth doing on its own
terms, is reusable by Entra sync, Google sync and HR sync — which have rendered
as "kommer" cards since Phase 3 — and half of it fixes something that is wrong
today.

Security is the organising principle rather than a section: each phase below is
named by the trust boundary it establishes.

---

## 0. What is actually missing

HeiTuva has no integration architecture. It has four *point* integrations —
SES, LINK Mobility, Turnstile, Sentry — that share a shape so simple it has
never needed one: **one HeiTuva account, one provider, one process-wide
credential in `process.env`, read at call time, outbound only.** Every property
that makes that shape safe stops holding the moment a customer brings their own
credential.

| | Today | What an integration needs |
|---|---|---|
| Credential | One, global, in `process.env` | One **per tenant**, minted by their administrator, revocable by them, stored somewhere |
| Direction | Outbound only | Outbound **and inbound** (OAuth callback, webhooks) |
| Caller identity | Always a signed-in member, or the worker | Sometimes **nobody** — a third party with a signature and no session |
| Blast radius of a leak | Every customer's mail | Every customer's *workspace*, posting as them |
| Residency | Fixed at deploy, EEA by choice | Varies **per provider**, and a customer may have promised otherwise |
| Failure mode | A message is not sent | A credential is used by the wrong tenant |

Seven concrete gaps follow from that, and they are the seven phases in §2.

---

## 1. The one decision everything else rests on

**Who is allowed to read a customer's integration credential?**

The honest answer today is *anything holding `SUPABASE_SERVICE_ROLE_KEY`* — and
that set is larger than the documentation believes.

Three verified facts that only matter together:

1. **Supabase Vault is installed on `heituva-prod` already.** `supabase_vault`
   0.3.1, schema `vault`, with `vault.secrets` and `vault.decrypted_secrets`.
   This resolves the spike the Slack plan carried as its largest unknown: the
   secret store exists, on `eu-central-1`, and needs no new extension.
2. **`decrypted_secrets` is granted to `service_role`.** Its ACL is
   `service_role=rd` — `anon` and `authenticated` have no grant at all, which is
   right. But it means **any holder of the service key can read every tenant's
   plaintext secrets**, and no RLS policy can change that, because nothing in
   this database sets `force row level security` and the service role bypasses
   RLS by design.
3. **The app uses the service key at request time, and `docs/OPERATIONS.md:53`
   says it does not.** The doc reads *"never into Vercel for the app: the app
   does not use it at request time, only the scripts do."* But
   `app/(auth)/kom-i-gang/actions.ts:45` calls `createAdminClient()` to create an
   organisation, and `app/(app)/administrasjon/actions.ts:390` calls
   `createAdminClient().auth.admin.inviteUserByEmail`. Both are server actions on
   the request path, and `createAdminClient()` throws outright when the key is
   absent.

   **Evidence from production, 2026-09-07.** `heituva-prod` holds one
   organisation ("HeiTuva AS", created 2026-09-03 11:42:57Z), one active
   administrator whose `org_members` row carries the *same* creation timestamp
   to the microsecond, and one `auth.users` row with provider `email` created
   2.7 hours earlier — which is exactly the shape `/kom-i-gang` produces, and
   `/kom-i-gang` cannot produce anything at all without the service key. The
   account also holds four surveys and no groups, rounds, responses, duties or
   reports, so it is a real if lightly-used signup rather than seed data
   (`scripts/seed-demo.ts` would have left a populated org).

   **So the key is available to the app runtime, with one caveat that only
   Vercel can close:** this proves the *code path* ran, not that it ran on the
   deployed Vercel app rather than a local dev server pointed at production. The
   remaining question is a `vercel env ls` away and needs the CLI or the
   dashboard — the Vercel MCP connector's tool surface is projects, deployments
   and deployment events, with no environment-variable tools, so it cannot
   answer it.

   **Either way the design consequence is unchanged, and is the point:** the
   only assumption that survives is that the app *can* read anything the service
   role can read. `docs/OPERATIONS.md:53` must be corrected to say so.

So: if integration secrets are stored the obvious way, **a bug in any server
action becomes a cross-tenant credential disclosure**, and the only thing
standing between them is code review. That is not a boundary; it is a habit.

### The proposed model: the app never reads an integration secret

Three custody options, with a recommendation.

| | How | Protects against | Cost |
|---|---|---|---|
| **A. Vault + service_role** | Secret in Vault, worker reads via service key | The database files at rest | None — and it does *not* protect against a request-path bug, because the app holds the same key |
| **B. Vault + a bespoke Postgres role** (recommended) | Secret in Vault; the reading RPC is granted to a `heituva_integrations` role and **revoked from `service_role`**; the worker authenticates as that role with its own JWT, held only by the worker deployment | A request-path bug, a leaked Vercel env, an over-broad server action | One role, one JWT, one deployment variable |
| **C. B + envelope encryption** | As B, and the stored value is additionally encrypted with a data key held only in the integration runtime's env | A full database compromise, and Supabase itself | A key to rotate, and a recovery story if it is lost |

~~**Recommendation: B**~~ — **superseded by the G1 spike, which chose C and
dropped Vault.** The reasoning above holds; two facts it did not have do not.

`service_role` can both **read** `vault.decrypted_secrets` and **execute**
`vault.create_secret`, so Vault stops nothing the app can already do — its
protection boundary on Supabase is everything below `supabase_admin`, and the
service key sits inside it. And B's two ways of reaching a bespoke role are
both shaky right now: a custom-role JWT rests on the legacy JWT secret, which
Supabase marks "no longer recommended" and is migrating projects off, while a
direct Postgres connection rests on a deploy target that does not exist —
`scripts/mail-worker.ts` has no host at all (§G1, and Q19).

C is indifferent to all of it: ciphertext under a key the database has never
held is useless to whoever reads the row, wherever the runtime runs, under
whichever JWT system Supabase settles on. It also covers the database-dump case
Vault was for. Layering both would add a second key-management surface for
protection already held — defence in depth wants layers that fail
independently, and Vault and the service key fail to the same key.

Full evidence, including what was proven against the live catalog and what is
inferred rather than executed: **`docs/G1_CUSTODY_SPIKE.md`**. The decision is
DECISIONS **Q18**; the hosting question it surfaced is **Q19**.

Three rules that hold under any option:

- **The secret is never returned to a browser, a server action, or a page.** The
  settings screen reads *workspace name and connection state* through a
  SECURITY DEFINER RPC that cannot return a secret reference.
- **`org_integrations` has no client select policy — ever.** Same posture as
  `responses`/`answers`, for the same reason stated in
  `supabase/migrations/20260902000005_answers.sql:2-3`: the safest read policy is
  the one that does not exist.
- **Every read of a secret writes an audit row.** A credential read is an event,
  not a detail.

This decision is a DECISIONS-register entry (call it **Q18**), because it
changes what `SUPABASE_SERVICE_ROLE_KEY` means, and because option C would later
introduce a key HeiTuva must not lose.

---

## 2. The groundwork, in seven phases

Ordered so each one is shippable alone and nothing later un-builds anything
earlier. **G0 and G1 can start today.**

### G0 — Truth-up and hygiene · **DONE 2026-09-07** · no dependencies

Fixing what is already wrong, before anything is built on top of it. Every item
has value with or without integrations.

1. **Establish the service-key reality** (§1, fact 3). The database side is
   now evidence rather than conjecture; what remains is one `vercel env ls`
   against the production project. Then correct `docs/OPERATIONS.md:53` — this
   is a finding to record, not a line to quietly edit, because the sentence has
   been load-bearing for the threat model since Phase 7.

   While confirming this, two related facts were read off the production
   advisors and are worth writing into the same commit rather than
   rediscovering: `auth_leaked_password_protection` is **off**, which is
   consistent with `docs/OPERATIONS.md:11` ("the pre-launch gate — what the
   operator does") still being open and with DECISIONS Q14 deferring it, not a
   regression; and `audit_events` on production is **empty**, so the audit path
   G3 extends has never actually run against a real deployment. `lib/auth/audit.ts`
   swallows its own errors into `console.error` by design, so an empty trail and
   a broken trail look identical. G3 should add the assertion that closes that
   gap.
2. **Resurrect `FLAGGED_CHANNELS`.** `lib/send/registry.ts:19` has **zero
   references repo-wide**; `SendScreen.tsx:200` hard-codes
   `c !== 'sms' || smsEnabled` instead, with further hard-coded channel branches
   at `:236, 351-352, 432, 434, 442, 447`. The registry exists to data-drive
   this. Until it does, every new channel adds another branch.
3. **Close the worker's fail-open.** `scripts/mail-worker.ts:47` types `channel`
   as `'email' | 'sms'` with no exhaustiveness check and no default throw, and
   `:104` reads `job.channel === 'sms' ? job.phone : job.email` — so an unknown
   channel is delivered **as email**. Add the exhaustive default that throws.
   Also derive the TypeScript `Channel` from the generated `types/database.ts`
   rather than the hand-written array at `registry.ts:10-11`, which drifts from
   the database enum silently.
4. **Widen the Sentry scrubber.** `sentry.config.ts` drops keys matching
   `/^(cookie|authorization|password|token|answers?|value|comment|text)$/i` —
   **anchored**, so `access_token`, `refresh_token`, `bot_token`, `client_secret`
   and `signing_secret` all pass through. The length guard does not catch them
   either: `MAX_STRING` is 200 and a bot token is far shorter. Move to a
   substring match on `secret|token|credential|signature` and add a test.
5. **`noindex` on the token routes.** There is no `robots.txt`, no
   `app/robots.ts`, no `X-Robots-Tag` in `next.config.ts:41-47`, and
   `app/layout.tsx:12-15` sets no `robots` field. `/s/[token]` sets
   `dynamic = 'force-dynamic'` and `revalidate = 0`, which is cache control, not
   crawler control — and `/r/[token]`, the report share route, is the same. A GET
   mutates nothing (`get_survey_for_token` is `STABLE`), so this is not a token
   risk; it is that the page discloses a survey title, an organisation name and
   `already_responded` to anything that fetches it.

**Done when:** the two channel defects have tests, the scrubber has a test that
a `refresh_token` key is dropped, the token routes send `X-Robots-Tag: noindex`,
and OPERATIONS.md says something true about the service key.

#### What shipped

- **`Channel` derives from the database.** `lib/send/registry.ts` reads it off
  `Database['public']['Tables']['survey_invitations']['Row']['channel']`
  instead of a hand-written array, `CHANNELS` is `satisfies readonly Channel[]`,
  and `CHANNEL_KEY` stays a total `Record<Channel, …>` — so a migration that
  grows `app.channel` now breaks the build at the registry, which is where
  someone should be made to look.
- **`FLAGGED_CHANNELS` is the gate.** `SendScreen` reads
  `FLAGGED_CHANNELS[c]` and a resolved flag map instead of
  `c !== 'sms' || smsEnabled`; the `smsEnabled` prop is gone, replaced by
  `channelFlags`, which `send/page.tsx` fills from the derived
  `CHANNEL_FLAG_KEYS`. Gating a channel is now a registry row plus a seed row.
- **The worker refuses what it cannot send.** `scripts/mail-worker.ts` types
  `channel` from the database enum and archives any job outside
  `DELIVERABLE = ['email','sms']` as malformed. It used to compute
  `job.channel === 'sms' ? phone : email`, so an unhandled channel was
  delivered *as email*, to a null address, silently, for every recipient.
- **The Sentry scrubber catches credentials.** The key rule was one anchored
  alternation containing `token`, which dropped a key called exactly `token`
  and kept `access_token`, `refresh_token`, `bot_token`, `client_secret` and
  `signing_secret` — and `MAX_STRING` is 200, so the length guard passed them
  through as ordinary short strings. Credentials are now matched as substrings,
  respondent content still exactly; `request.query_string` is dropped (it
  carries the one-time auth code on `/auth/callback`) and signature headers go
  with cookie and authorization.
- **`X-Robots-Tag: noindex, nofollow, noarchive, nosnippet`** on `/s/:path*`
  and `/r/:path*`, verified against a running build: both token routes carry it
  alongside all six existing security headers, and `/` does not. A header
  rather than a robots.txt, which is advisory and would publish the path shape.
- **`docs/OPERATIONS.md` step 3 corrected** with the evidence, and pointed at
  §1 for the consequence.

Census: **20 files / 407 tests**, up from 18 / 392. Both numbers may only move
up and did.

#### Logged, not built

Three things surfaced that are real and are not G0's:

- **The Send screen still hard-codes channels for its panels** —
  `channels.includes('email') || channels.includes('sms')` decides whether the
  recipient list shows, `includes('link') || includes('qr')` the share panel,
  and `includes('sms')` the message preview. That is channel *shape*
  (needs recipients / shares a link / has a preview) and it wants registry
  fields, not another `includes`. It belongs with the first provider that adds
  a card, because that is when the shape becomes decidable rather than guessed.
- **The worker cannot be unit-tested.** `scripts/mail-worker.ts` calls `main()`
  at import, so the refusal above is asserted by reading the code and by the
  registry's compile-time break, not by a test. Extracting the per-job decision
  into a pure function is a small change with no caller today; it belongs with
  G6's worker hardening.
- **`npm ci` fails on this checkout** with `Missing: image-size@ from lock
  file` under npm 10.9.7 — the `overrides` → `stubs/image-size` link has moved
  in the tree between npm versions. `npm install` succeeds and rewrites four
  lines of `package-lock.json`; the lockfile was left untouched here because it
  is not G0's to change. Worth pinning the npm version in CI before it bites
  someone mid-phase.

### G1 — The custody decision · **DONE 2026-09-07** · gates G2

A spike and a decision, not a build. **Report: `docs/G1_CUSTODY_SPIKE.md`.**

It answered the question by making two of the three proofs unnecessary rather
than by producing them, which is a legitimate outcome for a spike and is worth
being explicit about:

- **DECISIONS Q18 is written** — option C, envelope encryption, Vault dropped —
  with the evidence table and the two refused options.
- **The bespoke-role proofs were not run, and are no longer wanted.** They
  needed DDL, and a spike does not get to leave objects on production; the only
  clean venue was a Supabase branch, which costs money nobody authorised. They
  became moot when `service_role`'s Vault grants (read *and* write) showed that
  the layer they were protecting adds nothing. What replaced them is catalog
  evidence: E2, E3 and E4 in the report, read rather than asserted, plus three
  claims explicitly marked inferred.
- **The local-Vault proof was not run and is moot for the same reason.** This
  container has neither the Supabase CLI nor a running Docker daemon, so no
  local stack could be started. It returns only if Tor overrules Q18.
- **The recovery story is in Q18**, and is deliberately blunt: a lost data key
  means every connected customer reconnects through OAuth. Visible, recoverable,
  and cheaper than the failure option A accepts.

**Also found, not looked for:** production enqueues into `mail_outbox` on two
hourly cron jobs and **nothing drains the queue** — the worker is an npm script
with no host. Latent today (nothing has been sent), silent when it bites.
Recorded as **Q19** and as a launch blocker beside the four in Q5 and Q14.

### G2 — Secret custody · 4–6 days · needs G1

The kernel. One migration pair (a table, then its policies and functions).

```
org_integrations
  id, org_id → organizations(id) on delete cascade
  provider          text not null          -- FK to the registry (G5)
  external_id       text                   -- the provider's tenant id
  external_name     text                   -- shown in the UI; untrusted input
  secret_ct         bytea                  -- AES-256-GCM ciphertext (Q18)
  refresh_ct        bytea
  key_version       int                    -- which data key encrypted these
  expires_at        timestamptz
  scopes            text[]
  status            text                   -- 'active' | 'revoked' | 'expired' | 'error'
  last_error        text
  installed_by      uuid → org_members(id) on delete set null
  installed_at, revoked_at
  unique (org_id, provider) where status = 'active'
```

- **RLS on, no select policy for clients.** The UI reads
  `public.integration_status(p_org uuid)` — a SECURITY DEFINER RPC returning
  provider, workspace name, status and `installed_at`, and nothing else.
- **The ciphertext never leaves the database as plaintext, because it never
  enters as plaintext.** Under Q18 the encryption happens in the integration
  runtime (`node:crypto`, AES-256-GCM, key from the environment), so Postgres
  holds bytes it cannot interpret and there is no secret-reading function to
  guard. `org_integrations` is read by the runtime like any other table; what
  makes it safe is that reading it is useless.
- **`key_version` is there from the first row, not added later.** Rotating a
  data key means re-encrypting every row, and a schema that cannot say which key
  a row used cannot roll forward without downtime.
- **The audit row is written on use, not on read.** With no privileged accessor
  to hook, the honest event is "the runtime used org X's credential against
  provider Y", written by the runtime through `app.record_system_event` (G3).
- **Rotation is serialised.** A provider with rotating single-use refresh tokens
  will be locked out by two concurrent refreshers. The refresh path takes a
  `pg_advisory_xact_lock` keyed on the integration id and writes the new refresh
  token before the new access token is used anywhere.
- **The freeze trigger permits referential maintenance.** CLAUDE.md records this
  being rediscovered four times (D50, D51, D57, duty-archive): write the rule as
  *"nobody may change this content"*, comparing the columns that carry meaning,
  so `on delete set null` on `installed_by` still works.
- **Deleting the org destroys the credential.** `on delete cascade` removes the
  row, and under Q18 that is the whole of it — there is no second store to
  forget about, which was one of Vault's quieter costs.
- **Revoking at the provider is still required.** Deleting our ciphertext makes
  the credential unusable *by us*; the grant at the provider survives until it
  is revoked there. That call belongs in G7's revoke path, and cascade delete
  must not be the only thing that fires.

**Done when:** a credential round-trips through encrypt/decrypt with a key held
only in the environment; a row read directly with the service key yields
ciphertext and nothing usable; no persona — `anon`, `leser`, `redaktor`,
`administrator` — can select `org_integrations`; a wrong or absent key fails
closed rather than returning garbage; a concurrent refresh is provably blocked;
deleting an organisation leaves nothing behind.

### G3 — The inbound edge · 4–5 days · needs G2

HeiTuva has never had an externally-callable endpoint. Three route handlers
exist (`app/auth/callback/route.ts` and the two report exports), there is no
`supabase/functions`, and `vercel.json` has no `crons`. There is one documented,
never-built precedent: `CLAUDE_CODE_PROMPTS.md:80` specified a bounce webhook in
Phase 3.

None of the controls the product relies on apply to a webhook:

- `lib/ratelimit.ts:5-16` is in-memory, per warm instance, **by its own
  admission**, and keyed on `x-forwarded-for`.
- `lib/turnstile.ts:17` **fails open when unconfigured** and is a browser
  challenge regardless.
- `audit_ins` (`…0014_audit_integrity.sql:20`) requires
  `actor_user_id = auth.uid()`, so **a sessionless caller cannot write an audit
  row at all**.
- There is **no `timingSafeEqual` anywhere in the repository**. The only
  `createHmac` is `lib/mail/ses.ts:16,72`, signing outbound AWS requests.

So G3 builds, once, what every future integration reuses:

1. **`lib/webhook/verify.ts`** — HMAC-SHA256 over the raw body, constant-time
   compare, a timestamp window (five minutes), and a replay cache keyed on the
   signature. The raw body must be read **before** any parsing; a route that
   verifies a re-serialised body verifies nothing.
2. **A durable rate limit.** A small table plus a SECURITY DEFINER
   `app.rate_limit_take(p_bucket text, p_limit int, p_window interval)`, so the
   limit survives instance churn. `lib/ratelimit.ts` stays for what it is good
   at and stops being the only answer.
3. **`app.record_system_event(...)`** — SECURITY DEFINER, granted to the
   integration role, writing `audit_events` with `actor_user_id` null and an
   `action` naming the provider. `audit_events.action` is unconstrained text
   (`…ops_i18n.sql:28-36`) so this needs **no schema change** — exactly as
   `'option.change'` needed none. What it needs is the definer wrapper, because
   the insert policy will otherwise refuse.
4. **Route conventions**, written down once: Zod at the boundary; a per-provider
   path segment; no error text echoed back to the caller; the `state` parameter
   on any OAuth callback signed, single-use, short-expiry and bound to both the
   organisation and the member who started it.

**Route handlers, not Edge Functions** — and for a verification reason rather
than a taste one: CI starts Supabase with `-x edge-runtime`
(`.github/workflows/ci.yml:47`), so an Edge Function is a surface the invariant
suite cannot reach.

**Done when:** a forged signature, a stale timestamp, a replayed body and a
flood are each refused by a test, and a sessionless call writes an audit row.

### G4 — The outbound edge · 3–4 days · needs G2

Every outbound call today is a bare `fetch` written at its call site:
`lib/mail/ses.ts`, `lib/sms/link-mobility.ts`, `lib/turnstile.ts`. That was fine
when every destination was a constant chosen at deploy time. It stops being fine
when a URL can come from a provider registry or a stored integration.

**`lib/egress/`**, one client, mandatory for anything a provider adapter calls:

- a **destination allowlist** taken from the G5 registry — never a URL from a
  database row or a callback payload;
- timeouts, bounded retries with backoff, and a circuit breaker per provider, so
  one dead provider cannot drain the worker;
- **redirects not followed**, and a response size cap;
- **secrets never logged** — not in an error, not in a Sentry breadcrumb, not in
  a retry message;
- one place to add per-provider outbound audit.

Migrating the three existing adapters onto it is part of the phase, not a
follow-up. An egress client that half the code bypasses is documentation.

**Done when:** the three adapters use it, a request to an off-allowlist host is
refused by a test, and a provider returning a redirect to `169.254.169.254` is
refused by a test.

### G5 — The provider registry, and residency with teeth · 3–4 days

CLAUDE.md's data-not-code rule: *adding a pack/duty/language is a migration or a
row, not a component.* An integration provider is the same kind of thing.

```
integration_providers            -- seeded, one row per provider
  key                text primary key       -- 'slack', 'entra', 'google', 'hr'
  kind               text[]                 -- 'channel' | 'notify' | 'directory'
  data_region        text                   -- 'eea' | 'third_country'
  processes_personal_data boolean
  egress_hosts       text[]                 -- the G4 allowlist
  flag_key           text                   -- the feature_flags row that gates it
  docs_url           text
```

This is what makes the residency promise enforceable rather than decorative.
**`organizations.privacy.eu_only` is today a customer-facing switch read by no
enforcement code whatsoever** — defined at `…tenancy.sql:16`, allowlisted at
`administrasjon/actions.ts:90`, rendered at `PrivacyPanel.tsx:11`, and referenced
nowhere else but two tests. Meanwhile `messages/no.json:1380` (`dpa6P`) is a
**contractual** clause: *«Ingen overføring til tredjeland finner sted som ledd i
tjenesten.»*

So G5 gives the switch a meaning, in the database:

> An organisation with `privacy.eu_only` on cannot connect a provider whose
> `data_region` is `third_country`. The connect RPC refuses it; the screen
> explains it; turning the switch off is an administrator action and is audited.

That is a control HeiTuva can point at in a DPA, and it turns §4.1 of the Slack
plan from a copy-editing problem into a product behaviour. **It is also the one
phase here that touches a customer promise, so it wants Tor's sign-off** even
though it invents no screen.

While here: give `feature_flags` a surrogate primary key. It has none
(`docs/OPERATIONS.md:243` carries it as a known finding) and the registry
references its keys.

**Done when:** an org with `eu_only` on is refused a third-country provider by a
test, the refusal is audited, and the registry — not code — decides which hosts
egress may reach.

### G6 — Queue and worker generalisation · 2–3 days

`…0009_mail_outbox_api.sql` exposes exactly three RPCs, each with the queue name
**hard-coded in the body**, granted to `service_role` only, with the reasoning
written into the header: *"rather than exposing the pgmq schema (which would
also hand out create, drop, purge and every other queue), these three functions
are the whole API"* and *"the raw invitation tokens live in these messages."*

Both halves of that reasoning are right and must survive generalisation. So:

- `public.outbox_read/delete/archive(p_queue text, …)` with a **hard allowlist of
  queue names inside the function**, not a free parameter. The original
  design closed a queue-name injection question; a parameterised rewrite must
  close it again rather than reopen it.
- A second queue per integration surface, so a provider outage cannot stall
  invitation delivery. Reusing `mail_outbox` is what SMS did and is cheaper, but
  it couples a third party's availability to the product's core promise.
- **Worker hardening**: the exhaustive default from G0; per-provider
  concurrency and backoff from G4; dead-letter on a malformed job, as today;
  and no secret in any log line.

**Done when:** two queues drain independently, an unknown queue name is refused,
and killing a provider mid-batch does not delay mail.

### G7 — Lifecycle: revoke, kill, delete · 2–3 days

The phase everyone skips, and the one an incident needs.

- **Revoke** — an administrator disconnects: the row goes `revoked`, the Vault
  secret is destroyed, in-flight jobs for that org are archived rather than
  retried, and the audit row names who did it.
- **Provider-side revocation** — the credential stops working without anyone
  telling us. The adapter marks `status = 'error'` with `last_error`, the screen
  says the connection is gone, and nothing is silently lost.
- **Kill switch** — a global and a per-org "all integrations off", reachable
  without a deploy. `feature_flags` already has exactly this shape (global row,
  org override) and `lib/flags.ts` already resolves it that way.
- **Deletion and DSR** — `docs/INCIDENT_RESPONSE.md` and the `dsr_requests`
  table exist; an integration adds a place where an identifier for a person
  (a workspace user id) is held. It must be covered by the same erasure path,
  and `app.apply_retention()` must not leave it behind.

**Done when:** revoking destroys the secret and the archived jobs, a dead
credential surfaces as a status rather than a retry loop, the kill switch works
without a deploy, and deleting an organisation leaves nothing in `vault.secrets`.

### G8 — Verification · 2 days

No new gates. CLAUDE.md freezes the apparatus — *"VERIFY.md's seven gates, Gate
5a3, the test census and the 5a3 allowlist are what exist and they are enough"* —
and this plan does not propose to unfreeze it. What it does add:

- a new invariant file, `tests/invariants/integrations.test.ts`, carrying the
  denial tests every phase above lists;
- entries in `tests/expected-counts.json`, because `tests/census.ts:20-26` is
  explicit that a new file *"must be added to the manifest … new things arrive
  failing until someone states what they are worth"*;
- the new routes in `tests/routes.manifest.ts` at both viewports;
- **a reproduced policy-gate number.** CLAUDE.md's "55 of 71 surfaces" is not
  stored anywhere in the repository — the surface list is derived at runtime from
  `pg_proc` (`scripts/verify/policy-coverage.ts:9-11, 196`) and the pair is a
  snapshot of a past run's stdout. `org_integrations` and every new RPC arrive on
  the 71 **failing** until their denial tests exist, so the number must be
  re-run and quoted from output, never carried forward from the file.

---

## 3. Sequence, and what it costs

```
G0 truth-up & hygiene ......... DONE    ── shipped 2026-09-07
G1 custody decision (spike) ... DONE    ── shipped 2026-09-07 (Q18, Q19)
G2 secret custody ............. 4–6 d   ── gates G3, G4, G7
G3 inbound edge ............... 4–5 d
G4 outbound edge .............. 3–4 d   ── can run beside G3
G5 registry + residency ....... 3–4 d   ── needs Tor's sign-off, not artboards
G6 queue & worker ............. 2–3 d
G7 lifecycle .................. 2–3 d
G8 verification ............... 2 d     ── folded into each phase, closed here
                                -------
                                23–32 d
```

Roughly six weeks of one engineer, and at the end of it HeiTuva can hold *any*
integration — Slack, Entra, Google, an HR system — with the provider-specific
part reduced to an adapter, a registry row and a feature flag.

**Two dependency notes worth stating plainly.** G5 needs a decision from Tor
about what `eu_only` means, but not a design bundle. Nothing in G0–G8 needs an
artboard, because none of it draws a screen: the connect surface belongs to the
provider phase, and D87 says it waits for the bundle.

**Two-thirds of this is not integration work.** G0 fixes live defects. The
durable rate limit, the egress client, the widened Sentry scrubber, the
`noindex` headers, the audit path for sessionless actors and the lifecycle
plumbing are all things a SaaS wants regardless. That is the argument for
starting here rather than waiting on the legal gate: **the groundwork cannot be
wasted, and the provider work cannot start without it.**

---

## 4. Decisions owed before G2

| # | Decision | Owner | Blocks |
|---|---|---|---|
| Q18-a | The custody model — A, B or C from §1 | **answered by G1: C.** Tor may overrule in one line | G2 |
| Q18-b | ~~Whether a bespoke Postgres role and its JWT are acceptable operationally~~ | **withdrawn** — C uses neither | — |
| Q19 | Where the mail worker and the integration runtime run | Tor + operator | G2's accessor is written against it; a launch blocker on its own |
| Q18-c | What `organizations.privacy.eu_only` means — a control that refuses third-country providers, or a switch that comes out | Tor | G5 |
| Q18-d | Whether the service key is on Vercel today, and whether it should be | operator + Tor | **open** — needs `vercel env ls`; G0 established the app *can* read it and corrected OPERATIONS.md |
| Q18-e | Whether an empty production `audit_events` means "nothing auditable happened" or "the trail is failing silently" | G3, from evidence | G3 |

Q18-d is a question of fact and is now most of the way answered (§1, fact 3);
what is left needs Vercel, not judgement. Q18-e is the same shape. The other
three are judgements, and G1 exists to put evidence under them.
