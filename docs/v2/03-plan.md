# 03 — The plan (Round 3)

Phases in dependency order, with 01-briefs §7's scope split applied. This document plans;
it starts nothing.

Per phase: scope with Round-0 classifications, **schema first with the negative tests to be
proven failing before implementation**, **UI second with the `docs/RESPONSIVE.md` pattern
named per screen**, a definition of done carrying the census and 5a3 numbers it must
produce, and what is explicitly **not** in it.

**Carried numbers, which may only move up:** Gate 5a3 **56 of 74** surfaces actively
checked (45 RLS tables + 29 SECURITY DEFINER functions, 18 allowlisted); census
**577 tests across 35 files**. Capture states 159, responsive combinations 160. Per-phase
figures are **targets the phase must produce**, not measurements.

**Constraints, all earned in v1:**

- Database before UI, always.
- Any phase touching an aggregate path carries the two-sided catalogue-derived `k_for`
  assertion — and it is a real test, not a slogan:
  **`tests/invariants/threshold-policy.test.ts:366-386`** enumerates every caller-reachable
  `public` SECURITY DEFINER function reading `responses`/`answers` and fails unless it calls
  `app.k_for`. It fails **by construction** for a new vault reader. `app.k_for` returns
  **0** for organisation surveys, which every caller handles explicitly.
- One verification pass, one fix pass. Findings from the fix pass go to the next phase.
- No phase builds a screen absent from a bundle.
- Anything already built is a **fidelity check** against v2, not a rebuild.
- The apparatus stays frozen. A check the gates cannot make is **logged as a limit**.
- **Any phase introducing a screen with no seedable state extends `scripts/seed-demo.ts`
  and `tests/db/factories.ts` in the same phase.** This is not boilerplate here: the demo
  seed reaches only states the current code creates, which produced two invisible defects in
  the v1 bundle (`docs/v1/05-status.md § 3`), and the general owner of that gap is launch
  readiness, not this plan.
- Tasks-from-findings, live and quiz each get their own phase, negative tests first, the
  Q17 treatment. None folded into a larger phase.
- Integrasjoner, the public API and the webhooks are **one phase, placed last**, not started
  without Tor's go-ahead. No earlier phase may depend on anything it would deliver.
- **No v2 phase lifts `feature_flags.event_stream_panel`.** Q26 defers it, V1-7 was
  descheduled because the panel is R4's second half, and a third bundle drawing the same
  panel changes neither (02-conflicts §A9). **Any phase that appears to need it is depending
  on the deferred integrations phase, which is forbidden** — that is the test, and it is
  cheaper than re-arguing Q26: the dependency is the finding, not the panel.

---

## What is already built, and what that does to the ordering

The v1 bundle closed on 2026-09-07 with seven phases planned, six built, one descheduled
(`docs/v1/06-closeout.md`). **The Q17 UI, the attributed path, recurrence, dashboard
customisation and the use-case library all exist**, so none of them is a v2 phase:

| v2 surface | Built in | Now a |
|---|---|---|
| Innsikt nav, wide toggle, the frame | V1-0 | fidelity check |
| Builder policy panel (Q17 §1/§2), Oversikt compliance card | V1-1 | fidelity check |
| Attributed results, «Svar per virksomhet» panel, CSV export, rounds | V1-2 | fidelity check |
| Recurrence | V1-3 | fidelity check |
| Dashboard layouts, panel registry, presets, «Tilpass» | V1-4 | fidelity check |
| `use_cases`, «Bruksområder» tab, five packs | V1-5 | fidelity check |

That is why V2-0 is a fidelity phase and not a build phase, and why there is no "finish
Q17" phase: Q17 finished. The one staged decision v2 unblocks is **Q38**, and it is small
(00-diff §A.0b).

## Gating summary

| Blocker | Blocks | Source |
|---|---|---|
| The expansion catalogue (R3/R4) | populations, retention-per-population, the CRM half of the final phase | 00-diff §0.1 |
| `HeiTuva Lovpalagt.dc.html` missing | V2-8's splash pass | 00-diff §0.2 |
| **Q52** — does Q18 extend to a third bundle? | **V2-0, and every fidelity question after it** | 02-conflicts §A1 |
| ~~**Q72**~~ — **CONFIRMED**: the trigger is audience group size, not a finding | *unblocked* — V2-5 proceeds | `DECISIONS.md` Q72 |
| **Q78–Q82** — live's counter, cloud, questions, viewport, route | V2-9 entirely | 01-briefs §2(ii), §4 |
| **Q83–Q85** — quiz tokens, assessment semantics, DB refusals | V2-10 entirely | 01-briefs §2(iii), §3 |
| **Q89** — the API/integrations program go-ahead | V2-11 entirely | 01-briefs §7 |

V2-1 through V2-8 are buildable once batches A–I are answered. None of them touches a
program.

---

## V2-0 — Bundle intake and the fidelity pass

**Why first, and why it is not small.** v2 moves the frame under screens signed off against
v1: the hardening pass (42 controls), the header, and a fifth nav item. Every later phase
renders inside that frame.

**Scope**

| Surface | Class | Work |
|---|---|---|
| Q18 extended to three bundles | — | **Q52 CONFIRMED: extend.** `scripts/verify/reference.ts`, CLAUDE.md and VERIFY.md carry the third path; `artifacts/reference-v2/` is added and neither existing directory is overwritten. The per-surface answer is **already written**, once, in `00-diff.md § 0.3` — this phase reads that table, it does not re-derive it |
| Reference re-render | — | One scheduled commit. It turns every existing Gate 3a diff red at once, which is correct |
| Oppgaver as a fifth nav item | PARTIAL (B.1 built as four) | **MOVED TO V2-4 during the V2-0 pass — see the note below.** `components/AppHeader.tsx:27-30`, `AppNav.tsx`'s pathname→key map, `MobileNav.tsx` |
| Header avatar-only + role line | PARTIAL (B.29) | V2:195, V2:199–200 |
| `box-sizing` / `max-width:100%` hardening | PARTIAL (B.27) | **Q53 CONFIRMED: a check, not a rebuild.** 42 controls. **The mechanism is not the point, the property is** — where `docs/RESPONSIVE.md`'s patterns already hold it, record that and change nothing; adopt the bundle's pair only where they do not. **D90 is not reopened.** And per `00-diff.md § 0.3`, this check **moves no screen's governing bundle** |
| Q31's carried chip chrome | PARTIAL | **Q54 CONFIRMED: fix here.** Adopt the v1 bundle's chrome verbatim — 11px/700, `padding:6px 8px`, 2px gap, `--sf` active — and `title` + `aria-label` carrying the language name (`design-reference-v1/…:2320-2322`). The missing accessible name is the part that matters. Count rule already built (`app/s/[token]/page.tsx:49-62`) |
| The categorical-"fem" copy | — | **Q55 CONFIRMED: rewrite.** Person surveys «aldri under virksomhetens terskel, som aldri er lavere enn tre»; **a separate clause** for organisation respondents — attributed, no threshold at all. Corrected **here**: the splash (`messages/no.json:1369`, `:1344`), the pricing fine print (`:1455`), and `legal.privacy3P` (`:1553`). **`legal.dpa4P` (`:1573`) is corrected in the same commit but does NOT go live** — `legal.draftNotice` stays up and only the lawyer's sign-off commit empties it. It is a contract, not copy. `docs/LEGAL_DRAFTS.md` names it as where the review starts |

**Schema:** none. **Negative tests:** none — no new surface.

**UI, pattern named**

| Screen | Pattern |
|---|---|
| App shell / header, all routes | § App shell / header — slide-over below `md`. The fifth item is one more row |
| Header user button (38×38, V2:195) | Global rule 2 — ≥44px hit area via transparent padding; painted size unchanged |
| Every existing screen | Its existing pattern, re-checked. Charts follow the **amended** Q40 rule (44px per interactive mark; the 200px floor is gone) |

**One scope change made during the pass, and why.** The plan had the fifth nav item
rendering **inert** in V2-0, with the screen following in V2-4. I moved the whole item to
V2-4 instead.

Q26 is the precedent that looks like it authorises the inert version — the stream panel is
drawn as unavailable rather than hidden, "so its absence is drawn rather than hidden". But
Q26's panel appears in a **picker**, where an unavailable entry states **its precondition**
(«krever løpende måling, f.eks. CSAT etter sak») and that is information a person choosing
panels can use. A top-level nav item is not a chooser; it is a promise of a destination, and
Oppgaver has no honest precondition to state — only "kommer", which is a roadmap claim, not a
condition. D73's rule is the governing one: a surface must not claim a capability the product
does not have. The plan's own wording («disabled/absent») already allowed this reading.

**Definition of done**
- Reference renders regenerated for all three bundles (Q52), committed in their own commit.
  **Every current Gate 3a diff goes red in that commit** — the accepted, recorded cost of the
  rule, not a regression.
- Gate 3a run across all **159** capture states; every diff resolved or logged with a reason.
- No horizontal scroll at 390px on any route (RESPONSIVE.md global rule 1 — blocker).
- Census **577 / 35** unchanged; 5a3 **56 of 74** unchanged. A fidelity phase that moves
  either number has built something it should not have.

**Not in it:** any new screen, any schema change, the Bruksområder page (V2-8).

---

## V2-1 — Profil og avsender, and Q38's Personvern controls

Both extend locks that exist. This is the phase that closes a staged decision.

**Scope**

| Surface | Class | Work |
|---|---|---|
| Admin → Profil og avsender | NOT BUILT (B.18) | V2:2310–2404. The lock exists: `brandLocked` V2:4830 mirrors `policy.locked \|\| policy.legal`, which is `app.guard_survey_policy` + `app.apply_pack_policy` (`M:0032`, `M:0034`) |
| Sender domains with DNS state, sender profiles, logo slots, accent/type | NOT BUILT | V2:2353–2360 and neighbours |
| Personvern default-threshold picker (**Q38**) | NOT BUILT | Chips V2:5583 `[3,5,8,10]`, V2:5587 `[5,8,10,12]`, note V2:5591, markup V2:2737–2747 |
| `redaktor_may_lower` switch | — | **Not drawn in v2.** Per 02-conflicts §A2 the column stays and the switch is not built; the note is parameterised on the flag rather than asserting the flag is always false |
| Per-topic sensitive threshold | — | **Q58.** If it lands as recommended it is a seed change to `template_packs.policy`, no DDL |

**Schema first.** No new tables. Sender domains and profiles are new rows; the threshold
picker writes `organizations.default_k_threshold`, which exists (`M:0034`) and has had **no
writer** since D87 recorded that an action with no caller is a lie in the codebase.

**Negative tests, proven failing before implementation**
1. A `redaktør` writes `organizations.default_k_threshold` → refused (administrator action,
   audited).
2. Setting it below **3** → refused by Q17's floor; above **10** → refused by Q36's CHECK
   (`M:0036`). Both boundaries, both sides.
3. A `redaktør` lowers a survey below the organisation minimum while `redaktor_may_lower`
   is false → refused by `app.guard_survey_policy`, not by the form.
4. Changing a threshold after the first response → refused (the lock is a trigger).
5. A statutory pack's locked policy overridden → refused.
6. Cross-org: org A's administrator writes org B's default → refused.
7. A `redaktør` changes the sender on a survey whose policy is locked → refused in the
   database, not only by `senderLocked` (V2:4935).
8. Two-sided `k_for` re-run at k=3, k=5, k=8 — and the k=0 organisation case.

**Standing question 1 applies to tests 1, 3 and 6** (`tests/db/clients.ts`): what ELSE could
refuse this before the check under test? V1-1 shipped a guard test that RLS had already
filtered, and it would have passed with the guard deleted. Arrange each fixture so only the
rule under test can produce the result.

**UI, pattern named**

| Screen | Pattern |
|---|---|
| Admin tab rail, now nine with `sprak` | § Tab rails — wrap; `AdminTabs.tsx` already does |
| Sender domains / profiles | § Data tables — narrow rows keep the row; status is consequential and stays visible |
| Logo slots, accent swatches | The bundle's own `auto-fit` grids |
| Personvern threshold chips | § Tab rails and chip groups — wrap; chips keep exact dimensions |

**Definition of done**
- All eight negative tests pass **as denials**, distinguished from empty result sets (Gate 2b).
- Mutation check: break `app.k_for` to return 1, show a test failing, revert.
- Census target **≥595 / 36**. 5a3 **≥57 of 74** (sender tables enumerated; any allowlist
  entry carries a reason).
- Demo seed gains an organisation with a non-default threshold and a locked statutory survey.

**Not in it:** the redaktør switch, Målgrupper, anything integration-shaped (sender **domain
verification** is manual/DNS-record display only — no provider API).

---

## V2-2 — Suppression and member state

> **WHAT ACTUALLY SHIPPED AS V2-2 (2026-09-07), recorded here so the plan does not
> misdescribe the repository.** Tor folded «Profil og avsender»'s unblocked half into this
> phase (V2-1's §4 recommendation), and three threshold decisions — **Q58, Q90, Q91** —
> arrived mid-phase and were taken here.
>
> **THE SCOPE BELOW — SUPPRESSION AND MEMBER STATE — WAS NOT DELIVERED, AND IT MOVES INTO
> V2-3 rather than drifting** (Tor, 2026-09-08: a GDPR art. 21 obligation belongs ahead of a
> screen, not behind one). The six negative tests stand exactly as written; they run in V2-3
> beside Målgrupper's seven, because both decide the same thing — which addresses
> `send_round` may resolve into invitations. **Batch C (Q60, Q61) therefore goes with Batch D.**
> See `docs/v2/reports/V2-2.md § 5`.

Small, legally required (GDPR art. 21), overdue.

**Scope**

| Surface | Class | Work |
|---|---|---|
| Suppression list | NOT BUILT (B.16) | `SUPPRESSED` V2:4325; blocks import V2:4971, badges preview V2:4982, filters recipients V2:4993; reasons V2:5014 |
| Member statuses Aktiv/Bounce/Reservert/Ny | PARTIAL (B.17) | V2:4327–4335 vs `org_members.status` `check (… 'invited','active','inactive')` (`M:0002:43`) |

**Schema first.** `suppressions(org_id, email, reason, source, created_by, created_at)`,
unique on `(org_id, lower(email))`, RLS + policies in the same migration. Status mapping per
**Q61** — derive rather than duplicate.

**Negative tests, proven failing before implementation**
1. `send_round` addresses a suppressed email → **the invitation row is not created**, and
   the refusal is the database's.
2. **Re-importing the same CSV re-adds a suppressed address → refused.** This is the failure
   mode that makes suppression theatre.
3. A `leser` writes `suppressions` → refused.
4. Cross-org: org A suppresses into org B → refused.
5. A suppressed address that is also a group member is excluded from a group-targeted send.
6. Removing a suppression is an audited administrator action (`audit_events`).

**Standing question 4 applies** (`tests/db/clients.ts`): what does the test leave behind
when it fails to fail? A suppression fixture that survives into the next test silently
changes another phase's recipient counts. `verify:roundtrip` was fixed in V1-6 for exactly
this.

**UI**

| Screen | Pattern |
|---|---|
| Brukere (statuses) | § Data tables → **narrow rows keep the row** — RESPONSIVE.md names Brukere explicitly. Status is consequential and stays visible |
| Suppression list | § Data tables → wide rows become cards |
| Send preview badges | § Send screen |

**Definition of done**
- Six negative tests pass as denials; test 2 is a blocker.
- Census target **≥608 / 37**. 5a3 **≥58 of 74**.
- Demo seed carries one suppressed address and one bounced member.

**Not in it:** populations, per-population suppression scope (**Q60** may defer it).

---

## V2-3 — Målgrupper, and suppression

**Groups and segments, plus the suppression list moved down from V2-2** (Tor, 2026-09-08).
Populations are catalogue-blocked and carry retention (02-conflicts §B8).

**WHY THE TWO ARE ONE PHASE.** They are the same code path seen twice. A suppression is an
address `send_round` must not resolve into an invitation; a segment is a rule that decides
which addresses it resolves at all. Building them apart means writing and testing the
recipient-resolution path twice, and the two hardest tests in each — the segment freeze
(Q64) and the re-import case — both hang off exactly that path.

**This makes V2-3 the largest phase in the series: thirteen negative tests, not seven.**

**IT IS NOT SPLIT, AND THE SIGNAL TO SPLIT IS NOT THE COUNT** (Tor, 2026-09-08): thirteen
negative tests in a phase whose subject is an art. 21 obligation is proportionate, and a split
would put the obligation behind a screen. **If the phase does not close in one verification
pass and one fix pass, THAT is the signal** — the two-pass rule is the size limit, not the
test count. Should it fire, the cut is Målgrupper then suppression, with suppression still
ahead of V2-4.

**Batch C (Q60, Q61) is sent with Batch D**, since suppression scope and the member-status
vocabulary are now decisions this phase needs.

**Scope**

| Surface | Class | Work |
|---|---|---|
| Grupper | PARTIAL (B.14) | `mgGroups` V2:5045; `groups` (`M:0002:29`) gains `kind`, `source`, `synced_at` |
| Segmenter | NOT BUILT | `mgSegments` V2:5049, rules V2:4320–4322 |
| Per-round freeze | NOT BUILT | V2:5033 — "312 treff · frosset for Ukespuls 36" |
| Audience audit log | NOT BUILT | `auditRows` V2:5031–5036 |
| Import relocation (**Q62**) | PARTIAL (B.28) | Send keeps the one-off list V2:3020 + "Lagre som målgruppe" V2:3037; sync stubs move here V2:3040, still behind `feature_flags`, still "kommer" |
| `hasThresholdWarn` | NOT BUILT (B.25) | V2:4988 — **a fourth caller of `lib/questions/policy-warnings.ts`, not a fourth copy**, taking k from `app.k_for`. See the note below |
| Populasjoner | NOT BUILT (B.15) | **Not in this phase.** The section renders the design's unavailable state — never a fabricated count (CLAUDE.md) |
| Medlemmer | NOT BUILT ▲ | V2:2570–2608. A per-member list with a search box and «Synkroniser nå». **Unlisted until 2026-09-08** |
| Reservasjonsliste | NOT BUILT ▲ | The suppression card, V2:2641–2657 — the surface the carried V2-2 scope builds |
| Behandlingsgrunnlag | NOT BUILT ▲ | V2:2610–2621, data :5016–5021. **Lawful basis per population, with a count of people.** Population-scoped, so it follows Q63 and renders the unavailable treatment |

**The section draws NINE cards; this table had seven rows.** Two rows (Import relocation,
`hasThresholdWarn`) sit inside one card, so seven rows never covered nine cards even before
the three additions above.

**Schema first.** `suppressions(org_id, email, reason, source, created_by, created_at)`,
unique on `(org_id, lower(email))`, RLS and policies in the same migration. Status mapping per
**Q61** — derive rather than duplicate. Then `groups` gains `kind ('gruppe'|'segment')`,
`source`, `synced_at`, and for segments a **structured predicate** — jsonb `{field, op, value}` clauses over an allowlisted
field set, never free text evaluated in SQL (**Q65**). A
`round_audience_members(round_id, member_id, frozen_at)` materialisation. An
`audience_events` log.

**Negative tests, proven failing before implementation.** Seven from Målgrupper, then six
carried down from V2-2's suppression scope — thirteen, and the two blockers are #3 and #9.

1. A segment rule naming a field outside the allowlist → refused at write time.
2. A rule containing SQL → stored as data and never executed; assert no `execute` of user
   text exists in the codebase.
3. **The freeze:** send a round, change the segment's membership, re-read the round's
   denominator and participation rate → **unchanged**. The phase's most important test and
   the one nothing errors on.
4. A `leser` writes an audience or a rule → refused.
5. Cross-org: org A reads org B's audiences → refused.
6. `hasThresholdWarn` fires at `app.k_for(survey) − 1` and not at `k`, tested at k=3 and
   k=8, and **does not fire at all** for an organisation survey (`k_for` = 0).
7. The mixed-population send guard is **not** built here and nothing pretends it is: a group
   with a null population cannot satisfy it.

**Carried from V2-2 (GDPR art. 21), same recipient-resolution path:**

8. `send_round` addresses a suppressed email → **the invitation row is not created**, and the
   refusal is the database's.
9. **Re-importing the same CSV re-adds a suppressed address → refused. BLOCKER.** This is the
   failure mode that makes suppression theatre.
10. A `leser` writes `suppressions` → refused.
11. Cross-org: org A suppresses into org B → refused.
12. A suppressed address that is also a group member is excluded from a group-targeted send —
    **and this is the test that only exists because the two halves are one phase**: it spans a
    segment's membership and the suppression list at once.
13. Removing a suppression is an audited administrator action (`audit_events`).

**Standing question 3 applies to test 6**: assert over the SET of sites that can violate the
property, not the ones you picked. `policyWarnings` will then have four callers, and the
test must bind all four — the pattern `tests/unit/dashboard-panels.test.ts` established for
the panel vocabulary.

**Recorded because the pattern is now being caught earlier, which is the point.**
`hasThresholdWarn` is the **fifth** instance of one-function-many-callers in this project and
**the first caught before the second copy existed**. The previous four were removed after the
fact — V1-3's interval CASE, V1-4's panel vocabulary, V1-5's use-case mapping, V1-6's
pack-question builder, all named in `lib/questions/pack.ts` — and
`docs/v1/06-closeout.md § 1` calls the shape "the defect shape of this codebase". Here the
copy is still hypothetical: the bundle draws `g.count > 0 && g.count < 5` inline (V2:4988),
and the phase's job is to route it to the existing function instead of transcribing it.
**And the answer to the v2 instruction's question: `audGroups` is not the data source D94 was
waiting for.** D94 closed in V1-2 (`M:0039`); `surveys.target` has had a writer since, and
`policyWarnings` already has three callers. v2's warning is a different comparison — per
audience group, at pick time — so it is new work for an existing function, not a new rule.

**UI**

| Screen | Pattern |
|---|---|
| Grupper | The bundle's `auto-fill,minmax(280px,1fr)` (V2:2432) |
| Segmenter | § Data tables → wide rows become cards; the monospace rule wraps, never truncated |
| Populasjoner | The design's unavailable/empty treatment |
| ~~Builder breach warning (V2:2561)~~ **Målgrupper import warning (V2:2561)** | **CORRECTED 2026-09-08 — V2:2561 IS NOT IN THE BUILDER.** Its `sc-if` chain is `isAdmin` (2214–2821) → `adminMalgrupper` (2405–2658) → `mgImportOpen` (2510–2567); the Builder's `isBuild` block spans 382–941 and closes 1620 lines earlier. So the prescribed three-pane/sheet treatment solved a problem this screen does not have: Målgrupper is a single-column admin surface with no right pane and no `xl` sheet. The warning sits inside the import panel, on the base layer already, and needs no responsive treatment beyond § Cards |
| Send audience picker warning (V2:3072–3074) | **The fourth rendered site of the same rule**, missed by `00-diff.md § B.27` and `02-conflicts.md § A4`, both of which say «three». Data at V2:6543–6544 (`warn`, `hasWarn`). It is a chip inside an existing picker row — § Data tables, narrow rows keep the row |

**Definition of done**
- Thirteen negative tests pass; tests 3 and 9 are blockers.
- Census target **≥660 / 40**. 5a3 **≥60 of 77**.
  **RESTATED 2026-09-08, because the committed numbers gated nothing.** «≥630 / 38» was
  already satisfied before the phase opened — the manifest reads **636 / 38** — and «≥61 of
  74» carried a denominator that moved to **75** in V2-2 and reads **56 of 75** today. A
  target the tree already passes is not a target. The new numbers assume the thirteen negative
  tests plus the suppression suite, and the 5a3 denominator assumes `suppressions` and one
  audience table; **restate them again if Q92 lands on option (a)**, which adds no membership
  table.
  *The 5a3 ladder in the phases below still reads «of 74» and is stale by the same one. It is
  left alone rather than swept: each phase restates its own target when it opens, and editing
  eight future numbers on one measurement is how a plan starts describing a repository nobody
  has looked at.*
  **`docs/DEVIATIONS.md` D110, instance 3** — and the rule it carries applies here directly:
  a target is restated by running `npm run verify:policy` and summing
  `tests/expected-counts.json`, and **the command goes beside the number**:
  `npm run verify:policy | grep -c '^  ok '` and
  `python3 -c "import json;d=json.load(open('tests/expected-counts.json'));print(len(d),sum(d.values()))"`.
- Demo seed gains four groups, four segments, **one segment whose membership changes after a
  send**, one group below k, one suppressed address, one bounced member, and — carried from
  V2-2 — **one SENT survey at `k_threshold` 2**, so Q91's «two» tier is photographed on the
  Results screen instead of only proven structurally. It cannot be made after the fact: the
  policy freezes at send.

**Not in it:** populations, the mixed-population send guard (**Q67**, lands with populations),
retention per population (**Q66**), any sync that actually syncs.

---

## V2-4 — Oppgaver

The statutory task register, **without the from-findings source** (V2-5). The split is
deliberate: the valuable part does not wait on Q72.

**Scope**

| Surface | Class | Work |
|---|---|---|
| Oppgaver screen | NOT BUILT (B.10) | V2:2152–2214; filters V2:5164, stats V2:5168–5177, rows V2:5178 |
| Six-step lifecycle | NOT BUILT | V2:5181 |
| The close guard | NOT BUILT | V2:5197 |
| `loop_actions` migration | — | Supersedes (**Q68**); `text → title`, `done → Lukket`; retire `oversikt/LoopActionForm.tsx` |
| Teams notification | — | **Not built** — integration-blocked. Copy at V2:5198 and V2:2206 adjusted (**Q71**). A claim the product cannot keep is not shipped |

**Schema first.** `tasks(id, org_id, title, kind, law_ref, source_kind, source_ref,
owner_member_id, due_at, status, created_at)` with a six-value status enum;
`task_effect_assessments(task_id, round_id, assessed_by, assessed_at, note)`. `law_ref`
references `duty_definitions` where a statutory duty applies (**Q70**) — Q35's precedent:
data on the registry, never a string parsed at read time.

**The close guard is a trigger and CLAUDE.md's rule bites.** Write it as *"nobody may close
without an assessment"*, comparing the columns that carry meaning — **not** "reject any
UPDATE". An `ON DELETE SET NULL` on `owner_member_id` is an UPDATE the database issues on
your behalf; a blanket rejection produces a member row that cannot be deleted, discovered far
from the trigger. Four rediscoveries: D50, D51, D57, duty-archive. Decide the cascade when
the trigger is written (**Q69**).

**Negative tests, proven failing before implementation**
1. `status → 'lukket'` with no assessment row → refused by the trigger.
2. The same through the server action → refused, and the error **surfaces to the user**
   rather than being swallowed (Gate 4).
3. Deleting an `org_members` row that owns a task → the FK nulls `owner_member_id` and the
   trigger **allows it**. The CLAUDE.md case, tested explicitly.
4. Skipping a lifecycle step (Foreslått → Gjennomført) → refused.
5. Moving backwards from Lukket → decide and test, either way.
6. A `leser` advances a task → refused; a `redaktør` who owns it → allowed.
7. Cross-org: org A advances org B's task → refused.
8. `source_ref` pointing at another org's survey → refused by the FK.

**Standing question 1 applies to test 6**, and **2b** to test 7: which ROWS can my roles
reach, not just which roles read? V1-2 hit that twice.

**UI**

| Screen | Pattern |
|---|---|
| Filter pills | § Tab rails — wrap; row gap ≥ the design step so 44px areas do not overlap |
| Stat tiles | The bundle's `auto-fit,minmax(180px,1fr)` (V2:2166) |
| Task cards | Already cards. `stepChips` (six, V2:2197) wrap below `md` |
| Nav | The fifth item is ADDED here, with the screen it points to (moved from V2-0) |

**Definition of done**
- Eight negative tests pass; 1 and 3 are blockers.
- `loop_actions` migrated; the Oversikt surface removed, not left in parallel.
- Census target **≥655 / 39**. 5a3 **≥64 of 74**.
- Demo seed carries a task at each of the six steps, one late, one awaiting effect
  assessment — the screen has no seedable state otherwise.

**Not in it:** the blind-spot task generator (V2-5), Teams (Q71), the webhook (**Q73: not
built**). The card's copy for a generated task is confirmed under Q72 and is rendered by
V2-5, not here.

---

## V2-5 — Tasks from a survey's blind spots

Its own phase, negative tests first, the Q17 treatment. **Q72 and Q73 are CONFIRMED**, so
this phase is unblocked — but its shape changed with them, and the phase is renamed because
the old name described the trigger that was rejected.

**What Q72 decided, and why the trigger and not the wording.** The drafted option — a task
saying «undersøkelsesplikt utløst for denne undersøkelsen», naming no group — **still leaked
by elimination**: groups A(12), B(9), C(4), with A and B visible and healthy, tells the
reader C scored badly. The predicate was still over a gated value, merely wrapped. So the
condition that fires a task is **not** «a finding below threshold» but:

> **this survey has an audience group whose SIZE is below `app.k_for(survey)`** — a group
> that will never receive its own results even at a 100 % response rate.

That is a **count of people**, which Q28 expressly permits, and it is a property of the
**audience**, not of the responses. The distinction is the whole decision: a trigger reading
a group's *response count* would reintroduce the leak.

Copy, confirmed: «Denne undersøkelsen har grupper som ikke får egne resultater. Plikten til å
kartlegge og følge opp gjelder likevel.»

**Scope**

| Surface | Class | Work |
|---|---|---|
| The generator | NOT BUILT | Fires on audience group size vs `app.k_for(survey)`. Its **inputs are group sizes and the policy value, and nothing else** |
| The task's payload | NOT BUILT | No group name, no question, no score, no survey-level derived value |
| Oppgaver card copy | BUILT in V2-4 | The card renders the confirmed sentence |
| Bundle copy V2:4239, V2:4270 | — | **Becomes false on this decision's authority and changes.** D103 is the precedent — the first time a v1 phase changed bundle copy because a decision made the drawn sentence untrue on its own screen. **Logged in `docs/DEVIATIONS.md` when this phase ships it** |

**Depends on V2-3**, which builds the audience with per-group sizes. Nothing else.

**Schema first.** A `task_sources` row referencing the **survey and the duty** — no group, no
question, no score — and a generator that cannot construct one.

**Negative tests, proven failing before implementation — these are the phase**

1. The produced row contains **no group name**, **no question text**, **no score**, and **no
   survey-level derived value**, in `title`, `source_ref`, `law_ref` or any rendered string.
   Asserted by reading the row and failing on each appearing in it.
2. **A task is produced for a survey with a sub-threshold group REGARDLESS of that group's
   results** — including when every group scores well. This is the test that forces the
   trigger to read audience size rather than responses, and it is the one that would have
   caught the drafted option.
3. **No task is produced by any path that reads a gated value.**

**Test 3 is the phase, and its FORM matters more than its existence.** Written as "the
generator does not call `aggregate_results`" it is a *symptom* test — it would miss a
generator reading `responses` directly, or calling a new RPC added later. V1-6's first rule:
**the derivation must describe the PROPERTY, not a symptom of it** — that phase's
`next_run_at` sweep required `send_at_local` in the function body, so it swept only the
functions that already knew about the column and missed the two that ignored it. So test 3 is
written as a **catalogue-style assertion**, in the shape
`tests/invariants/threshold-policy.test.ts:366-386` already uses: enumerate the generator's
reachable call graph and fail if anything in it reads `responses`/`answers`. That fails by
construction for a future path nobody thought of, which is the only version worth having.

**Standing question 3 governs test 1** (`tests/db/clients.ts`): assert over the SET — every
field that reaches a reader — not the ones you picked. And its positive form: "the body has no
group name" is satisfied by a 404, by a login form, and by the route not existing, so guard
test 1 on the task **existing**.

**Enumerability, checked rather than assumed.** `taskFilters`' `lov` entry (V2:5164) now
enumerates surveys with **small groups**, not surveys with bad findings — the channel closes
rather than narrows. Assert it: a reader filtering by `lov` cannot distinguish a survey whose
small group scored badly from one whose small group scored well.

**UI.** Oppgaver, built in V2-4. What changes is what the card says.

**Definition of done**
- Tests 1, 2 and 3 are blockers.
- Census target **≥670 / 39**. 5a3 unchanged or higher.
- The `docs/DEVIATIONS.md` entry for the changed bundle copy exists, citing D103 as precedent.
- **Logged as a limit:** no gate here can see what a free-text string discloses to a reader who
  already knows the team structure. The control is that the string is not *constructed* from a
  gated value; test 3 asserts the construction, not the inference.

**Not in it:** `threshold.breached` (**Q73: not built**), Teams notification (V2-4's Q71).

**Accepted cost, recorded so it is not later read as a defect:** the task appears more often
than a findings-triggered one would, including when nothing is wrong. That is tolerable
noise — it points at a real blind spot every time, and an employer cannot know a
sub-threshold group is fine either.

## V2-6 — Help articles and contact

**Scope.** Twelve articles (V2:4177+), `helpContact` / `contactSent` (V2:5159),
`statusRows` (V2:5161). **`helpForum` is not built** (02-conflicts §B3, **Q74**).

**Schema first.** `help_articles` as a registry with a `jsonb` body plus translations, or
`ui_messages` — **Q75**. Whichever, it lands in 5a3's `PUBLIC_BY_DESIGN` allowlist **with a
stated reason**; an entry without one is a finding.

**Negative tests**
1. A `leser` or an outsider **writes** `help_articles` → refused.
2. The table appears in 5a3's catalogue-derived list and is protected or allowlisted with a
   reason.
3. `contactSent` does not echo respondent free text into a log or an error payload
   (CLAUDE.md invariant 7).

**UI:** § Data tables for the list (wide rows → cards); prose body.

**Definition of done.** i18n complete `no` + `en` for all twelve. Census target
**≥678 / 40**. 5a3 **≥62 of 74** denominator +1.

**Not in it:** the forum.

---

## V2-7 — Test mode

Small, and it protects the single-write-path invariant.

**Scope.** `testMode` V2:6631, entered V2:6637, left V2:6638, banner V2:3323 and V2:3558.

**Schema first.** A dry-run path through `submit_response` (**Q76**) that runs every
validation and returns without inserting.

**Negative tests, proven failing before implementation**
1. A test submission does **not** create a `responses` row — asserted on the count.
2. It does **not** set `responded_at` on the invitation.
3. It does **not** consume or invalidate the token — a real respondent can still answer.
4. It is not reachable by `anon` without a valid token (test mode is not a bypass).
5. The anonymity CHECK is unchanged by this phase — asserted by diffing the constraint.

**UI:** the Send/preview banner; no new pattern.

**Definition of done.** Five negative tests pass; 1–3 are blockers. Census target
**≥686 / 40**. 5a3 unchanged (no new surface — a modified RPC is not a new one).

---

## V2-8 — Bruksområder, and the splash fidelity pass

**No longer blocked. Q56 CONFIRMED: strike the links.** Tor is requesting the export
separately; V2-8 proceeds without it.

**Scope.** The Bruksområder page (NOT BUILT, B.24) — nine survey types, `UC` :184,
`ORDER` :290, all nine already seeded as packs. The splash's growth 696 → 1051 (PARTIAL,
B.26), whose two new states (`r.isLegal` V2:217, `r.hasPage` V2:226) drive links at
`HeiTuva Splash.dc.html:1027` and `:1029` **to the page that does not exist**. Per Q56 the
ranked list ships **without the details link** — `r.hasPage` is never true, so the `sc-if`
never renders — and the deviation is logged. **The page is not built and the link is not
redirected to Bruksområder**: both invent content for a page nobody drew, and a redirect is
worse than a gap because it silently answers a link with something else. Q26's stream panel
is the precedent — the absence is left visible.

**Schema:** none. **Negative tests:** none new; re-run the public-surface denials
(`request_demo`, the anon paths) unchanged.

**UI.** Public and respondent-facing surfaces are **mobile-first pixel-perfect** at
380–420px, not RESPONSIVE.md.

**Definition of done**
- No link on any public page points at a page that does not exist.
- No public page claims a capability the product does not have (D73). The categorical-five
  copy was already corrected in V2-0 (Q55); this phase must not reinstate it from the v2
  splash, which still draws `n ≥ 5` at `HeiTuva Splash.dc.html:375`.
- Census and 5a3 unchanged.

---

## V2-9 — Live mode *(program-scale; own phase; blocked)*

**Blocked on Q78–Q82.** 01-briefs §4 is explicit: a projected surface is a viewport class
`docs/RESPONSIVE.md` has never covered, and CLAUDE.md relaxes "do not invent" **only** to
that file's patterns. **This phase cannot start with RESPONSIVE.md as it is.**

**Scope if it proceeds.** The stage V2:1829–1868, ten toggles V2:6136–6145, reveal V2:1838,
QR V2:1852, word cloud with its moderation queue V2:1874 / V2:6180, priority exercise
V2:6181, closing screen V2:6185. **Without** `audienceQuestions` (**Q80**; defaults off at
V2:4338 and stays off).

**Schema first.** `live_sessions`, a moderation queue for projected free text, and whatever
Q78 requires of the counter.

**Negative tests, proven failing before implementation**
1. The projected DOM shows **no derived numbers** at `k−1` and shows them at `k`, at k=3 and k=8.
2. **The counter**, per Q78: submit responses one at a time and read the projected DOM at
   each n. This test stands in for a gate that cannot exist.
3. Unmoderated free text never reaches the projected surface.
4. The projected read path obeys the **same** rule as `get_quotes` (`M:0009:176-177` — a
   `leser` with a group filter is refused), not a second answer.
5. A word appearing once does not reach the cloud — its own minimum-occurrence floor, which
   is **not** k.
6. Cross-org: org A joins org B's session → refused.
7. The two-sided catalogue assertion: `live_session_state` reads the vault, so
   `tests/invariants/threshold-policy.test.ts:366-386` fails until it calls `app.k_for`.

**UI.** **Every pattern is a stop-and-ask** until Q81/Q82. Uncovered: the projected viewport;
the dark surface with no dark tokens; the QR's physical size; the presenter's second device;
audience text at display size.

**Definition of done**
- **Logged as a limit up front:** live has **no reference comparison** in Gate 3a — no
  render exists in `artifacts/reference/` or `artifacts/reference-v1/` and
  `playwright.config.ts` has no projector viewport. Gate 3a degrades to "captured and looked
  at", and the phase report says so rather than reporting a comparison.
- Census target **≥705 / 41**. 5a3 **≥67 of 74+**.
- Demo seed produces a live session at n = k−1 and n = k.

**Not in it:** quiz, audience questions.

---

## V2-10 — Quiz *(own phase; blocked)*

**Blocked on Q83–Q85.**

**Scope if it proceeds.** Quiz mode V2:6131, four toggles V2:6149–6153, pass mark V2:6159,
attempts V2:6161, `answerIndex`/`pointsAward` V2:6507, team leaderboard V2:6186, respondent
tiles V2:4768.

**Schema first. Own tables** — 02-conflicts §B7 is settled.
`quiz_attempts(survey_id, member_id, attempt_no, score, passed, taken_at)`,
`survey_questions.answer_index`/`points`, certificate issuance.

**Negative tests, proven failing before implementation**
1. The anonymity CHECK on `responses` is **unchanged** — asserted by diffing the constraint,
   not by inspection.
2. **No join exists** from `quiz_attempts` to `responses` — assert the absence of the FK and
   of any query joining them.
3. Quiz enabled on an anonymous survey → refused **by the database**, not only by the UI's
   early return (V2:6156–6158). **Q85**.
4. Quiz enabled on a statutory pack → refused by the database (V2:6122 is UI-only today).
5. A `leser` reads an individual attempt → refused.
6. The leaderboard returns **team** aggregates only and refuses individual rows even to an
   administrator through that RPC.
7. Retention per **Q84** applied and tested — `app.apply_retention` has one path today.

**Standing question 1 applies to tests 3 and 4**: arrange the fixture so only the guard under
test can refuse, and where two layers matter write two tests.

**UI**

| Screen | Pattern |
|---|---|
| Quiz settings in the builder | § Three-pane Builder — sheet below `xl` |
| Quiz tiles on `/s/[token]` | **Respondent surface — mobile-first pixel-perfect** |
| Leaderboard | § Data tables → narrow rows keep the row |

Contrast of `#FFFDF6` on each tile colour is **measured** and recorded.

**Definition of done.** Tests 1, 2 and 3 are blockers. Census target **≥722 / 42**.
5a3 **≥69 of 74+**.

---

## V2-11 — FINAL PHASE: Integrasjoner, the public API and the webhooks

**One phase, placed last. Not started without Tor's go-ahead (Q89).** Written as a phase,
not a placeholder — but its first output is a decision set and a risk register.

**Why it is one phase and last**, stated so the plan does not re-derive it: fifteen external
systems is larger than any phase this project has run and is a program; several bring data
categories this product has never held — sykefravær (health, GDPR art. 9), HR's `kjønn`,
`lønn` — each needing its own lawful basis and DPA text; BankID revisits Q4's deferred
identity decision; the CRM row is **R4**, which is not in this repository; and the webhooks
carry `threshold.breached`, which cannot be designed before **Q72**, a decision belonging to
V2-5, on whose outcome this phase depends.

**Groundwork that already exists on main and should be read before anything is scoped:**
`docs/INTEGRATION_ARCHITECTURE.md` and `docs/SLACK_INTEGRATION.md`.

**Order, what each reads, its lawful-basis question, its DPA consequence**

| # | System | Reads | Lawful-basis question | DPA consequence |
|---|---|---|---|---|
| 1 | **Entra ID (SCIM)** V2:5204 | navn, e-post, gruppe, stilling, sluttdato | Already the employment basis; Entra SSO shipped Phase 6e (`M:0029`, D82) | Sub-processor in scope |
| 2 | **Google Workspace** V2:5205 | navn, e-post, organisasjonsenhet | As above | US processing vs Q6's EU/EØS promise |
| 3 | **Brønnøysund/Proff** V2:5220 | orgnr, bransje, land | Public register, no personal data | Minimal |
| 4 | **Teams / Slack** V2:5212–5213 | varsler, oppgavekort | Notification only; **no result content may leave** | Content-scoping clause |
| 5 | **Kalender** V2:5214 | møtetid, frist, eier | Ordinary | Minimal |
| 6 | **Sak/arkiv** V2:5216 | rapport-PDF, metadata | Archiving obligation | Interacts with `app.apply_retention` |
| 7 | **Sanksjonslister** V2:5221 | treffliste | Åpenhetsloven due diligence | Third-country flows |
| 8 | **HR-system** V2:5206 | stillingsgruppe, ansiennitet, stillingsprosent, **kjønn** | Gender for ARP under ldl. § 26 — and the field that makes a two-axis breakdown re-identifying in a small unit | Special-category adjacency |
| 9 | **Lønn** V2:5207 | lønn per stillingsgruppe (aggregert) | ldl. § 26 ARP | **Aggregation enforced at the boundary, not promised in copy** (V2:5250) |
| 10 | **BankID / ID-porten** V2:5215 | navn, signaturtidspunkt | **Reopens Q4** (**Q86**). Changes what a signed duty report legally *is* | IdP as sub-processor |
| 11 | **Power BI / Tableau** V2:5225 | "aggregerte resultater" | **Q87: can it honour `app.k_for` at all?** | Controller/processor boundary moves |
| 12 | **Sykefravær** V2:5209 | fraværsprosent per enhet | **GDPR art. 9**, joined to psychosocial results per unit (**Q88**) | DPIA, not a clause |
| 13 | **CRM** V2:5222 | kunde-e-post, sakstype | **R4 — not in this repository** | — |

**The API.** Hashed key storage (CLAUDE.md invariant 5), scopes, rotation, rate limiting, a
delivery queue with retries and dead-lettering (`pgmq` + `mail_outbox_*`, `M:0009`, is the
precedent), request signing, subscriptions, versioning, documentation. Five events:
`survey.completed`, `response.received`, `task.created`, `task.overdue`, `report.signed`.
**`threshold.breached` is not built** (**Q73**).

**What must be true before any of it starts**
1. **Q89** — an explicit go-ahead for a program, not a phase.
2. **Q72** answered (V2-5) — `task.created` carries whatever a from-findings task contains.
3. **Q87** answered — if a BI export cannot honour `app.k_for`, say so publicly rather than
   shipping a connector that quietly breaks the guarantee.
4. **Q88** and **Q86** answered.
5. The expansion catalogue in the repository, for CRM (R4).
6. A DPA text per row and a customer-facing description of exactly which fields each
   connection reads — the bundle already writes the promise (V2:5250).

**Definition of done.** Per connector, not per phase: the connector, its denial tests, its
DPA clause and its documentation ship together. 5a3 and the census grow per connector;
numbers are set when the program is scoped, not guessed here.

**Not in it:** anything an earlier phase assumed. No earlier phase assumes anything from
here — checked in V2-0 … V2-8 by the absence of any integration dependency, with manual or
CSV input planned wherever an integration would otherwise supply data.

---

## Standing limitations carried, not solved

- **Every gate reads local; nothing has ever read prod** (`docs/v1/06-closeout.md § 3`). The
  finding of the v1 close-out, with no owner. Not this bundle's to solve; recorded so no v2
  phase reports green as though it said something about `heituva-prod`.
- **The demo seed reaches only states the current code creates** (`docs/v1/05-status.md § 3`).
  Owned by launch readiness. Each v2 phase extends the seed itself rather than relying on
  that owner.
- **5a3 proves a denial test exists, not that its scope is right** (`VERIFY.md`). Every new
  table below inherits it.
- **A CHECK constraint and an `app`-schema function are neither an RLS table nor a public
  SECURITY DEFINER function**, so neither is a 5a3 surface.
