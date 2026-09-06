# v1 bundle — Round 1: six expert briefs (independent, no cross-talk)

Each brief was written in full before the next was started, against
`docs/v1/00-diff.md` and the governing files. Where two disagree, the
disagreement is left standing; `02-conflicts.md` resolves or escalates it.
Line references use the conventions of `00-diff.md` (`NEW:`, `OLD:`, `M:`).

---

## 1. Database architect

### What I see

Eleven surfaces, of which only four need the schema to change, and only one
needs a new SECURITY DEFINER function. The rest is either already in the
Phase 8/9 kernel or is a reshaping of reads the schema already serves.

**Per surface — tables, columns, RLS, RPCs; and which invariant each touches.**

| Surface | Required | Invariant touched | New DEFINER? |
|---|---|---|---|
| Policy panel (Builder) | Nothing new. `setSurveyPolicy` (`bygg/actions.ts:350–385`) gains `anonymity` so the panel's three chip groups write one row; its ceiling drops from 50 to 10 to match `organizations_default_k_threshold_range` (`M:0034:19–20`) and the panel's values (NEW:4855). The guard (`M:0034:76–121`) already refuses locked/pack/non-admin changes and audits. | #4 role semantics (already enforced by trigger); Q17 lock | No |
| Attributed table + CSV | No table. A server route (not a client select — invariant #1) that calls `attributed_results` and writes `audit_events` with a new action string `attributed.export` (`audit_events.action` is free text, `M:0007:32`). Key-question designation: a `role` key (`brudd`, `policy`, `key`) on the pack's `questions` jsonb entries (`M:0003:10`) copied into `survey_questions.config` (`M:0003:60`) when a pack is used — data, no DDL. | #1 (no new read path — the RPC is the read path), #4 (leser refused by the RPC, `M:0034:176–178`) | No |
| Runde for runde | None. `get_trends` (`M:0032:587–635`). | — | No |
| Recurrence | (a) `alter type app.cadence add value 'biennial'`, `'custom'`; NEW's "Hvert år" maps onto the existing `'annual'` (`M:0001:20`). (b) `schedules` gains `every_n int`, `unit text check (unit in ('days','weeks','months'))`, `weekday int check (weekday between 1 and 7)`, `paused_at timestamptz`; `send_at_local` (`M:0004:62`) starts being honoured. (c) A partial unique index `schedules(survey_id) where active` so the wizard row (`undersokelser/actions.ts:181–186`) and the send row (`M:0032:326–338`) collapse into one — `send_round` upserts. (d) `app.run_due_schedules` (`M:0027:283–372`) recomputes `next_run_at` from cadence/every/unit/weekday/send_at_local and skips `paused_at is not null`. (e) A select policy `schedules_view_sel using (app.can_view_survey(survey_id))` so the chip renders for a leser — today only `can_edit_survey` (`M:0030:117`). (f) Inherited cadence: a `cadence` key inside `template_packs.policy` (`M:0032:31`) applied by `apply_pack_policy` as the schedule **default**; if it must be a lock (NEW:4325 draws it locked), a BEFORE UPDATE trigger on `schedules` mirroring `guard_survey_policy`. | #3 (new policy on `schedules`), #8 (new migration only) | No |
| Dashboard customisation | Three tables: `dashboard_panel_types` (registry: `key, archetype, label, description, requires, section_key null references report_section_types`), `dashboard_presets` (registry rows with `org_id null` + org-saved rows with `org_id, created_by, name, panels jsonb`), `dashboard_layouts` (`org_id, user_id, preset_key, panels jsonb [{key, wide}]`, unique `(org_id, user_id)`). RLS as `dashboard_pins` (`M:0024:35–42`): own rows, inside a member's org. Registries are `PUBLIC_BY_DESIGN` with a reason (`scripts/verify/policy-coverage.ts:41–52`). "Frys som rapport" reuses `createReport` (`dashboard/actions.ts:75–79`). Register panel = `attributed_results`; duties panel = plain RLS reads. | #3 (three new tables ⇒ policies + tests in the same migration) | No |
| Stream panel | `public.stream_series(p_org, p_surveys, p_window_days)`: per-day response volume and a rolling average over the strictest `app.k_for` of the selection, per-window gate. **This is the one new k-gate surface.** | #1 (a new SECURITY DEFINER vault reader), Q17 (`app.k_for`), 5a3 enumeration | **Yes — one** |
| Use-case library | `use_cases` registry (`key, label, short, description, tint, preset_key, sort_order`), `template_packs.use_case text references use_cases(key)` nullable with a backfill from category; the category CHECK (`M:0003:6`) either widened to the three new values or left and made irrelevant by the new column. Five packs seeded; `ci.yml:63` count → 22. | #3 (registry table ⇒ RLS + `PUBLIC_BY_DESIGN` entry), data-not-code | No |
| Innsikt nav, frame, wide toggle | None. `wide` stays `localStorage` (NEW:3117) — a viewer convenience, not tenant state. | — | No |
| Respondent banner / peer results | `get_peer_results` (`M:0032:1130–1195`) gains `if v_survey.respondent_kind = 'organisation' then return hidden` before the gate. A rule change inside an existing DEFINER function, re-covered by the k_for two-sided test. | #1, Q17 | No (modified) |
| Results stats below k | If decided (see 04): `results_summary` (`M:0032:422–584`) nulls `n`, `invited`, `responded`, `completion` when `v_n < v_k`. | #1 (existing DEFINER), and the `DO_NOT_GATE` convention (`tests/invariants/threshold-policy.test.ts:297–300`) | No (modified) |
| Oversikt compliance card | None — `duties.next_due_at` (`M:0006:21`), `reminder_weeks` (`M:0005:16–18`). | — | No |

### Three highest-risk items

1. **`schedules` is already lying, and recurrence status will print the lie.** Two rows per survey (`undersokelser/actions.ts:181–186` + `M:0032:326–338`), no uniqueness (`M:0004:55–68`), a `send_at_local` nobody reads (`M:0027:357–367`), and `next_run_at = now() + 30 days` for "monthly". A status chip "Runde 4 av 12 · neste 14. sep 09:00" built on this shows a date and time the scheduler will not keep. The migration must fix the model before any chip renders it.
2. **The stream RPC's gate has no precedent here.** Every existing gate is per cell on a fixed partition (question × group × round). A rolling window is a family of overlapping cells: window *t* and window *t+1* differ by one day, so with the window gated at *k* but not the step, a single day's average is recoverable by subtraction when that day's volume is 1. The gate needs a rule for the step (e.g., suppress a window whose difference from its neighbour is below *k*), and that rule is not in the bundle or the brief (`docs/Designbrief_terskel_Q17.md:173–182` says only "perioder under terskelen viser —").
3. **A registry seed that the CI count and the 5a3 allowlist do not know about fails the build twice.** `ci.yml:63` asserts `packs = 17`; `policy-coverage.ts:41–52` lists registries by name. Three new registries (`use_cases`, `dashboard_panel_types`, `dashboard_presets`) plus five packs arrive failing until both are updated in the same PR — which is the intended behaviour of the apparatus, but it means the migration PR is never green on its own.

### What I think is a mistake

Storing the dashboard layout in `localStorage` as the bundle does (NEW:3115–3117 keeps `dashLayout` in component state with no persistence at all; only `wide` reaches storage). A layout that lives in one browser is not "the organisation's dashboard" the brief describes ("Når en virksomhet åpner Dashboard første gang", `docs/Designbrief_terskel_Q17.md:163`), and a saved preset that "dukker opp … neste gang" (NEW:1023) cannot come from component state. Layouts and presets are rows.

### One thing another expert will get wrong

The security reviewer will list the register panel as a new k-gate surface. It is not: it is `attributed_results`, the ungated path Phase 9 built and tested (`tests/invariants/attributed-results.test.ts:143–215`), rendered in a smaller frame. The new surface is `stream_series`, and only that.

---

## 2. Security reviewer

### What I see

Six things a person could reach that they cannot reach today, and two places
where the bundle is stricter than the database. Persona reach is stated per
surface; the denial tests are the ones that must exist, proven failing,
before the surface ships.

| Surface | What could leak | Who can reach it | Denial tests required (must fail first) |
|---|---|---|---|
| Policy panel | A redaktør lowering `k` when `privacy.redaktor_may_lower` is off; anonymity flipped on a survey with answers; organisation mode switched on over person answers. All three are refused by trigger today (`M:0034:86–104, 107–114`) and tested (`threshold-policy.test.ts` #3, #4, #5, #7; `attributed-results.test.ts` B). | administrator (redaktør if flagged) | Existing seven stay green; **add**: the panel's server action refuses `anonymity` changes on a locked survey (new field in the action), and `kThreshold > 10` is `invalid`. |
| Attributed table | Names, e-mails and every answer of named organisations. | administrator, redaktør (`M:0034:176–178`); leser refused; anon cannot execute (`M:0034:193`) | Existing A-block stays green. **CSV route**: leser → 403; outsider → 403; anon → redirect; a successful export writes exactly one `audit_events` row with `attributed.export`; the file for a person survey is refused (`not_attributed`). |
| Per-virksomhet in a shared report | `compose_report` skips `teams`/`heatmap` for `alle_ansatte` (`M:0034:340–343`) but **not** `per_virksomhet` (`M:0034:401–414`). An all-employees share link on an organisation-only report renders supplier names and answers to a reader with no session. | anyone holding an `alle_ansatte` or `ledere_eget_team` token | A share token at `alle_ansatte` on an org-only report gets `per_virksomhet` as `unavailable` (if decided so — 04-decisions); today's test asserts refusal only over person sources (`attributed-results.test.ts:386–406`). |
| Peer results on an organisation survey | `get_peer_results` uses `app.k_for` = 0 for organisation surveys (`M:0032:1152, 1176`), so any supplier holding a token sees the distribution of the other suppliers' first numeric answer after submitting. The bundle hides it (NEW:3984–3985). | anon with a live token | `get_peer_results` on an organisation survey returns `{hidden:true}` for a live token, with `reveal_results` on. |
| Results stats below k | `results_summary` returns `n` at 4 (`M:0032:575–583`). The brief forbids showing the actual count "noe sted, uansett rolle" (`docs/Designbrief_terskel_Q17.md:133`); the bundle hides it on Resultater (NEW:4886–4889) and shows it on the list row (NEW:4136). This is a contradiction inside the bundle and an open rule, not a bug I can assign. | any member | If the count is a result: `results_summary` at n=4 returns `n: null`. If it is participation: no test — the DO_NOT_GATE list (`threshold-policy.test.ts:297–300`) already says so. |
| Dashboard customisation | The panels are the existing RPCs with the existing parameters; composing them adds no filter the RPCs do not already accept. New exposure is (a) the layout/preset tables themselves (cross-org and cross-member reads), (b) a register panel shown to a leser (the RPC refuses, so the panel must render "utilgjengelig", never an empty table that looks gated), (c) "Frys som rapport" creating a `reports` row — existing RLS. | any member | For each new table: outsider, stranger, anon and same-org colleague cannot read another member's layout; leser cannot see register rows (RPC `forbidden`); a frozen report over a mixed selection carries no `per_virksomhet`. |
| Stream panel | Sliding-window differencing (see the architect's point; I reach it independently): the per-day **volume** bars are participation counts (accepted org-wide in `overview_activity`, D65) but here they are **per survey**, and a per-survey, per-day count on a transactional CSAT is "who answered today". | any member | n=4 in a 7-day window → gap; two adjacent windows whose difference is < k → the later one suppressed (rule to be decided); volume bars for a survey with fewer than k responses in the window → not drawn. |
| Recurrence status to a leser | No answer data. `schedules` is editor-only today (`M:0030:117`); opening a select policy to viewers exposes cadence, next run and runs count. | leser | Cross-org denial on `schedules` (exists? — 5a3 marks the table guarded via `token-lifecycle.test.ts`; a viewer-policy widening needs its own positive control and outsider denial). |
| Four language chips | No data. Q11 (`DECISIONS.md:19`) — a promise, not a leak. | respondent | none |
| Wide toggle / Innsikt | none | — | none |

### Three highest-risk items

1. **`get_peer_results` on organisation surveys.** Not a design choice — a token holder can call the RPC directly, so the fix must be in the function (`M:0032:1130–1195`), and it is shippable independently of any screen.
2. **Stream windows.** A per-survey, per-day series is the first time-axis finer than a round. Rounds were chosen as the axis for exactly this reason (D48, D65 — "per-group participation over time is exactly the shape k-anonymity protects", `docs/DEVIATIONS.md:1276–1281`). The panel's *volume* bars are drawn even where the *score* is gated (NEW:3717–3722, `fill` only depends on `d.vol`).
3. **The count contradiction.** Whichever way it goes, one screen is currently wrong: either Resultater shows a count the brief forbids, or the survey row and Oversikt "Krever handling" ("65 % har svart") will have to stop. This is a decision that will invalidate tests in `threshold-policy.test.ts` either way; it must be taken before, not after, the attributed phase.

### What I think is a mistake

The bundle presents the organisation-mode pronoun check ("«…» handler om enkeltpersoner", NEW:3529) inside the same `--ac3` box family as the target-vs-threshold warning. The first is a wording heuristic — a `quality_rules` row, data — and offers no protection; the second is arithmetic about a promise. Rendering them as one class of "breach" teaches the editor that the regex is a control. Keep them; label them differently.

### One thing another expert will get wrong

The frontend architect will hide organisation-survey peer results in `PeerResults.tsx` because that is where the panel is. The panel is the last place it can be hidden; the RPC is the only place it must be.

---

## 3. Frontend architect

### What I see

Twenty-one screen changes; five genuinely new components, the rest variations
of components that exist. Default is reuse; a new component is justified only
where nothing in the tree has the shape.

| Surface | Reuse (path) | New component? Reason |
|---|---|---|
| Frame `max-width:1120px` + wide toggle | `app/(app)/layout.tsx:18` becomes the single frame; every per-screen `max-w-[…]` listed in `00-diff.md` b.1 is removed | `components/WideToggle.tsx` (client, `localStorage`, 38 px round button) — new because no header control today is stateful client-side; small |
| Innsikt nav + rail | `components/AppHeader.tsx:19–25` (NAV array), `components/AppNav.tsx:19–26` (both `/dashboard` and `/rapporter` → `insight`), `components/MobileNav.tsx`; rail = `bibliotek/ChipLink.tsx` `variant="segment"` as Bibliotek and Undersøkelser already use | `components/InsightTabs.tsx` — a two-link rail shared by two screens; variation of ChipLink, but shared, so one file |
| Wizard use-case chips, 6 cadences, custom editor | `Wizard.tsx:284–306` chip loop; `keys.ts` lists | `CadenceEditor.tsx` — the bundle draws the identical block twice (NEW:121–136 and NEW:2182–2197): one component, used by Wizard and Send |
| Context-bar chip, row chip | `SurveyContextBar.tsx:77–82` pill styling; `SurveyRow.tsx:155–159` share chip | No — variations |
| Row menu Pause/Stopp | `SurveyRow.tsx:279–298` (copy/close buttons, `run()` helper) | No — two more `menuItem` buttons + two server actions |
| Oversikt compliance card | `OverviewScreen.tsx:172–192` (data already shaped as `ComplianceChip[]`) | `ComplianceCard.tsx` — dark `--ink` surface with a positioned timeline; nothing in the tree draws a dark card or absolute dots |
| Policy panel | `EngagementPanel.tsx:104–129` (chip rail on `--sf2`), `:195` (warning box), `Builder.tsx:298–316` (card + check list) | `PolicyPanel.tsx` — new because it is the first chip group with a locked state and a lock note; but built from EngagementPanel's chip classes, not restyled |
| Send status row + inherited note | `SendScreen.tsx:485–542` recurring block; `Radio` (`:666–706`) | No — variation; `CadenceEditor` reused |
| Respondent banner + chips | `Respondent.tsx:152–178` | No — class changes only; `optional` banner gets the number word from `anonymityPromise` (`lib/respondent/anonymity-promise.ts:60`) |
| Results threshold/stat states, rounds panel | `ResultsScreen.tsx:118–155` stats; `:377–396` vs-previous block for the bar style | `RoundsPanel.tsx` — vertical bars with a gated 4 % stub are not in the tree (all bars are horizontal `BarRow`s); small |
| Attributed table | Brief §5 names the pattern: Administrasjon → Brukere (`administrasjon/UsersPanel.tsx`) — row with `border-b`, no card-in-card (D25) | `AttributedTable.tsx` — new because rows expand and carry a filter rail; the row chrome is Brukere's |
| Dashboard customisation | `DashboardScreen.tsx:269–291` (`Panel`), `:297–319` (`BarRow`), `:327–399` (`HeatGrid`), `DashboardFilters.tsx` (moves into the card), `PinButton.tsx` | `CustomizeCard.tsx` (three tabs), `PresetGallery.tsx` (six SVG illustrations as assets), `RegisterPanel.tsx`, `DutiesPanel.tsx`; panel controls are a variation of `Panel`'s `action` slot |
| Stream panel | none comparable (the only SVG chart is Oversikt's bar strip `OverviewScreen.tsx:252–264`) | `StreamPanel.tsx` — new, and the only one that needs a chart library decision (none is in `package.json`) |
| Bibliotek use cases | `TemplateCard.tsx` chrome (tint, 18 px radius, 22 px padding) | `UseCaseCard.tsx` — different content shape (examples, count/live line, two buttons); a variation would need six props that TemplateCard does not have |

### Three highest-risk items

1. **The frame change is systemic and must land first.** Nine files carry their own `max-w-[…]` (`00-diff.md` b.1). If the policy panel or the attributed table is built before the frame moves, every Gate 3a comparison of those screens is against a reference that is 40 px wider or narrower than the app; the finding count in the verification pass will be dominated by a single root cause and the fix pass will be spent on it.
2. **The dashboard's state model does not fit the app's.** The bundle keeps `dashLayout`, `dashPickerOpen`, `custTab`, `presetDraft` in component state (NEW:3115–3117). This app renders every screen on the server with state in the URL or the database (`DashboardScreen.tsx` is a server component; D16 made even tabs routes). A layout that is edited live (move, resize, remove) but rendered server-side needs either optimistic client state over a server action per change, or a client panel host. That is an architecture decision, not a component.
3. **Chart rendering.** The stream panel is 520 × 172 SVG with computed polylines (NEW:1175–1201). No charting dependency exists; hand-rolled SVG is what the bundle does and what Oversikt does. Adding a library for one panel is the wrong trade; the risk is in writing the gap/segment logic twice (server for k, client for drawing).

### What I think is a mistake

The bundle derives the attributed table's columns by regex on question text (`/policy/`, `/brudd/`, NEW:3536–3540) and shortens headers by another regex (`shortQ`, NEW:3540). Copying that into components makes the table's meaning depend on Norwegian spelling. The columns should come from the question's config, and the label from the question itself.

### One thing another expert will get wrong

The database architect will want a `dashboard_layouts` row per member, mirroring pins. A dashboard is what the organisation sees together — the brief says "Når en virksomhet åpner Dashboard første gang" and the presets are organisational — so the default layout belongs to the org, with a per-member override only if someone asks for one. Two members of the same org seeing two different "Arbeidsmiljø" dashboards is a support ticket.

---

## 4. Responsive / design-system reviewer

### What I see

Every new surface checked against `docs/RESPONSIVE.md`. "Pattern" names the
section that governs it; "stop-and-ask" is where the file has nothing.

| Surface | Pattern (RESPONSIVE.md) | Verdict |
|---|---|---|
| Frame `calc(100% - 72px)` | Breakpoints table (:7–14): ≥1280 pixel-perfect; below, layout may reflow. The new frame *is* the reflow the app already does with `mx-5` (`layout.tsx:18`, 20 px vs the bundle's 36 px side gutter) | Covered; the gutter value is a desktop fidelity item, not a responsive one |
| Wide toggle | Global rule 4 (:23) "No feature hidden on mobile" — but the control does nothing below 1192 px (1120 + 72), and rule 4's own escape is "if something genuinely cannot work at 390px, stop and ask" | **Stop-and-ask** |
| Innsikt rail beside a Playfair 28 px heading | Tab rails (:35–40): wrap, keep chip size, 44 px separation | Covered |
| Wizard: six cadence chips; custom editor row (number, two selects, time) | Modals (:61–62) full-screen sheet; Tab rails for the chips; the editor row wraps by its own `flex-wrap` and each control needs `touch-44-field` | Covered |
| Context-bar chip | App shell (:29–30) unchanged; chip wraps with the title block | Covered |
| Oversikt: 1.6fr/.9fr grid, dark card with absolute dots | Global rule 5 content order (:24): stacks primary first. Timeline dots are `left:%` — scale-free | Covered |
| Policy panel in the Builder right pane | Three-pane Builder (:32–33): the pane is a sheet below xl; chip groups wrap per Tab rails; lock note is a text box | Covered |
| Send: status row buttons, custom editor, inherited note | Send screen (:58–59) columns stack; controls ≥44 via `touch-44` | Covered |
| Row chip + two more menu items | Data tables narrow-row rule (:46); menu spacing already widened for hit areas (D32) | Covered |
| Dashboard "Tilpass" card (three tabs, a 1.3fr/.7fr grid, a picker grid `minmax(320px,1fr)`, a 1fr/1fr layout tab) | **No pattern.** It is not a modal (inline card, NEW:945), not a table, not a sheet. "a customise sheet, a panel picker" is precisely the gap the brief for this round names | **Stop-and-ask** |
| Preset gallery `minmax(280px,1fr)` with 112 px SVG illustrations | Grid reflow is layout; illustrations are `width:100%` | Covered |
| Panel header controls: ↑ ↓ (30 px), width toggle, pin, × — five controls in a wrapping row | Global rule 2 (:18–20): 30 px controls need 44 px hit areas, and five adjacent expanded areas collide; spacing must grow at mobile (D30 precedent). Which spacing step is a judgement the rule allows | Covered by rule 2, but the five-control cluster at 390 px should be **looked at**, not assumed |
| Register panel (three tiles `minmax(280px,1fr)`) | Grid reflow | Covered |
| Duties panel (rows) | Narrow rows (:46) | Covered |
| Stream panel SVG 520 × 172 | Charts (:64–65): "minimum height 200px, legend below" — the bundle's chart is 172 px at desktop | **Conflict**: applying the 200 px floor below md changes a height the bundle fixes; heights are layout (allowed), but the rule was written before any chart existed. Stop-and-ask whether the floor applies to a chart the design draws smaller |
| Rounds panel 120 px bars | Charts rule again: 120 px < 200 px | **Same conflict** |
| Attributed table (Virksomhet · Svardato · Status · up to 4 columns · chevron) | Data tables wide row (:45): card per row, label/value pairs, actions in overflow; **consequential controls stay visible** — none here. The expandable detail grid (`r.open`) inside a card: the pattern says nothing about a row that opens | Mostly covered; the open-row-in-a-card treatment is a **stop-and-ask** (minor) |
| Results stat cards `auto-fill minmax(200px)` | Layout; app already reflows 4→2→1 | Covered |
| Respondent: four 11 px code chips at `padding:6px 8px; gap:2px` | RESPONSIVE.md does **not** govern respondent surfaces (:5 "Respondent-facing surfaces are unaffected — they have real mobile designs"). The chips are ~28 × 26 px, 2 px apart; under the app rule they would collide, but the app rule does not apply | Covered by exemption; note it so nobody "fixes" it |
| Bibliotek use-case cards; nine category chips | Grid reflow; Tab rails wrap (nine chips will take three rows at 390 px) | Covered |

### Three highest-risk items

1. **The customise card has no pattern and is the largest new layout.** At 390 px it is a card containing a tab rail, a chip cloud, two selects, a two-column picker and a two-column form. Every one of those parts is covered individually; the composition is not, and RESPONSIVE.md is explicit that composition without a pattern is a stop-and-ask (:5).
2. **Two chart heights contradict the Charts rule.** Applying the rule as written makes the mobile rounds panel taller than the desktop one; not applying it leaves a rule that says "minimum 200" with two 120/172 px charts shipped under it. One of the two must be amended by Tor.
3. **The wide toggle** either hides on mobile (rule 4 violation by the letter) or renders as a control that does nothing (D26's "a control that silently does nothing is worse than one that says why it cannot").

### What I think is a mistake

The bundle moves the survey chips, period and group selects *into* the customise card (NEW:956–990). On desktop that is a design decision and the bundle wins. But below md it means the only way to change the period is to open a card, pick a tab, then find a select — three taps for what was one. RESPONSIVE.md's "no new interaction is introduced" (:36, for chip rails) is not literally violated, but its spirit is.

### One thing another expert will get wrong

The frontend architect will make the customise card a full-screen sheet below md "because the Builder's right pane is a sheet". The Builder pattern (:32–33) applies to a *pane* that is the base layer's sibling; the customise card is inline content above the panels. It stacks; it does not become a sheet. Ask before inventing a sheet.

---

## 5. Verification engineer

### What I see

The apparatus is frozen: seven gates (VERIFY.md), 5a3 by enumeration
(`scripts/verify/policy-coverage.ts`), the census (`tests/census.ts` +
`tests/expected-counts.json`, 18 files / 392 tests), and the two numbers that
may only move up (CLAUDE.md:126–127). Per surface, what each gate needs and
what none of them can see.

| Surface | Gate 3a (design compare) | Gate 3e (390 px) | 5a3 | Census |
|---|---|---|---|---|
| Frame + wide toggle | **Every route** re-compared: the reference PNGs in `artifacts/reference/` were rendered from `reference.ts:21` = the OLD bundle; the harness must be re-pointed at NEW and re-run once for all screens before any per-screen comparison means anything | Every route re-measured (`verify:responsive`) — the frame changes every page's width | — | — |
| Innsikt nav/rail | Dashboard, Rapporter | Both + slide-over | — | — |
| Wizard | `undersokelser-ny` states formal/sporsmal/hyppighet; **the pinned visual baseline `veiviser-formal.png` changes** (`tests/visual/screens.spec.ts:71–77`) and must be regenerated deliberately, not reflexively | same | — | — |
| Recurrence (Send, list, context bar) | Send `recurring` state (`routes.manifest.ts:522–535`) plus **new states**: status row (needs a seeded recurring, sent survey), custom cadence, inherited (needs a statutory-pack survey) | same | `schedules` gets a new select policy → still one table, but the positive control must change persona (leser reads) | New file `tests/invariants/recurrence.test.ts` (scheduler honours `send_at_local`/weekday, pause skips, resume continues, stop deactivates, one schedule row per survey, pack cadence default, leser can read, outsider cannot) |
| Policy panel | Builder `innstillinger` state + **new states**: open, locked-by-pack, locked-by-answers, below-5 warning, organisation | same | — | Unit tests for `polWarnings` rules (pure functions), and one action test (anonymity in `setSurveyPolicy`) |
| Attributed table + CSV | Resultater **new state** with an organisation survey (the demo seed has none; `routes.manifest.ts:707–755` states are all person surveys) | Card conversion per Data tables | CSV route is not a DB surface — 5a3 cannot see it; its denial lives in `tests/db` | `tests/invariants/attributed-export.test.ts` (leser/outsider/anon refused; audit row; person survey refused) |
| Rounds panel | Resultater state with ≥2 rounds — the demo seed produces none: one `send_round` per survey, no second round anywhere (`scripts/seed-demo.ts:281–290`; grep `round_no:` / `survey_rounds').insert` = 0 hits) | Charts rule | — | — |
| Dashboard customisation | **New states**: needs-setup gallery, ready with preset, customise open × 3 tabs, register panel, duties panel; `dashboard` route today has three states (`routes.manifest.ts:756–782`) | The stop-and-ask pattern first | Three new RLS tables ⇒ three new rows in the 5a3 catalogue, each arriving `UNTESTED` until `policy-coverage.test.ts` gains describe blocks with **producer fixtures** (a real row in the primary org, or the surface is "PROTECTED BUT UNPROVEN", `policy-coverage.ts:92–107`); two registries ⇒ `PUBLIC_BY_DESIGN` entries with reasons | `policy-coverage.test.ts` +≥15 (3 tables × outside readers + positive control + colleague denial); `report-composition.test.ts` +2 (frozen report from a layout carries only aggregate sections) |
| Stream panel | New dashboard state | Charts rule | `stream_series` ⇒ one new SECURITY DEFINER row; **`threshold-policy.test.ts` #8b will fail by construction** the moment a caller-reachable function reads `responses` without calling `app.k_for` (`:301–318`) — the function must call it, or be added to `DO_NOT_GATE` with a reason (it cannot: it returns averages) | `tests/invariants/k-surface.test.ts` +≥4 (window at n=4 gated, n=5 shown, adjacent-window differencing, volume bars gated) |
| Use-case library + packs | Bibliotek `bibliotek-maler` states + **new**: bruksomrader tab; chip rail with nine chips | Tab rails | `use_cases` ⇒ registry row in `PUBLIC_BY_DESIGN`; `ci.yml:63` seed assertion → 22 packs; `PUBLIC_BY_DESIGN.template_packs` reason unchanged | Seed-shape test (packs carry a use case; the CHECK or FK holds) |
| Peer results (org) | Respondent thank-you state with an organisation token — **no such state or token exists** (`routes.manifest.ts:658–694` uses `DEMO_SHARE_TOKEN` on a person survey) | — | modified DEFINER (already enumerated) | `threshold-policy.test.ts` +1 (org token → hidden) — file count 11 → 12 |
| Results stats below k | Resultater `for-fa-svar` state exists (`:722–729`) | — | modified DEFINER | If decided: `k-surface.test.ts` +1 (summary at n=4 carries no `n`) — and the `DO_NOT_GATE` reasons must be re-read |
| Oversikt compliance card | `oversikt` default + leser | Grid stack | — | — |

**Census arithmetic.** Today 18 files / 392 tests. Minimum growth the tests
above imply: +2 files (`recurrence`, `attributed-export`) and the per-phase
minimums named in `03-plan.md`; the exact numbers are committed in
`tests/expected-counts.json` in the same commit as each file, per
`tests/census.ts:18–25`. I will not invent a total here.

**5a3 arithmetic.** 55 of 71 today (CLAUDE.md:126). The post-Phase-9
catalogue count is UNKNOWN in this session (no local database); it is settled
by `npm run verify:policy` on a reset database before the first v1 phase
starts, and that number is the new floor. Each new RLS table adds one to the
denominator; each is "actively checked" only when its producer fixture puts a
real row in the primary org.

### Three highest-risk items

1. **The reference gate is pointed at the wrong bundle.** Until `reference.ts:21` names `design-reference-v1/…`, every 3a comparison is against a design that no longer exists, and the fidelity notes in `00-diff.md` b.1 ("matches OLD") will read as passes. Re-pointing is a configuration change to an existing gate, not a new gate.
2. **States nobody photographs.** D32 is the lesson: everything reachable only by clicking was unmeasured for two phases. The new bundle adds at least twelve click-only states (policy open/locked/warning, customise × 3, presets, register, duties, stream, attributed, rounds, recurring status). A state with no manifest entry is a state nobody is looking at (`routes.manifest.ts:8–10`).
3. **Fixtures the seed does not have.** No organisation survey, no two-round survey, no organisation token; the only recurring survey is "Planlagt utsending", a monthly × 3 **test-only** send with no recipients (`scripts/seed-demo.ts:277–290`), which leaves the policy unlocked (`M:0032:343–345`) and shows no invitations. Every one of the new states depends on a seed the demo does not produce; `verify:browser` will report the routes as measured and the states as absent unless the seed grows first — and the seed count assertion in CI (`ci.yml:53–66`) counts registries, not demo rows, so it will not notice.

### What the current gates structurally cannot see

- **A `localStorage` layout or `wide` flag.** Nothing in the database, nothing in the URL; capture runs start from a fresh context, so the state is never reached unless a manifest `setup` sets it — and then it proves the setup, not persistence.
- **Time.** Pause/resume/stop semantics play out across cron runs; `verify:send` proves one `run_due_schedules` sweep (`scripts/verify/send.ts:226–251`), not a second one after a pause.
- **Sliding-window differencing.** Every k assertion in the suite is per cell (`k-surface.test.ts:12–17` — "per cell, not per query"). A rule about the difference between two overlapping cells has no existing shape; the test must be written as a new shape, and 5a3 cannot tell whether it exists.
- **Whether a policy predicate is right** (VERIFY.md:229 — 5a3's documented limit). Three new tables with "own rows in my org" predicates are exactly the case: a predicate that reads `app.is_org_member(org_id)` alone would pass 5a3 and leak layouts between colleagues.
- **The count contradiction** is a rule, not a defect; no gate can decide it.

### What I think is a mistake

Letting the wizard's `veiviser-formal.png` baseline be updated in the same commit as the wizard change. Baselines are updated "deliberately, never reflexively" (`screens.spec.ts:34–35`); the update should be its own commit after the 3a comparison of the new step 0 has been looked at.

### One thing another expert will get wrong

The database architect will count `stream_series` as "one more surface". 5a3 counts it, yes — but `threshold-policy.test.ts` #8b (`:301–318`) is the gate that bites: any caller-reachable function that joins `responses`/`answers` and does not call `app.k_for` fails the suite on the day the migration lands, with no test written. Whether that function belongs in `DO_NOT_GATE` is verification's call, and the answer is no.

---

## 6. Product / scope reviewer

### What I see

The bundle does four things: finishes Q17 on screen (policy panel, attributed
table, derived promises), adds recurrence management, turns the dashboard into
a composable one with presets, and introduces a six-category use-case
catalogue. Two of those were decided (Q17, D46-era dashboard pins); two were
not (recurrence beyond D43; the catalogue).

**Recurrence vs D43.** D43 (`docs/DEVIATIONS.md:860–883`) deferred two
drawn controls — the "Sendes" picker and the reminder chips — and asked one
question: how a scheduled round appears on the list before it is sent. The new
bundle **still draws both controls unbuilt** (NEW:2245–2263) and **answers the
question** with the row chip "Planlagt hver uke · 12 runder" for drafts
(NEW:3269–3272). So: the bundle does not resolve D43; it settles D43's open
question and adds a larger thing beside it (status, pause/stop, custom cadence,
yearly/biennial, inherited cadence). D43 stays open on its own two items.

**Use cases vs the expansion catalogue.** The brief (`docs/Designbrief_terskel_Q17.md:140–151`)
counted 36 use cases in six categories and argued for four dashboard
archetypes instead of one dashboard per use case. The bundle follows the
brief's structure: six categories (`USE_CASES`, NEW:2964–2971), each with one
preset (NEW:2974–2981), one tab (NEW:1873–1897), and five new packs to give
Intern/Offentlig/Medlem something to show. That is the catalogue as **product
surface** (a tab, chips, wizard step, eyebrows), which no decision in
DECISIONS.md has taken. B5 (`:184–188`) — no per-use-case navigation — is
respected.

**What supersedes what.** The bundle supersedes OLD on: Oversikt layout
(chips → card), Dashboard header (filters → customise card; the pinned-report
button is gone from markup), nav (five → four), Bibliotek categories (packs
→ use cases), Rapporter heading. It does not touch the report editor, the
duty cards, Personvern, Profil or Administrasjon.

### What is NOT worth building now

1. **The stream panel.** It assumes a transactional data model ("CSAT etter sak", `docs/Designbrief_terskel_Q17.md:175`) the product does not have: the only time axis is rounds (D48, D64), and a "løpende" survey is a share link with continuous answers on one round. The panel needs a new k-gate surface with an unresolved differencing rule for a use case with no customer. The bundle already gives it an "Ikke tilgjengelig / krever løpende måling" treatment in the picker (NEW:2962, 3666–3670) — ship that, not the panel.
2. **Presets that lead with the stream panel** (Kundeopplevelse, Intern tjenestekvalitet, NEW:2976–2977) — the brief's own rule is "utelat panelet heller enn å vise seedede tall" (`:165`); without stream they are `themes + drivers` and should be seeded as that, or not at all.
3. **The four respondent language chips.** Q11 is confirmed; D73 removed sv/da from the splash for the same reason. Render the active locales (the app already does, `s/[token]/page.tsx:55–69`); log the deviation.
4. **The wide toggle.** A per-viewer convenience with no product value in a compliance tool; it exists to make the 1440 canvas feel less empty. Build it last, or not — but it is drawn, so "not" is Tor's call.

### What IS worth building, in value order

Attributed table + CSV (the åpenhetsloven wedge, and the last piece of D87
that has a bundle) → policy panel (closes D87 §1/§2) → recurrence status and
pause/stop (a compliance product whose annual survey silently stops is D43's
own argument) → presets + register/duties panels (the register panel is the
supplier overview in three numbers; duties is what Oversikt's card already
shows) → use-case tab (cheap, data) → Innsikt nav (cheap) → Oversikt card →
rounds panel → the rest.

### Three highest-risk items

1. **Category drift.** Five new packs with three new categories that the schema's CHECK refuses (`M:0003:6`) and CI counts (`ci.yml:63`) — a content change that breaks the build twice and re-tints the Bibliotek grid (positional tints, `bibliotek/chips.ts:33–41`): with 22 packs, cards 6–22 are untinted; with categories re-mapped, which five are tinted changes on every filter.
2. **The bundle's `dashThresholdLine` is wrong** (org-wide max, NEW:3533) and the app's is right (selection, `M:0032:973`). Building to the bundle here would state a threshold the RPCs did not apply. The bundle wins on visuals, not on what a number means.
3. **Personvern §8 is still undrawn** — the second handoff did not deliver it, nor the per-virksomhet report section body, nor the optional-mode per-choice consequence texts. D87's stop-and-ask is narrower now but not closed; a third handoff or an explicit "build from prose" decision is needed for those three.

### What I think is a mistake

Removing "Åpne rapport (n)" from the dashboard header while keeping "Legg i rapport" on every aggregate panel (NEW:1095–1097, 3734). A pin with nothing to open it is a button that stores a fact nobody can use. Either the pins go, or "Frys som rapport" honours pins as well as the layout. The bundle does neither.

### One thing another expert will get wrong

The frontend architect will build the stream panel because it is drawn and CLAUDE.md says match the bundle exactly. Fidelity is a rule about *how* a screen is built, not *whether*; a screen whose data does not exist is a fabricated number by construction (CLAUDE.md, "Never fabricate data in the UI"), and the picker's own "Ikke tilgjengelig" is the bundle's sanctioned way to draw its absence.
