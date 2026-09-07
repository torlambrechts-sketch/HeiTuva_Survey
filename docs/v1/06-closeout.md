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
| Migrations | **81** | `supabase/migrations/*.sql` |
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
| **1** | ~~Prod is nineteen migrations behind~~ — **DONE 2026-09-07.** All nineteen applied, ledger reconciled, schema now identical to local byte for byte. Two drifts found and repaired; seven invariants verified on prod; advisors clean. `docs/OPERATIONS.md` § "Prod sync" | **Two things came out of it and are still Tor's:** PITR is not enabled (a logical snapshot stood in, adequate only because prod holds zero responses), and the invariant suite was NOT run against prod because it writes fixtures — behaviour under real RLS remains unproven and wants a disposable database |
| **2** | **Launch readiness** — Turnstile, Entra, leaked-password protection, the remote load test | `docs/OPERATIONS.md:11-78` |
| **3** | **Two deferred auth controls**, triggered by the first real organisation | D27; `docs/OPERATIONS.md:76-78` |
| **4** | **Four unreviewed legal texts, DPIA not started** | `docs/LEGAL_DRAFTS.md` |
| **5** | **The Next 16 upgrade**, now unblocked by Q17 having shipped | `docs/OPERATIONS.md:252-271` |
| **6** | **The expansion catalogue** — not in this repository. R2, R3, R4 | Owed before R4 and the descheduled stream panel can be reconciled |

### Owned by launch readiness

| Item | Shape |
|---|---|
| **The demo seed reaches only states the current code creates.** Twice in this bundle: D102's pre-`M:0040` organisation survey, and V1-6's multi-round survey below the threshold, which no fixture has | One seed row plus one `routes.manifest.ts` state. Belongs beside the remote load test, which needs non-happy-path fixtures anyway. Natural trigger: the first real organisation |

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
