# 03 — The plan (Round 3)

Phases in dependency order, with Brief 7's scope split applied. This document plans; it
starts nothing.

**Reading order.** Every phase names its Round-0 classification per surface
(BUILT / PARTIALLY BUILT / NOT BUILT, from 00-diff §B), states its **schema first with the
negative tests to be proven failing before implementation**, its **UI second with the
`docs/RESPONSIVE.md` pattern named per screen**, its definition of done including the
census and 5a3 numbers it must produce, and what is explicitly **not** in it.

**Numbers that carry forward and may only move up:** **55 of 71 surfaces actively checked**
by Gate 5a3 (`npm run verify:policy`), and **18 files / 392 tests** in the census
(`tests/expected-counts.json`). Per-phase figures below are **targets the phase must
produce**, not measurements — a phase that lands under its target has not finished.

**Constraints, all earned in v1 and applied throughout:**

- Database before UI, always.
- Any phase touching an aggregate path carries the two-sided catalogue-derived `k_for`
  assertion: nothing calls the old constant, everything reading the vault calls
  `app.k_for` — and handles its `0` return (organisation respondents) explicitly.
- One verification pass, one fix pass. Findings from the fix pass go to the next phase's
  list. Phases are sized so that is possible.
- No phase builds a screen absent from a bundle.
- Anything already built is a **fidelity check** against v2, not a rebuild.
- The verification apparatus stays frozen. A check the gates cannot make is **logged as a
  limit**, not built around.
- Any phase introducing a screen with no seedable state extends `scripts/seed-demo.ts` and
  `tests/db/factories.ts` **in the same phase**.
- Tasks-from-findings, live and quiz each get their own phase, negative tests first, the
  Q17 treatment. None may be folded into a larger phase.
- Integrasjoner, the public API and the webhooks are **one phase, placed last**, not started
  without Tor's go-ahead. No earlier phase may depend on anything it would deliver.

---

## Gating summary — what blocks what

| Blocker | Blocks | Source |
|---|---|---|
| The expansion catalogue (R3/R4) is not in this repo | populations, retention-per-population, the CRM half of the final phase | 00-diff §0.1 |
| The missing v1 round | nothing structurally; it moves the A-series counts if it arrives | 00-diff §0.2 |
| `HeiTuva Lovpalagt.dc.html` is not in the bundle | V2-9 (Bruksområder) and a clean splash fidelity pass | 00-diff §0.3.2 |
| **Q18** — what a task from a below-threshold finding may contain | V2-7, and the `threshold.breached` half of V2-12 | 02-conflicts §B1 |
| **Q24–Q26, Q28, Q29** — live's counter, word cloud, audience questions, viewport, route shape | V2-10 entirely | Briefs 2(ii), 2(v), 4 |
| **Q22, Q23** — quiz tokens and assessment semantics | V2-11 entirely | Briefs 2(iii), 3 |
| **Q45** — the API/integrations program go-ahead | V2-12 entirely | Brief 7 |

Nothing before V2-7 depends on any of these. That is deliberate: the first six phases are
buildable the moment this plan is approved.

---

## V2-0 — Bundle intake and the fidelity baseline

**Why first.** `scripts/verify/reference.ts:21` drives the **old** bundle. Repointing it at
v2 re-captures all 26 PNGs in `artifacts/reference/` and turns every existing Gate 3a
comparison red at once. That is correct and necessary, and it must be one scheduled step
rather than a surprise inside a feature phase.

**Scope**

| Surface | Class (00-diff §B) | Work |
|---|---|---|
| Reference capture | — | Repoint `reference.ts` to `design-reference-v2/`, re-capture 26 PNGs, commit |
| Nav restructure to `dash/surveys/tasks/insight/library` | PARTIAL (B.1) | `components/AppHeader.tsx:19-24`; Innsikt as a group whose active state covers `/dashboard` and `/rapporter` (bundle :4881), remembering the last sub-tab (:4473, :4487); sub-tabs from `insightTabs` :5280. **Oppgaver renders as a disabled/absent item until V2-6** — no dead route. |
| Header avatar-only button + role line | PARTIAL (B.2) | Bundle :195, :199–200 |
| box-sizing / `max-width:100%` hardening | PARTIAL (B.27) | 42 controls (00-diff §A.10). A **check**, not a rebuild: the app solved the class via `docs/RESPONSIVE.md`; where it already holds, record it and change nothing |
| Categorical-"fem" copy | — | 02-conflicts §A2: parameterise :1711, :2790, :4660 equivalents on `app.k_for`. Splash and legal stay flagged to Tor (Q39) |

**Schema:** none. **Negative tests:** none — this phase adds no surface.

**UI, with the pattern named**

| Screen | RESPONSIVE.md pattern |
|---|---|
| App shell / header (all routes) | § App shell / header — slide-over below `md`. **Uncovered:** a nav item that is a *group with sub-items*. Stop-and-ask → **Q40** |
| Innsikt sub-tabs | § Tab rails and chip groups — wrap to multiple rows |
| Header user button (38×38, :195) | Global rule 2 — ≥44px hit area via transparent padding, painted size unchanged |

**Definition of done**
- All 26 reference PNGs re-captured from v2 and committed.
- Gate 3a run against every existing route; every diff either resolved or logged as a
  deviation with a reason.
- `document.documentElement.scrollWidth` at 390px within viewport on every route
  (RESPONSIVE.md global rule 1 — blocker).
- Census: **18 files / 392 tests** (unchanged — no new behaviour).
- 5a3: **55 of 71** (unchanged — no new surface).

**Not in it:** Oppgaver, Målgrupper, any schema change, the splash and Bruksområder fidelity
passes (V2-9).

---

## V2-1 — Q17 completion, part 1: the builder policy panel and the Personvern controls

Closes D87 §1, the policy half of §2, and §8. **This is the only part of the bundle that
closes an open commitment rather than opening one**, the kernel is already built and
tested, and D87 explicitly records that the Personvern server actions were left unwritten
*because there was no caller*. There is a caller now.

**Scope**

| Surface | Class | Work |
|---|---|---|
| Builder «Hvem svarer og hva vises» panel | PARTIAL (B.17) | Bundle :714, :725, :734. Kernel exists: `app.k_for` (`…0032:69`), `app.guard_survey_policy`, `app.apply_pack_policy`, the org-survey naming CHECK (`…0034`) |
| `polLowWarn` — lowering below 5 states its consequence | NOT BUILT (B.18, policy half) | :6683 — `pol.kind === "person" && pol.threshold < 5`; `polWarnings`/`hasPolWarnings` :6685. Per Q17: states the consequence, **takes no confirmation dialog** |
| Personvern default-threshold picker + redaktør-may-lower switch | PARTIAL (B.21) | Chips :5583 `[3,5,8,10]`; `orgThresholdNote` :5591. Columns exist (`organizations.default_k_threshold`, `privacy.redaktor_may_lower`, `…0034`); **server actions do not** |
| Per-topic sensitive threshold (8) | NOT BUILT | 02-conflicts §A4 — **Q21**. If adopted as recommended (a pack property), this is a seed change, not DDL |
| `minResponses` renders locked | — | 02-conflicts §A1 — informational, styled as the bundle styles a disabled switch (:6156–6157) |

**Schema first.** No new tables. Two server actions and, if Q21 lands as recommended, a
seed update to `template_packs.policy` for the sensitive packs.

**Negative tests, proven failing before implementation**
1. A `redaktør` sets a survey's threshold below the organisation's minimum → refused by
   `app.guard_survey_policy`, not by the form.
2. A `redaktør` sets it below 5 while `privacy.redaktor_may_lower` is false → refused.
3. Anyone sets a threshold below **3** on a natural-person survey → refused (Q17 floor).
4. Anyone changes threshold or respondent kind after the first response → refused (the
   lock is a trigger, not a screen).
5. A statutory pack's locked policy is overridden → refused.
6. A `leser` calls the Personvern write action → refused.
7. Cross-org: org A's administrator writes org B's `default_k_threshold` → refused.
8. **Two-sided `k_for`:** at `k−1` the gated read returns `insufficient_data`; at `k` it
   returns data — asserted for k=3, k=5 and k=8, not only k=5.
9. **Catalogue-derived:** no function in `public` or `app` references a literal threshold
   constant; every reader of the vault calls `app.k_for`.

**UI, with the pattern named**

| Screen | Pattern |
|---|---|
| Builder right pane (the policy panel lives here) | § Three-pane Builder — below `xl` the right pane becomes a full-screen sheet opened from a pinned button row |
| Personvern threshold chips | § Tab rails and chip groups — wrap; chips keep exact dimensions |
| Personvern rows | § Data tables → narrow rows keep the row; **consequential controls stay visible**, never behind an overflow menu |

**Definition of done**
- The eight-plus negative tests above pass as denials (not empty result sets — Gate 2b
  distinguishes them).
- Mutation check (Gate 5b): break `app.k_for` to return 1, show a test failing, revert.
- Census target: **18 files / ≥410 tests** (extends `tests/invariants/threshold-policy.test.ts`).
- 5a3: **≥55 of 71** — no new surface; the number must not fall.
- Demo seed extended so a survey with k=3, one with k=8 and one organisation survey (k=0)
  all exist.

**Not in it:** the audience-size breach warning (`hasThresholdWarn` needs an audience — V2-5),
the attributed table (V2-2), Del B (V2-8).

---

## V2-2 — Q17 completion, part 2: the attributed-results table and «Svar per virksomhet»

Closes D87 §5 and §6, and D88.

**Scope**

| Surface | Class | Work |
|---|---|---|
| Attributed-results table | PARTIAL (B.19) | Bundle :3607 (`resAttrib`), :3611, :3635 (`attribRows`), :6687, :6692. `public.attributed_results` + `app.attributed_rows` exist (`…0034`), 15 tests already |
| «Svar per virksomhet» section body | PARTIAL (B.20) | `compose_report` composes it through the same `app.attributed_rows` and refuses over person sources with `reason: person_sources`. Today it renders as a status line (D88) |
| Report-editor Filter-tab source lines | PARTIAL | D87 §6; already shipped as copy, now needs the drawn treatment |
| `attribNote` / CSV export | NOT BUILT | :6705–6706 |

**Schema first.** None — this is the phase where the discipline pays off. Both RPCs shipped
in Phase 9 precisely so the UI could follow a bundle.

**Negative tests, proven failing before implementation**
1. A `leser` calls `attributed_results` → refused (already asserted; re-run, do not assume).
2. `attributed_results` on a **person** survey → refused, not filtered.
3. A report mixing an organisation source and a person source composes `per_virksomhet` as
   `unavailable` with `reason: person_sources`, and **no organisation name appears anywhere
   in the composed document**.
4. Cross-org: org A reads org B's attributed rows → refused.
5. The CSV export path applies the same refusals as the screen (a new export surface is a
   new way to leak).
6. Two-sided `k_for` on the **aggregate** side of the same screen (`resAggregate` :6687)
   at k−1 / k.

**UI**

| Screen | Pattern |
|---|---|
| Attributed table | § Data tables — wide rows become cards below `md`; row actions in an overflow menu **except** anything consequential |
| Filter tab in the report editor | § Report editor — side tabs become a sheet below `xl` |

**Definition of done**
- The six negative tests pass as denials.
- Census target: **18 files / ≥425 tests**.
- 5a3: **≥55 of 71** plus any new definer function for the CSV export, each with a denial
  test in this phase.

**Not in it:** Del B panels (V2-8).

---

## V2-3 — Data-not-code: packs, use cases, help articles

The cheapest phase in the plan and it unblocks two later ones (V2-9 needs the packs; the
help centre is content).

**Scope**

| Surface | Class | Work |
|---|---|---|
| Five new template packs | NOT BUILT (B.23) | *Servicedesk etter sak, IT og verktøy, Innbyggerundersøkelse, Brukerundersøkelse tjeneste, Frivillige etter arrangement*. Rows in `template_packs` + `template_pack_translations` (no/en) |
| `USE_CASES` registry | NOT BUILT (B.24) | Six rows (:4034–4041), driving `packCats` :6229, `wizUses` :5848, `useChips` :5914, `useCaseCards` :6233, `libTabs` :6220 (a third Bibliotek tab, "Bruksområder") |
| Help articles + contact | NOT BUILT (B.11) | Twelve articles (:4177+), `helpContact`/`contactSent` :5159, `statusRows` :5161 |
| `helpForum` | — | **Not built** — 02-conflicts §B3, decision **Q27** |

**Schema first.** `use_cases(key, label, short, description, preset, tint, sort_order)` +
`use_case_translations`; `template_packs.use_case_key`; `help_articles(key, category,
read_minutes, tint, body jsonb)` + translations, or `ui_messages` — **Q50**.

**Negative tests, proven failing before implementation**
1. A `leser` or an outsider **writes** `use_cases` / `help_articles` → refused.
2. A member of org A reads org B's *org-scoped* packs → refused (the shared rows are
   `org_id is null`, exactly as `template_packs` already works).
3. Both new tables appear in 5a3's catalogue-derived list and are either protected or
   allowlisted **with a stated reason** (`scripts/verify/policy-coverage.ts`
   `PUBLIC_BY_DESIGN`) — an allowlist entry without a reason is a finding.
4. A pack whose `use_case_key` does not exist → refused by the FK.

**UI**

| Screen | Pattern |
|---|---|
| Bibliotek — third tab "Bruksområder" | § Tab rails and chip groups — wrap |
| Use-case cards | The bundle's own `repeat(auto-fill,minmax(...))` grid |
| Help article list | § Data tables — wide rows become cards |
| Help article body | Prose; § Charts does not apply |

**Definition of done**
- Both registries seeded and reachable through the wizard and Bibliotek.
- i18n complete for `no` + `en` on all 23 packs and 6 use cases.
- Census target: **19 files / ≥440 tests**.
- 5a3: **≥57 of 71** (two new tables, both enumerated).

**Not in it:** the Bruksområder marketing page (V2-9), the forum.

---

## V2-4 — Suppression and member state

Small, legally required (GDPR art. 21), and overdue.

**Scope**

| Surface | Class | Work |
|---|---|---|
| Suppression list | NOT BUILT (B.6) | `SUPPRESSED` :4325; blocks import :4971, badges preview :4982, filters recipients :4993; `suppressRows` :5014 gives each a reason |
| Member statuses | PARTIAL (B.7) | `MEMBERS` :4327–4335 — Aktiv / Bounce / Reservert / Ny. Today `org_members.status` is `invited/active/inactive` (`…0002_tenancy.sql:43`) |

**Schema first.** `suppressions(org_id, email, reason, source, created_by, created_at)`,
unique on `(org_id, lower(email))`, RLS + policies in the same migration. A mapping
decision for `org_members.status` — **Q37**; bounce must promote from
`survey_invitations.bounced_at` to member state.

**Negative tests, proven failing before implementation**
1. `send_round` addresses a suppressed email → **the row is not created**, and the refusal
   is the database's, not the UI's.
2. Re-importing the same CSV re-adds a suppressed address → refused (this is the failure
   mode that makes suppression theatre).
3. A `leser` writes `suppressions` → refused.
4. Cross-org: org A suppresses into org B → refused.
5. A suppressed address that is also a group member is excluded from a group-targeted send.
6. Removing a suppression is an audited administrator action (`audit_events`).

**UI**

| Screen | Pattern |
|---|---|
| Brukere (member statuses) | § Data tables → **narrow rows keep the row** — this is explicitly the Brukere case in RESPONSIVE.md; status is consequential and stays visible |
| Suppression list (Personvern or Brukere) | § Data tables → wide rows become cards |
| Send preview badges | § Send screen |

**Definition of done**
- The six negative tests pass as denials.
- Census target: **20 files / ≥455 tests**.
- 5a3: **≥58 of 71**.
- Demo seed carries one suppressed address and one bounced member.

**Not in it:** populations (catalogue-blocked), retention per population.

---

## V2-5 — Målgrupper: groups and segments

**Groups and segments only.** Populations are catalogue-blocked (00-diff §0.1) and carry
retention (02-conflicts §B7); they wait.

**Scope**

| Surface | Class | Work |
|---|---|---|
| Grupper (fixed lists) | PARTIAL (B.4) | `mgGroups` :5045 from `DEFAULT_AUD` :4313–4318. `public.groups` exists (`…0002_tenancy.sql:29`) and gains `kind`, `source`, `synced_at` |
| Segmenter (rule-based) | NOT BUILT | `mgSegments` :5049, `DEFAULT_AUD` :4319–4322, rules at :4320–4322 |
| Per-round freeze | NOT BUILT | :5033 — "312 treff · frosset for Ukespuls 36" |
| Audience audit log | NOT BUILT | `auditRows` :5031–5036 |
| Import relocation | PARTIAL (B.28) | Q9 amendment (02-conflicts §A6): Send keeps the one-off list (:3020) + "Lagre som målgruppe" (:3037); sync stubs move here (:3040), still flagged, still "kommer" |
| `hasThresholdWarn` | NOT BUILT (B.18, audience half) | :4988, **rewritten to `app.k_for`** (02-conflicts §A3) |
| Populasjoner | NOT BUILT (B.5) | **Not in this phase.** The screen renders the section as an explicit unavailable state, never as fabricated data (CLAUDE.md: never fabricate data in the UI) |

**Schema first.** `groups` gains `kind ('gruppe'|'segment')`, `source`, `synced_at`, and for
segments a **structured predicate** — jsonb `{field, op, value}` clauses joined by AND over
an allowlisted field set, never free text evaluated in SQL (Brief 1). A
`round_audience_members(round_id, member_id, frozen_at)` materialisation. An
`audience_events` log.

**Negative tests, proven failing before implementation**
1. A segment rule naming a field outside the allowlist → refused at write time.
2. A rule containing SQL → stored as data and never executed (assert the predicate
   evaluator rejects it; assert no `execute` of user text exists in the codebase).
3. **The freeze:** send a round, change the segment's membership, re-read the round's
   denominator and participation rate → **unchanged**. This is the phase's most important
   test and the one nothing errors on.
4. A `leser` writes an audience or a rule → refused.
5. Cross-org: org A reads org B's audiences → refused.
6. `hasThresholdWarn` fires at `app.k_for(survey) − 1` and does **not** fire at `k`, tested
   at k=3 and k=8, and does not fire at all for an organisation survey (`k_for` = 0).
7. A group with a `NULL` population cannot be used to satisfy the mixed-population send
   guard — i.e. the guard is **not** built here and nothing pretends it is.

**UI**

| Screen | Pattern |
|---|---|
| Målgrupper — grupper | The bundle's `repeat(auto-fill,minmax(280px,1fr))` (:2432) |
| Målgrupper — segmenter | § Data tables → wide rows become cards; the monospace rule wraps, never truncated to unreadability |
| Målgrupper — populasjoner | Rendered as the design's unavailable/empty treatment |
| Admin tabs (now eight) | § Tab rails — wrap; `AdminTabs.tsx` already does |
| Builder breach warning (:2561) | § Three-pane Builder — **note Brief 4's finding: it sits inside the right pane, which becomes a sheet below `xl`. A warning behind a closed sheet is not a warning** — surface it on the base layer at mobile |

**Definition of done**
- The seven negative tests pass; test 3 is a blocker.
- Census target: **21 files / ≥475 tests**.
- 5a3: **≥60 of 71**.
- Demo seed gains four groups, four segments, one segment whose membership changes after a
  send, and one group with `count < k`.

**Not in it:** populations, the mixed-population send guard, retention per population,
any sync that actually syncs.

---

## V2-6 — Oppgaver

The statutory task register — **without the from-findings source**, which is V2-7. This
split is deliberate: the valuable part does not wait on Q18.

**Scope**

| Surface | Class | Work |
|---|---|---|
| Oppgaver screen | NOT BUILT (B.3) | :2152–2214; filters :5164, stat tiles :5168, rows :5178 |
| Six-step lifecycle | NOT BUILT | :5181 |
| The close guard | NOT BUILT | :5197 — "Et tiltak kan ikke lukkes før effekten er vurdert" |
| `loop_actions` migration | — | Supersedes (02-conflicts §C); `text → title`, `done → Lukket`; retire the Oversikt surface |
| Teams notification | — | **Not built** — integration-blocked. The copy at :5198 and :2206 is adjusted or the feature renders without it; a claim the product cannot keep is not shipped |

**Schema first.** `tasks(id, org_id, title, kind, law_ref, source_kind, source_ref,
owner_member_id, due_at, status, created_at)` with `status` an enum of the six;
`task_effect_assessments(task_id, round_id, assessed_by, assessed_at, note)`. `law_ref`
references `duty_definitions` where a statutory duty applies, free text otherwise (Brief 1).

**The close guard is a trigger, and CLAUDE.md's rule applies.** Write it as *"nobody may
close without an assessment"*, comparing the columns that carry meaning — **not** as
"reject any UPDATE". An `ON DELETE SET NULL` on `owner_member_id` is an UPDATE the database
issues on your behalf, and a blanket rejection produces a member row that cannot be
deleted, discovered far from the trigger. This has been rediscovered four times (D50, D51,
D57, duty-archive). Decide the cascade when the trigger is written.

**Negative tests, proven failing before implementation**
1. `status → 'lukket'` with no `task_effect_assessments` row → **refused by the trigger**.
2. The same, attempted through the server action → refused, and the error surfaces to the
   user rather than being swallowed (Gate 4).
3. Deleting an `org_members` row that owns a task → the FK nulls `owner_member_id` and the
   trigger **allows it** (the CLAUDE.md case, tested explicitly).
4. Skipping a lifecycle step (Foreslått → Gjennomført) → refused.
5. Moving backwards from Lukket → refused, or allowed and audited — decide and test it.
6. A `leser` advances a task → refused. A `redaktør` advances a task they own → allowed.
7. Cross-org: org A advances org B's task → refused.
8. A task's `source_ref` pointing at a survey in another org → refused by the FK.

**UI**

| Screen | Pattern |
|---|---|
| Oppgaver — filter pills | § Tab rails and chip groups — wrap; row gap ≥ the design step so 44px hit areas do not overlap |
| Oppgaver — stat tiles | The bundle's `repeat(auto-fit,minmax(180px,1fr))` (:2166) |
| Oppgaver — task cards | Already cards. `stepChips` (six, :2197) wrap below `md`; non-overlapping hit areas per global rule 2 |
| Nav | Oppgaver becomes a live item (V2-0 left the slot) |

**Definition of done**
- All eight negative tests pass; tests 1 and 3 are blockers.
- `loop_actions` rows migrated; the old Oversikt surface removed, not left in parallel.
- Census target: **22 files / ≥500 tests**.
- 5a3: **≥63 of 71**.
- Demo seed carries one task at each of the six steps, one late, one awaiting effect
  assessment — the screen has no seedable state otherwise.

**Not in it:** tasks from below-threshold findings, Teams notification, the webhook.

---

## V2-7 — Tasks from findings

Its own phase, negative tests first, the Q17 treatment. **Blocked on Q18**
(02-conflicts §B1). Do not start it before Q18 is answered; its whole shape depends on the
answer.

**Scope.** One thing: whatever Q18 permits a task created from a suppressed finding to
contain. The bundle draws it at :4239, :4270 and :4168, and `hasThresholdWarn` (V2-5) is the
detector.

**Schema first.** Depends on Q18. Under the recommended option (1), a
`task_sources` row referencing the *survey and the duty*, carrying **no group, no question
and no score**, and a generator that cannot construct one.

**Negative tests, proven failing before implementation — these are the phase**
1. A task generated from a below-threshold finding contains **no group name** anywhere in
   `title`, `source_ref`, `law_ref` or any rendered string. Asserted by reading the
   produced row and failing on the group's name appearing in it (Brief 5 — this is the only
   control the apparatus can express).
2. The same for the question text and the score.
3. A `leser` reads tasks generated from findings → whatever Q18 decides, tested as a
   denial or an allowance, not left implicit.
4. Two below-threshold groups in one survey produce a task that does not let a reader
   distinguish which one.
5. Enumerability: filtering the task list by `lov` (:5164) does not let a reader recover
   the set of gated groups.
6. Two-sided: a finding at `k` produces **no** below-threshold task; at `k−1` it produces
   one — tested at k=3 and k=8.
7. No outbound event is emitted (Q19 — `threshold.breached` is not built).

**UI.** Oppgaver, already built. The change is what the card says.

**Definition of done**
- Tests 1, 2 and 5 are blockers.
- Census target: **22 files / ≥515 tests**.
- 5a3: unchanged or higher.
- **Logged as a limit:** no gate in this repository can see what a free-text `source`
  string discloses to a reader who already knows the team structure. The control is that
  the string is not constructed that way; the test asserts the construction, not the
  inference.

**Not in it:** the webhook, Teams notification.

---

## V2-8 — Del B: the dashboard panel library, presets and the stream panel

Closes the last of D87. **Touches an aggregate path** — the two-sided catalogue-derived
`k_for` assertion applies in full.

**Scope**

| Surface | Class | Work |
|---|---|---|
| Four archetypes | NOT BUILT (B.22) | `ARCHE_LABEL` :4024 — `agg` / `reg` / `duty` / `stream` |
| Panel library + customise | NOT BUILT | `customizeOpen` :5298, `custData/custPanels/custLayout` :5303, `dashPanels` :5312 |
| Presets | NOT BUILT | `DASH_PRESETS` :4044–4050, `dashPresets` :5292, `presetChips` :5304, `myPresets` |
| Stream panel | NOT BUILT | :4032, `streamWin` :4368, markup :1325–1326 |
| `dashNeedsSetup` / `dashReady` | NOT BUILT | :5283 — the empty state |

**Schema first.** A panel registry (data-not-code, one row per panel with its archetype and
its `req` precondition — :4030, :4032), saved layouts, org and personal presets. A
`stream_window` SECURITY DEFINER RPC returning a rolling average and volume per day,
**k-gated per window** — a window is a cell.

**Negative tests, proven failing before implementation**
1. `stream_window` at `k−1` responses in a window returns `insufficient_data`; at `k`
   returns data. Tested at k=3, k=5, k=8, **and** for an organisation survey where
   `app.k_for` = 0 (ungated) — the `0` case is the one a naive `count >= k` gets right by
   accident and a `count > k` gets wrong.
2. A `leser` calls `stream_window` with a group filter → refused, matching `get_quotes`'
   rule (`…0009_rpcs.sql:176`).
3. The `register` panel (`req:"krever organisasjonsrespondenter"`, :4030) on a person
   survey → refused, not filtered.
4. A saved layout referencing a panel the survey cannot satisfy renders the panel's
   unavailable state — **never a fabricated number** (CLAUDE.md).
5. Cross-org: org A loads org B's preset → refused.
6. **Catalogue-derived, two-sided:** no aggregate path references a literal constant; every
   panel's read calls `app.k_for`.

**UI**

| Screen | Pattern |
|---|---|
| Customise sheet | § Modals and the wizard — full-screen sheet below `md` |
| Panel grid | § Charts — aspect ratio kept, min-height 200px, legend below |
| Stream panel | § Charts |
| Heatmap panel | § Heatmap — grouped list below `md`, same colour scale, same `insufficient_data` "—" |
| Preset chips | § Tab rails |

**Definition of done**
- All six negative tests pass; test 1's `k_for = 0` case is a blocker.
- Census target: **23 files / ≥530 tests**.
- 5a3: **≥65 of 71**.
- Demo seed produces a **gated multi-round trend** and a gated stream window — the fixture
  class Brief 5 names as missing.

**Not in it:** live, quiz.

---

## V2-9 — Bruksområder, and the splash fidelity pass

**Blocked on Q32** (the missing `HeiTuva Lovpalagt.dc.html`) **and on V2-3** (the nine
survey types must exist as packs before a public page names them — the D73 precedent,
02-conflicts §A9).

**Scope**

| Surface | Class | Work |
|---|---|---|
| Bruksområder page | NOT BUILT (B.25) | New public route; `UC` :184, `ORDER` :290, nine cards |
| Splash growth | PARTIAL (B.26) | 696 → 1051 lines; new states `r.isLegal` :217, `r.hasPage` :226 |
| Splash categorical-five copy | — | **Q39** — Tor's call, flagged since D87 |

**Schema:** none — marketing content. **Negative tests:** none new; re-run the existing
public-surface denials (`request_demo`, the anon paths) unchanged.

**UI.** Respondent- and public-facing surfaces are **mobile-first pixel-perfect** at
380–420px, not RESPONSIVE.md. Both pages have real mobile treatments in the bundle.

**Definition of done**
- No link on any public page points at a page that does not exist.
- No public page claims a capability the product does not have (D73).
- Census: unchanged. 5a3: unchanged.

**Not in it:** pricing changes, Stripe (Q10).

---

## V2-10 — Live mode *(program-scale; own phase; blocked)*

**Blocked on Q24, Q25, Q26, Q28, Q29** (04-decisions batch I). Brief 4 is explicit: a projected surface is a
viewport class `docs/RESPONSIVE.md` has never covered, and CLAUDE.md relaxes "do not
invent" **only** to the patterns in that file. **This phase cannot start with RESPONSIVE.md
as it is.**

**Scope if it proceeds.** The stage (:1829–1868), the ten toggles (:6136–6145), the reveal
(:1838), the QR (:1852), the word cloud with its moderation queue (:1874, :6180), the
priority exercise (:6181), the closing screen (:6185). **Without** `audienceQuestions`
(02-conflicts §B4 — defaults off at :4338 and stays off).

**Schema first.** `live_sessions`, a moderation queue for projected free text, and whatever
Q24 requires of the counter.

**Negative tests, proven failing before implementation**
1. The projected DOM shows **no numbers** at `k−1` and numbers at `k`, at k=3 and k=8.
2. **The counter**, per Q24: whatever rule is chosen, asserted by submitting responses one
   at a time and reading the projected DOM at each n. This is the test that stands in for a
   gate that cannot exist.
3. Unmoderated free text never reaches the projected surface.
4. A `leser` moderating free text → refused or allowed per Q25, tested either way; and the
   projected read path is subject to the **same** rule as `get_quotes`
   (`…0009_rpcs.sql:176`), not a second answer.
5. A rare word appearing once does not reach the cloud (its own minimum-occurrence floor,
   which is **not** k — Brief 2(ii)).
6. Cross-org: org A joins org B's session → refused.

**UI.** **Every pattern here is a stop-and-ask** until Q28/Q29 are answered. Named
uncovered cases: the projected viewport itself; the dark surface with no dark tokens; the
QR's minimum physical size; whether the presenter's control surface is a second device.

**Definition of done**
- **Logged as a limit up front:** live has **no reference comparison** in Gate 3a — no
  reference PNG can be captured for a projector and no viewport exists in
  `playwright.config.ts`. Gate 3a degrades to "captured and looked at" and the phase report
  says so rather than reporting a comparison (Brief 5).
- Census target: **24 files / ≥545 tests**. 5a3: **≥67 of 71**.
- Demo seed produces a live session at n = k−1 and n = k.

**Not in it:** quiz, audience questions.

---

## V2-11 — Quiz *(own phase; blocked)*

**Blocked on Q22** (tokens), **Q23** (assessment semantics: retention, who may see a
result, which tables) **and Q49** (both quiz refusals move into the database) — 04-decisions
batch J.

**Scope if it proceeds.** Quiz mode (:6131), the four toggles (:6149–6153), pass mark
(:6159), attempts (:6161), `answerIndex`/`pointsAward` (:6507), the team leaderboard
(:6186), the respondent tiles (:4768).

**Schema first.** **Own tables** — 02-conflicts §B6 is settled: quiz does not live beside
`responses`. `quiz_attempts(survey_id, member_id, attempt_no, score, passed, taken_at)`,
`survey_questions.answer_index`/`points`, and a certificate issuance record.

**Negative tests, proven failing before implementation**
1. The anonymity CHECK on `responses` is **unchanged** by this phase — asserted by diffing
   the constraint, not by inspection.
2. No join exists from `quiz_attempts` to `responses` (assert the absence of the FK and of
   any query joining them).
3. Quiz enabled on an anonymous survey → **refused by the database**, not only by the UI's
   early return (:6156–6158). Currently a UI-only guard.
4. Quiz enabled on a statutory pack → refused by the database (:6122 is UI-only today).
5. A `leser` reads an individual attempt → refused.
6. The leaderboard returns **team** aggregates only, and refuses to return individual rows
   even to an administrator through that RPC.
7. Retention per Q23 applied and tested (`app.apply_retention` currently has one path).

**UI**

| Screen | Pattern |
|---|---|
| Quiz settings in the builder | § Three-pane Builder — right pane becomes a sheet below `xl` |
| Quiz tiles on `/s/[token]` | **Respondent surface — mobile-first pixel-perfect**, not RESPONSIVE.md |
| Leaderboard | § Data tables → narrow rows keep the row |

Contrast of `#FFFDF6` on each tile colour is **measured** and recorded, not assumed
(Brief 3).

**Definition of done**
- Tests 1, 2 and 3 are blockers.
- Census target: **25 files / ≥560 tests**. 5a3: **≥69 of 71**.

**Not in it:** certificates by email if Q23 rejects them; anything on the live screen.

---

## V2-12 — FINAL PHASE: Integrasjoner, the public API and the webhooks

**One phase, placed last. Not started without Tor's go-ahead (Q45).** Written as a phase,
not a placeholder — but its output is a decision set and a risk register before it is code.

**Why it is one phase and last** (stated so the plan does not re-derive it): fifteen
external systems is larger than any phase this project has run and is a program, not a
phase; several bring data categories this product has never held — sykefravær (health,
GDPR art. 9), HR's `kjønn`, `lønn` — and each needs its own lawful basis and DPA text;
BankID revisits Q4's deferred identity decision; the CRM row is R4 event ingestion, which
is not in this repository; and the webhooks carry `threshold.breached`, which cannot be
designed before Q18 — a decision belonging to V2-7, on whose outcome this phase depends.

**What each integration reads, its lawful basis question, and its DPA consequence**

| Order | System | Reads | Lawful basis question | DPA consequence |
|---|---|---|---|---|
| 1 | **Entra ID (SCIM)** :5204 | navn, e-post, gruppe, stilling, sluttdato | Already the basis for the employment relationship; Entra SSO shipped in Phase 6e (`…0029`, D82) | Sub-processor already in scope |
| 2 | **Google Workspace** :5205 | navn, e-post, organisasjonsenhet | As above | US processing posture — Q6's EU/EØS promise applies |
| 3 | **Brønnøysund/Proff** :5220 | orgnr, bransje, land | Public register; no personal data | Minimal |
| 4 | **Teams / Slack** :5212–5213 | varsler, oppgavekort | Notification only; **no result content may leave** | Content-scoping clause |
| 5 | **Kalender** :5214 | møtetid, frist, eier | Ordinary | Minimal |
| 6 | **Sak/arkiv** :5216 | rapport-PDF, metadata | Archiving obligation | Retention interaction with `app.apply_retention` |
| 7 | **Sanksjonslister** :5221 | treffliste | Åpenhetsloven due diligence | Third-country data flows |
| 8 | **HR-system** :5206 | stillingsgruppe, ansiennitet, stillingsprosent, **kjønn** | Gender for ARP under ldl. § 26 — but it is also the field that makes a two-axis breakdown re-identifying in a small unit | Special-category adjacency; needs its own clause |
| 9 | **Lønn** :5207 | lønn per stillingsgruppe (aggregert) | ldl. § 26 ARP | **Aggregation enforced at the boundary, not promised in copy** (:5250) |
| 10 | **BankID / ID-porten** :5215 | navn, signaturtidspunkt | **Reopens Q4.** Changes what a signed duty report legally *is* | Identity provider as sub-processor |
| 11 | **Power BI / Tableau** :5225 | "aggregerte resultater" | **Q43: can this export honour `app.k_for` at all?** A BI tool's value is slicing; a gate that holds for the slices the product ships does not hold for slices the customer invents | Controller/processor boundary moves |
| 12 | **Sykefravær** :5209 | fraværsprosent per enhet | **GDPR art. 9 health data**, joined to psychosocial results, per unit — and a unit can be small enough to identify a person. Art. 9(2)(b) is arguable for HSE duties but is a different basis from the rest of the product | DPIA, not a clause. **Brief 7 recommends not building this as a product feature (Q44)** |
| 13 | **CRM** :5222 | kunde-e-post, sakstype | **R4 — not in this repository.** Catalogue-blocked | — |
| 14–15 | **Public API + webhooks** :2695, :5243–5249 | — | See below | Support and versioning obligation |

**The API.** Key issuance with **hashed storage** (CLAUDE.md invariant 5 — tokens hashed at
rest, constant-time compare), scopes, rotation, rate limiting, a delivery queue with
retries and dead-lettering (`pgmq` and `mail_outbox_*` are the precedent, `…0009`), request
signing, subscriptions, versioning, and public documentation. Five events:
`survey.completed`, `response.received`, `task.created`, `task.overdue`, `report.signed`.
**`threshold.breached` is not built** — 02-conflicts §B2, decision Q19.

**What would have to be true before any of it is built**
1. Q45 — an explicit go-ahead for a program, not a phase.
2. Q18 answered (V2-7), because `task.created` carries whatever a from-findings task
   contains.
3. Q43 answered — if a Power BI export cannot honour `app.k_for`, say so publicly rather
   than shipping a connector that quietly breaks the guarantee.
4. Q44 answered on sykefravær.
5. Q42 answered on what a BankID signature means (Q4 reopened).
6. The expansion catalogue in the repository, for CRM (R4).
7. A DPA text per row, and a customer-facing description of exactly which fields each
   connection reads — the bundle already writes the promise (:5250) and the product must be
   able to keep it.

**Definition of done.** Per connector, not per phase: the connector, its denial tests, its
DPA clause and its documentation ship together. 5a3 grows by every new table and definer
function; the census by every connector's tests. Numbers are set when the program is
scoped, not guessed here.

**Not in it:** anything any earlier phase assumed. No earlier phase assumes anything from
here — that is checked in V2-0 through V2-9 by the absence of any integration dependency,
and where a surface needed data an integration would supply, it is planned against manual
or CSV input with the integration named as a later enhancement (Målgrupper's source field,
sender domain verification, supplier org-number lookup).
