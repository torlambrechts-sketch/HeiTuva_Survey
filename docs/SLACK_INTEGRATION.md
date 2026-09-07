# Slack-integrasjon — investigation, verification and plan

Status: **PROPOSAL — not built, not decided.** Nothing in this document has been
implemented. It exists so the decision can be made on evidence rather than on a
demo. Written against the repository at commit `cd74022` (Phase 9 closed).

Three passes, in the order they were run: what the codebase actually gives us
(engineering), what a supervisor refuses to sign (verification), and what a
project manager can commit to (plan).

---

## 0. Recommendation in one page

"A Slack integration" is four different products. They do not cost the same and
they do not carry the same risk:

| | What it is | Value | Risk | Verdict |
|---|---|---|---|---|
| **S1** | Slack DM as a fifth **invitation channel** — the same `/s/<token>` link, delivered by bot instead of by email | High — response rate is the product's weak point, and Slack is where the target market reads things | High — employee identities and emails leave for a US processor | **Build second** |
| **S2** | Slack as a **notification sink** — HeiTuva posts *events* (round closed, duty deadline, "krever handling") into a channel the org picks | Medium — keeps compliance work visible where work happens | Low — no respondent data, no results, only an event and a deep link | **Build first** |
| **S3** | Slack as a **directory source** — roster import alongside CSV/Excel/Entra/Google/HR | Low — the three existing sync stubs are unbuilt; Slack would jump a queue | Medium | **Build third, or not at all** |
| **S4** | **Answering inside Slack** — Block Kit modal instead of the `/s/<token>` page | Looks impressive | **Fatal for anonymous surveys** | **Refuse** (§4.4) |

**The recommendation is S2 → S1, and only after a legal gate that has to clear
before a single line is written.** S2 exists mostly to prove the plumbing —
OAuth install, per-org credential storage, token rotation, the outbound worker
path — against traffic that carries no personal data. S1 then reuses all of it
and only adds the parts that are actually delicate.

One honest qualification to that ordering, found while costing it (§5.4): S2 is
**not** the cheap one. It looked cheap until the event source turned out not to
exist — `notifications` has no producer at all and is addressed to a member
rather than to an organisation (§3.2) — which makes S2 and S1 cost roughly the
same, 12–18 days each on top of a shared foundation. So the ordering rests on
risk and on the legal gate, not on price. If G0-1 clears cleanly and quickly,
starting with S1 is defensible, because S1 is where the customer value is. If
G0-1 is at all uncertain, S2 first is the ordering that cannot be wasted.

**S1 and S3 cannot ship at all until DECISIONS' standing invariant 5 (EU/EØS
residency) is amended and the customer-facing privacy text is rewritten.**
`messages/no.json:1358` today tells every reader *«Ingen persondata overføres
til land utenfor EØS»*. Slack is Salesforce, and Salesforce is American. EU data
residency for Slack exists but is a paid add-on on Business+ and Enterprise
Grid, is off by default, and is therefore not something a Norwegian SMB customer
of ours will have. Shipping S1 without touching that sentence would make the
product's own privacy page false. That is not a documentation task to do at the
end; it is the gate at the front.

---

## 1. What the codebase already gives us

The good news is real: **HeiTuva already has a channel seam, and it has been
exercised once.** Migration `20260904000027_sms_channel.sql` added SMS to a
product that had only email, link and QR, and it is the exact template a Slack
channel follows.

### 1.1 The seam, as SMS actually used it

Seven touchpoints, not the five one would guess:

1. **The enum** — `app.channel` is `('email','link','qr','sms')`
   (`supabase/migrations/20260902000001_foundation.sql:13`).
2. **The reachability column and its CHECK** — SMS made
   `survey_invitations.email` nullable and added `phone`, with
   `invitations_reachable_check` guaranteeing "an email or a phone or both,
   never neither" (`…0027:22-26`).
3. **The flag, enforced in the database** — `send_round` refuses `sms` outright
   with `error: 'sms_not_enabled'` when `feature_flags.sms_channel` is off for
   the org (`…0027:105-114`). The screen hiding the card is not the control; the
   RPC is.
4. **The queue payload** — `pgmq.send('mail_outbox', …)` gained `channel` and
   `phone` keys, in all three producers: `send_round`, `app.enqueue_reminders`
   and `app.run_due_schedules` (`…0027:160, 270, 348`). A channel
   that is added to only the first of those works on the first send and silently
   drops every reminder and every recurring round.
5. **The worker branch** — `scripts/mail-worker.ts:104-125` switches on
   `job.channel` and dead-letters a malformed job rather than retrying it.
6. **The provider adapter** — `lib/sms/{types,index,link-mobility,capture}.ts`,
   deliberately not `server-only` because the worker is a plain Node process,
   with credentials read from `process.env` **at call time** and never at import.
   The `capture` provider writing one JSON line per message is what makes the
   channel verifiable locally.
7. **Everything around it** — the registry (`lib/send/registry.ts`: `CHANNELS`,
   `FLAGGED_CHANNELS`, `CHANNEL_KEY`), the i18n keys in both
   `messages/{no,en}.json`, the import parser learning a new column, the Send
   screen's card and preview panel, the invariant tests, `docs/OPERATIONS.md`,
   and a `docs/DEVIATIONS.md` entry (D80) explaining the routing rule the design
   never drew.

Anything that claims a Slack channel is "add an enum value and a send function"
has counted 2 of these 7.

### 1.2 What does **not** exist, and is the actual work

- **There is no home for a per-organisation credential.** Nothing in the 38
  tables stores a third-party token. Every integration the product has today
  (SES, LINK Mobility, Sentry, Turnstile, Entra) is configured with a *single*
  process-wide secret in `process.env` — one HeiTuva account talking to one
  provider. Slack is the first integration where **each customer has their own
  credential**, minted by their own administrator, revocable by them, and useless
  to every other tenant. That is a new table, a new encryption story, and a new
  RLS posture — see §3.1. It is the single largest piece of work in the whole
  proposal and it is invisible from the feature description.
- **There is no inbound HTTP endpoint of any kind.** The app has exactly three
  route handlers: `app/auth/callback/route.ts` and the two report exports. There
  are no Supabase Edge Functions (`supabase/functions` is empty). A Slack OAuth
  callback, and later a Slack interactivity/events endpoint, would be the first
  externally-callable, unauthenticated-at-the-edge surfaces the product has ever
  had. They belong in Next route handlers rather than Edge Functions, for a
  reason that is about verification rather than taste: CI starts Supabase with
  `-x edge-runtime` (`.github/workflows/ci.yml:47`), so an Edge Function is a
  surface the invariant suite cannot reach. A route handler is covered by every
  gate the product already runs.
- **There is no design.** `HeiTuva.dc.html` contains no Slack, no
  "Integrasjoner" tab, and no fifth channel card. See §4.2 — under the rule D87
  set in Phase 9, that is a stop-and-ask, not a licence to draw.
- **`app.channel` cannot gain a value and be used in the same migration.**
  PostgreSQL 17 still holds the rule: a value added by `ALTER TYPE … ADD VALUE`
  inside a transaction block cannot be used until that transaction commits, and
  `supabase db push` runs each migration file in its own transaction. So Slack
  needs **two migration files** — one that does nothing but
  `alter type app.channel add value if not exists 'slack';`, and the next one
  that uses it. Discovering this at `db push` time on prod, mid-phase, is a bad
  afternoon; it costs nothing to know now.

---

## 2. What Slack itself requires

Facts that shape the design, verified against Slack's current developer docs
(September 2026):

- **A distributed (public) app**, not a workspace app: each customer installs it
  into their own workspace and we hold one bot token per workspace. One redirect
  URL, one client id/secret pair held by HeiTuva.
- **Scopes**: `chat:write` and `im:write` (via `conversations.open`) to DM a
  person; `users:read` + `users:read.email` to match an employee to a Slack
  account; `chat:write` alone for S2's channel posts. `users:read.email` is the
  one that matters — it is how an email address gets to Slack.
- **Token rotation**: access tokens expire after 12 hours and are refreshed with
  a rotating refresh token. **Rotation cannot be turned off once turned on.**
  The refresh token is single-use, so the web app and the send worker refreshing
  concurrently will race and invalidate each other. Refresh must be serialised —
  one owner, holding a lock — which is a design constraint on §3.1, not an
  implementation detail.
- **Rate limits**: roughly one message per second per conversation. A 400-person
  send is therefore minutes of worker time, which the existing pgmq worker
  handles fine and an HTTP request would not. This is another reason the send
  path stays where it is.
- **Link unfurling** is on by default. Slack fetches any URL it sees to build a
  preview — which means Slack's crawler would fetch `/s/<token>`, a personal,
  single-purpose respondent link, and render a preview of it into the
  conversation. Every Slack message the product sends must set
  `unfurl_links: false` and `unfurl_media: false`.
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
  secret_id         uuid  -- Supabase Vault secret holding the bot token
  refresh_secret_id uuid  -- Vault secret holding the rotating refresh token
  expires_at        timestamptz
  scopes            text[]
  installed_by      uuid → org_members(id) on delete set null
  installed_at, revoked_at
  unique (org_id, provider) where revoked_at is null
```

Three rules that are not negotiable, each borrowed from a rule the product
already enforces:

1. **No select policy for clients — ever.** RLS on, and the only policies are
   for what the UI legitimately needs, which is *workspace name and connection
   state*, exposed through a SECURITY DEFINER RPC that never returns a secret
   id. This is the same posture `responses`/`answers` have, for the same reason:
   the safest read policy is the one that does not exist. A bot token is a
   credential that can post as the customer's organisation into their Slack.
2. **The token is never a column.** It lives in Supabase Vault; the table holds
   the secret id. Nothing in the app schema ever holds plaintext.
3. **Refresh is serialised.** One producer refreshes, under an advisory lock,
   and writes the new refresh token before using the new access token. Slack's
   refresh tokens are single-use; two concurrent refreshers lock the customer
   out of their own integration and the failure surfaces days later as
   `invalid_grant`.

Plus:

- `app/api/slack/oauth/{start,callback}/route.ts` — administrator-only,
  signed single-use `state` bound to the org and to the member, short expiry.
  The callback is the first place in this codebase where an external party
  controls the input to a route handler; Zod at the boundary, the existing
  `lib/ratelimit.ts` in front of it.
- `audit_events` rows for connect, reconnect and revoke. An administrator
  granting a third party the ability to message every employee is exactly the
  class of act the audit trail exists for.
- `lib/slack/` mirroring `lib/mail/` and `lib/sms/` exactly: `types.ts`,
  `index.ts` choosing provider by configuration, `api.ts` (real Slack), and
  `capture.ts` writing JSON lines so the local verifier can read back what was
  "sent" without a Slack workspace.

### 3.2 S2 — Slack as a notification sink (build first)

The smallest thing that proves all of §3.1 in production traffic.

- One org-selected channel; HeiTuva posts **events, never results**: a round
  closed, a duty deadline inside 14 days, a "krever handling" chip appearing,
  an import finishing. Each message is one line and a deep link into HeiTuva.
- **No numbers, no group labels, no free text, ever.** A Slack channel is not a
  surface where `app.k_for` can be enforced — its audience is whoever is in the
  channel, which HeiTuva does not know and cannot bound. So results do not go
  there. The link goes there, and HeiTuva decides what the person who clicks it
  may see, exactly as it does today.
- **The event source does not exist yet, and this is the part that gets
  under-estimated.** `notifications` looks like the right home — it holds
  `(org_id, member_id, kind, payload)` and its RLS is already proven — but two
  things disqualify it as-is. Nothing writes to it: `scripts/seed-demo.ts:342`
  records that "notifications are not yet emitted", and the only row in the
  whole system is a synthetic fixture that exists so Gate 5a3 can prove a
  cross-org read is refused. And it is addressed to **one member**, not to the
  organisation — `tests/invariants/policy-coverage.test.ts:252` asserts that an
  administrator cannot see a `leser`'s notification — whereas a Slack channel
  post is org-scoped by definition.

  So S2 must first build the org-level event producer the product has never
  had: triggers or RPC-side emissions for "round closed", "duty deadline
  approaching", "import finished". That is the honest majority of M2, and it is
  worth having regardless of Slack — it is also what an in-app activity feed
  and an email digest would need.
- Second pgmq queue (`slack_outbox`) with its own read/archive RPCs mirroring
  `mail_outbox_api`, so a Slack outage cannot stall invitations.

Data leaving the EEA in S2: an organisation name, a survey title, a duty title,
a URL. No respondent, no answer, no employee list. That is a defensible
paragraph in the privacy text, which S1's is not.

### 3.3 S1 — Slack as an invitation channel (build second)

Follows §1.1's seven touchpoints:

1. Migration A: `alter type app.channel add value if not exists 'slack';` — and
   nothing else in the file.
2. Migration B: `survey_invitations.slack_user_id text`; extend
   `invitations_reachable_check` to `email is not null or phone is not null or
   slack_user_id is not null`; extend the channel-precedence rule in
   `send_round`, `app.enqueue_reminders` and `app.run_due_schedules`; refuse
   `slack` with `error: 'slack_not_enabled'` unless `feature_flags.slack_channel`
   is on for the org **and** a live `org_integrations` row exists.
3. Precedence, stated once and tested: **email when it can be, Slack when the
   person has no address, SMS when they have only a phone.** Nobody is reached
   twice. This mirrors D80 and needs its own deviation entry, because the design
   never drew it.
4. Matching an employee to a Slack account: `users.lookupByEmail`, which is a
   transfer of that employee's work email to Slack **before any message is
   sent**. There is no way around it and it must be stated plainly in the
   privacy text and in the connect screen's copy — not buried.
5. Worker branch, adapter, capture provider, `unfurl_links: false`.
6. Registry entry, `CHANNEL_KEY`, `FLAGGED_CHANNELS.slack = 'slack_channel'`,
   i18n keys in `no` and `en`.
7. Invariant tests (§5.3), OPERATIONS entry, DEVIATIONS entry.

### 3.4 S3 — directory import

`app.import_source` gains `'slack'`; `IMPLEMENTED_SOURCES` gains it; the parser
gains a Slack path. Cheap *given* §3.1. The reason it is third and not second is
product order, not difficulty: `entra`, `google` and `hr` have rendered as
"kommer" cards since Phase 3, and shipping Slack ahead of all three is a
statement about the customer we are building for. That is Tor's call, not
engineering's.

### 3.5 S4 — answering inside Slack: refuse

The product's second standing invariant is that anonymity is *structural*: an
anonymous response carries no invitation id, no user id, no IP, no user-agent,
and an hour-truncated timestamp, and a database CHECK enforces it. A Block Kit
modal inverts that. The submission arrives over an authenticated Slack
interaction whose payload names the Slack user, in a request Slack logs, from a
workspace the employer administers and can export. Even a flawless
implementation that discards the identity before the insert has moved the
guarantee from *structural* to *behavioural* — from "the database cannot hold
the link" to "our code promises not to look". That is precisely the trade
DECISIONS Q3 already refused when it made k=5 non-disableable, on the stated
grounds that *a toggleable anonymity guarantee is not a guarantee*.

The narrow version — S4 for `named` and organisation-attributed surveys only,
where there is no anonymity to lose — is arguable. It is also a second complete
respondent renderer for all 13 question types, in Block Kit, forever in step
with the real one. The recommendation is no.

---

## 4. Supervisor's verification — what would fail review

### 4.1 BLOCKER — the EEA claim is currently categorical

`messages/no.json:1358` (`privacy4P`): *«Alle data lagres i EU/EØS … Ingen
persondata overføres til land utenfor EØS.»* `privacy7P:1364` and `dpa5P:1378`
enumerate the subprocessors, and `dpa5P` commits us to **30 days' notice to the
controller before a new subprocessor is used**, with a right to object.

Consequences, all of which precede code:

- DECISIONS standing invariant 5 must be amended by Tor, as a decision (Q18),
  not edited in passing.
- The three legal strings must be rewritten — in **both** languages, at the
  same line numbers in `messages/no.json` and `messages/en.json` (1358, 1364,
  1378), and then reseeded into `ui_messages` with `scripts/seed-i18n.ts`,
  because the app reads copy from the table and not from the files.
  `docs/LEGAL_DRAFTS.md:7` already says the subprocessor list needs a Norwegian
  lawyer's read before a customer sees it; adding a US processor is exactly when
  that read is owed.
- The 30-day clock is real for any existing customer. It runs in parallel with
  the build, but it must be *started*, and it is a project-management item with
  a date, not a checkbox at the end.

### 4.2 BLOCKER — there is no design, and D87 is the precedent

The bundle has no Slack. S1 needs a fifth channel card in a grid the design
drew with four. S2 and the connect flow need a settings surface that does not
exist — Administrasjon has its tabs and "Integrasjoner" is not among them.

Phase 9 hit this exact wall and D87 recorded the answer: nine surfaces the Q17
brief described in prose but the bundle did not contain were **not built** —
the phase shipped the kernel and the copy-only surfaces and the screens waited
for the bundle. Building Slack's screens from this document's prose would
reverse that decision silently, after it has held fidelity for nine phases.

So: **the kernel is buildable now; the screens need artboards.** Getting them
into `/design-reference/` is a scheduled dependency with a real owner, and it
is on the critical path for anything a customer can see.

### 4.3 The parts most likely to be got wrong

- **Adding `slack` to only `send_round`.** Reminders and recurring rounds are
  separate producers (`…0027:237, 283`). A channel added to one of three works
  perfectly for a day and then goes quiet.
- **`ALTER TYPE … ADD VALUE` in the migration that uses it** — §1.2. Fails at
  `db push`, and prod is the first place with enough data to notice.
- **Unfurling.** Default-on. Slack's crawler fetching `/s/<token>` and
  previewing a personal respondent link into a channel is a privacy incident
  with our name on it, caused by a parameter we did not pass.
- **Concurrent token refresh.** Two processes, single-use refresh token,
  customer locked out. Serialise it.
- **A select policy on `org_integrations`** "just for the settings screen". The
  answer is an RPC that returns a workspace name and a boolean.
- **Rendering a workspace name we have never validated.** It is attacker-ish
  input from an external system; it is displayed to administrators; escape and
  bound it like any other untrusted string.

### 4.4 What must be true before this is called done

Beyond the standing gates in VERIFY.md:

- A Slack invitation is structurally identical to an email one: same token,
  same hashing, same rotation, same grace window, same anonymity rules. If
  anything about a Slack invitation is special beyond the pipe it travels down,
  the design is wrong.
- The feature flag is enforced in the database, not the screen, and there is a
  negative test proving a hand-rolled RPC call with `'slack'` in `p_channels`
  is refused for an org without the flag.
- No Slack identifier is ever written to `responses` or `answers`, and a test
  attempts it and fails.
- Revoking the integration in Slack degrades gracefully: the worker
  dead-letters, the screen says the connection is gone, and no invitation is
  silently lost.

---

## 5. The plan

### 5.1 Gate 0 — decisions owed before any code (owner: Tor)

| # | Decision | Why it blocks | Blocks |
|---|---|---|---|
| G0-1 | Amend standing invariant 5 to permit a named non-EEA subprocessor, or refuse Slack | The invariant as written forbids the integration | S1, S2, S3 |
| G0-2 | Approve the rewritten `privacy4P` / `privacy7P` / `dpa5P` and start the 30-day subprocessor notice | Contractual commitment to existing controllers | S1, S2, S3 |
| G0-3 | Which scope ships, in which order | §0's table is a recommendation, not a decision | everything |
| G0-4 | Slack ahead of Entra/Google/HR sync, or behind them | Three "kommer" cards predate this | S3 |
| G0-5 | Design artboards for the connect surface and the fifth channel card | D87 | all UI |
| G0-6 | Confirm S4 is refused | §3.5 | scope |

**Nothing below starts before G0-1 and G0-3.** G0-5 blocks only the screens, so
the kernel can proceed in parallel once the design work is commissioned.

### 5.2 Workstreams and sequence

```
W0  Legal & decisions ......... G0-1..G0-6           Tor + counsel   ── gates all
W1  Design artboards .......... connect surface,     design           ── gates W4, W6
                                5th channel card
W2  Credential foundation ..... org_integrations,    engineering      ── gates W3, W5
                                Vault, OAuth routes,
                                rotation, audit
W3  S2 notification sink ...... slack_outbox queue,  engineering
                                fan-out, worker
W4  S2 surface ................ connect/disconnect   engineering      ── needs W1
W5  S1 channel kernel ......... 2 migrations, 3      engineering
                                producers, worker,
                                adapter, tests
W6  S1 surface ................ 5th card, preview,   engineering      ── needs W1
                                import matching
W7  S3 directory import ....... optional             engineering
```

### 5.3 Milestones

**M1 — Foundation (W2).** `org_integrations` + Vault + OAuth install/callback +
rotation under lock + audit events + `lib/slack/` with a capture provider. Done
when a real workspace can be connected and disconnected from a script, the
token is provably not in any table, a second concurrent refresh is provably
blocked, and revocation in Slack is detected. Tests: RLS negative (no persona
can select `org_integrations`), OAuth `state` replay refused, rotation race
refused.

**M2 — S2 kernel (W3).** The org-level event producer (§3.2) + `slack_outbox`
queue + RPCs + fan-out + worker branch. Done when an event produces a Slack message in
the capture file with `unfurl_links: false`, and a Slack outage dead-letters
without touching `mail_outbox`. Tests: no numeric result value can appear in a
Slack payload (assert the payload builder's shape, not its politeness).

**M3 — S2 shipped (W4).** Connect surface behind `feature_flags.slack_notify`.
Needs W1. Full VERIFY pass.

**M4 — S1 kernel (W5).** Two migrations; `slack_user_id`; the CHECK; the
precedence rule in all three producers; flag refusal in `send_round`; worker
branch; `users.lookupByEmail` matching. Done when a Slack invitation appears in
the capture file with the same token semantics as email, reminders and the next
recurring round both go out on Slack, and every §4.4 negative test passes.

**M5 — S1 shipped (W6).** Fifth channel card, preview panel, import matching,
DEVIATIONS entry for the precedence rule, OPERATIONS entry for the install
steps. Needs W1. Full VERIFY pass.

**M6 — S3** if G0-4 says so.

### 5.4 Estimate

Working days of engineering, excluding W0 and W1, which are calendar-bound and
not ours:

| Milestone | Estimate | Confidence |
|---|---|---|
| M1 foundation | 5–8 d | Low — first credential store, first inbound route, rotation is fiddly |
| M2 S2 kernel | 5–7 d | Medium — the second queue mirrors the first, but the org event producer is new (§3.2) |
| M3 S2 surface | 2–3 d | Medium — trivial once artboards exist, unbuildable before |
| M4 S1 kernel | 4–6 d | High — SMS is a worked example |
| M5 S1 surface | 3–4 d | Medium |
| M6 S3 | 2–3 d | High |
| **S2 path (M1–M3)** | **12–18 d** | |
| **S1 path (M4–M5)** | **7–10 d** | |

M1 is the estimate to distrust. Every other line has a precedent in this
repository; M1 has none, and half of it is Slack's rotation semantics rather
than our code. Plan it as a spike with a review point at day 3.

### 5.5 Risk register

| Risk | Likelihood | Impact | Response |
|---|---|---|---|
| Legal gate refuses the non-EEA transfer | Medium | Kills S1/S3; S2 survives with a narrower text | Run G0-1/G0-2 first; S2's data footprint is defensible standalone |
| Artboards do not arrive | Medium | Kernels ship, screens do not — a D87 repeat | Commission W1 at Gate 0; sequence kernels first so the wait is not idle |
| Token rotation lockout in production | Medium | Customer's integration dies, opaquely | Serialise refresh; alert on `invalid_grant`; make reconnect one click |
| Unfurl leaks a respondent link | Low | Privacy incident | `unfurl_links:false` everywhere + a test asserting the flag on every outbound call |
| Slack changes app-review or rate-limit terms | Low | Delay | Nothing we control; do not build on `conversations.history` |
| Scope creep into S4 | Medium | Anonymity invariant | §3.5 recorded as a decision, not a preference |

### 5.6 What this does to the verification apparatus

CLAUDE.md freezes two numbers that may only move up: **55 of 71 surfaces**
checked by Gate 5a3, and **18 files / 392 tests** in the census. A Slack phase
adds test files, so `tests/expected-counts.json` and `tests/census.ts` gain
entries and both numbers rise. New routes (`/api/slack/*`, the connect surface)
join `tests/routes.manifest.ts` at both viewports. **No new gate, no new
meta-check** — CLAUDE.md freezes the apparatus, and this proposal does not
propose to unfreeze it.

---

## 6. Stop-and-ask

Five things this document deliberately does not decide, because they are not
engineering's to decide:

1. Whether HeiTuva accepts a US subprocessor at all (G0-1).
2. What the privacy and DPA texts say afterwards, and when the 30-day notice
   starts (G0-2).
3. Whether Slack jumps ahead of the Entra/Google/HR cards that have said
   "kommer" since Phase 3 (G0-4).
4. What the connect surface and the fifth channel card look like (G0-5) — D87
   says we wait for the bundle, and this proposal does not overrule D87.
5. Whether S4 is closed permanently or merely deferred (G0-6).
