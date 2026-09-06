# v1 bundle — decisions for DECISIONS.md (Q18 onward)

Every question the second handoff raises that the register must carry.
Each is written so it can be confirmed or overruled in one line. "DEFAULT" is
the recommended answer the plan in `03-plan.md` assumes; overruling one changes
the plan where the phase text says "per Qnn". Anything the bundle implies but
never states is here as a decision, not an assumption.

**Status.** Q18, Q28, Q31, Q32, Q36, Q37 and Q47 are **CONFIRMED by Tor**
(2026-09-06) and are in force. The rest are staged: they are confirmed in batches tied to the phase
where each bites, because a decision taken out of context is taken badly. The
batch order is V1-2 (Q30, Q34, Q35, Q43) → V1-3 (Q19–Q23) →
V1-4 (Q25, Q26, Q27, Q29, Q33, Q42, Q46) → V1-5 (Q24, Q44, Q45) → V1-7 (Q41); Q38, Q39 and Q40 belong to no phase and are confirmed when their
subject arises. Nine of the twenty-nine touch the security core: six on the
k-gate or an aggregate path (Q26, Q28, Q30, Q36, Q41, Q42) and three on RLS or
role semantics (Q23, Q25, Q43).

| # | Question | DEFAULT (confirm / overrule) | Where it bites |
|---|---|---|---|
| Q18 | Design source of truth | **CONFIRMED with refinement.** `design-reference-v1/…` is the target for every screen a v1 phase touches; `design-reference/` remains the reference for Phase 1–7 work **as built**, so a fidelity question about an untouched screen is answered against the bundle it was built from. Both bundles stay in the repo — CLAUDE.md makes the design load-bearing, and a referenced-but-absent bundle turns fidelity into guesswork. The v1 renders are captured beside the Phase 1–7 renders, named so which-is-which needs no inference; CLAUDE.md, VERIFY.md and `scripts/verify/reference.ts:21` carry both paths and say which governs what. | V1-0; C15 |
| Q19 | Does recurrence supersede D43? | **No.** D43's two controls ("Sendes" picker, reminder chips) are still drawn (NEW:2245–2263) and stay open; the row chip "Planlagt hver uke · 12 runder" (NEW:3269–3272) closes D43's open question about how a scheduled survey appears on the list. Recurrence (status, pause/stop, custom, yearly/biennial, inherited) is built as drawn. | V1-3; C21 |
| Q20 | Cadence vocabulary | Add `biennial` and `custom` to `app.cadence`; "Hvert år" = existing `annual`; `biannual` stays unused and undocumented in the UI. | V1-3 |
| Q21 | Inherited statutory cadence | **Default, not lock.** The pack's cadence pre-fills the schedule; the padlock note becomes an explanatory note. (Overrule = a guard trigger on `schedules` and one more negative test.) | V1-3; C4 |
| Q22 | Pause semantics | `schedules.paused_at`; a paused schedule is skipped by the scheduler; the open round stays open; resume recomputes `next_run_at` from `send_at_local` + weekday. Stop = `active = false`. | V1-3 |
| Q23 | Who sees recurrence status | Viewers (`app.can_view_survey`) may **read** `schedules`; writes stay with editors. A leser sees the ↻ chip. | V1-3; C16 |
| Q24 | The use-case catalogue as product surface | **Commit** to the six categories (HR, Kunder, Intern, Leverandørkjede, Offentlig, Medlem) as a `use_cases` registry with a tab, chips, wizard step and eyebrows; the brief's 36 use cases stay outside the product until a pack exists for one. | V1-5; C22 |
| Q25 | Dashboard layout ownership | **Per member** (`dashboard_layouts (org_id, user_id)`), presets per organisation (registry rows + org-saved rows). Mirrors `dashboard_pins` (`M:0024:9–11`). | V1-4; C3 |
| Q26 | Stream panel | **Defer** behind `feature_flags.event_stream_panel`; the picker shows it unavailable with its `req` chip, as the bundle draws (NEW:2962, 3666–3670). | V1-4 / V1-7; C9 |
| Q27 | Presets that lead with the stream panel | Seed "Kundeopplevelse" and "Intern tjenestekvalitet" **without** the stream entry (brief B2: omit rather than seed) until Q26 lifts; their descriptions are adjusted accordingly and logged as a deviation. | V1-4 |
| Q28 | Response counts below the threshold | **CONFIRMED as DEFAULT.** Keep the app's reading: a response count is participation and stays visible (row, Oversikt, Resultater stats); only answer-derived scalars are gated. The brief's "aldri det faktiske antallet" (§ Hva som ikke skal designes) is amended to "never an answer-derived number"; the bundle's own row still prints "N av T". Three follow-ons, all in V1-0: the design brief's line is amended to «aldri et svarutledet tall» so the brief stops contradicting the bundle for whoever reads it next; the reasoning is written into `tests/invariants/threshold-policy.test.ts` as a comment on the exemptions — **counts of PEOPLE are participation, anything derived from what they SAID is gated** — because a grandfathered pair of names decays and a stated rule does not; and the exemption list stays enumerated and closed, so a third count-only function FAILS the assertion until someone adds it deliberately with a reason, the same rule as the k_for allowlist. | V1-0, V1-2; C2 |
| Q29 | Pins without an opener | **Keep** the app's "Åpne rapport (n)" beside "Frys som rapport"; log the deviation from NEW (which removed the button but kept the pins). | V1-4; C17 |
| Q30 | «Svar per virksomhet» under share links | **Refuse** for token readers (`alle_ansatte`, `ledere_eget_team`): composed as `unavailable / share_scope`; members at `ledelse` see it. Åpenhetsloven publishes the redegjørelse, not the per-supplier answers. | V1-2; C11 |
| Q31 | Respondent language chips | **CONFIRMED as DEFAULT.** Only **active** locales are drawn (Q11 holds; D73 precedent); NEW's chip chrome adopted; logged as a deviation with Q11 as driver. The general rule is recorded with it: **the bundle is authoritative for how something LOOKS, DECISIONS for whether it EXISTS.** The Profil/respondent asymmetry is deliberate and stated in `DECISIONS.md` so it is not later "fixed". | V1-1; C5 |
| Q32 | Wide toggle below 1192 px | **CONFIRMED as DEFAULT.** Render at `xl` and above only; deviation logged under RESPONSIVE.md rule 4's own escape clause. | V1-0; C10 |
| Q33 | Mobile pattern for the "Tilpass" card | It **stacks in place** (content order); its rail wraps; the picker's columns become one. Written into RESPONSIVE.md as a named pattern before V1-4's UI starts. | V1-4; C14 |
| Q34 | Mobile treatment of an expandable attributed row | Card per row (Data tables, wide row); the detail grid opens **inside** the card as a single column; no overflow menu (no consequential controls). Written into RESPONSIVE.md. | V1-2 |
| Q35 | Key-question designation for the attributed table | **Data on the pack**: a `role` (`brudd`, `policy`, `key`) on the pack's question entries, carried into `survey_questions.config`; never a regex on question text (NEW:3536–3540). | V1-2 |
| Q36 | Threshold values and ceiling | **CONFIRMED as DEFAULT, with two additions.** The panel offers 3/4/5/8/10 (NEW:4855) and is the only writer; the server accepts **3–10** (down from 50). The ceiling goes in the **database** — a CHECK on `surveys.k_threshold` mirroring `organizations.default_k_threshold` (migration 0036) — because Q17 put the floor in a CHECK so a non-UI writer could not go under it, and a ceiling deserves the same. A negative test asserts the boundary: 11 refused, 10 accepted. The bound is a **product** one, not security: above a typical SMB group everything gates to silence, and silence reads as broken rather than strict, so 15 for a real customer reason is a decision to revisit rather than a wall to breach. | V1-1; C6 |
| Q37 | Oversikt relocation | **CONFIRMED** (Tor, 2026-09-06). Adopt NEW: "Krever handling" into the lower grid, chip row → dark compliance card. **Moved V1-6 → V1-1** in the same call: it is the first screen anyone opens and nothing depended on the delay (see `03-plan.md` § V1-1). | V1-1; C12 |
| Q38 | Personvern §8 controls (still undrawn) | **Wait** for a bundle; D87's stop-and-ask stands. (Overrule = build from the brief's prose, logged as an invented screen like D8/D21.) | none; cross-phase 6 |
| Q39 | «Svar per virksomhet» report section body and the optional-mode per-choice texts (still undrawn) | **Wait** for a bundle (same as Q38). | none; cross-phase 6 |
| Q40 | RESPONSIVE.md Charts rule vs the bundle's 120 px / 172 px charts | Amend the rule: "never smaller than the design draws it; never below 44 px per interactive mark"; drop the 200 px floor. | V1-2, V1-7; C13 |
| Q41 | Window-step rule for the stream gate (only if Q26 = build) | Suppress any window whose set of responses differs from its neighbour's by fewer than k; volume bars follow the same gate. | V1-7 |
| Q42 | `dashThresholdLine` semantics | The RPC's k over the **selection** (already how `get_heatmap`/`dashboard_summary` gate); the bundle's org-wide maximum (NEW:3533) is not adopted. | V1-4; C7 |
| Q43 | Attributed CSV export | Administrator and redaktør; leser refused; audited (`attributed.export`); never reachable through a share link. | V1-2 |
| Q44 | Wizard purposes | The wizard lists the first six packs of the chosen use case (NEW:4197) instead of the fixed six keys (`undersokelser/keys.ts:93–100`). | V1-5 |
| Q45 | The five new packs' categories | Seeded with `category = 'Annet'` and `use_case` set; `template_packs.category` CHECK untouched (C8). | V1-5 |
| Q47 | Peer results on an organisation survey | **CONFIRMED (was C1).** `get_peer_results` returns `hidden` when `respondent_kind = 'organisation'`, decided in the RPC and not in the component: a supplier holding a live token can call the function directly, and today `app.k_for` returns 0 for an organisation survey (`M:0032:1152, 1176`), so the distribution of the other suppliers' answers comes back. That is **disclosure between competitors**, not a display choice. It needs its own negative test in V1-0: a supplier token retrieves its own submission and nothing about any other respondent, with a positive control proving the supplier's own data does come back. | V1-0; was C1 |
| Q46 | Filters move into the "Tilpass" card | Adopt NEW on desktop (period/group/survey chips leave the header). Below `md` this costs taps; accepted as drawn unless Q33's pattern says otherwise. | V1-4 |

**Two things this register does not decide.** The 5a3 floor after Phase 9
(measured in V1-0) and the census numbers per phase (committed in
`tests/expected-counts.json` with each file) are facts to be produced, not
decisions to be taken.
