# 04 — SUMMARY: the prioritised list

**363 surviving findings across 27 probes. 1 BLOCKER · 79 MAJOR · 118 MINOR · 98 LIMITATION ·
67 CLEAN. Ten claims were refuted.** Every one carries an evidence tier and a
**BITES PROD TODAY** answer; the two are kept apart on purpose, because severity describes the
defect and reachability describes today.

**78 findings can bite prod today, 34 of them MAJOR.** Prod is a one-tenant, near-empty project —
1 organisation, 1 member, 4 surveys, 1 response — so most of what follows is a pre-launch finding
rather than an incident. Three are not.

---

## 1. THE AUDIT'S FINDING — `org_members.group_id` has no writer

**`A7a-1` / `A7b-1` · MAJOR · tier VERIFIED · BITES PROD TODAY: YES · a DEFECT**

Not because it is the worst. Because it is what a gate structurally cannot see.

A group can be created. **Nobody can ever be put in one.** Every group count renders 0, the Send
screen's group picker targets an empty set, every per-group result is permanently
`insufficient_data`, and the blind-spot generator sees only empty groups — with every gate green
and the demo working perfectly.

The complete set of writes to `org_members` in the codebase, derived rather than sampled:

```
app/(auth)/kom-i-gang/actions.ts:78     insert { org_id, user_id, email, name, role, status }
app/(app)/administrasjon/actions.ts:322 update { role }
app/(app)/administrasjon/actions.ts:359 update { status }
app/(app)/administrasjon/actions.ts:394 update { sso_exempt }
app/(app)/administrasjon/actions.ts:431 insert { org_id, email, role, status, invited_by }
SQL functions writing group_id:         (none)
```

None names `group_id`. **The only writer is `scripts/seed-demo.ts:106,108,114`** — which is
CLAUDE.md's own sentence, word for word: *"A COLUMN WHOSE ONLY WRITER IS THE SEED IS EXACTLY THE
FINDING — the demo works, every gate is green, and no user can ever set it."*

It is read in at least eight places (Brukere, Grupper counts, Målgrupper audience sizes, Profil,
the Send headcount, two survey lists) and, through `responses.respondent_group_id`, by every
per-group aggregate, heatmap cell, trend and report filter.

**Two independent probes converged on it, on deliberately different methods** — one sweeping the
catalogue inwards, one walking outwards from the 23 server actions and 4 route handlers. Neither
saw the other's result. That convergence is the strongest evidence in this audit.

It is the **fifth** instance of "who writes this column?" after D102, `created_by`, `run_mode` and
Q50's `timezone`, and it has the largest blast radius of the five. The audit found **five more in
the same family**: `duties.next_due_at` (drives Oversikt's «Krever handling»),
`run_mode = 'quiz'` (all of V2-10, reachable only from psql), `survey_invitations.bounced_at`,
`groups.lead_member_id` (no writer at all, not even the seed), and `report_shares.expires_at`
(every share link permanent, no revocation).

---

## 2. BLOCKER — cross-tenant WRITE through `live_sessions.round_id`

**`A5-1` · tier VERIFIED · BITES PROD TODAY: NO · a DEFECT**

An administrator or redaktør of any organisation can cause anonymous respondents to write real
responses into another organisation's round. Reproduced end to end, twice, rolled back. Full
evidence in `01-database.md` § 1.2.

**Not reachable on prod today** — it needs a second organisation, and prod has one. It becomes
reachable with the second customer.

Fixing it is one migration: give `survey_rounds` a unique `(id, survey_id)` and restate
`live_sessions.round_id` as a composite — the shape `M:0070` already used for
`tasks.(source_round_id, source_ref)`. **Fix the column, not the policy**, per CLAUDE.md.

---

## 3. HAPPENING NOW ON PRODUCTION — three items

These are not latent.

| | finding | tier | what is true right now |
|---|---|---|---|
| **3.1** | `B4-F01` / `C6b-1` — **nothing drains the mail queue** | VERIFIED | `pgmq.a_mail_outbox` = 0 rows ever archived. Two real invitations to the account owner, `read_ct = 0`, **37 hours old**. Three cron producers, no consumer. `scripts/mail-worker.ts` has no scheduled invocation anywhere — `vercel.json` declares only framework and region. The Send screen said «Sendt til N personer». |
| **3.2** | `B7a-*` / `B7b-*` / `A9-1` — **prod serves the pre-correction copy** | PROBE-VERIFIED | `lib/i18n/messages.ts` layers seeded `ui_messages` **over** the JSON files, and prod's rows predate D113/D120/D122/D124. Live on prod: «Summerte tall beholdes», «Servere i Oslo og Frankfurt», a 24-month retention claim against a 12-month default, six hard-coded-five splash strings, SMS/Entra/Google/HR integration claims against four disabled flags, Swedish and Danish surveys that are not served. |
| **3.3** | `A1-2` / `A1-3` — **prod is missing seeded content** | PROBE-VERIFIED | 17 template packs against the repository's 22; the `offentlig` use case has **zero** packs and renders as an empty card. `help_articles` = 0, so `/hjelp` is blank. `quality_rules` is missing `policy_pronoun`. |

**3.1 and 3.3 are operational, not code.** Neither needs a migration; both need something to be
run against production that never has been.

**3.2 is the one to think hardest about**, because of *why* no gate caught it: **`verify:copy`
reads the JSON file and never the table the product serves** (`B7b-02`). The gate is green
*precisely because* it is looking at the half that was fixed. That is D110's case 4 with a gate in
place of a screenshot — real, on-topic, and structurally mute on the claim.

---

## 4. The themes, so 79 MAJORs are not read as 79 unrelated things

**4.1 · A column with no writer (10 findings).** Section 1. The standing question fires on a
feature that is fully built, fully read, green on every gate, and settable only from psql.

**4.2 · A control that guards one transition, not the state (6 findings).** `B1-02`
(`guard_invitation_not_suppressed` is BEFORE INSERT only; an UPDATE walks round it), `B7a-03` /
`B7b-03` (the org threshold floor and the administrator-only rule are BEFORE UPDATE, so INSERT
escapes both), `A6-4` (live-anonymity guarded on two transitions and on neither state), `B3c-3`
(`guard_survey_policy` role-checks `k_threshold` only, so a redaktør can change *anonymity*
unaudited). CLAUDE.md already names this shape — *"a guard on one transition is not a guard on the
state"* — and it recurs six times.

**4.3 · The report is the weakest authorisation surface (6 findings).** `compose_report` applies
**no role rule at all** (`B6-05`, `B3a-11`), so CLAUDE.md invariant 4 has no effect anywhere in
reports; `result_snapshots.aggregates` is directly SELECTable by any org member including a
`leser`, quotes and attributed rows included, with no RPC in the path (`B6-03` / `A2-5`); archived
exports are readable by every org member (`B6-04`); the PDF/PPTX routes archive into the *viewer's*
org (`B3a-1`); and a shared report composes **empty** for its recipient (`C2-12`, verified by me:
same report, `findings: [{low_question, 3.6}]` for a member, `findings: null` for the share-link
holder — because the guarded RPCs return `forbidden` and the result is coalesced to null rather
than surfaced as an error).

**4.4 · Retention promises more than it does (5 findings).** `apply_retention` reaches two tables.
The frozen snapshot and the archived export keep free text past it (`B6-06`, `B6-07`); a round
that never closes loses its answers with nothing frozen behind them (`A9-4`); `survey_invitations`
— who was asked, who answered — is kept for ever (`A9-5`); and «Slett rådata automatisk» is a
switch nothing reads (`A9-2` / `B7a-02`).

**4.5 · Gates that cannot see what they are trusted for (7 LIMITATIONs, and the most valuable
category here).**

- `B7b-02` — `verify:copy` reads the file, not the table the product serves.
- `A8-8` — Gate 5a3 hard-codes `nspname = 'public'`; the 38 SECURITY DEFINER functions in `app`
  are outside every automated check, and `A8-1`/`B2-01` lives exactly there.
- `A5-2` — `fk-tenancy.test.ts` enumerates FKs where *both* tables carry a literal `org_id`;
  transitively-scoped targets are invisible, which is how the BLOCKER survived.
- `C3-2` — `react-hooks/exhaustive-deps` is a WARNING and `eslint .` carries no `--max-warnings`,
  so the hooks gate cannot fail.
- `C4-7` — nothing in the 22-script apparatus measures bundle size or page weight.
- `A2-8` / `A3-11` — nothing forces RLS, so all 72 SECURITY DEFINER functions bypass every policy;
  and **nothing asserts "RLS on every table"** — `grep -rn relrowsecurity tests/` is empty, and
  disabling RLS would remove a table from 5a3's enumeration rather than fail it.
- **CI runs 289 of the census's 824 tests — 35.1%.** `.github/workflows/ci.yml` is the only
  automation in the repository (no git hooks, no other workflow). It runs `tsc`, `eslint`,
  `next build`, `supabase db lint` and `vitest run tests/invariants`. **`tests/db` (313 tests) and
  `tests/unit` (222) never run in CI**, and of the 17 gates chained by `verify:all`, four run.
  **The other thirteen — including Gate 5a3, `verify:copy`, `verify:attack` and every browser
  gate — run on a developer's machine or nowhere.** And the reason is not cost: timed individually
  on an idle machine, **all seventeen gates pass and the whole chain takes 979 seconds — 16 min
  19 s**, of which three browser gates are 57%. The apparatus works, it is green, and nothing
  schedules it.

**4.6 · Documents that disagree with the system (4 findings).** CLAUDE.md's invariant 1 says k=5;
the running floor is 2, and 0 for organisation respondents (`A2-12`). CLAUDE.md's census line says
820 across 53 files; `tests/expected-counts.json`, which is generated, says **824** — the V2-10
close-out added four quiz tests and the carried number stayed. `M:0012`'s comment asserts a revoke
that never took effect (`A8-2`). CLAUDE.md names `app.k_threshold()` as the k-anonymity control;
nothing calls it any more (`C6b-7`).

---

## 5. What each one is, for sequencing

**DEFECTS — a thing is wrong and the fix is not a decision.**
The BLOCKER (§2); every no-writer column (§4.1); every one-transition guard (§4.2); the report
authorisation set (§4.3); `A5-4` (`submit_response` trusts the client's `question_id`); `A4-1`
(`is_test` gates no write path); `B3c-1` (test send rewrites the denominator); `B5-1` (soft-delete
revokes no token); `C1a-2` (`saveDraft` is not atomic); `C1a-3` (copy drops the quiz answer key);
`C2-2` (three definitions of "has an average").

**OPERATIONAL — nothing to write, something to run.**
§3.1 the mail worker; §3.3 the missing packs and help articles; and the `ui_messages` reseed behind
§3.2. All three are "production has never had X run against it".

**LIMITATIONS TO DOCUMENT — behaving as designed, cost unwritten.**
§4.5 in full; the vault's wide-open table grants with RLS as the sole control (`A1-9`, `A8-5`, and
TRUNCATE is not subject to RLS); the live voucher's plaintext `code` (defensible, written down
nowhere); the credential in the URL path on `/s/`, `/r/`, `/l/` (`B5-14`); no pagination anywhere
(`C1b-14`); the 81 kB Sentry floor on every route (`C4-1`, `C4-4`).

**DECISIONS FOR YOU — I have deliberately not taken these.**
1. **Is a Sentry DSN configured on Vercel?** I could not read Vercel env. If not, every visitor
   downloads 81 kB of an error reporter that never initialises. Either way the fix is a decision
   about whether Sentry stays on the client at all.
2. **Leaked-password protection is off on prod** (`B1-05`). Enabling it is a production change.
3. **`get_peer_results` discloses the question text in the below-threshold branch** (`B2-10`) —
   whether that is acceptable is a k-anonymity judgement, not a bug report.
4. **Prod's ledger holds 162 rows against the repository's 116** (`A8-4`, `A1-10`). Clearing the
   42 historical duplicates is a bulk delete on the remote, which CLAUDE.md makes stop-and-ask.
5. **Whether `compose_report` should have a leser branch at all**, or whether reports are
   deliberately administrator-and-redaktør only — the code implies one answer and invariant 4
   implies another.

---

## 6. The numbers, each with the command that produced it

```
$ node -e '(merge probe findings with triage verdicts)'   # scratchpad/audit/merge.js
  TOTAL findings 373 · triaged 373 · refuted or withdrawn 10 · surviving 363
  by severity : BLOCKER 1 · MAJOR 79 · MINOR 118 · LIMITATION 98 · CLEAN 67
  by tier     : VERIFIED 5 · PROBE-VERIFIED 341 · INFERRED 17
  by bites    : YES 78 · NO 169 · NOT-APPLICABLE 116
  by part     : A 117 · B 155 · C 91

$ (severity movement during triage, first 9 sections)
  MAJOR -> MAJOR 18 · MAJOR -> MINOR 6 · MAJOR -> WITHDRAWN 2 · MAJOR -> LIMITATION 1
  LIMITATION -> MAJOR 1
  i.e. the probes over-assigned MAJOR by roughly a third, and under-assigned once.

$ node -e '(sum tests/expected-counts.json by directory)'
  manifest 824 tests / 53 files · tests/invariants 289 · tests/db 313 · tests/unit 222
  CI runs 289 of 824 = 35.1%

$ grep -n "run:" .github/workflows/ci.yml   # the only automation; no git hooks
  11 steps, 2 jobs
```

**Eight of the ten refutations are downstream of my own briefing error** — I told the probes the
local database carried the demo seed and it did not. That is D110's case 1 arriving inside the
audit, and it is why the refutation count is not a measure of probe sloppiness. It is recorded in
full in `00-method.md` § 0.2, along with two further method failures of my own.

---

## 7. What I would not conclude from this

- **That the security invariants are broken.** They are not. The vault has no client SELECT policy,
  the anonymity CHECK is intact and byte-identical on both environments, `submit_response` is the
  only writer, no SECURITY DEFINER function lacks a pinned `search_path`, and there is no
  `when others` anywhere. The one BLOCKER is a tenancy defect in a feature two phases old, not a
  failure of the k-anonymity design.
- **That 79 MAJORs means 79 things are broken for users.** 34 can bite prod today; of those, three
  are already happening and most of the rest are copy that overstates what the product does.
- **That the gates are worthless.** They caught what they enumerate. Every finding in §4.5 is a
  gate being *exactly right about what it measures* and silent about a room it never claimed to
  cover — which is this project's most-repeated lesson, arriving once more, from the outside.
