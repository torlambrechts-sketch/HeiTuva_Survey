# Slack-integrasjon — investigation, verification and plan

Status: **PROPOSAL — not built, not decided.** Nothing in this document has been
implemented. Its internal half — everything HeiTuva must change in itself, with
no provider named — has been split out into
**`docs/INTEGRATION_ARCHITECTURE.md`**, which is not blocked on any of the gates
below and is where work should start. It exists so the decision can be made on evidence rather than on a
demo. Written against the repository at commit `cd74022` (Phase 9 closed).

Three passes, in the order they were run: what the codebase actually gives us
(engineering), what a supervisor refuses to sign (an adversarial verification
pass that corrected the first draft in five places, noted where it did),
and what a project manager can commit to.

---

## 0. Recommendation in one page

"A Slack integration" is four different products. They do not cost the same and
they do not carry the same risk:

| | What it is | Value | Risk | Verdict |
|---|---|---|---|---|
| **S1** | Slack DM as a fifth **invitation channel** — the same `/s/<token>` link, delivered by bot instead of by email | High — response rate is the product's weak point, and Slack is where the target market reads things | High — employee names and Slack user ids are processed outside the EEA | **Build second** |
| **S2** | Slack as a **notification sink** — HeiTuva posts *events* (round closed, duty deadline, "krever handling") into a channel the org picks | Medium — keeps compliance work visible where work happens | Low-medium — no respondent data and no results, but a survey title and an org name still transit | **Build first** |
| **S3** | Slack as a **directory source** — roster import alongside CSV/Excel/Entra/Google/HR | Low — the three existing sync stubs are unbuilt; Slack would jump a queue | Medium | **Build third, or not at all** |
| **S4** | **Answering inside Slack** — Block Kit modal instead of the `/s/<token>` page | Looks impressive | **Breaks anonymity in the one way the test suite cannot see** | **Refuse** (§3.5) |

**The recommendation is S2 → S1, and only after a legal gate that has to clear
before a single line is written.** S2 exists mostly to prove the plumbing —
OAuth install, per-org credential storage, token rotation, the outbound worker
path — against traffic that carries no respondent data. S1 then reuses all of it
and only adds the parts that are actually delicate.

Two honest qualifications to that ordering, both found while costing it:

- **S2 is not the cheap one.** It looked cheap until the event source turned out
  not to exist: `notifications` has no producer at all and is addressed to a
  member rather than to an organisation (§3.2). S2 and S1 cost roughly the same,
  12–18 days each on top of a shared foundation. The ordering therefore rests on
  risk and on the legal gate, not on price. If the gate clears cleanly and
  quickly, starting with S1 is defensible, because S1 is where the value is.
- **The blocking foundation is not Slack at all.** It is that HeiTuva has never
  stored a per-tenant secret, has no encryption anywhere in the database, and
  has never exposed an inbound HTTP endpoint. Roughly half this proposal is
  building a security primitive the product lacks; Slack is merely the first
  thing that needs it. That work is reusable — Entra sync, Google sync and HR
  sync all need the same primitive — which is an argument for building it
  properly rather than for building it quickly.

---

## 1. What the codebase already gives us

The good news is real: **HeiTuva already has a channel seam, and it has been
exercised once.** Migration `20260904000027_sms_channel.sql` added SMS to a
product that had only email, link and QR, and it is the template a Slack channel
follows.

### 1.1 The seam, as SMS actually used it

Not five touchpoints, and not seven. Fifteen:

**The obvious six**

1. **The enum** — `app.channel` is `('email','link','qr','sms')`
   (`supabase/migrations/20260902000001_foundation.sql:13`).
2. **The reachability column and its CHECK** — `survey_invitations.email` became
   nullable, `phone` was added, and `invitations_reachable_check` guarantees "an
   email or a phone or both, never neither" (`…0027:22-26`).
3. **The flag, enforced in the database** — `send_round` refuses `sms` outright
   with `error: 'sms_not_enabled'` when `feature_flags.sms_channel` is off for
   the org (`…0027:105-114`). The screen hiding the card is not the control; the
   RPC is.
4. **The queue payload, in all three producers** — `pgmq.send('mail_outbox', …)`
   gained `channel` and `phone` in `send_round`, `app.enqueue_reminders` and
   `app.run_due_schedules` (`…0027:160, 270, 348`). A channel added to only the
   first works on the first send and then silently drops every reminder and
   every recurring round.
5. **The worker branch** — `scripts/mail-worker.ts:104-125`, which dead-letters
   a malformed job rather than retrying it forever.
6. **The provider adapter** — `lib/sms/{types,index,link-mobility,capture}.ts`,
   deliberately not `server-only` because the worker is a plain Node process,
   with credentials read from `process.env` **at call time**.

**The nine that are invisible from the feature description**

7. **A second, corrective migration** — `20260904000028_normalize_phone_search_path.sql`.
   SMS took two migrations, not one. Budgeting one for Slack budgets from an
   incomplete precedent.
8. **The import parser** — `lib/send/import.ts:16-19, 31-36, 120-123, 143-144`:
   a client-side `normalizePhone` mirroring the database's, a header-alias list,
   a rewritten header-detection heuristic and a new identity key ("one person is
   one address or one phone").
9. **A local gateway stand-in** — `lib/sms/capture.ts`. Mail has Mailpit; SMS had
   nothing, so a capture-file provider was written purely so the verifier could
   observe the chain. Slack needs the same, and for the same reason.
10. **i18n keys in both languages** — `messages/no.json:296-297, 383, 389, 391,
    837`, mirrored in `en.json`.
11. **Legal and marketing copy** — `messages/no.json:1358, 1364, 1378` plus the
    splash claims. Adding one subprocessor rewrote the privacy notice, the DPA
    list and the front page. **This is the largest hidden cost, and it is
    exactly where Slack bites hardest** (§4.1).
12. **A seed row** — `supabase/seed.sql:114-115`, `('sms_channel', null, false)`.
13. **Tests** — `tests/unit/import.test.ts`, `tests/invariants/invariants.test.ts:215,224`.
14. **The verification harness** — `tests/routes.manifest.ts:510-519` (a named
    `sms` state on the Send route, with a click-path setup) and
    `scripts/verify/send.ts:275-316` (a section proving flag refusal and the
    whole queue → worker → provider chain).
15. **A deviation entry** — `docs/DEVIATIONS.md:1463-1494` (D80), recording the
    routing rule the design never drew.

### 1.2 What does **not** exist, and is the actual work

- **There is no home for a per-organisation credential, and no encryption at
  all.** None of the 38 tables stores a third-party token. A grep for
  `pgsodium|vault|encrypt` across every migration returns only prose in
  comments — **nothing in this database is application-encrypted.** The single
  cryptographic primitive is one-way SHA-256 (`app.hash_token`,
  `…foundation.sql:27-28`), which is useless for a bearer token you must replay
  to Slack. Every provider credential today is a **process-wide env var** for one
  HeiTuva account talking to one provider (`lib/sms/link-mobility.ts:15-21`).
  Slack is the first integration where **each customer has their own credential**,
  minted by their own administrator and revocable by them. It is novel in both
  dimensions at once: first per-tenant secret, and first secret that must live in
  the database. CLAUDE.md's secrets rule offers no guidance because the situation
  has never arisen.
- **`organizations.options` is not a place to put it.** It is a closed allowlist
  of five booleans (`…tenancy.sql:19-21`, `administrasjon/keys.ts:41-43`) whose
  server action rejects any non-boolean at the Zod boundary
  (`administrasjon/actions.ts:159-163`). The nearest structural analogue is the
  `sso` option (`actions.ts:180-194`), whose enablement runs real preconditions
  before flipping — and which needed migration `…0029_sso_break_glass.sql` and
  two triggers to support. That is the shape, and that is the cost.
- **There is no inbound HTTP endpoint of any kind.** Three route handlers exist
  in the whole app (`app/auth/callback/route.ts` and the two report exports);
  `supabase/functions` does not exist; `vercel.json` has no `crons` key. There is
  one documented, never-built precedent: `CLAUDE_CODE_PROMPTS.md:80` specified a
  bounce webhook for Phase 3.
  A Slack OAuth callback would be the first externally-callable surface the
  product has ever had, and it belongs in a Next route handler rather than a
  Supabase Edge Function for a reason about verification rather than taste: CI
  starts Supabase with `-x edge-runtime` (`.github/workflows/ci.yml:47`), so an
  Edge Function is a surface the invariant suite cannot reach.
- **There is no design.** `HeiTuva.dc.html` contains no "slack" and no
  "integrasjon" — zero occurrences of either. See §4.2.
- **`app.channel` cannot gain a value and be used in the same migration.**
  PostgreSQL 17 still holds the rule: a value added by `ALTER TYPE … ADD VALUE`
  inside a transaction block cannot be used until that transaction commits, and
  `supabase db push` runs each migration file in its own transaction. Slack needs
  **two migration files** — one that does nothing but
  `alter type app.channel add value if not exists 'slack';`, and the next one
  that uses it. Discovering this at `db push` time on prod is a bad afternoon;
  it costs nothing to know now.

### 1.3 Two pre-existing defects the investigation surfaced

Logged here rather than fixed, per CLAUDE.md: *something interesting that
surfaces gets logged for the next phase, not built.* Both are directly in the
path of any channel work and should be the first two commits of it.

- **`FLAGGED_CHANNELS` is dead code.** `lib/send/registry.ts:19` exists precisely
  to data-drive which channels are gated, and it has **zero references
  repo-wide**. `SendScreen.tsx:200` instead hard-codes `c !== 'sms' || smsEnabled`,
  with further hard-coded channel branches at `:236, 351-352, 432, 434, 442, 447`.
  A Slack channel either resurrects the registry or adds a second hard-coded
  branch, and the branches multiply from there. Resurrect it first.
- **The worker fails open on an unknown channel.** `scripts/mail-worker.ts:47`
  types `channel` as `'email' | 'sms'` with no exhaustiveness check and no
  default throw, and `:104` reads `job.channel === 'sms' ? job.phone : job.email`.
  A `'slack'` job would fall through to the **email** path and try to send to
  `null` — a runtime misdelivery, not a compile error. The TypeScript `Channel`
  type is also hand-written (`registry.ts:10-11`) rather than derived from the
  generated `types/database.ts`, so the two lists drift silently. Add the
  exhaustive default-throw before adding a channel, not after.

---

## 2. What Slack itself requires

Facts that shape the design, verified against Slack's current developer docs
(September 2026):

- **A distributed (public) app**, not a workspace app: each customer installs it
  into their own workspace and we hold one bot token per workspace.
- **Scopes**: `chat:write` and `im:write` (via `conversations.open`) to DM a
  person; `users:read` + `users:read.email` to match an employee to a Slack
  account; `chat:write` alone for S2's channel posts. `users:read.email` is the
  one that matters — it is how an email address gets to Slack.
- **Token rotation**: access tokens expire after 12 hours and are refreshed with
  a rotating, single-use refresh token. **Rotation cannot be turned off once
  turned on.** The web app and the send worker refreshing concurrently will race
  and invalidate each other. Refresh must be serialised under a lock — a design
  constraint on §3.1, not an implementation detail.
- **Rate limits**: roughly one message per second per conversation. A 400-person
  send is therefore minutes of worker time, which the existing pgmq worker
  handles and an HTTP request would not.
- **Link unfurling is on by default.** Slack fetches any URL it sees to build a
  preview. Every message the product sends must set `unfurl_links: false` and
  `unfurl_media: false` — see §4.3 for what actually leaks.
- **EU data residency** is a paid add-on, available on Business+ and Enterprise
  Grid only, off unless the customer explicitly enables it. We cannot assume it
  and must not imply it.

---

## 3. The build

### 3.1 The foundation both S1 and S2 need: per-org credentials

New table, `org_integrations`, one row per (org, provider):

```
org_integrations
  id, org_id → organizations(id) on delete cascade
  provider          text  check (provider in ('slack'))
  external_id       text  -- Slack team id, for install-collision detection
  external_name     text  -- workspace name, the only thing the UI shows
  secret_ref        uuid  -- reference to the stored bot token (see below)
  refresh_ref       uuid  -- reference to the rotating refresh token
  expires_at        timestamptz
  scopes            text[]
  installed_by      uuid → org_members(id) on delete set null
  installed_at, revoked_at
  unique (org_id, provider) where revoked_at is null
```

Four rules, each borrowed from one the product already enforces:

1. **No select policy for clients — ever.** RLS on, and the settings screen reads
   *workspace name and connection state* through a SECURITY DEFINER RPC that
   never returns a secret reference. Same posture as `responses`/`answers`, for
   the same reason: the safest read policy is the one that does not exist.
2. **The token is never a plaintext column.** Since this document was written,
   the spike has partly resolved: **`supabase_vault` 0.3.1 is already installed
   on `heituva-prod`** (schema `vault`, `eu-central-1`), so the secret store
   exists and needs no new extension. What remains unverified is its presence in
   the local stack CI starts and its behaviour under `supabase db reset`. The
   harder question turned out not to be *where* the secret lives but *who may
   read it* — `vault.decrypted_secrets` is granted to `service_role`, which the
   app itself holds. See `docs/INTEGRATION_ARCHITECTURE.md` §1, which is where
   that decision now lives.
3. **Refresh is serialised.** One producer refreshes under an advisory lock and
   writes the new refresh token before using the new access token. Slack's
   refresh tokens are single-use; two concurrent refreshers lock the customer out
   of their own integration, and the failure surfaces days later as
   `invalid_grant`.
4. **Immutability triggers permit referential maintenance.** CLAUDE.md records
   this having been rediscovered four times (D50, D51, D57, duty-archive). If
   `org_integrations` rows are frozen after install, the rule is written as
   *"nobody may change this content"* — comparing the columns that carry meaning
   — so that `on delete set null` on `installed_by` still works.

Plus:

- `app/api/slack/oauth/{start,callback}/route.ts` — administrator-only, signed
  single-use `state` bound to org and member, short expiry. Zod at the boundary.
  Note what is **not** available here: `lib/ratelimit.ts:5-16` is in-memory and
  per-warm-instance by its own admission, Turnstile is browser-only and
  **fails open when unconfigured** (`lib/turnstile.ts:17`), and there is **no
  `timingSafeEqual` anywhere in the repository**. Slack's `v0=` signature check,
  its timestamp replay window and the constant-time compare CLAUDE.md invariant 5
  demands would all be written from scratch. Budget for it.
- **Audit needs an RPC, not a migration.** `audit_events.action` is unconstrained
  text (`…ops_i18n.sql:28-36`) — `'integration.connect'` needs no schema change,
  exactly as `'option.change'` needed none. But the insert policy requires
  `actor_user_id = auth.uid()` (`…0014_audit_integrity.sql:20`), so a **sessionless
  Slack callback cannot write an audit row at all** without a SECURITY DEFINER
  wrapper. That is the real audit obstacle, and it is easy to miss.
- `lib/slack/` mirroring `lib/mail/` and `lib/sms/` exactly: `types.ts`,
  `index.ts` choosing provider by configuration, `api.ts`, and `capture.ts`
  writing JSON lines so the verifier can read back what was "sent" without a
  Slack workspace.

### 3.2 S2 — Slack as a notification sink (build first)

The smallest thing that proves all of §3.1 against production traffic.

- One org-selected channel; HeiTuva posts **events, never results**: a round
  closed, a duty deadline inside 14 days, a "krever handling" chip appearing, an
  import finishing. Each message is one line and a deep link into HeiTuva.
- **No numbers, no group labels, no free text, ever.** A Slack channel is not a
  surface where `app.k_for` can be enforced — its audience is whoever is in the
  channel, which HeiTuva does not know and cannot bound. So results do not go
  there. The link goes there, and HeiTuva decides what the person who clicks it
  may see, exactly as it does today.
- **The event source does not exist yet, and this is the part that gets
  under-estimated.** `notifications` looks like the right home — it holds
  `(org_id, member_id, kind, payload)` and its RLS is already proven — but two
  things disqualify it as-is. Nothing writes to it: `scripts/seed-demo.ts:342`
  records that "notifications are not yet emitted", and the only row in the whole
  system is a synthetic fixture that exists so the policy gate can prove a
  cross-org read is refused. And it is addressed to **one member**, not to the
  organisation — `tests/invariants/policy-coverage.test.ts:252` asserts an
  administrator cannot see a `leser`'s notification — whereas a Slack channel
  post is org-scoped by definition. So S2 must first build the org-level event
  producer the product has never had. That is the honest majority of M2, and it
  is worth having regardless of Slack: an in-app activity feed and an email
  digest would both need it.
- **Queue: a second one, and it is not free.** `…0009_mail_outbox_api.sql`
  exposes exactly three RPCs — `mail_outbox_read/delete/archive` — each with the
  queue name **hard-coded in the function body**, granted to `service_role` only,
  because *"rather than exposing the pgmq schema (which would also hand out
  create, drop, purge and every other queue), these three functions are the whole
  API"* and *"the raw invitation tokens live in these messages."* A `slack_outbox`
  queue therefore needs a migration creating the queue **and three more
  parameter-free wrappers**. The cheaper alternative is what SMS did — reuse
  `mail_outbox` with `channel: 'slack'` — but that couples a Slack outage to
  invitation delivery and walks straight into the fail-open worker default in
  §1.3. **Recommendation: separate queue, and pay the three wrappers.**

Data leaving the EEA in S2: an organisation name, a survey or duty title, a URL.
No respondent, no answer, no employee list. That is a defensible paragraph in the
privacy text, which S1's is not.

### 3.3 S1 — Slack as an invitation channel (build second)

Follows §1.1's fifteen touchpoints. The ones with content beyond "do what SMS
did":

1. Migration A: `alter type app.channel add value if not exists 'slack';` — and
   nothing else in the file.
2. Migration B: `survey_invitations.slack_user_id text`; extend
   `invitations_reachable_check` to `email is not null or phone is not null or
   slack_user_id is not null`; extend the precedence rule in `send_round`,
   `app.enqueue_reminders` **and** `app.run_due_schedules`; refuse `slack` with
   `error: 'slack_not_enabled'` unless `feature_flags.slack_channel` is on for the
   org **and** a live `org_integrations` row exists.
3. Precedence, stated once and tested: **email when it can be, Slack when the
   person has no address, SMS when they have only a phone.** Nobody is reached
   twice. This mirrors D80 and needs its own deviation entry, because the design
   never drew it.
4. Matching an employee to a Slack account: `users.lookupByEmail`, which is a
   transfer of that employee's work email to Slack **before any message is
   sent**. There is no way around it, and it must be stated plainly in the
   privacy text and in the connect screen's copy rather than buried.
5. Worker branch (after §1.3's default-throw exists), adapter, capture provider,
   `unfurl_links: false`.
6. Registry: `FLAGGED_CHANNELS.slack = 'slack_channel'` — which requires §1.3's
   first fix, or the flag is decorative.

### 3.4 S3 — directory import

`app.import_source` gains `'slack'`; `IMPLEMENTED_SOURCES` gains it; the parser
gains a Slack path. Cheap *given* §3.1. It is third rather than second for
product reasons, not technical ones: `entra`, `google` and `hr` have rendered as
"kommer" cards since Phase 3, and shipping Slack ahead of all three is a
statement about which customer we are building for. That is Tor's call.

### 3.5 S4 — answering inside Slack: refuse

The first draft of this document said a Block Kit modal was structurally
impossible. **That was wrong, and the correction is the most important paragraph
here.** It is entirely possible, which is worse.

`…answers.sql:16-18` holds the constraint the whole anonymity story rests on:

```sql
-- STRUCTURAL ANONYMITY (DECISIONS Q2): an anonymous response can never reference an invitation.
constraint responses_anonymous_unlinked
  check (anonymity_at_submission <> 'anonymous' or invitation_id is null)
```

A Slack submission would pass `null` for `invitation_id`. **The CHECK would not
fire.** It constrains a column; it cannot see that the *transport* identified the
respondent. So a Slack answer flow would pass the constraint, pass
`submit_response`, and pass the entire invariant suite — while:

- Slack's `view_submission` payload always carries `user.id` and `team.id`, so
  the server holds a hard identity mapping at the exact moment it writes a row
  marked anonymous, and Slack's own logs retain that pairing outside the database
  the CHECK protects;
- routing the modal back requires **storing** a token ↔ `slack_user_id` binding,
  recreating the linkage the schema exists to make impossible;
- `submit_response` is granted to `anon` by design as the token-validated
  respondent write path, so a sessionless Slack webhook would call it with a
  token — meaning **the respondent token must be transmitted into and held by
  Slack**, against CLAUDE.md invariant 5's containment;
- a modal's text inputs are respondent free text, transiting and logged by a
  third party by construction, against CLAUDE.md invariant 7.

**Green tests over a broken guarantee is the single most dangerous shape a
feature can take in this codebase.** DECISIONS Q3 already refused this trade once,
on the stated grounds that *a toggleable anonymity guarantee is not a guarantee*;
this is the same trade with better packaging. The narrow version — S4 for `named`
and organisation-attributed surveys only — is arguable but is also a second
complete respondent renderer for all 13 question types, in Block Kit, forever in
step with the real one.

**"Notify in Slack, answer at `/s/[token]`" has none of these problems and is
the only defensible shape.** Recommendation: refuse S4, and record the refusal as
a decision so it does not return as a feature request.

---

## 4. Supervisor's verification — what would fail review

### 4.1 BLOCKER — but not the one it first looks like

The first draft called this "Slack is a US processor, therefore blocked." **That
framing does not survive contact with the existing subprocessor list, and a
reviewer would find the hole in five minutes: Cloudflare Inc. is already an
admitted US subprocessor** (`messages/no.json:1378`), scoped as *«bot-beskyttelse
på forsiden, ingen svardata»*. Supabase Inc., Vercel Inc. and Functional
Software Inc./Sentry are likewise US-incorporated with EU regions. DECISIONS Q6
explicitly reserves the US-processing call to Tor rather than barring it.

The invariant as *practised* is **"personal data stays in EU/EØS regions"**, not
"no US-incorporated vendor". So the real blocker is narrower and sharper:

- Slack processes messages **in the US** by default, and a Slack invitation
  carries a **name and a workspace user id** — persondata. Slack's EU residency
  is a paid Business+/Enterprise Grid add-on our market will not have.
- That falsifies two customer-facing texts outright:
  `messages/no.json:1358` (`privacy4P`) — *«Ingen persondata overføres til land
  utenfor EØS»* — and, the stronger one, `messages/no.json:1379-1380`
  (`dpa6H`/`dpa6P`) — *«Overføring utenfor EØS … Ingen overføring til tredjeland
  finner sted som ledd i tjenesten.»* The second is a **contractual clause**, not
  marketing copy.
- `dpa5P:1378` obliges **30 days' advance notice to every controller, with a
  right to object**, before a new subprocessor is used. That is a calendar
  dependency, and it must be *started*, not ticked off at the end.
- **`organizations.privacy.eu_only` is a customer-settable switch enforced by
  nothing.** It is defined at `…tenancy.sql:16`, rendered in `PrivacyPanel.tsx:11`,
  allowlisted in `administrasjon/actions.ts:90` — and read by no code whatsoever.
  Shipping a US processor while a customer has that switch on would be a
  misrepresentation with a UI to prove it. Either the switch starts meaning
  something (it gates the Slack channel) or it comes out. Leaving it is the one
  option that is not available.

What this costs, concretely: an amended standing invariant 5 (a DECISIONS entry,
Tor's), a Norwegian lawyer's read that `docs/LEGAL_DRAFTS.md:7` already says is
owed before any customer sees the subprocessor list, rewrites at lines 1358,
1364, 1378 and 1380 in **both** `messages/no.json` and `messages/en.json` plus
the splash claims, a reseed through `scripts/seed-i18n.ts` because the app reads
copy from `ui_messages` and not from the files, and a 30-day clock.

### 4.2 BLOCKER — there is no design, and the precedent cuts both ways

Zero occurrences of "slack" and zero of "integrasjon" in `HeiTuva.dc.html`.

**The fifth channel card is worse than "not drawn".** The grid is a hard
two-column `grid-template-columns:1fr 1fr` (`HeiTuva.dc.html:1691`) around
exactly four cards (`:3843`), rendered as `md:grid-cols-2` in
`SendScreen.tsx:197`. A fifth card produces an orphan in a half-empty third row —
span full width? left-aligned? centred? — a layout state the bundle does not
contain and does not specify. The first draft called this "mechanically
possible"; that was too generous.

**The Integrasjoner tab claim needs correcting too.** The design draws five
Administrasjon tabs (`:3012`); the implementation ships **six** — `sprak` was
added under D79 (`DEVIATIONS.md:1445-1461`) with the reasoning written into the
layout file. And two whole pages have been invented before, under D8 (`/logg-inn`)
and D83 (`/personvern`, `/databehandleravtale`). So an undrawn tab is *not*
categorically forbidden. The bar that D79 actually set is three-part: **(i) a
DECISIONS-level entry mandates the capability, (ii) the screen is composed only
from component classes the bundle already specifies — "nothing new is invented",
and (iii) it is logged as a deviation.**

Slack has none of the three. D87 (`DEVIATIONS.md:1622-1670`) is the more recent
and more on-point precedent: nine surfaces the Q17 brief described in prose but
the bundle did not contain were **not built** — the phase, decided with Tor,
shipped the kernel and the copy-only surfaces, and the screens waited. Its three
sub-rules carry over directly: split by evidence rather than ambition;
parameterise existing copy rather than draw new screens; and **leave no dead
code, because "an action with no caller is a lie in the codebase."**

So: **the kernels are buildable now; the screens need artboards or a decision.**
Getting them into `/design-reference/` is a scheduled dependency with a real
owner, on the critical path for anything a customer can see.

### 4.3 The parts most likely to be got wrong

- **Adding `slack` to only `send_round`.** Reminders and recurring rounds are
  separate producers (`…0027:237, 283`). A channel added to one of three works
  perfectly for a day and then goes quiet.
- **`ALTER TYPE … ADD VALUE` in the migration that uses it** (§1.2). Fails at
  `db push`, and prod is the first place with enough data to notice.
- **The worker's fail-open default** (§1.3). An unknown channel currently routes
  to the email path.
- **Unfurling — and note what actually leaks.** A GET on `/s/[token]` mutates
  nothing: `get_survey_for_token` is `STABLE`, and `responded_at`, rotation and
  the grace window are touched only by the `VOLATILE` `submit_response` and
  `enqueue_reminders`. So Slack's crawler cannot damage a token. What it *can* do
  is fetch the page and render a preview containing the **survey title and the
  organisation name** — metadata about a live employee survey at a named company,
  transiting a US processor, triggered by anyone pasting a link. The same RPC
  also returns `already_responded`, so a prefetcher observing the response learns
  whether that individual has answered. Set `unfurl_links: false` and
  `unfurl_media: false` on every outbound message, and assert it in a test.
- **Nothing in the app is `noindex`.** No `robots.txt`, no `app/robots.ts`, no
  `X-Robots-Tag` in `next.config.ts:41-47`, and `app/layout.tsx:12-15` sets no
  `robots` field. `app/s/[token]` sets `dynamic = 'force-dynamic'` and
  `revalidate = 0`, which is cache control, not crawler control — and
  `app/r/[token]`, the report share route, has the identical exposure. This is a
  pre-existing gap, not a Slack one, but Slack is what makes links get pasted.
- **Concurrent token refresh.** Two processes, single-use refresh token, customer
  locked out.
- **A select policy on `org_integrations`** "just for the settings screen". The
  answer is an RPC that returns a workspace name and a boolean.
- **Rendering a workspace name we have never validated.** External input,
  displayed to administrators; escape and bound it. And a Slack workspace icon
  would need `img-src` widened *and* `images.remotePatterns` configured (neither
  exists today) — proxying the icon and keeping `img-src 'self'` is the cheaper
  answer. The "Add to Slack" button itself needs **no CSP change** provided it is
  a plain `<a href>`: `form-action 'self'` (`next.config.ts:35`) governs form
  submissions, not navigation. Server-side token exchange is not subject to CSP
  at all.

### 4.4 What must be true before this is called done

Beyond the standing gates in VERIFY.md:

- A Slack invitation is structurally identical to an email one: same token, same
  hashing, same rotation, same grace window, same anonymity rules. If anything
  about a Slack invitation is special beyond the pipe it travels down, the design
  is wrong.
- The feature flag is enforced in the database, and a negative test proves a
  hand-rolled RPC call with `'slack'` in `p_channels` is refused for an org
  without it.
- No persona can select from `org_integrations`; a test attempts it and fails.
- No Slack identifier is ever written to `responses` or `answers`; a test
  attempts it and fails.
- The worker throws on an unknown channel rather than defaulting to email.
- Revoking the integration in Slack degrades gracefully: the worker
  dead-letters, the screen says the connection is gone, no invitation is
  silently lost.

---

## 5. The plan

### 5.1 Gate 0 — decisions owed before any code (owner: Tor)

| # | Decision | Why it blocks | Blocks |
|---|---|---|---|
| G0-1 | Amend standing invariant 5 to permit personal data in a named non-EEA region, or refuse S1/S3 | The invariant as practised forbids it (§4.1) | S1, S3 (S2 needs only a narrower amendment) |
| G0-2 | Approve rewritten `privacy4P`, `privacy7P`, `dpa5P`, `dpa6P` in both languages, and start the 30-day subprocessor notice | Contractual commitment to existing controllers | S1, S2, S3 |
| G0-3 | Decide what `organizations.privacy.eu_only` means — gate the integration, or remove the switch | It is a promise enforced by nothing (§4.1) | S1, S2, S3 |
| G0-4 | Which scope ships, in which order | §0's table is a recommendation | everything |
| G0-5 | Slack ahead of Entra/Google/HR sync, or behind them | Three "kommer" cards predate this | S3 |
| G0-6 | Design artboards for the connect surface and for a five-card channel grid — or a D79-style mandate with pure composition | §4.2 | all UI |
| G0-7 | Confirm S4 is refused, and record it | §3.5 — it will come back otherwise | scope |

**Nothing below starts before G0-1 and G0-4.** G0-6 blocks only the screens, so
the kernels proceed in parallel once the design work is commissioned.

### 5.2 Workstreams and sequence

```
W0  Legal & decisions ......... G0-1..G0-7           Tor + counsel   ── gates all
W1  Design artboards .......... connect surface,     design           ── gates W4, W6
                                5-card channel grid
W2  Hygiene ................... resurrect            engineering      ── gates W5
                                FLAGGED_CHANNELS,
                                worker default-throw
W3  Credential foundation ..... Vault spike,         engineering      ── gates W4, W5, W6
                                org_integrations,
                                OAuth routes,
                                rotation, audit RPC
W4  S2 ........................ org event producer,  engineering      ── surface needs W1
                                slack_outbox + 3
                                wrappers, worker,
                                connect surface
W5  S1 kernel ................. 2 migrations, 3      engineering
                                producers, worker,
                                adapter, tests
W6  S1 surface ................ 5th card, preview,   engineering      ── needs W1
                                import matching
W7  S3 directory import ....... optional             engineering
```

### 5.3 Milestones

**M0 — Hygiene (W2), 1 day.** `FLAGGED_CHANNELS` actually consulted by
`SendScreen`; the worker throws on an unknown channel. Two small commits that
make every later one safe. Ships regardless of whether Slack proceeds.

**M1 — Foundation (W3).** Vault spike first, with a review point at day 3 and a
written answer on whether it holds up in CI. Then `org_integrations`, the OAuth
install/callback routes with signature verification and replay window built from
scratch, rotation under an advisory lock, and the SECURITY DEFINER audit wrapper.
Done when a real workspace can be connected and disconnected from a script, the
token is provably absent from every table, a concurrent refresh is provably
blocked, revocation is detected, and no persona can select `org_integrations`.

**M2 — S2 kernel (W4).** The org-level event producer, then `slack_outbox` plus
its three wrappers, fan-out, worker branch. Done when an event produces a Slack
message in the capture file with `unfurl_links: false`, a Slack outage
dead-letters without touching `mail_outbox`, and a test asserts no numeric result
value can appear in a Slack payload.

**M3 — S2 shipped.** Connect surface behind `feature_flags.slack_notify`. Needs
W1. Full VERIFY pass.

**M4 — S1 kernel (W5).** Two migrations; `slack_user_id`; the CHECK; precedence
in all three producers; flag refusal in `send_round`; worker branch;
`users.lookupByEmail` matching. Done when a Slack invitation appears in the
capture file with the same token semantics as email, reminders and the next
recurring round both go out on Slack, and every §4.4 test passes.

**M5 — S1 shipped (W6).** Fifth channel card, preview panel, import matching,
DEVIATIONS entry for the precedence rule, OPERATIONS entry for the install steps.
Needs W1. Full VERIFY pass.

**M6 — S3** if G0-5 says so.

### 5.4 Estimate

Working days of engineering, excluding W0 and W1, which are calendar-bound and
not ours:

| Milestone | Estimate | Confidence |
|---|---|---|
| M0 hygiene | 1 d | High |
| M1 foundation | 7–11 d | **Low** — first per-tenant secret, first inbound route, no crypto primitives in the repo, Vault unproven here, Slack rotation fiddly |
| M2 S2 kernel | 5–7 d | Medium — the queue mirrors the first, but the org event producer is new |
| M3 S2 surface | 2–3 d | Medium — trivial once artboards exist, unbuildable before |
| M4 S1 kernel | 4–6 d | High — SMS is a worked example |
| M5 S1 surface | 3–4 d | Medium |
| M6 S3 | 2–3 d | High |
| **S2 path (M0–M3)** | **15–22 d** | |
| **S1 path (M4–M5)** | **7–10 d** on top of M0–M1 | |

M1 is the estimate to distrust, and it got worse rather than better under
verification. Every other line has a precedent in this repository; M1 has none,
and a meaningful share of it is Slack's rotation semantics and a signature
primitive we do not own. Treat the first three days as a spike with a written
go/no-go on Vault at the end of them.

### 5.5 Risk register

| Risk | Likelihood | Impact | Response |
|---|---|---|---|
| Legal gate refuses personal data leaving the EEA | Medium | Kills S1/S3; S2 survives with a narrower text | Run G0-1/G0-2 first; S2's data footprint is defensible standalone |
| The app can read every tenant's secrets | High if unaddressed | A request-path bug becomes cross-tenant credential disclosure | `INTEGRATION_ARCHITECTURE.md` §1: grant the secret accessor to a bespoke role and revoke `service_role` |
| Supabase Vault absent from the local CI stack | Low | Invariant suite cannot cover the secret path | Prod has it (verified); confirm local in G1 |
| Artboards do not arrive | Medium | Kernels ship, screens do not — a D87 repeat | Commission W1 at Gate 0; sequence kernels first so the wait is not idle |
| Token rotation lockout in production | Medium | Customer's integration dies opaquely | Serialise refresh under a lock; alert on `invalid_grant`; make reconnect one click |
| A webhook endpoint without the primitives to defend it | Medium | First externally-callable surface, built with no `timingSafeEqual`, an in-memory rate limiter and a fail-open Turnstile | Treat signature verification + replay window as a named deliverable of M1, not a detail |
| `eu_only` left as an unenforced promise | High if unaddressed | Misrepresentation with a UI to prove it | G0-3 decides: gate the integration or remove the switch |
| Unfurl leaks survey title and org name | Low | Metadata about a named company's live survey reaches Slack | `unfurl_links:false` everywhere + a test asserting it on every outbound call |
| Scope creep into S4 | Medium | Anonymity guarantee broken with green tests | §3.5 recorded as a decision (G0-7), not a preference |

### 5.6 What this does to the verification apparatus

CLAUDE.md freezes two numbers that may only move up: **55 of 71 surfaces**
checked by the policy gate, and **18 files / 392 tests** in the census. One
correction worth recording before anyone plans against them:

- **18 files / 392 tests is exact.** `tests/expected-counts.json` has 18 entries
  and they sum to 392. A new test file must be added to the manifest —
  `tests/census.ts:20-26` is explicit that this is the point rather than a chore:
  *"new things arrive failing until someone states what they are worth."*
- **55 of 71 is not stored anywhere in the repository.** The surface list is
  derived at runtime from `pg_tables`/`pg_proc`
  (`scripts/verify/policy-coverage.ts:9-11, 196`); the pair of numbers in
  CLAUDE.md is a snapshot of a past run's stdout. It is reproducible only by
  starting a local Supabase and running `npm run verify:policy`. **A Slack phase
  must reproduce it before claiming to have moved it** — `org_integrations` adds
  a surface to the 71 and arrives failing until its denial test is written, so it
  must also add to the 55 in the same PR or CI is red.

**No new gate, no new meta-check, no new manifest** — CLAUDE.md freezes the
apparatus and this proposal does not propose to unfreeze it.

---

## 6. Stop-and-ask

Seven things this document deliberately does not decide, because they are not
engineering's to decide:

1. Whether personal data may leave the EEA for a named processor (G0-1).
2. What the privacy notice and the DPA say afterwards, in both languages, and
   when the 30-day notice starts (G0-2).
3. What `organizations.privacy.eu_only` means — a switch that gates something, or
   a switch that goes away (G0-3).
4. Which scope ships, and in which order (G0-4).
5. Whether Slack jumps ahead of the Entra/Google/HR cards that have said "kommer"
   since Phase 3 (G0-5).
6. What the connect surface and the five-card channel grid look like (G0-6) —
   D87 says the screens wait for the bundle, D79 says an undrawn surface is
   admissible with a mandate and pure composition, and Slack currently has
   neither.
7. Whether S4 is closed permanently or merely deferred (G0-7).
