# 01 — DATABASE

**117 surviving findings from ten probes (A1–A9), each adversarially re-checked.** Read
`00-method.md` first for the evidence tiers and for the two things this audit got wrong about
itself. Every finding below carries a **tier** (VERIFIED = I ran it; PROBE-VERIFIED = a probe ran
it and an independent verifier reproduced it; INFERRED = reasoned, not measured) and **BITES PROD
TODAY**, which is a fact about prod's data and not about the defect.

Severity after triage: **1 BLOCKER · 23 MAJOR · 36 MINOR · 31 LIMITATION · 26 CLEAN.**
Eight further claims were **refuted** and are listed at the foot.

---

## 1.1 What holds — because a report of only defects is not an audit

These were checked and hold, with evidence. They matter more than the list below, because they are
the invariants the product is sold on.

- **No SELECT policy exists on `responses` or `answers`, on either environment**, and RLS is
  enabled on both. Measured directly, and confirmed by attempting the read through PostgREST with
  the anon key: `GET /rest/v1/responses` returns `[]`, and `POST` returns
  `42501 new row violates row-level security policy`.
- **The anonymity CHECK is byte-identical on both environments** and is the only CHECK on
  `responses`: `CHECK (((anonymity_at_submission <> 'anonymous') OR (invitation_id IS NULL)))`.
  The column list of `responses` carries no IP, no user-agent and no user id — eight columns, all
  accounted for.
- **`submitted_hour` is truncated on the write path itself**, not by the column DEFAULT:
  `submit_response` names the column explicitly and supplies `date_trunc('hour', now())`, so a
  client value is never trusted.
- **Exactly one function inserts into `responses`, and it is `submit_response`.** Two functions
  touch the vault at all; the other is `app.apply_retention`, which deletes.
- **No SECURITY DEFINER function lacks a pinned `search_path`.**
- **There is no `when others` catch-all anywhere** in `app` or `public` once comments are
  stripped — D115 holds. (My first sweep said 1; it was a *comment*. See `00-method.md` § 0.6.)
- **`M:0068` is applied and all three closers freeze.** `tests/db/round-freeze.test.ts` asserts
  the `result_snapshots` ROW after the scheduled path, never a return value — I read the file to
  confirm the assertion is on the row.
- **The catalogue is identical between prod and local** at every level. A verifier re-derived this
  with its own nine-object fingerprint rather than reusing the probe's: 1160 objects,
  `5edb774a0b9c00ecd5becf19bef650c6` on both sides, and comment-normalised function bodies
  identical (94 functions, `a3dbd96a…`). The raw bodies differ for exactly 24 functions — comment
  text only, already recorded in `docs/OPERATIONS.md`.

Full CLEAN list: 26 items, in the table's source data.

---

## 1.2 BLOCKER — cross-tenant WRITE through `live_sessions.round_id`

**`A5-1` · tier VERIFIED · BITES PROD TODAY: NO (prod has one organisation)**

An administrator or redaktør of **any** organisation can cause anonymous respondents to write real
responses and answers into **another organisation's** survey round. A probe found it; I reproduced
it end to end twice, in a transaction, rolled back.

`live_sessions` has four foreign keys. Three were made composite; one was not:

```
live_sessions_created_by_fkey  (created_by,org_id) -> org_members(id,org_id)   M:0084
live_sessions_survey_tenancy   (survey_id,org_id)  -> surveys(id,org_id)       M:0079
live_sessions_round_id_fkey    (round_id)          -> survey_rounds(id)        SINGLE COLUMN
```

`survey_rounds` has no `org_id` (measured: 0), so there was nothing for a composite to bind to.
Nothing else constrains it: the only trigger checks the *survey's* anonymity, the CHECKs cover
`code` and `status`, and `live_ins`'s WITH CHECK is
`has_role(org_id, …) AND can_edit_survey(survey_id)` — **`round_id` never appears.**

```
STEP 1  org A admin inserts live_sessions(org_id=A, survey_id=A's own, round_id=ORG B's round)
        -> ACCEPTED by live_ins
STEP 2  anon: redeem_live_voucher('CROSS1') -> {"token":"…","round_id":"<ORG B's round>"}
STEP 3  the invitation lands on a round of a survey owned by ORG B
STEP 4  anon: submit_response(token,'no',{B's question:5}) -> {"ok":true,"response_id":"fe06ddea…"}
        response in org: ORG B   |   answers written into ORG B: 1
```

**Two independent paths, both open.** `authenticated` holds INSERT on `live_sessions`, so one
PostgREST POST does it; and the product's own action takes `roundId` **from the client**
(`live/actions.ts:28,31-33,43`), validates it only as `z.string().uuid()`, and inserts it verbatim.

**Preconditions**, so this is not overstated: admin/redaktør of some org (any signup), an anonymous
survey of their own, and knowledge of the victim's round UUID — not guessable, but handed out by
`redeem_live_voucher` and by `submit_response(…, p_dry_run => true)`, both of which return
`round_id` to any holder of a token for that round.

**No cross-tenant READ via this vector**: the live surface calls `live_cloud` and
`aggregate_results` with the attacker's own `p_survey`, which gates on their org and filters
`sr.survey_id = p_survey`. The impact is a write — the victim's round accumulates responses from
people who were never their audience.

**Why every gate missed it, and this is the part that generalises.**
`tests/db/fk-tenancy.test.ts:55-59` enumerates single-column FKs where **both** source and target
carry a literal `org_id` column. `survey_rounds` has none — it is org-scoped *transitively*,
through `survey_id → surveys.org_id` — so the FK falls outside the enumeration and the test is
structurally incapable of reporting it. The same query finds **11 FKs in that blind spot**; the
rest point at global registries or `auth.users`. `result_snapshots.round_id` is the only other
transitively-scoped target and is not equivalent: a foreign round there mislabels the writer's own
row rather than routing a write elsewhere. **`live_sessions.round_id` is the only one where the
unbound value routes a write.**

---

## 1.3 The MAJORs that bite prod today

**`A7a-1` / `A7b-1` — `org_members.group_id` has no writer.** Found independently by both A7
lenses, on deliberately different methods; verified by me. Every write to `org_members` in the
codebase — the complete set — is five statements (`kom-i-gang/actions.ts:78` insert;
`administrasjon/actions.ts:322/359/394` updating `role`, `status`, `sso_exempt`; `:431` insert),
and **none names `group_id`**; no SQL function writes it either. The only writer is
`scripts/seed-demo.ts:106,108,114`. It is read in at least eight places, including the **Send
screen's group headcount**. On a real organisation a group can be created and nobody can ever be
put in one. This is the audit's lead finding and it is developed in `04-summary.md`.

**`A1-2` — prod is missing five template packs and one quality rule.** Prod carries 17 packs
against the repository's 22; the missing five are `brukerundersokelse-tjeneste`,
`frivillige-arrangement`, `innbyggerundersokelse`, `it-verktoy`, `servicedesk-sak`. Prod's
use-case distribution has **no `offentlig` key at all**, while `use_cases` has 6 rows on both
sides — so Bibliotek renders the «offentlig» use case with zero packs rather than hiding it.
`quality_rules` is missing `policy_pronoun`, so that builder quality flag cannot fire on
production content.

**`A1-3` / `A7a-4` — `help_articles` is empty in production.** `help_articles = 0` and
`help_article_translations = 0` on prod, against 12 and 24 locally. `/hjelp` reads the registry
and renders an empty state; nothing errors. The one writer is `scripts/seed-help.ts`, which can
only reach localhost.

**`A9-1` — production serves the pre-correction retention copy.** Prod's `ui_messages` carries
org-null overrides for four admin strings, including **«Summerte tall beholdes»** — the sentence
D113 § 3 corrected because it was true only by luck. The file was fixed; the seeded table on prod
was not, and the table wins at render time.

**`A9-2` — «Slett rådata automatisk» is a switch nothing reads.** `app.apply_retention` ignores
`organizations.privacy.auto_delete` entirely. Prod's one organisation has `auto_delete = true` and
the `retention-daily` cron is active, so the toggle's state and the system's behaviour are
unrelated.

**`A9-6` — the DSR panel's deletion claim.** «Fjerner all identifiserbar data om personen» is
present tense about a register that deletes nothing.

**`A4-1` — `is_test` gates no write path.** `mint_test_token` mints a live token and, on re-mint,
sets `responded_at = null`; `submit_response` never reads `is_test` (measured: the string is absent
from its body); `/s/[token]/page.tsx:125` renders `<Respondent>` with no `testMode` prop, so
`dryRun` defaults to false. Opening a preview token therefore writes a **real** response, and
`responses` has no `is_test` column and — for anonymous surveys — no invitation link, so the row is
structurally indistinguishable from a respondent's for ever. `app.aggregate_rows` counts
`count(distinct r.id)` with no test filter. An org editor can raise `n` at will and read out cells
the k-gate exists to withhold. Held at MAJOR rather than BLOCKER because prod carries zero
`is_test` invitations and one response — nothing has been poisoned.

**`A5-4` — `submit_response` trusts the client's `question_id`.** The loop inserts
`question_id = k::uuid` straight from the JSON key, with no check that the question belongs to the
round, the survey, or the organisation. The FK constrains existence only and is `ON DELETE
CASCADE`, so erasing organisation B can silently delete a row inside organisation A's response.
Verified inert for **reads** — all 17 functions touching `answers` bind the round's `survey_id`,
two of them read in full and 15 by regex.

**`A3-2` — `request_demo` bypasses its own rate limit.** The migration says the RPC «is the single
place a rate limit can be attached». The limiter and Turnstile were attached to the *server
action* instead (`lib/ratelimit.ts` via `guard()` in `app/(marketing)/actions.ts`), while the RPC
carries `grant execute … to anon` in the exposed `public` schema. Any holder of the publishable key
can POST `/rest/v1/rpc/request_demo` and skip both. The verifier confirmed reachability **on prod
using deliberately invalid input so that no row was written**; I confirmed independently that
prod's `demo_requests` is still 0.

---

## 1.4 The LIMITATIONs worth reading — designs with an unwritten cost

- **`A1-9` / `A8-5` — the vault's table grants are wide open.** `anon` and `authenticated` hold
  `SELECT, INSERT, UPDATE, DELETE, TRUNCATE` on `responses`, `answers` and `demo_requests`; RLS
  with no policy is the entire control. That is Supabase's default and it works — I proved the
  refusal through PostgREST — but **nothing in the repository asserts it.** `grep -rn
  "relrowsecurity" tests/` returns nothing, and `role_table_grants` appears in no test. And
  TRUNCATE is not subject to RLS at all.
- **`A8-8` / `A3-10` — Gate 5a3 hard-codes `nspname = 'public'`.** The 38 SECURITY DEFINER
  functions in `app` are outside every automated check, and `A8-1` — 27 of 60 `app` functions
  still holding PUBLIC EXECUTE because `M:0012`'s `alter default privileges … revoke` never took
  effect — lives exactly there. The migration's own comment is false against the running system.
- **`A2-8` / `A3-11` — nothing forces RLS.** `relforcerowsecurity` is false on all 56 tables, so
  every one of the 72 SECURITY DEFINER functions bypasses every policy. RLS is not a backstop for
  any of them; the function bodies are the whole control.
- **`A2-12` — CLAUDE.md invariant 1 says k=5; the running floor is 2**, and 0 for organisation
  respondents. The document and the system disagree, and the system is right (Q91 moved it).
- **`A9-5` — retention reaches two tables.** Everything else holding personal data is kept for
  ever, including `survey_invitations`, which records who was asked and who answered.
- **`A9-4` — retention destroys the raw data of a round that never closes**, and nothing froze it.
  `M:0068` repaired the closers, not the clock: a round left open past the retention window loses
  its answers with no snapshot behind them.
- **`A6-5` — three freeze triggers are still written as «reject the operation»** rather than
  «reject the change». Latent only because their tables happen to carry no `ON DELETE SET NULL` FK
  — which is the referential-maintenance rule waiting for its seventh instance.
- **`A1-8` — every guard in that family runs immediately.** Zero constraint triggers, zero
  exclusion constraints, and only 2 of 92 FKs deferrable.

---

## 1.5 Every surviving Part A finding

Ordered by severity, then section. `§` is the probe.

| § | id | finding | sev | tier | bites prod today |
|---|---|---|---|---|---|
| A5 | `A5-1` | live_sessions.round_id is single-column: an administrator of one organisation can write responses into another organisation's survey round | **BLOCKER** | VERIFIED | NO |
| A1 | `A1-2` | Production is missing five template packs and one quality rule that the repo's seed creates; the "offentlig" use case has zero packs in prod | **MAJOR** | PROBE-VERIFIED | YES — needs only one org and one signed-in member, and prod has exactly that; the single adminis |
| A1 | `A1-3` | help_articles and help_article_translations are empty in PRODUCTION, and /hjelp reads them from the database | **MAJOR** | PROBE-VERIFIED | YES — /hjelp needs only a signed-in viewer, and prod has one administrator; the whole article li |
| A2 | `A2-4` | public.compose_report returns a leser the group-filtered free text and the named attributed rows that get_quotes and attributed_results refuse them | **MAJOR** | PROBE-VERIFIED | NO |
| A2 | `A2-5` | result_snapshots.aggregates is directly SELECTable by any org member, and one of its three writers stores a report document containing quotes and attributed rows | **MAJOR** | PROBE-VERIFIED | NO |
| A3 | `A3-2` | request_demo is granted to anon and reachable directly over PostgREST — the rate limit and Turnstile that DECISIONS Q5 calls launch blockers guard only the server action | **MAJOR** | PROBE-VERIFIED | YES — I reached the function on production with the publishable key just now (HTTP 200, the RPC' |
| A4 | `A4-1` | survey_invitations.is_test gates no write path: a preview token writes a real, permanently unmarkable response that counts toward k | **MAJOR** | PROBE-VERIFIED | YES — prod has 2 open rounds and 1 administrator, so mint_test_token is callable and the loop is |
| A4 | `A4-2` | The guard written to catch a new unclassified survey_invitations reader is inert — \m/\M eaten by the JS template literal — and it is already overtaken by two V2-9 functions | **MAJOR** | PROBE-VERIFIED | NOT-APPLICABLE |
| A5 | `A5-2` | The shipped guard test's enumeration is narrower than the catalogue's class — 19 disagreeing instances arrive silently, not failing | **MAJOR** | PROBE-VERIFIED | NOT-APPLICABLE |
| A5 | `A5-3` | snapshot_results writes result_snapshots.round_id from an unvalidated argument — the one instance the shipped test records as NOT REACHABLE is reachable one column over | **MAJOR** | PROBE-VERIFIED | NO |
| A5 | `A5-4` | submit_response inserts answers.question_id straight from the client-supplied JSON key with no check that the question belongs to the round | **MAJOR** | PROBE-VERIFIED | YES — YES for the write itself — submit_response is EXECUTE-granted to anon on prod and prod has |
| A6 | `A6-1` | An organisation with an sso_exempt active administrator cannot be deleted at all — the break-glass guard fires on the erasure cascade, and it fires even when SSO is off | **MAJOR** | PROBE-VERIFIED | NO |
| A6 | `A6-3` | policy_locked is set by send_round only; app.run_due_schedules opens rounds without it, so a scheduled survey's anonymity and k-threshold stay editable while a round is open | **MAJOR** | PROBE-VERIFIED | NO |
| A7a | `A7a-1` | org_members.group_id has no writer: no member can ever be put in a group, so every group-scoped feature is permanently empty | **MAJOR** | VERIFIED | YES — prod has groups=1 and org_members=1 with group_id NULL (measured: count(group_id)=0), so t |
| A7a | `A7a-2` | duties.next_due_at has no writer: the statutory deadline that drives Oversikt's «Krever handling» is permanently NULL | **MAJOR** | PROBE-VERIFIED | YES — needs no data prod lacks; duties are created on first touch, so the single administrator c |
| A7a | `A7a-4` | The help centre has exactly one writer and it can only reach localhost — PROD has zero help articles and /hjelp renders an empty page silently | **MAJOR** | PROBE-VERIFIED | YES — measured on prod now: help_articles=0 and help_article_translations=0 while ui_messages=27 |
| A7b | `A7b-1` | org_members.group_id has no writer — groups can be created but nobody can be put in one, and group targeting in send_round therefore always matches zero members | **MAJOR** | VERIFIED | YES — prod has 1 group and 1 member; the Grupper card and the Send screen's group headcount both |
| A7b | `A7b-3` | survey_invitations.bounced_at is read by two delivery-control functions and written by nothing in the running system — the bounce path can never fire in production | **MAJOR** | PROBE-VERIFIED | NO |
| A7b | `A7b-5` | duties.next_due_at is seed-only and drives the Oversikt deadline chip — a real organisation's duties read «not started» forever | **MAJOR** | PROBE-VERIFIED | NO |
| A8 | `A8-1` | `alter default privileges in schema app revoke execute on functions from public` never took effect; 27 of 60 app functions carry PUBLIC EXECUTE, four of them SECURITY DEFINER | **MAJOR** | PROBE-VERIFIED | NO |
| A9 | `A9-1` | Production serves the pre-correction retention and anonymity copy: ui_messages overrides four admin strings, including «Summerte tall beholdes» | **MAJOR** | PROBE-VERIFIED | YES — the four stale rows are live in prod's public.ui_messages (org_id IS NULL, lang='no', name |
| A9 | `A9-2` | «Slett rådata automatisk» is a switch nothing reads — apply_retention ignores organizations.privacy.auto_delete entirely | **MAJOR** | PROBE-VERIFIED | YES — prod's one organisation has privacy.auto_delete=true and cron job 1 `select app.apply_rete |
| A9 | `A9-3` | A frozen snapshot preserves respondent contact details verbatim, past the deletion that was supposed to remove them — app.aggregate_rows excludes only type='text' | **MAJOR** | INFERRED | NO |
| A9 | `A9-6` | «Sletting (retten til å bli glemt) — Fjerner all identifiserbar data om personen» is a present-tense claim about a register that deletes nothing | **MAJOR** | PROBE-VERIFIED | YES — the DSR panel renders on prod's Personvern tab for its single administrator, and the four  |
| A1 | `A1-11` | feature_flags is the only public table with no primary key | **MINOR** | PROBE-VERIFIED | NO |
| A2 | `A2-10` | surveys_upd and surveys_del carry no deleted_at guard, while the analogous reports policies do | **MINOR** | PROBE-VERIFIED | NO |
| A2 | `A2-11` | app.guard_survey_policy names three policy columns but gates and audits only one of them | **MINOR** | PROBE-VERIFIED | NO |
| A2 | `A2-7` | The Gate-5a3 allowlist reason for ui_messages states its content but not its scope, and the scope changed under it | **MINOR** | PROBE-VERIFIED | NOT-APPLICABLE |
| A2 | `A2-9` | 27 app-schema functions, 17 of them SECURITY DEFINER, still hold the default PUBLIC EXECUTE grant; the app schema has USAGE granted to anon | **MINOR** | PROBE-VERIFIED | NO |
| A3 | `A3-13` | Six functions in schema app have a mutable search_path, three of them security guards | **MINOR** | PROBE-VERIFIED | NO |
| A3 | `A3-3` | CLAUDE.md invariant 1 enumerates two zero-policy tables; the system has three | **MINOR** | PROBE-VERIFIED | NOT-APPLICABLE |
| A3 | `A3-5` | The 5a3 allowlist reason for ui_messages states its content and not its scope, and predates the column that made the scope wrong | **MINOR** | PROBE-VERIFIED | NOT-APPLICABLE |
| A4 | `A4-3` | test-mode.test.ts #1 cannot show its own claim false: the fixture invitation is not a test invitation and the suite supplies p_dry_run itself | **MINOR** | PROBE-VERIFIED | NOT-APPLICABLE |
| A4 | `A4-4` | Twelve app-schema SECURITY DEFINER functions are anon-executable, two of them mutating; only PostgREST's exposed-schema setting, not a database privilege, stands in the way | **MINOR** | PROBE-VERIFIED | NO |
| A4 | `A4-6` | Six SECURITY INVOKER functions, four of them trigger guards, have no pinned search_path at all | **MINOR** | PROBE-VERIFIED | NO |
| A4 | `A4-7` | app.k_threshold() still exists in the database after the constant it represents was replaced | **MINOR** | PROBE-VERIFIED | NO |
| A5 | `A5-10` | The V2-4 report records the class as thirteen candidates; the catalogue's answer to the same question is thirty-one | **MINOR** | PROBE-VERIFIED | NOT-APPLICABLE |
| A5 | `A5-5` | Fourteen of fourteen attempted cross-tenant writes were accepted, including four on grant- and share-shaped rows | **MINOR** | INFERRED | NO |
| A6 | `A6-2` | tasks_source_ref_fkey's ON DELETE SET NULL can never succeed — the CHECK added in the same migration refuses every row it applies to, so the FK behaves as RESTRICT | **MINOR** | PROBE-VERIFIED | NO |
| A6 | `A6-4` | «A live session may only exist on an anonymous survey» is guarded on two transitions and on neither state — one UPDATE that changes anonymity and run_mode together leaves an open, redeemable voucher on a named survey | **MINOR** | PROBE-VERIFIED | NO |
| A7a | `A7a-11` | Fifteen of the sixteen no-writer columns carry no column comment, which is the specific thing CLAUDE.md's standing question asks for | **MINOR** | PROBE-VERIFIED | NOT-APPLICABLE |
| A7a | `A7a-12` | The dead-column set: eleven columns with neither a reader nor a real writer | **MINOR** | PROBE-VERIFIED | NO |
| A7a | `A7a-13` | live_sessions.step and tasks.due_at are read and rendered but written only by the demo seed | **MINOR** | PROBE-VERIFIED | YES — YES for the tasks.due_at half — no data prod lacks is required; any task the single admini |
| A7a | `A7a-5` | live_sessions.created_by is a fifth instance of the standing question, added AFTER the audit that fixed the previous four | **MINOR** | PROBE-VERIFIED | NO |
| A7a | `A7a-6` | organizations.plan can only ever be 'team', and the Administrasjon header renders it as if it were a fact about the account | **MINOR** | PROBE-VERIFIED | NO |
| A7a | `A7a-8` | organizations.active_langs is a dead column, and supabase/seed.sql states in prose that it governs language exposure | **MINOR** | PROBE-VERIFIED | NO |
| A7b | `A7b-12` | duty_survey_links is written by nothing and read by nothing — the code already says so in a comment, and no column comment does | **MINOR** | PROBE-VERIFIED | NOT-APPLICABLE |
| A7b | `A7b-15` | Three dead columns nothing writes and nothing reads: responses.submission_key, survey_invitations.identity_provider, and the two synced_at columns | **MINOR** | PROBE-VERIFIED | NO |
| A7b | `A7b-2` | import_jobs and notifications are two complete tables written only by the demo seed and read by nothing — 17 columns, no user path in or out | **MINOR** | PROBE-VERIFIED | NO |
| A7b | `A7b-4` | groups.lead_member_id has no writer anywhere — not even the demo seed — and the Grupper tab renders it | **MINOR** | PROBE-VERIFIED | YES — YES in the weak sense — prod has 1 group, so the Grupper card renders the groupNoLead fall |
| A7b | `A7b-6` | organizations.timezone (Q50) is still open — measured, not remembered | **MINOR** | PROBE-VERIFIED | NO |
| A7b | `A7b-9` | created_by is PARTIALLY fixed: three of six created_by columns now have a real writer, two have none, one relies on a DEFAULT | **MINOR** | PROBE-VERIFIED | NO |
| A8 | `A8-11` | `dashboard_presets_sel` re-evaluates auth.role() per row; every other policy in the database is already wrapped | **MINOR** | PROBE-VERIFIED | NO |
| A8 | `A8-12` | `feature_flags` has no primary key and its only FK is unindexed | **MINOR** | PROBE-VERIFIED | NO |
| A8 | `A8-13` | Six functions with mutable search_path — all SECURITY INVOKER, three of them trigger functions that cannot be called directly | **MINOR** | PROBE-VERIFIED | NO |
| A8 | `A8-2` | Migration 0012's own comment is false against the running system — the DOCUMENT half of A8-1 | **MINOR** | PROBE-VERIFIED | NOT-APPLICABLE |
| A8 | `A8-3` | `surveys_org_id_fkey` is reported covered by the advisor and is not: its only index is partial on `deleted_at IS NULL`, and the organisation-erasure cascade cannot use it | **MINOR** | PROBE-VERIFIED | NO |
| A8 | `A8-4` | Prod's migration ledger holds 162 rows against the repository's 116, and four of them name changes with no file anywhere in `supabase/migrations/` | **MINOR** | PROBE-VERIFIED | NO |
| A8 | `A8-6` | 61 unindexed foreign keys — the DELETE-time cost falls on exactly the growth tables and on the two most frequently deleted parents | **MINOR** | PROBE-VERIFIED | NO |
| A9 | `A9-9` | The audit's LOCAL environment was not demo-seeded, and its migration ledger is one row behind prod | **MINOR** | PROBE-VERIFIED | NOT-APPLICABLE |
| A1 | `A1-10` | PROD's migration ledger has 162 rows against the repo's 116, and four of the extras correspond to no file in the repository | **LIMITATION** | PROBE-VERIFIED | NO |
| A1 | `A1-7` | 61 of 92 foreign keys have no covering index, on both LOCAL and PROD — and the count moves with the definition of "covering" | **LIMITATION** | PROBE-VERIFIED | NO |
| A1 | `A1-8` | There are zero constraint triggers and zero exclusion constraints, and only 2 of 92 FKs are deferrable — every guard in the referential-maintenance family runs immediately | **LIMITATION** | PROBE-VERIFIED | NOT-APPLICABLE |
| A1 | `A1-9` | responses and answers carry full ALL privileges to anon and authenticated — RLS-with-no-policies is the only layer, and the REVOKE pattern exists elsewhere in the same schema | **LIMITATION** | PROBE-VERIFIED | NO |
| A2 | `A2-12` | CLAUDE.md invariant 1 says k=5; the running system's floor is 2, and 0 for organisation respondents | **LIMITATION** | PROBE-VERIFIED | NO |
| A2 | `A2-14` | 29 of 56 tables have no policy for at least one command, so those commands are reachable only through SECURITY DEFINER code — and the policy set alone cannot tell you which | **LIMITATION** | PROBE-VERIFIED | NOT-APPLICABLE |
| A2 | `A2-6` | ui_messages: qual='true' on the one org-scoped table among the eight, so an organisation's copy overrides are world-readable by unauthenticated callers | **LIMITATION** | PROBE-VERIFIED | NO |
| A2 | `A2-8` | Nothing forces RLS, so all 72 SECURITY DEFINER functions bypass every policy — RLS is not a backstop for any of them | **LIMITATION** | PROBE-VERIFIED | NOT-APPLICABLE |
| A3 | `A3-10` | 36 of 60 app-schema functions are EXECUTE-able by anon; only PostgREST's exposed-schema config stands between them and the internet | **LIMITATION** | PROBE-VERIFIED | NO |
| A3 | `A3-11` | relforcerowsecurity is false on all 56 tables, so the table owner reads responses and answers with RLS off | **LIMITATION** | PROBE-VERIFIED | NO |
| A3 | `A3-4` | ui_messages' SELECT policy is `using (true)` while the table carries org_id — an unauthenticated caller reads any tenant's copy overrides and enumerates organisation ids | **LIMITATION** | PROBE-VERIFIED | NO |
| A3 | `A3-6` | demo_requests is written by anon, read by nobody in the product, and its status column has no writer at all | **LIMITATION** | PROBE-VERIFIED | YES — YES for the notification half — the write path is live on prod (proven in A3-2), so a real |
| A4 | `A4-5` | Thirty-seven SECURITY DEFINER functions pin search_path=public rather than '' — safe today only because every body happens to schema-qualify, and no gate asserts that | **LIMITATION** | PROBE-VERIFIED | NO |
| A4 | `A4-8` | The shipped SIDE 2 assertion narrows to public + SECURITY DEFINER + caller-reachable, so a gate that lives on a parameter is outside what it can see | **LIMITATION** | PROBE-VERIFIED | NO |
| A5 | `A5-6` | UNREACHABLE group is smaller than it looks: only two instances are refused by a control, and neither control is a foreign key | **LIMITATION** | PROBE-VERIFIED | NOT-APPLICABLE |
| A5 | `A5-7` | duty_survey_links and import_jobs are client-writable through RLS and are written and read by nothing in the product | **LIMITATION** | PROBE-VERIFIED | YES — prod's single administrator can INSERT into both tables through PostgREST today; no second |
| A6 | `A6-10` | Erasing an organisation survives A6-2 only by cascade firing order, which nothing pins and no test asserts | **LIMITATION** | PROBE-VERIFIED | NO |
| A6 | `A6-5` | Three freeze triggers are still written as «reject the operation» rather than «reject the change» — latent only because their tables happen to have no ON DELETE SET NULL FK | **LIMITATION** | PROBE-VERIFIED | NOT-APPLICABLE |
| A6 | `A6-6` | tasks_law_ref_fkey is ON DELETE RESTRICT and not deferrable — the exact construct V2-3b replaced, reintroduced against a seeded registry three migrations later | **LIMITATION** | PROBE-VERIFIED | NO |
| A6 | `A6-7` | Three FKs inherited NO ACTION rather than choosing it, and one of them specifies ON UPDATE while staying silent on ON DELETE | **LIMITATION** | INFERRED | NOT-APPLICABLE |
| A7a | `A7a-10` | tests/db/fk-tenancy.test.ts reasons about the tenancy risk of six columns no code ever writes; every one of its reasons is correct about a case that cannot arise | **LIMITATION** | PROBE-VERIFIED | NOT-APPLICABLE |
| A7a | `A7a-14` | The local reference build has no demo data at all, so any measurement that relied on rows being present would have been measuring the wrong thing | **LIMITATION** | PROBE-VERIFIED | NOT-APPLICABLE |
| A7a | `A7a-3` | report_shares.expires_at has no writer: every report share link is permanent, while the RPC that checks expiry reads a column nothing can set | **LIMITATION** | PROBE-VERIFIED | NO |
| A7a | `A7a-7` | organizations.timezone (Q50) is still unwritable, and its column comment reads as though it were settable | **LIMITATION** | PROBE-VERIFIED | NO |
| A7a | `A7a-9` | Four tables are entirely unreachable from the product: import_jobs, notifications, question_translations, template_pack_translations | **LIMITATION** | PROBE-VERIFIED | NO |
| A7b | `A7b-10` | report_shares.expires_at has no writer, and report_for_share_token treats NULL as «never expires» — every report share link is permanent, and no UI can revoke one | **LIMITATION** | PROBE-VERIFIED | NO |
| A7b | `A7b-11` | Four columns can only ever hold their DEFAULT: organizations.plan, organizations.active_langs, demo_requests.status, dsr_requests.due_at | **LIMITATION** | PROBE-VERIFIED | NO |
| A8 | `A8-5` | anon and authenticated hold full table DML including TRUNCATE on the response vault; RLS is the single control, and TRUNCATE is not subject to RLS | **LIMITATION** | PROBE-VERIFIED | NO |
| A8 | `A8-8` | Gate 5a3 hard-codes `nspname = 'public'`, so the 38 SECURITY DEFINER functions in `app` are outside every automated check — and that is where A8-1 lives | **LIMITATION** | PROBE-VERIFIED | NOT-APPLICABLE |
| A9 | `A9-4` | Retention destroys the raw data of a round that never closes, and nothing ever froze it — M:0068 repaired the closers, not the clock | **LIMITATION** | PROBE-VERIFIED | NO |
| A9 | `A9-5` | Retention reaches 2 tables; every other table holding personal data is kept for ever, including the invitation list that records who answered | **LIMITATION** | PROBE-VERIFIED | NO |

---

## 1.6 Refuted or withdrawn — and what that number means

Eight Part A claims did not survive. **Six of them are downstream of my own briefing error**
(`00-method.md` § 0.2): probes correctly observed that the local database was empty, filed it as a
finding about the environment, and the triage — run after seeding — found the observation stale.
That is D110's case 1 arriving inside the audit, and it is the honest reason the refutation count
is not a measure of probe sloppiness.

- `A1-1` The LOCAL "reference build" contains no demo seed — 0 organizations, 0 auth users, 0 responses, 0 answers — REFUTED as stale — D110 case 1. The lead session has confirmed the briefing error and the local database is now fully seeded, so every count the finding rests on has changed. ONE SUB-CLAIM SURVIVES AND IS WORTH ONE LINE 
- `A1-12` LOCAL's ui_messages holds 50 rows against production's 2730 — the i18n seed was never run on this build — REFUTED AS WRITTEN — stale, D110 case 1: LOCAL does not hold 50 rows, it holds 4212, and it is now the side that is CURRENT. But refuting the sentence must not discard the subject. Re-measured, the divergence is real and
- `A3-12` The LOCAL reference build has no demo seed — every tenant table is empty — REFUTED as STALE (D110 case 1): the claim was accurate when the probe ran and the local stack has since been seeded, so it no longer holds. It was also never a defect in the product — it described a briefing error about 
- `A5-8` Neither environment could have shown a cross-tenant row: LOCAL has no tenant data at all and PROD has one organisation — REFUTED as written for LOCAL — the D110 case is 'the claim is stale' (the probe was briefed that LOCAL carried the demo seed and it did not; it does now). LOCAL is a two-tenant database with 20 populated tables and the 3
- `A6-11` The LOCAL reference build contains no demo data at all, so every «exposure in seeded data» number measured against it is vacuous — STALE, in D110's first sense: the observation was accurate when the probe ran and the environment has since been seeded, so the claim no longer holds. Withdrawn rather than downgraded — there is nothing left to fix. Its 
- `A7b-13` THE AUDIT BRIEF'S LOCAL ENVIRONMENT CLAIM IS FALSE: the local database has no demo-seed data at all — Does not reproduce: the local database is now fully seeded, which is why several of this section's claims (org_members.group_id, duties.next_due_at, groups.lead_member_id) could be re-tested against real rows in this pas
- `A7b-14` A catalogue sweep written with \b instead of \y returns zero for every column and looks like a clean result — The technical claim is exactly right and reproduces. Withdrawn as a FINDING because nothing in the repository runs that query — it is a method note about this audit, and it belongs beside D123 (the identical ASCII-\b bli
- `A8-7` The local reference build has no demo seed — every tenant table is empty, which silently changes what several of this audit's checks can prove — D110 case 1: the claim is stale. It was a true observation of the harness at probe time and the lead session has since acknowledged it as its own briefing error and seeded the database. It is not a defect in HeiTuva — no

**One withdrawal is worth keeping as a note rather than a finding.** `A7b-14` observed that a
catalogue sweep written with `\b` instead of `\y` returns zero for every column and looks like a
clean result. The technical claim is exactly right and reproduces — but nothing in the repository
runs that query, so it is a method note about this audit, not a defect in HeiTuva. It belongs
beside **D123**, which recorded the identical ASCII-`\b` blindness in `verify:copy`.
