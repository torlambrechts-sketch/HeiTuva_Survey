# HeiTuva — approved plan, at 192210d

Folds in: the M0–M4 baseline, the design handoff measurement, and the invariant 1 amendment.
Ordering rule: a phase comes earlier when doing it later would make the work before it unverifiable.

**One open decision blocks nothing but is stated as an assumption throughout (§ Open).**

---

## 0. Findings ledger from the baseline — disposition

| # | Finding | Disposition |
|---|---|---|
| F1 | Prod ledger diffed by **name**; MCP `apply_migration` has previously applied **truncated bodies** (6 repair migrations exist in prod for exactly this, none recorded in the repo); 42 names applied twice | **Phase A.** Name presence is not body equivalence. Fingerprint the catalogue, not the ledger |
| F2 | `anon` / `authenticated` hold SELECT, INSERT, UPDATE, DELETE, **TRUNCATE**, **REFERENCES**, TRIGGER on `responses` and `answers`, both environments | **Phase B.** RLS does not cover TRUNCATE. Test before concluding, then revoke |
| F3 | 6 keys where `ui_messages` overrides the build; **2079 keys present in both**, so every future copy edit to any of them is inert | **Phase C.** Blocks all copy work |
| F4 | `tasks.taskFilterFrist`: prod serves «Nær frist», repo says «Over frist» — opposite meanings on a live filter | **Phase C.** User-visible defect |
| F5 | Q171's rename (`nav.tasks`, `tasks.title`) never reached a user | **Phase C** |
| F6 | `verify:reference` green while rewriting **35 of 35** baselines | **Logged.** Apparatus frozen (§ 8) — D-number, not a fix |
| F7 | `verify:responsive` order-dependent; clean 244/244 after reset, red after write-heavy gates | **Logged + runbook line.** Reset before running; not a code change |
| F8 | 4 respondent terminal routes report `controls=0` legitimately — and are the routes where a 500 and a correct page are indistinguishable to that gate | **Phase A**, as a status check. No new gate |
| F9 | 5a3 = 82/115, measured, matches the carried number. 6 PROTECTED-BUT-UNPROVEN | **Accepted.** Documented run-order effect |
| F10 | `auth_leaked_password_protection` still off (§ 5.4) | **Tor's** — one dashboard setting |

---

## Phase A — the base is what the files say

**Why first.** Every later phase changes an RPC or a policy. If prod's schema is not what the 156
migrations produce, those changes land on an unverified base and a green apply proves nothing (F1).

Scope:
1. Apply all 156 migrations to a clean database. Dump the resulting catalogue.
2. Dump production's catalogue the same way: tables, columns, types, defaults, NOT NULLs, CHECK and
   FK constraints, indexes, RLS flags, policies, and the **full body** (`prosrc`) of every function in
   `app` and every SECURITY DEFINER RPC.
3. Diff the two by content. Every difference is a finding, whether or not a repair migration explains it.
4. Commit the six prod-only repair migrations to `supabase/migrations/` so the repo records them.
5. HTTP status for all 40 routes, and specifically the four `controls=0` respondent terminal routes (F8).

**Exit:** a content-level diff with zero unexplained entries, and the repo containing every migration
production has run. **Blocks:** B, D.

---

## Phase B — invariant 1's grants

Small, and it is the invariant the product is built on.

1. Behavioural test, on seeded tables, at the standard already set in M1: `set role anon` then
   TRUNCATE; then REFERENCES via a foreign key pointing at `responses`. Report what happens.
2. Revoke SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER from `anon` and
   `authenticated` on `responses` and `answers`, in a new migration.
3. Read the grants back from `information_schema.role_table_grants` afterwards — including anything
   inherited from PUBLIC, which is the M:0013 / M:0101 failure. An apply is not evidence.
4. Re-run the M1 denial tests. They must still pass, and for the same reason plus one more.

**Exit:** zero grants for either role on either table, read back from the catalogue.

---

## Phase C — the copy pipeline

**Why before D and E.** The threshold banner and the English locale are both copy, and F3 means copy
edits do not reach users.

1. Establish how a row enters `ui_messages`: what writes it, whether any admin surface does, and
   whether a seed run overwrites or merges. Report it before changing anything.
2. Decide and record which side is the source of truth. Both faces of invariant 8 apply here — who
   writes this, and what reads it.
3. Fix F4 (`tasks.taskFilterFrist`) and land F5 (Q171) **in both places**, per § 5.8(c)'s pattern: the
   JSON is the seed, `ui_messages` is what the product serves.
4. Re-read the served value from production afterwards and confirm it changed.

**Exit:** a stated pipeline, the six divergences resolved, and a verified read-back.
**Blocks:** D, and the English half of E.

---

## Phase D — threshold and banner

Per `INVARIANT-1-AMENDMENT.md`, which must be committed to CLAUDE.md before this starts.

1. `app.k_threshold()` becomes a per-survey read with a database floor of 3 for person surveys.
2. CHECK constraints: floor 3; threshold immutable once a response exists; `respondent_kind`
   immutable once a response exists.
3. Strictest-threshold-wins for multi-survey reports, **in the RPC**.
4. Template-carried statutory policy locks threshold and anonymity mode.
5. The build panel «Hvem svarer og hva vises», the send-summary row, the results meta line, the
   report method line, the admin default and its redaktør switch.
6. The five respondent banner variants — `anon(n)`, `low`, `named`, `org(o)`, `choose(n)` — generated
   from the threshold, in **Norwegian and English**. The English set does not exist in the design and
   must be written.
7. Below-threshold cells never expose their n, in any role.

**Exit:** the floor and both immutability rules provable red by test before they are trusted (§ 7.4),
and the banner correct in both locales.

---

## Phase E — the design gap

Read-only measurement can run any time, including now, in parallel with A. Implementation waits for D,
because D changes six of the screens E would otherwise measure twice.

**E1 — measurement (read-only).**
- v7 (15 screens, in repo) vs the handoff bundle (16 screens). Name the added screen.
- Geometry diff between the two bundles: every literal inline style value in the markup region, keyed
  by screen gate and source line.
- Implementation column: computed styles for every rendered control on all 40 routes, joined to
  `docs/fidelity/elements.json` (3423 elements, 570 controls, 301 repeaters). **It is committed now.**
  Until 2026-09-20 this line named a file that was not in the tree — scratch from the session that
  produced the inventory, cited as though it had been committed.

**E2 — implementation, in tranches ranked by per-screen `changed` count.** One verification pass and
one fix pass per tranche; fix-pass findings go to the next tranche.

Not in scope at any fidelity: **Sitat**, **Segmenter**, and the nps card's right half.
In scope only if Tor reverses them by name: Bølger, Sammenligning, Frisvar, Levering, Leveranse,
Matrise — these are product decisions, not invariants, and the design draws all six.

---

## Open

**«Manager» — `redaktor` or a team leader?** Everything above is written on `redaktor`: the survey's
owner may set the threshold within the floor when an administrator has enabled it; `leser` cannot.
This is stated as an assumption, not settled. If it meant a reader, Phase D item 5 changes and the
role check moves.

Nothing else is waiting on a decision.
