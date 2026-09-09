# 00 — METHOD: what was run, what could not be, and what this audit gets wrong about itself

**Run 2026-09-09, after the prod sync (`9f53ff1`), before the remainder is sequenced.**
This is an audit, not a phase. It produces `docs/audit/` and changes no product code, no
migrations and no tests. Nothing in it has been fixed.

---

## 0.1 Orientation, run first, because a working tree is a position and not an inventory

```
$ git fetch origin && git rev-list --left-right --count origin/main...HEAD
  0   78                     # 78 ahead of origin/main, 0 behind: a clean descendant
$ git merge-base origin/main HEAD
  3b7cef54…                  # == origin/main's tip
$ git log --oneline -1
  9f53ff1 Q103 complete: M:0062–M:0088 applied to prod, fingerprinted, ledger reconciled
```

## 0.2 The two environments, and one of them was not what I said it was

```
$ psql LOCAL -tAc "select count(*), max(version) from supabase_migrations.schema_migrations"
  116 | 20260909000088
```

Prod (`jmhhszsnjfqgclxzhciq`) is at the same 116; all eight catalogue fingerprint hashes matched
local earlier the same session (`docs/OPERATIONS.md`, 2026-09-09). The raw per-function `md5`
differs for 24 of 94 functions in **comment text only** — recorded there, and it matters here
only because one probe reported it as a fingerprint mismatch and it is not one.

**PROD'S ACTUAL SCALE, MEASURED, because half of this audit's conclusions depend on it:**

```sql
-- mcp Supabase execute_sql, project jmhhszsnjfqgclxzhciq
organizations 1 | auth_users 1 | org_members 1 (a single administrator) | groups 1
surveys 4 (2 aktiv, 2 utkast) | survey_rounds 2 | survey_invitations 2 | responses 1 | answers 3
share_links 1 | report_shares 0 | reports 0 | duties 0 | tasks 0 | segments 0
live_sessions 0 | suppressions 0 | schedules 0 | result_snapshots 0 | notifications 0
support_messages 0 | audit_events 7 | ui_messages 2730 | help_articles 0
```

**Prod is a one-tenant, near-empty project.** Several real defects below cannot bite there today
for want of a second organisation, a group, a schedule, a report, or an objector. That is a fact
about prod's *data*, not about the defect. Every finding therefore carries **two** fields, kept
apart on purpose: a **severity**, which describes the defect, and **BITES PROD TODAY**, which
describes today.

### THE AUDIT'S OWN FIRST ERROR, AND IT IS D110'S CASE 2 INSIDE THE AUDIT THAT NAMES THE SHAPE

I briefed all 27 probes that local was "freshly reset from all 116 migrations **+ demo seed**".
It was not:

```
$ grep -n "sql_paths" supabase/config.toml
  sql_paths = ["./seed.sql"]              # registries only
$ node -e "…" package.json
  seed:demo = tsx scripts/seed-demo.ts --local     # NEVER run by db reset
$ psql LOCAL -tAc "…"
  organizations=0 auth_users=0 surveys=0 responses=0 | template_packs=22 ui_messages=50
```

**Every probe measured an empty database.** D110's case 2 exactly: the command ran, produced
output, and the output was about an environment that was not the one the document described —
which looks identical to a real measurement. B1 caught it independently and worked around it with
rolled-back fixtures; **C2's row counts and query plans were worthless as written and are not
reported**. Before the triage pass the database was seeded properly:

```
$ npm run seed:demo && npx tsx scripts/seed-i18n.ts --local && npx tsx scripts/seed-help.ts --local
$ psql LOCAL -tAc "…"
  orgs=2 members=7 groups=2 surveys=6 rounds=6 invitations=33 responses=22 answers=53 ui_messages=4212
```

Findings a probe marked UNVERIFIED for want of data were re-offered to the triage pass against
this seeded state. **22 responses and 53 answers are still not production volumes**, and no timing
claim anywhere in `03-efficiency.md` rests on them.

## 0.3 Structure: 27 probes, then an adversarial triage, then this

**Measurement.** 27 independent probes, run as four concurrent workflows, each given the same
method rules (measure don't reason; a pattern match is a symptom not a property; an enumeration is
not a property; absence is what a gate cannot see) and each required to return every count with
the command that produced it. They wrote raw logs to a scratchpad and returned structured
findings. **373 findings.**

**Triage.** Every finding then went to an independent adversarial verifier, one per section,
instructed to *refute by default*, to re-run the command in `how_found`, and to answer three
questions: does it reproduce, what severity does the written definition actually support, and can
it bite on prod today. Severity was corrected in both directions.

**Three evidence tiers, stated per finding, because 110 unverified MAJORs is a number nobody can
act on:**

| Tier | Meaning |
|---|---|
| **VERIFIED** | I ran the commands myself in the lead session and quote the output. |
| **PROBE-VERIFIED** | A probe ran a command, and an independent verifier re-ran it and got the same thing. I did not personally re-run it. |
| **INFERRED** | The claim rests on reading code or on reasoning. It may well be true; it was not measured, and it is not presented as if it were. |

Anything a verifier could not reproduce is **REFUTED** and does not appear as a finding — the
count of refutations is reported in `04-summary.md`, because how many findings died is itself a
measurement of how generously the probes assigned severity.

## 0.4 What was run, per section

Every probe had unrestricted read-only SQL on both environments, the repository, and the built
output. Full raw logs: one file per section in the session scratchpad.

| § | What it measured | Principal method |
|---|---|---|
| A1 | tables, columns, indexes, constraints, triggers, functions, policies, enums — both envs | `pg_class`, `pg_constraint`, `pg_proc`, `pg_policies`, `information_schema` |
| A2 | every RLS policy set; the `FOR ALL`-beside-a-narrower-policy shape | `pg_policies`, then reasoning about what each `USING` admits |
| A3 | tables with RLS and no policy; the inverse (tables with RLS off) | `pg_class.relrowsecurity` + `pg_policy` |
| A4 | every SECURITY DEFINER function, its `search_path`, its grants, and the two-sided k check | `pg_proc.prosecdef`, `proconfig`, `routine_privileges`; call-graph walk with comments stripped |
| A5 | single-column FKs between org-scoped tables | `pg_constraint.conkey/confkey` + a live exploit probe |
| A6 | `ON DELETE` on every FK; CHECK predicates over columns an FK may null | `confdeltype`, `conkey` (not a regex over the predicate text) |
| A7a/A7b | **columns with no writer** — two deliberately different derivations | (a) catalogue + code sweep inwards; (b) walking outwards from the 23 server actions, 4 route handlers and the writing RPCs |
| A8 | advisors both envs; unindexed FKs; unused indexes | `get_advisors` on prod; SQL equivalents on local |
| A9 | what `apply_retention` destroys; whether all three closers freeze | `pg_get_functiondef`; the existing `round-freeze` test, which asserts the ROW |
| B1 | the invariants, prod and local separately | catalogue, plus `app.k_for` called on real rows |
| B2 | what the catalogue GRANTS (not what migrations revoke) | `routine_privileges`, `has_function_privilege`, `role_table_grants` |
| B3a/b/c | **the four route handlers and all 23 server actions as a database surface** | reading every file; classifying client, tables, RPCs, Zod, and the authorising control |
| B4 | service-role reach; every catch-all in SQL and TypeScript | `pg_proc` sweep; grep over `app/` and `lib/`; the built chunks |
| B5 | every token: hashing, comparison, expiry, revocation, entropy, logging | catalogue sweep for credential columns, then each writer and each resolver |
| B6 | every path free text can leave the vault | catalogue derivation of text-returning functions + call-graph walk |
| B7a/B7b | **the claim set** — every user-facing string asserting a security or privacy property | `messages/*.json` and the seeded `ui_messages`, each claim checked against the system |
| C1a/C1b | query shape: N+1, unbounded selects, over-fetching, shell queries | reading every action, handler, page and `lib/` module |
| C2 | RPC cost | **re-done by the lead session after seeding**; structural, not timed — see below |
| C3 | React re-renders, effects, deps, keys | static structure only; render timings are UNVERIFIED by design |
| C4 | bundle | the build output, plus an **A/B build** to attribute Sentry's cost |
| C6a/C6b | dead code: exports, message keys, tables, flags, functions | enumerate-then-search, in both directions |

### Two measurements the lead session did itself rather than delegating

**C4 — Sentry's client cost, A/B rather than estimated.** The repository was copied to a throwaway
tree (repo untouched), `node_modules` symlinked, `instrumentation-client.ts` deleted (Next treats
it as optional), and `npm run build` run in both. Nothing else differed; both exited 0.

```
with instrumentation-client.ts : shared First Load JS = 184 kB
without it                     : shared First Load JS = 102 kB
delta across all 37 routes     : 80–82 kB, mean 81.2 kB
middleware                     : 147 kB in BOTH — the cost is purely the browser bundle
```

**C2 — re-done structurally after seeding, per the instruction not to report zero-row plans.**
The finding that matters is scale-independent and is stated in `03-efficiency.md`; no timing
number is claimed from a 53-answer database.

## 0.5 What could not be measured, and why

| Item | Why | Status |
|---|---|---|
| **The role-based invariants against PROD** | Cross-org isolation, "leser cannot read answers" and token replay need real persona sessions over a Postgres connection. Prod's direct host does not resolve from this container and 5432/6543 are blocked; only 443 is open. | **UNVERIFIED on prod.** Proven on local. The `policies` hash being byte-identical to local is an argument, not the measurement — and the difference is the whole point of this file. |
| **React render counts and timings (C3)** | Needs a running browser with the React profiler. | **UNVERIFIED by design.** C3 reports only structural claims, and says so. No memoisation is recommended on an unmeasured basis. |
| **Whether a Sentry DSN is configured on Vercel** | Vercel env vars are not readable from here. | **UNVERIFIED.** The *cost* is measured and unconditional; whether the benefit is switched on is a question for Tor. |
| **Production-scale query plans (C2)** | The largest database available holds 22 responses. | **NOT ATTEMPTED.** Reporting a plan from 53 answers as evidence about 60 000 would be the error this audit exists to avoid. |
| **`verify:visual` / `verify:responsive` / `verify:browser` timings (C5)** | These need WebKit; the container has Chromium only, and VERIFY.md records that a Chromium-only container reports the mobile half as an install error rather than a pass. | Measured where they run; named where they cannot. See `03-efficiency.md` § C5. |

## 0.6 Three places this audit's own method failed, recorded because they are the shape it hunts

**1. A pattern match over source text is a symptom, and I used one first.** My opening sweep for
catch-alls was `prosrc ~* 'when\s+others'` → **1**, contradicting D115's recorded zero. It was a
*comment*, in `public.send_round`, and the comment is `M:0072`'s own explanation of why the
handler was narrowed. Stripping comments first: **zero**. D115 holds. I made the error the rule
exists to prevent, in the first five minutes.

**2. A call-site enumeration by literal string is blind to a dispatcher.** `lib/results/read.ts:32`
is `supabase.rpc(fn as 'aggregate_results', args as never)` — **the RPC name is a variable**. So
`grep "rpc('get_heatmap'"` returns zero for six live RPCs. Any "function X has no call site"
finding built on literal grep had to be re-derived against this before it was believed; the ones
that survived are marked, and the ones that did not are in the refuted count.

**3. The seed briefing, § 0.2 above.** The largest of the three, and mine.

## 0.7 The limits of this audit, stated as an enumeration of its own enumerations

- **The probe set is 27 sections chosen from the brief**, not derived from the system. A defect
  in a place no section looked is invisible here. The sections cover the catalogue exhaustively;
  they cover *code* by file-list, and a file nobody listed was not read.
- **The claim-set sweep (B7a/B7b) is bounded by the strings I asked for** — those asserting a
  security or privacy property, or carrying a fixed number. A false claim of a different kind
  (a performance promise, a capability claim in an image) is outside it.
- **"No writer" (A7) is derived from SQL function bodies, `.insert/.update/.upsert` in `app/` and
  `lib/`, and the seeds.** A writer reaching a column through a spread (`.update(payload)`) is
  visible only if the payload's keys are literal. Both A7 lenses were told this; it is the most
  likely way that section is incomplete.
- **Nothing here measures behaviour under concurrency, under load, or over time.** No race, no
  lock-contention and no growth-curve finding appears, because none was measured.
- **The triage pass ran once.** A verifier that reproduced a command and agreed is one
  independent check, not three; findings marked VERIFIED are the ones that got a second.
