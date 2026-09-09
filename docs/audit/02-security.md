# 02 — SECURITY

**155 surviving findings from ten probes (B1–B7b), each adversarially re-checked.** Read
`00-method.md` for the evidence tiers. Every finding carries a **tier** and **BITES PROD TODAY**.

Severity after triage: **43 MAJOR · 45 MINOR · 41 LIMITATION · 26 CLEAN.** Two claims were
refuted. **No BLOCKER.** The one blocker this audit found is a database-tenancy defect and lives
in `01-database.md`.

**B3 is the section that had never been run.** Gate 5a3 states its own scope at
`scripts/verify/policy-coverage.ts:9-12`: *"Every RLS-enabled table in `public` and every SECURITY
DEFINER function in `public` is a surface."* A query inside a route handler or a server action is
neither. Eleven phases have shipped 4 route handlers and 23 server-action files, and none of them
had ever been audited as a database surface. Most of what follows comes from there.

---

## 2.1 What holds

- **The k-gate is real and two-sided.** `app.k_for` returns 5 for a person survey at threshold 5,
  2 at threshold 2, 0 for an organisation survey and NULL for a survey that does not exist —
  proven by calling it on real rows, not by reading it. The floor and ceiling CHECKs are present
  on both environments.
- **`submit_response` is the only writer of `responses`**, on both environments, comments stripped.
- **`anon` holds EXECUTE on exactly seven functions**, and every one is the documented set plus
  `redeem_live_voucher`, which V2-9 allowlisted with its reason.
- **`lib/supabase/admin.ts` is fail-closed and guarded.** It imports `server-only` (a build error
  if a client component pulls it in) and it **throws** when the key is absent rather than falling
  back to anon. I read both lines.
- **No service-role key reaches the client bundle.** Verified against the built output, not the
  source.
- **No `when others` in any SQL body** once comments are stripped.
- **Every credential stored in a first-class column is SHA-256 hashed at rest** with 192–256 bits
  of CSPRNG entropy. The live voucher's `code` is the exception and is plaintext by design.

---

## 2.2 The MAJORs that bite prod today

### `B4-F01` — nothing drains the mail queue in production · tier VERIFIED

**This one has already happened.** Measured on prod by me, read-only:

```
pgmq.q_mail_outbox   queued_now    = 2     read_ct = 0 on both
pgmq.a_mail_outbox   archived_ever = 0     <- the queue has NEVER been drained
oldest message age                 = 37.3 hours
msg 1,2  kind=invitation  to=tor.lambrechts@gmail.com   enqueued 2026-09-08
cron.job = enqueue_reminders | apply_retention | run_due_schedules   (three PRODUCERS, no CONSUMER)
survey_invitations where sent_at is not null = 0
```

`send_round` enqueues and the Send screen reports «Sendt til N personer». The only consumer is
`scripts/mail-worker.ts`, which has no scheduled invocation anywhere: `vercel.json` declares only
`framework` and `regions`, there is no pg_cron job for it, and no route handler calls it. **Two
genuine invitations to the account owner have been undelivered for 37 hours.**

A second-order consequence worth recording: `sent_at` is written by the *worker*, so it is NULL on
every prod invitation, and `app.enqueue_reminders` requires `sent_at is not null`. **One broken
thing is hiding another** — the suppression defect below is doubly inert on prod because the mail
path never ran. Neither is visible from any screen.

### `B1-01` — the reminder cron ignores suppressions · tier VERIFIED

Every suppression check sits at invitation-creation time: `guard_invitation_not_suppressed`,
`app.is_suppressed`, `app.run_due_schedules`, `public.send_round`. **`app.enqueue_reminders` is
absent from that list** — the string `suppress` does not appear in its body on either environment
— and `reminders-hourly` is active on both. V2-3b closed the cron *re-invitation* path; an
objection lodged *after* a round is sent never reaches the invitation that already exists. The
function walks un-answered invitations, **mints a fresh token for each**, and queues an email.

A verifier reproduced it end to end on the seeded database using the seed's own schedule row:
`invitation inserted → objection recorded → is_suppressed = true → enqueue_reminders returned 1 →
QUEUED kind=reminder to=objector`. MAJOR rather than BLOCKER: suppression is not one of the eight
numbered invariants, and prod has `schedules = 0` and `suppressions = 0`.

### `B1-02` — the invitation guard is BEFORE INSERT only

`pg_get_triggerdef` reads `BEFORE INSERT ON public.survey_invitations` — no `OR UPDATE`. The
verifier found the exploit is *simpler* than filed: no sms/null-email trick is needed, an ordinary
invitation can simply be `UPDATE`d onto a suppressed address. The actor the guard exists to
constrain — a redaktør with `can_edit_survey` — is exactly the actor who can walk round it. Reach
is API-only: no product screen updates an invitation's email.

### `B3c-1` — «Send test til meg selv» rewrites the participation denominator

`send_round` never sets `is_test`, so the test send writes an ordinary invitation. The sole prod
administrator can press this on either `aktiv` survey today.

### `B3c-4` — `run_mode = 'quiz'` has no writer

All of V2-10 is reachable only from psql. The Builder renders the card and cannot enable it. This
is the fifth-and-sixth instance of the standing question, on a feature that shipped two phases ago.

### `B3b-2` / `A3-2` — Turnstile and the rate limiter protect one caller, not the endpoint

`request_demo` carries `grant execute … to anon` in the exposed `public` schema; the limiter and
captcha live in the Next.js server action. The publishable key is public by definition. The
verifier proved reachability on prod **using invalid input so that no row was written**, and I
confirmed prod's `demo_requests` is still 0.

### `B5-1` — soft-deleting a survey revokes no token

`app.resolve_token` never reads `surveys` at all, so `deleted_at` is invisible to it. Every
invitation, share link and live session on a "deleted" survey stays live. Prod has 2 open rounds,
2 live invitation tokens expiring 2026-09-15, and 1 active share link.

### `B7a-*` / `B7b-*` — **production serves the pre-correction copy**

This is the largest cluster and it has one cause. `lib/i18n/messages.ts` layers the seeded
`ui_messages` table **over** the JSON files, and prod's table carries rows written before D113,
D120, D122 and D124 corrected them. So every copy fix those deviations recorded is present in the
repository and **absent from the running product**:

- `B7a-01` / `A9-1` — the pre-fix privacy copy, including **«Summerte tall beholdes»**.
- `B7b-01` — six public splash strings and the statutory-report threshold sentence still
  hard-code five.
- `B7a-04` — **«Servere i Oslo og Frankfurt»**. Nothing runs or stores in Oslo: Supabase is
  `eu-central-1`, Vercel is `fra1`.
- `B7a-05` — the public privacy notice states a 24-month default retention; the database default
  is 12.
- `B7a-06` / `A9-6` — the DSR surface promises access, erasure and export; it is a deadline
  tracker.
- `B7b-07` — the splash promises Swedish and Danish surveys; only `no` and `en` are served.
- `B7b-10` — the splash claims SMS, Entra ID, Google and HR-system integrations; all four flags
  ship disabled.
- `B7b-05` / `B7b-06` — Bruksområder promises a «Filopplasting» question type and a «Vet ikke»
  option, neither of which exists anywhere. These render **from the bundle** because the
  `usecases` namespace has 0 rows in prod.

**`B7b-02` is the finding about the finding, and it is the one to keep.** `verify:copy` reads the
JSON file and never the table the product serves. It is therefore *structurally unable* to see any
of the above — the gate is green precisely because it is looking at the half that was fixed. This
is D110's case 4 with a gate in place of a screenshot: real, on-topic, and mute on the claim.

---

## 2.3 The MAJORs that do not bite today but are the ones to think about

- **`B6-03` / `A2-5` — `result_snapshots.aggregates` is directly SELECTable by any org member**,
  including a `leser`, and one of its writers stores a **report document containing quotes and
  attributed rows**. There is no RPC in that path, so the k-gate and the leser rule are both
  bypassed by reading the table.
- **`B6-05` / `B3a-11` — `compose_report` applies no role rule at all.** A `leser` gets the same
  composed document as an administrator, including the attributed rows the CSV route refuses them.
  CLAUDE.md invariant 4 has no effect anywhere in reports.
- **`B6-02` — `field` questions write the respondent's name and e-mail into `answers.value`**, and
  `aggregate_rows`' text exclusion is `v_q.type <> 'text'` — an enumeration of one type. A `field`
  question therefore flows into the aggregate path.
- **`B6-06` / `B6-07` — `apply_retention` reaches `answers` and `responses` only.** Free text
  survives in the frozen snapshot and in the archived export, past the deletion the copy promises.
- **`B6-04` — archived PDF/PPTX exports are readable by every org member**, so a `leser` can fetch
  a redaktør's document out of Storage.
- **`B3a-1` — the PDF and PPTX routes archive into the VIEWER's org, not the REPORT's.**
- **`B3c-3` — `app.guard_survey_policy` role-checks `k_threshold` only**, so a redaktør can change
  a survey's *anonymity*, unaudited, on a surface the Builder presents as administrator-only.
- **`B7a-03` / `B7b-03` — the org threshold floor and the administrator-only rule are BEFORE
  UPDATE triggers.** INSERT escapes both: a redaktør can create a survey below the floor through
  the REST API.
- **`B3b-1` — "an organisation always keeps an active administrator" lives only inside one server
  action.** No database rule, no test; a direct PostgREST call skips it.
- **`B5-2` / `A7a-3` — `report_shares.expires_at` has no writer.** Every report share link is
  permanent and there is no revocation UI, while the RPC that checks expiry reads a column nothing
  can set.
- **`B2-05` — `ui_messages` SELECT is `using(true)`** while a shipped editor writes org-scoped rows
  into the same table. Cross-tenant by construction, latent only because nobody has used the
  feature yet.

---

## 2.4 LIMITATIONs — designs whose cost was never written down

- **`B5-3` — Sentry's scrubber removes bodies, cookies and headers, but not `event.request.url`**,
  and for `/s/<token>`, `/r/<token>` and `/l/<code>` **the URL is the credential**. Same for any
  access log and any `Referer`. Marked INFERRED: the scrubber's behaviour is read, not observed
  against a live event.
- **The live voucher's `code` is plaintext at rest** and matched with `=`. Defensible — a code
  projected on a wall is not a mailed secret — but **written down nowhere**, which is what makes it
  a limitation rather than a decision.
- **`B2-01` / `A8-1` — `M:0012`'s `alter default privileges … revoke execute … from public` is
  inert.** 27–28 `app` functions carry PUBLIC EXECUTE, four of them SECURITY DEFINER. The only
  thing between them and the internet is PostgREST's exposed-schema setting, which is configuration
  rather than a database privilege. The migration's own comment asserts the opposite.
- **`B2-03` / `B2-04` — two allowlist reasons are half-reasons**, in D113(b)'s exact sense:
  `redeem_live_voucher`'s reason describes the *intended* usage ("each device redeems it for its
  own single-use token") and nothing enforces one-per-device; `submit_response` has no replay bar
  on a share-link token, so the caller who reads `get_peer_results` is the caller who sets its k.
  Both reasons are true. Neither is sufficient.

---

## 2.5 Every surviving Part B finding

| § | id | finding | sev | tier | bites prod today |
|---|---|---|---|---|---|
| B1 | `B1-01` | app.enqueue_reminders() has no suppression check — a GDPR art. 21 objection does not stop the reminder, and the job is active hourly on prod | **MAJOR** | VERIFIED | NO |
| B1 | `B1-02` | guard_invitation_not_suppressed is BEFORE INSERT only — an UPDATE reaches the same forbidden state | **MAJOR** | PROBE-VERIFIED | NO |
| B2 | `B2-01` | M:0012's `alter default privileges in schema app revoke execute on functions from public` is inert; 28 app functions are PUBLIC-executable, including four SECURITY DEFINER ones | **MAJOR** | PROBE-VERIFIED | NO |
| B2 | `B2-03` | HALF-REASON, compositional: `submit_response` has no replay bar on a share-link token, so the caller who reads `get_peer_results` is the same caller who sets its k | **MAJOR** | PROBE-VERIFIED | YES — prod's one active share link (d9cf7953) is on an OPEN round of a person-kind survey with r |
| B2 | `B2-04` | HALF-REASON: `redeem_live_voucher`'s reason describes the intended usage ('each device redeems it for its own single-use token'), and nothing enforces one-per-device | **MAJOR** | PROBE-VERIFIED | NO |
| B2 | `B2-05` | `ui_messages` SELECT is `using(true)` for role public while a SHIPPED editor writes org_id-scoped rows into the same table — cross-tenant by construction, latent only because nobody has used the feature yet | **MAJOR** | PROBE-VERIFIED | NO |
| B3a | `B3a-1` | PDF and PPTX archive the export into the VIEWER's org, not the REPORT's — a two-org viewer parks org B's report in org A's readable bucket prefix | **MAJOR** | PROBE-VERIFIED | NO |
| B3a | `B3a-11` | compose_report applies no ROLE rule at all, so a leser gets the same composed document as an administrator — including the attributed rows the CSV route refuses them | **MAJOR** | PROBE-VERIFIED | NO |
| B3a | `B3a-2` | A report title with any letter outside Latin-1 makes the PDF/PPTX route throw a 500 — after the file is archived and the audit row is written | **MAJOR** | PROBE-VERIFIED | NO |
| B3b | `B3b-1` | The "an organisation always keeps an active administrator" rule lives only inside one server action — no database rule, no test, and a direct PostgREST call skips it entirely | **MAJOR** | PROBE-VERIFIED | NO |
| B3b | `B3b-2` | Turnstile and the rate limiter protect one CALLER, not the endpoint: request_demo is granted EXECUTE to anon and is reachable directly through PostgREST | **MAJOR** | PROBE-VERIFIED | YES — prod's request_demo ACL is anon=X/postgres and the publishable anon key is by definition p |
| B3b | `B3b-4` | Three jsonb toggles read-modify-write with the read's error discarded — a failed read silently clears organizations.options, including the `sso` enforcement flag | **MAJOR** | INFERRED | NO |
| B3c | `B3c-1` | `send_round` never sets `is_test`, so "Send test til meg selv" rewrites the survey's participation denominator to 1 | **MAJOR** | PROBE-VERIFIED | YES — the sole prod administrator can press the button on either 'aktiv' survey today; the visib |
| B3c | `B3c-2` | An unauthenticated QR scan inflates an organisation's reported response rate, unbounded and unrate-limited | **MAJOR** | PROBE-VERIFIED | NO |
| B3c | `B3c-3` | `app.guard_survey_policy` role-checks `k_threshold` only — a redaktør can change a survey's anonymity, unaudited, on a surface the Builder calls administrator-only | **MAJOR** | PROBE-VERIFIED | NO |
| B3c | `B3c-4` | `run_mode = 'quiz'` has no writer: all of V2-10 is reachable only from psql | **MAJOR** | PROBE-VERIFIED | YES — prod's administrator sees the locked card in the Builder and cannot enable quiz on any of  |
| B3c | `B3c-5` | Every section heading on a shared report renders a raw registry key, because the unauthenticated page reads a table only authenticated callers can see | **MAJOR** | PROBE-VERIFIED | NO |
| B4 | `B4-F01` | Nothing drains the mail queue in production: two invitations have sat unread for 34 hours while the send screen said «Sendt til N personer» | **MAJOR** | PROBE-VERIFIED | YES — two real invitations are sitting in prod's pgmq.q_mail_outbox undelivered right now, and t |
| B4 | `B4-F02` | The invitation idempotency key is carried the whole way and then dropped by the only production mail provider, and a delivered mail can be re-sent | **MAJOR** | PROBE-VERIFIED | NO |
| B5 | `B5-1` | Soft-deleting a survey revokes no token whatsoever — every invitation, share link and live session on it stays live | **MAJOR** | PROBE-VERIFIED | YES — prod has 2 open rounds, 2 live invitation tokens (expiring 2026-09-15) and 1 active share_ |
| B5 | `B5-2` | report_shares.expires_at is read by two functions and written by nothing — every report share link is permanent, and there is no revocation UI | **MAJOR** | PROBE-VERIFIED | NO |
| B5 | `B5-3` | Sentry's scrubber removes bodies, cookies and headers but not the URL — and for /s/, /r/ and /l/ the URL IS the credential | **MAJOR** | INFERRED | NO |
| B6 | `B6-01` | A published report freezes its per_virksomhet share-scope refusal OFF, then serves the frozen document to share-link readers | **MAJOR** | INFERRED | NO |
| B6 | `B6-02` | `field` questions write the respondent's name and e-mail into answers.value, and aggregate_rows' text exclusion is an enumeration of one type | **MAJOR** | PROBE-VERIFIED | NO |
| B6 | `B6-03` | result_snapshots hands any org member, including a leser, the frozen document's quotes and attributed rows with no RPC in the path | **MAJOR** | PROBE-VERIFIED | NO |
| B6 | `B6-04` | Archived PDF/PPTX exports are readable by every org member, so a leser can fetch a redaktør's document out of Storage | **MAJOR** | PROBE-VERIFIED | NO |
| B6 | `B6-05` | compose_report has no leser branch, so the leser rule has no effect anywhere in reports | **MAJOR** | PROBE-VERIFIED | NO |
| B6 | `B6-06` | apply_retention deletes answers and responses and reaches neither derived copy, so free text outlives the retention the product promises | **MAJOR** | PROBE-VERIFIED | NO |
| B6 | `B6-07` | The retention and privacy copy promises a deletion that does not cover the frozen document or the archived export | **MAJOR** | PROBE-VERIFIED | NO |
| B7a | `B7a-01` | Production serves the pre-fix privacy copy: ui_messages overrides the bundle, and D113's corrections never reached it | **MAJOR** | PROBE-VERIFIED | YES — every stale row is present on prod's single tenant right now, and `/personvern` is `force- |
| B7a | `B7a-02` | Four privacy toggles write a column nothing reads — «Slett rådata automatisk» does not stop the nightly deletion, and «Vis samtykketekst» has no gate at all | **MAJOR** | PROBE-VERIFIED | NO |
| B7a | `B7a-03` | The organisation threshold floor and the administrator-only rule are BEFORE UPDATE triggers; INSERT escapes both, and two admin sentences say otherwise | **MAJOR** | PROBE-VERIFIED | NO |
| B7a | `B7a-04` | «Servere i Oslo og Frankfurt» — nothing in the system runs or stores in Oslo | **MAJOR** | PROBE-VERIFIED | YES — the prod ui_messages row for admin.pEuOnlyDesc and splash.faq2A both carry the Oslo senten |
| B7a | `B7a-05` | The public privacy notice states a 24-month default retention; the database default is 12 | **MAJOR** | PROBE-VERIFIED | YES — the sentence is in the file AND in prod's ui_messages, and prod's one organisation is at r |
| B7a | `B7a-06` | The DSR surface promises access, erasure and export; it is a deadline tracker and nothing more | **MAJOR** | PROBE-VERIFIED | YES — the Personvern tab renders for prod's single administrator and the prod ui_messages rows c |
| B7b | `B7b-01` | Production serves the pre-correction hard-coded-five copy on six public splash strings and the statutory-report threshold sentence | **MAJOR** | PROBE-VERIFIED | YES — I read the seven stale rows out of prod's own ui_messages, and lib/i18n/messages.ts lays t |
| B7b | `B7b-02` | verify:copy reads the JSON file and never the table the product serves, so it is structurally unable to see B7b-01 | **MAJOR** | PROBE-VERIFIED | NOT-APPLICABLE |
| B7b | `B7b-03` | The organisation's k-threshold floor is enforced only on UPDATE; a redaktor can create a survey below it through the REST API | **MAJOR** | PROBE-VERIFIED | NO |
| B7b | `B7b-05` | Bruksområder promises a «Filopplasting» question type that exists nowhere in the product | **MAJOR** | PROBE-VERIFIED | YES — the `usecases` namespace has 0 rows in prod's ui_messages, so the page falls through to th |
| B7b | `B7b-06` | Bruksområder promises a «Vet ikke» option on the statutory psychosocial survey; no such option exists in any pack, in the bank, or in any renderer | **MAJOR** | PROBE-VERIFIED | YES — usecases has 0 rows in prod, so both strings render from the bundle on the public page (th |
| B7b | `B7b-07` | The splash FAQ and the Aktsomhet use case promise Swedish and Danish surveys; only Norwegian and English are served | **MAJOR** | PROBE-VERIFIED | YES — splash.faq4A exists in prod's ui_messages and I read it («norsk, svensk, dansk og engelsk  |
| B7b | `B7b-10` | The splash claims SMS, Entra ID, Google and HR-system integrations; all four feature flags ship disabled | **MAJOR** | PROBE-VERIFIED | YES — I read all nine of these strings out of prod's own ui_messages, and prod's global feature_ |
| B7b | `B7b-11` | The help centre ships with zero articles in production, and nothing but a hand-run script can fill it | **MAJOR** | PROBE-VERIFIED | YES — measured 0 and 0 on prod just now; every signed-in prod user (there is one) gets an empty  |
| B1 | `B1-03` | app.is_suppressed trims the parameter but not the stored column, and nothing normalises suppressions.email at the database level | **MINOR** | PROBE-VERIFIED | NO |
| B1 | `B1-04` | The audit brief's premise is wrong: get_quotes' stored source differs between prod and local | **MINOR** | PROBE-VERIFIED | NOT-APPLICABLE |
| B1 | `B1-05` | Leaked-password protection is disabled on prod | **MINOR** | PROBE-VERIFIED | YES — it is a live prod Auth setting and prod has 1 auth user, who is the sole administrator (th |
| B1 | `B1-06` | Roughly twenty app-schema SECURITY DEFINER functions still carry PUBLIC EXECUTE, including is_suppressed and resolve_token | **MINOR** | PROBE-VERIFIED | NO |
| B1 | `B1-07` | Six functions have a mutable search_path; all six are SECURITY INVOKER and no client role can CREATE, so the path is not exploitable | **MINOR** | PROBE-VERIFIED | NO |
| B1 | `B1-12` | answers.elapsed_ms carries a column comment asserting a protection that nothing implements: submit_response writes it unconditionally from the client payload, on anonymous surveys included | **MINOR** | PROBE-VERIFIED | YES — submit_response is anon-executable on prod and stores the field on any survey (prod has 3  |
| B1 | `B1-15` | anon and authenticated hold TRUNCATE on responses and answers, and RLS does not apply to TRUNCATE | **MINOR** | PROBE-VERIFIED | NO |
| B2 | `B2-02` | M:0082 — the migration whose whole purpose was recording D115 — repeated D115's mistake in its own last line: `revoke execute on function app.live_word_floor() from anon` is inert | **MINOR** | PROBE-VERIFIED | NO |
| B2 | `B2-06` | HALF-REASON: `request_demo` claims to validate its own input and does not validate p_plan at all; the column has no type limit and no CHECK | **MINOR** | PROBE-VERIFIED | YES — request_demo is anon-executable on prod (prod advisor lint 0028 names it), so any internet |
| B2 | `B2-07` | HALF-REASON: `report_for_share_token`'s reason bounds the CONTENT it returns and says nothing about the SCOPE it does not check | **MINOR** | PROBE-VERIFIED | NOT-APPLICABLE |
| B2 | `B2-11` | `dashboard_presets` is allowlisted as PUBLIC_BY_DESIGN — which suppresses 5a3's anon-read check — while the migration in fact denies anon at the grant layer | **MINOR** | PROBE-VERIFIED | NOT-APPLICABLE |
| B2 | `B2-15` | DOCUMENT FINDING (rule 7) — M:0082's header and scripts/verify/attack.ts both record D115 as understood and closed, and the system disagrees for the app half | **MINOR** | PROBE-VERIFIED | NOT-APPLICABLE |
| B3a | `B3a-3` | Both of the auth callback's error redirects speak a vocabulary the login page does not understand | **MINOR** | PROBE-VERIFIED | YES — the callback runs on every magic-link/invite/recovery sign-in and prod has 1 auth user who |
| B3a | `B3a-5` | A malformed `neste` throws away a VALID auth code and blames the code | **MINOR** | PROBE-VERIFIED | NO |
| B3a | `B3a-6` | Middleware writes `?neste=<path>` on every sign-in redirect and nothing reads it | **MINOR** | PROBE-VERIFIED | YES — needs only a signed-out visitor following a deep link, which prod's single administrator c |
| B3b | `B3b-10` | Same-org attribution on support_messages is forgeable: the policy constrains org_id and nothing constrains member_id | **MINOR** | PROBE-VERIFIED | NO |
| B3b | `B3b-13` | DECISIONS Q5 and docs/OPERATIONS.md describe protection of an "endpoint" that is not the endpoint the running system exposes | **MINOR** | PROBE-VERIFIED | NOT-APPLICABLE |
| B3b | `B3b-3` | tests/db/fk-tenancy.test.ts enumerates "the source table has an org_id COLUMN" where the property is "the reference can cross a tenant boundary" — 27 further single-column FKs are invisible to it, and task_effect_assessments.assessed_by is written unconstrained by an action in this section | **MINOR** | PROBE-VERIFIED | NO |
| B3b | `B3b-5` | question_bank.used_count can never increment for any question in the shipped bank, and the screen renders "brukt i 0" as though it were a measurement | **MINOR** | PROBE-VERIFIED | YES — prod carries the same 12 org_id-NULL bank questions and the same bank_cud_upd policy, so " |
| B3b | `B3b-7` | Three administrasjon actions write an audit row without checking that the update matched anything, so the trail can record a change that did not happen | **MINOR** | PROBE-VERIFIED | NO |
| B3b | `B3b-8` | uploadLogo validates the browser-declared MIME type and never the bytes, and image/svg+xml is on the allowlist | **MINOR** | PROBE-VERIFIED | NO |
| B3b | `B3b-9` | request_demo validates three of its four parameters — p_plan is unbounded, at the boundary the function itself says must not trust its callers | **MINOR** | PROBE-VERIFIED | YES — prod grants request_demo to anon (confirmed), so an unauthenticated caller can write an ar |
| B3c | `B3c-6` | M:0076's applied column comment and header both assert the property B3c-1 disproves | **MINOR** | PROBE-VERIFIED | NOT-APPLICABLE |
| B3c | `B3c-7` | A code comment claims a CHECK constraint refuses 'quiz'; the migration that shipped quiz removed that refusal | **MINOR** | PROBE-VERIFIED | NOT-APPLICABLE |
| B3c | `B3c-8` | `setRevealed` reports success on a write RLS filtered away | **MINOR** | INFERRED | NO |
| B4 | `B4-F03` | Two server actions swallow a read error into a NULL attribution and return ok:true — a statutory record is written permanently unattributed over a green screen | **MINOR** | PROBE-VERIFIED | NO |
| B4 | `B4-F06` | The one catch that D115 blesses points at the wrong test file, and at one that runs in a different suite | **MINOR** | PROBE-VERIFIED | NOT-APPLICABLE |
| B5 | `B5-10` | Nothing purges pgmq.a_mail_outbox, so a dead-lettered invitation keeps a raw token, an address, a name and a phone forever | **MINOR** | PROBE-VERIFIED | NO |
| B5 | `B5-11` | Prod's mail worker has never run, so the queue is a durable plaintext token store rather than a transient one | **MINOR** | PROBE-VERIFIED | YES — 2 of prod's 2 invitation tokens are sitting in plaintext in pgmq.q_mail_outbox right now,  |
| B5 | `B5-12` | mint_test_token writes no expires_at, so an editor's preview token has no expiry of its own | **MINOR** | PROBE-VERIFIED | NO |
| B5 | `B5-13` | A live code collision is not retried — the presenter gets a bare 'failed' | **MINOR** | PROBE-VERIFIED | NO |
| B5 | `B5-4` | app/s/[token]/page.tsx states the token is never passed to anything that might serialise it; Sentry serialises it | **MINOR** | INFERRED | NOT-APPLICABLE |
| B5 | `B5-8` | close_round and close_rounds_with_survey do not close a live session on the round they close | **MINOR** | PROBE-VERIFIED | NO |
| B6 | `B6-08` | The Sentry scrubber never touches event.exception, event.message or event.tags — the fields an error most often carries text in | **MINOR** | PROBE-VERIFIED | NO |
| B7a | `B7a-09` | `legal.updated` says 5 September 2026; the legal text changed twice on 7 September | **MINOR** | PROBE-VERIFIED | YES — prod's ui_messages carries «Sist oppdatert 5. september 2026» and LegalPage renders it und |
| B7a | `B7a-10` | The English copy names the third role two different ways, and the string that names all three has no consumer | **MINOR** | PROBE-VERIFIED | NO |
| B7a | `B7a-11` | `admin.langIntro` claims a different scope in English than in Norwegian, and English is the wrong one | **MINOR** | PROBE-VERIFIED | YES — the string is on prod verbatim and prod's single member is an administrator, i.e. exactly  |
| B7a | `B7a-12` | One sub-processor, three different locations, in three shipped sentences | **MINOR** | PROBE-VERIFIED | YES — all three sentences are live in prod's ui_messages and render on the two public legal page |
| B7a | `B7a-13` | `legal.dpa9P` still tells the controller a signed DPA is under Administrasjon → Dokumentasjon; the four rows there say «Ikke lastet opp ennå» | **MINOR** | PROBE-VERIFIED | YES — dpa9P is live on prod's public DPA page and the Dokumentasjon card renders four «Ikke last |
| B7a | `B7a-14` | The retention note now under-claims: it promises only what a published report froze, and every close now freezes | **MINOR** | PROBE-VERIFIED | NO |
| B7b | `B7b-04` | DOCUMENT SIDE of B7b-03 — the help article and the panel both promise the floor cannot be undercut | **MINOR** | PROBE-VERIFIED | NO |
| B7b | `B7b-08` | The splash FAQ states unconditionally that no link between person and answer is stored — which is false for every named survey, and a quiz is REQUIRED to be named | **MINOR** | PROBE-VERIFIED | YES — faq1A is served on prod (in its stale variant, which makes the same claim), and prod carri |
| B7b | `B7b-09` | A quiz participant is never told their answers are scored, or that their response time is being recorded | **MINOR** | PROBE-VERIFIED | NO |
| B7b | `B7b-12` | Help-article claims the D117 sweep did not reach: a 20-question short pack that does not exist, and integrations shown as «Tilkoblet» | **MINOR** | PROBE-VERIFIED | NO |
| B7b | `B7b-13` | A named survey answered through a share link tells the respondent their name will be shown, and stores no name at all | **MINOR** | PROBE-VERIFIED | NO |
| B1 | `B1-08` | app.k_threshold() has zero callers — CLAUDE.md's invariant names a control nothing uses | **LIMITATION** | PROBE-VERIFIED | NOT-APPLICABLE |
| B1 | `B1-09` | app.k_for returns NULL for an unknown survey, and the `if v_n < v_k` shape fails OPEN on NULL — every caller is saved by a check written for a different reason | **LIMITATION** | PROBE-VERIFIED | NO |
| B1 | `B1-10` | 'k-anonymity, k=5, database-enforced' is a default, not the enforced floor: the floor is 2 for natural persons and 0 for organisations | **LIMITATION** | PROBE-VERIFIED | NO |
| B1 | `B1-11` | 'No IP or user-agent anywhere' is enforced by nothing — it is an absence, and the CHECK that looks like it enforces it covers only invitation_id | **LIMITATION** | PROBE-VERIFIED | NOT-APPLICABLE |
| B1 | `B1-13` | The invitation guard's null-email early return lets qr, sms and voucher invitations past unchecked — V2-9's recorded limit still holds | **LIMITATION** | PROBE-VERIFIED | NO |
| B1 | `B1-14` | suppressions.source enumerates four values; only one has a writer | **LIMITATION** | PROBE-VERIFIED | NOT-APPLICABLE |
| B2 | `B2-08` | anon holds SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER on 54 of 56 public tables, and RLS — the only thing refusing — does not cover TRUNCATE | **LIMITATION** | PROBE-VERIFIED | NO |
| B2 | `B2-09` | Gate 5a3 and the Supabase advisor enumerate the same schema, so the 28 PUBLIC-executable app functions are invisible to BOTH, and no test in the repository asserts a table, schema or sequence privilege at all | **LIMITATION** | PROBE-VERIFIED | NOT-APPLICABLE |
| B2 | `B2-10` | `get_peer_results` discloses the question text in the below-threshold branch, and the k it gates on can be 2 | **LIMITATION** | PROBE-VERIFIED | YES — prod's open share-link round has 1 response against k=5, so the insufficient_data branch f |
| B3a | `B3a-0` | The boundary this section exists to state: a route handler is not a Gate 5a3 catalogue surface | **LIMITATION** | PROBE-VERIFIED | NOT-APPLICABLE |
| B3a | `B3a-10` | compose_report hands the export routes every respondent's EMAIL, which the CSV route was deliberately built never to carry | **LIMITATION** | PROBE-VERIFIED | NO |
| B3a | `B3a-7` | `\w` in the callback's path regex is ASCII-only — the D113/D116 shape, in the one place the project has not swept | **LIMITATION** | PROBE-VERIFIED | NO |
| B3a | `B3a-8` | app/auth/callback/route.ts has zero automated coverage — it is the one handler no verify script and no test names | **LIMITATION** | PROBE-VERIFIED | NOT-APPLICABLE |
| B3a | `B3a-9` | K-ANONYMITY, answered explicitly per handler: no service-role path, no ungated read — but the k denominator counts test submissions | **LIMITATION** | PROBE-VERIFIED | NO |
| B3b | `B3b-11` | The public rate limiter is per-process, in memory, and keyed on a header the client sends — three properties, one of which is not written down | **LIMITATION** | INFERRED | NOT-APPLICABLE |
| B3b | `B3b-12` | Three dashboard actions carry no authorisation of their own; the control lives one call away in another file | **LIMITATION** | PROBE-VERIFIED | NO |
| B3b | `B3b-6` | An organisation's own UI copy overrides are readable by any unauthenticated caller, and the administrator writing one is never told | **LIMITATION** | PROBE-VERIFIED | NO |
| B3c | `B3c-10` | Voucher codes are globally unique forever, never released, and generated without a collision retry | **LIMITATION** | PROBE-VERIFIED | NO |
| B3c | `B3c-9` | The live voucher's indistinguishable refusal is not a defence against guessing, and nothing else on that path is either | **LIMITATION** | PROBE-VERIFIED | NO |
| B4 | `B4-F04` | Fourteen of the fifteen catch blocks in the request path have no test proving the swallowed case does not occur | **LIMITATION** | PROBE-VERIFIED | NOT-APPLICABLE |
| B4 | `B4-F05` | `server-only` stops the service role reaching the browser and nothing stops it reaching `answers` — and the eslint rule that looks like a second layer cannot fire on either real call site | **LIMITATION** | PROBE-VERIFIED | NO |
| B4 | `B4-F07` | Turnstile passes every caller when it is unconfigured, and the configuration is a launch item nobody has ticked | **LIMITATION** | INFERRED | NO |
| B4 | `B4-F08` | Eighty-eight reads discard the PostgREST error, and which of them are load-bearing is not written down anywhere | **LIMITATION** | PROBE-VERIFIED | NO |
| B4 | `B4-F09` | `lib/supabase/server.ts:19-21` is an empty catch on the auth cookie write whose real class is wider than the comment's | **LIMITATION** | INFERRED | NO |
| B4 | `B4-F10` | `task_effect_assessments.assessed_by` is written by one line and read by nothing — the standing question inverted | **LIMITATION** | PROBE-VERIFIED | NOT-APPLICABLE |
| B5 | `B5-14` | The credential is in the URL path segment on /s/, /r/ and /l/; Referrer-Policy covers the cross-origin case and nothing else | **LIMITATION** | PROBE-VERIFIED | YES — YES in the sense that the property is live — prod's 2 invitation tokens and 1 share link a |
| B5 | `B5-5` | live_sessions.code is stored in plaintext and compared in plaintext — defensible, and written down nowhere | **LIMITATION** | PROBE-VERIFIED | NO |
| B5 | `B5-6` | CLAUDE.md invariant 5 requires a constant-time compare; there is none anywhere, and on a SHA-256 hash there does not need to be | **LIMITATION** | PROBE-VERIFIED | NOT-APPLICABLE |
| B5 | `B5-7` | The live voucher is 30 bits and redeem_live_voucher is anon-executable with no rate limit | **LIMITATION** | PROBE-VERIFIED | NO |
| B5 | `B5-9` | share_links have no expiry column at all — a public link dies only when its round closes | **LIMITATION** | PROBE-VERIFIED | YES — prod has 1 share_link, active, on one of 2 open rounds, with no product surface that can t |
| B6 | `B6-09` | live_cloud's honest limit is written in the migration and the phase report and never reaches a single user | **LIMITATION** | PROBE-VERIFIED | NO |
| B6 | `B6-10` | The live word floor counts responses, and the voucher path lets one person hold three of them | **LIMITATION** | PROBE-VERIFIED | NO |
| B6 | `B6-11` | report_exports is written on every export and read by nothing — an archive with no reader and no expiry | **LIMITATION** | PROBE-VERIFIED | NO |
| B7a | `B7a-07` | `verify:copy` reads messages/*.json and the product reads ui_messages — the gate structurally cannot see the shipped copy | **LIMITATION** | PROBE-VERIFIED | NOT-APPLICABLE |
| B7a | `B7a-08` | Four allowlist reasons are true and insufficient — D113(b)'s half-reason, still present, and the two worst are on the public legal pages | **LIMITATION** | PROBE-VERIFIED | NOT-APPLICABLE |
| B7a | `B7a-15` | `legal.dpa4P` claims encryption at rest, daily backups and point-in-time recovery; nothing in the repo or any gate touches them | **LIMITATION** | INFERRED | NOT-APPLICABLE |
| B7b | `B7b-14` | A live respondent is never told their words may be projected on the screen in the room they are sitting in | **LIMITATION** | PROBE-VERIFIED | NO |
| B7b | `B7b-15` | «Rådata slettes automatisk etter tiden dere velger» is true of answers and silent about the recipient list, which nothing ever deletes | **LIMITATION** | PROBE-VERIFIED | YES — prod serves splash.faq2A (I read it) and holds 2 survey_invitations carrying email/name th |
| B7b | `B7b-16` | The translation editor exposes the respondent namespace; an override reaches the test preview and never reaches a respondent | **LIMITATION** | PROBE-VERIFIED | NO |
| B7b | `B7b-17` | Free-plan limits are stated as product constraints and nothing enforces them | **LIMITATION** | PROBE-VERIFIED | YES — YES in the sense that matters — I read plans1Features1 «Opptil 25 som svarer», plans1Featu |
| B7b | `B7b-18` | «Hei! Har du 90 sekunder?» and the live countdown are fixed regardless of how many questions the survey has | **LIMITATION** | PROBE-VERIFIED | YES — the respondent page serves it on prod's active surveys, though those carry 3 and 4 questio |

---

## 2.6 Refuted

- `B4-F11` A report title outside 1–200 characters is silently replaced with «Fra dashboard» rather than refused — The mechanism reproduces; the CONSEQUENCE the finding is built on does not. «The user's chosen title disappears and a report appears under a name they did not type» cannot happen, because the title is generated from a me
