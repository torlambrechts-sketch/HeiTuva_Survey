# The v1 bundle — close-out

**Closed 2026-09-07.** Seven phases planned, six built, one descheduled. Every count here
is measured, not estimated; there are no effort figures because none was measured.

Phase reports: `docs/v1/reports/V1-2.md` … `V1-6.md`. V1-0 and V1-1 were chat-only.
The living picture of what remains is `docs/v1/05-status.md`; this file is the summary.

---

## 1. What shipped, V1-0 to V1-6

| Phase | What it built | Decisions confirmed first |
|---|---|---|
| **V1-0** | The frame: header, wide toggle, Innsikt nav and rail; the reference harness re-pointed at the v1 bundle with the first bundle's renders kept beside it | Q18 (two bundles, refined), Q28 (what the threshold hides), Q32, Q47 |
| **V1-1** | The policy panel (Q17 §1/§2) and Oversikt's compliance card. Q37's two Oversikt surfaces moved here from V1-6, because Oversikt is the first screen anyone opens | Q17 §1/§2, Q37 |
| **V1-2** | Attributed results — the ungated organisation path — Q30/Q43's refusals, rounds, and D94's k=0 cell shape | Q30, Q31, Q34, Q35, Q36, Q43 |
| **V1-3** | Recurrence: the cadence enum split, `paused_at`, schedules RLS, and the Send screen's schedule controls | Q19, Q20, Q21, Q22, Q23 |
| **V1-4** | Dashboard customisation: `dashboard_layouts` with its constraints, the panel registry, presets, the «Tilpass» card | Q25, Q26, Q27, Q29, Q33, Q42, Q46, Q51 |
| **V1-5** | The use-case library: `use_cases` registry, the «Bruksområder» tab, chips, five new packs | Q24, Q44, Q45 |
| **V1-6** | Carried findings: Q49's round count, Q50's clock, Q48(b)'s registry strings, census generation, the pack builder, the roundtrip harness's cleanup | Q48(b), Q49 (Q50 confirmed in V1-3's acceptance) |
| **V1-7** | **DESCHEDULED.** The stream panel and the expansion catalogue's R4 are one feature in two halves — ingestion first. Q38–Q41 travel with it | — |

**Nineteen migrations**, `0035` … `0053`. **Thirty decisions** from the Q18–Q51 range
promoted into the register, twenty-two of them confirmed by Tor before the phase that
needed them.

### The four rules the bundle produced, in the order they were learned

1. **The derivation must describe the PROPERTY, not a symptom of it.** V1-6's
   `next_run_at` sweep required `send_at_local` in the function body, so it swept only the
   functions that already knew about the column and missed the two that ignored it.
2. **One rule written in two places is the defect shape of this codebase.** Removed four
   times — V1-3's interval CASE, V1-4's panel vocabulary, V1-5's use-case mapping, V1-6's
   pack-question builder. `lib/questions/pack.ts` names all four.
3. **A test must clean up after the outcome it is trying to PREVENT**, not only the one it
   expects. Standing question 4, `tests/db/clients.ts`.
4. **A test that fails because your own change altered the contract is not a stale test —
   it is the only reader that noticed the contract moved.** Standing question 5, added at
   the close. When the fix is one line, the question is what the value MEANS, not whether
   the types agree.

---

## 2. Carried numbers

| | Value | Where |
|---|---|---|
| Migrations | **81** (numbered series reaches 0053) — all applied on prod | `supabase/migrations/*.sql` |
| Gate 5a3 | **56 of 74** surfaces actively checked (45 RLS tables + 29 SECURITY DEFINER functions, 18 allowlisted) | `verify:policy` |
| Census manifest | **577 tests across 35 files** | `tests/expected-counts.json` |
| Capture states | **159** · responsive combinations **160** | `verify:browser`, `verify:responsive` |
| UI messages per language | **1559** (no, en) | `messages/*.json` |
| Decisions in the register | **48**, of which **33** are CONFIRMED (Tor) | `DECISIONS.md` |
| Deviations logged | **106** | `docs/DEVIATIONS.md` |
| Phase reports on disk | **5 of 7** closed phases | `docs/v1/reports/` |
| Last full chain | **`CHAIN_EXIT=0`**, run 3 of V1-6, from a reset database | `docs/v1/reports/V1-6.md` § 1.1 |

**5a3's denominator moved once in the whole bundle** (73 → 74, V1-5's `use_cases`,
allowlisted) and the checked number never fell. The census rose 392 → 577.

---

## 3. Every open item, with its owner

### Tor's

| # | Item | Why it is a decision |
|---|---|---|
| **1** | ~~Prod is nineteen migrations behind~~ — **DONE 2026-09-07.** All nineteen applied, ledger reconciled, schema now identical to local byte for byte. Two drifts found and repaired; seven invariants verified on prod; advisors clean. `docs/OPERATIONS.md` § "Prod sync" | **PITR** is not enabled — now the first item on the pre-launch gate, to be enabled before the first real send |
| **1b** | **The disposable-remote run is BLOCKED on a plan change.** `create_branch` → `PaymentRequiredException: Branching is supported only on the Pro plan or above`. A free throwaway project ($0/month) would serve identically and was refused by the free tier's two-active-project limit, both slots held by `heituva-prod` and `gauge` | **Two ways to unblock, both Tor's:** upgrade the org to Pro, or pause `gauge` if idle. Pausing an unrelated project is not mine to do. What it would prove is narrower than it first appears — see § 5 |
| **2** | **Launch readiness** — Turnstile, Entra, leaked-password protection, the remote load test | `docs/OPERATIONS.md:11-78` |
| **3** | **Two deferred auth controls**, triggered by the first real organisation | D27; `docs/OPERATIONS.md:76-78` |
| **4** | **Four unreviewed legal texts, DPIA not started** | `docs/LEGAL_DRAFTS.md` |
| **5** | **The Next 16 upgrade**, now unblocked by Q17 having shipped | `docs/OPERATIONS.md:252-271` |
| **6** | **The expansion catalogue** — not in this repository. R2, R3, R4 | Owed before R4 and the descheduled stream panel can be reconciled |

### Owned by launch readiness

| Item | Shape |
|---|---|
| **The demo seed reaches only states the current code creates.** Twice in this bundle: D102's pre-`M:0040` organisation survey, and V1-6's multi-round survey below the threshold, which no fixture has | One seed row plus one `routes.manifest.ts` state. Belongs beside the remote load test, which needs non-happy-path fixtures anyway. Natural trigger: the first real organisation |

### STANDING LIMITATIONS — no owner yet

Not a gap in any gate. A gap between the gates and the thing they are about.

| Limitation | Why it is here |
|---|---|
| **EVERY GATE READS LOCAL. NOTHING HAS EVER READ PROD.** `supabase db lint` lints the local database. The invariant suite queries the local database. Gate 5a3 enumerates the local catalogue. The census counts locally-collected tests. Six phases of green CI said nothing whatever about `heituva-prod`, and could not have | **This is the finding of the whole close-out pass, and it explains both prod defects found on 2026-09-07.** A hand-applied `overview_activity` that would have failed Gate 1's lint survived six phases (D104), and prod sat nineteen migrations behind while every gate stayed green — because the gates and prod are different databases and nothing compared them. The fingerprint procedure now in `docs/OPERATIONS.md` closes the *drift* half of this by hand, at apply time. It does not close the standing half: **between applies, nothing watches prod at all.** Whoever picks this up should decide whether that wants a scheduled comparison, a check in CI against a disposable remote, or a deliberate acceptance written down. **It is recorded here so the next person meets it as a known hole rather than discovering it the way I did** |

### Unowned by design

| Item | Why nothing is scheduled |
|---|---|
| **React #418** on `bibliotek-maler/liste/mobile` | One failure, no reproduction across V1-4, V1-5 or V1-6. Not called a flake. Nothing to do until it recurs |
| **D99** — organisation surveys lose the aggregate half | Open, not settled. The answer if a customer asks is a named report section, not a restored screen half |
| **D100, D101** | Revert as seed changes when Q26 lifts; the preset illustrations want keying by preset KEY rather than array position |
| **Q38–Q41** | Travel with the descheduled V1-7 |

### Closed at the bundle's close, 2026-09-07

- **D102** — scope query run on prod: **zero affected surveys** (4 surveys, 0 organisation).
  Option D taken with the copy fix; `tests/unit/register-stats.test.ts`, five tests, two
  proven failing against the old behaviour.
- **Standing question 5** written into `tests/db/clients.ts`.
- **`design-reference-v1/README.md`** — the bundles' copies of governing documents are
  historical; `docs/` governs. One file diverges today and the README names it.
- **The prod sync** — 0035–0053 applied, ledger reconciled, two drifts repaired
  (`schedules.paused_at` lost in transit; `overview_activity` hand-applied, D104), seven
  invariants verified on prod, advisors clean.
- **"An apply is not evidence, a comparison is"** — the fingerprint procedure, with a
  runnable query, at the head of the remote-apply section of `docs/OPERATIONS.md`.

---

## 4. The one thing to read if you read nothing else

V1-6's largest defect: a migration shipped a new field, `tsc` stayed clean because nothing
read it, the visual gate passed because it had only ever photographed the old state, and
the decision's user-visible half did not exist. **Every layer was individually green.**

The defect surfaced through a single assertion that went red for the most dismissible
reason available — the phase's own change had moved the contract the assertion described.
The one-line fix was available, correct-looking, and would have shipped both the missing
surface and a count that reported 0 for four people.

That is why standing question 5 exists, and why the Gate 6 decision-conformance section —
quote the clause, cite the `file:line` that satisfies it — is worth its cost: it would have
caught the same defect independently, by having nothing to cite.

---

## 5. What the disposable-remote run would and would not prove

Recorded because the answer is narrower than the instruction assumed, and the narrowing is
worth having before anyone pays for it.

**It would NOT add JWT realism.** The premise that the suite's personas are weaker than
real sessions does not hold: `tests/db/clients.ts:303` signs each persona in with
`signInWithPassword` against a genuine GoTrue and returns a real access token — the file's
own comment says *"a genuine JWT, so RLS and `auth.uid()` behave exactly as they do for a
real user in the browser."* Cross-org isolation, leser refusals and token replay are
already proven under real JWTs against real RLS, on every run, and they pass. A remote run
would re-run those same assertions against the same schema.

**It WOULD prove two things local genuinely cannot:**

1. **That `supabase db push` applies the whole set to a FRESH REMOTE in one go.** Local
   `db reset` proves the set is internally consistent; it says nothing about the transport.
   The 2026-09-07 sync is the reason this matters: the schema arrived correct only after a
   truncation was caught by comparison. (The repository holds **81** migration files; the
   numbered series reaches 0053.)
2. **That the schema behaves the same on Supabase's managed stack** — managed Postgres
   17.6.1.166 against local's 17.6, managed GoTrue, the pooler, and platform extension
   versions rather than the container's (`pg_cron 1.6.4`, `pgmq 1.5.1`, `supabase_vault
   0.3.1`, `pgcrypto 1.3`).

**A partial result already exists for (1), and it is not nothing.** Prod now carries all
81 applied incrementally, and its fingerprint matches a freshly-reset local — where the
same set was applied from scratch — byte for byte across columns, constraints, policies,
RLS tables, normalised function bodies, grants and enums. **Two different application
orders converge on an identical schema.** That is real evidence about the migration set;
it is not evidence about `db push` against an empty remote, which is what remains open.
