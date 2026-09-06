# v1 bundle — Round 3: the plan

Eight phases in dependency order. Each is small enough for one verification
pass and one fix pass (CLAUDE.md, "A phase gets ONE verification pass and ONE
fix pass"); findings from a fix pass go to the next phase's carried list, never
to a third round. Database before UI in every phase; negative tests written and
proven failing before the migration that makes them pass, exactly as Q17 was
run (`M:0032:12–14`, `M:0034:5–9`). Nothing here builds a screen the bundle
does not contain; the three brief-only screens are listed at the end as
stop-and-asks, not phases.

Conventions: `NEW:` / `OLD:` / `M:` as in `00-diff.md`; classifications from
`00-diff.md` b; decisions `Q18+` from `04-decisions.md`; conflicts `C1+` from
`02-conflicts.md`. "Pattern" names the section of `docs/RESPONSIVE.md`.

**Starting counts.** Census 18 files / 392 tests (`tests/expected-counts.json`).
Gate 5a3: 55 of 71 recorded (CLAUDE.md:126); the current catalogue count is
measured in V1-0 before anything else and becomes the floor. The counts below
are minimums implied by the named tests; the committed numbers are whatever
`tests/expected-counts.json` says in the commit that adds each file
(`tests/census.ts:18–25`).

**Size vocabulary.** *Small* = one or two files, no migration, one manifest
state. *Medium* = one migration or one new component family. *Large* = new
tables with RLS and producer fixtures, or a new SECURITY DEFINER function.
No effort estimates.

---

## V1-0 — Frame, navigation, reference harness, two kernel rules

Everything after this phase is compared against the new frame; nothing can be
fidelity-checked before it.

**Scope**

| Surface | Class (00-diff) |
|---|---|
| Shared frame `calc(100% - 72px)` / `max-width:1120px`; header padding + wrap (NEW:160, 364) | PARTIALLY BUILT (widths match OLD) — fidelity change on every screen |
| Wide toggle (NEW:181–183) — per Q32 | NOT BUILT |
| Four-item nav "Innsikt" (NEW:3513), active for `/dashboard` and `/rapporter` | NOT BUILT |
| Innsikt rail + subtitles on Dashboard and Rapporter (NEW:918–928, 1205–1214) | NOT BUILT |
| `get_peer_results` hidden for organisation surveys (NEW:3984–3985; C1) | NOT BUILT (kernel) |
| `results_summary` below-k nulls — **only if Q28 = hide** (C2) | NOT BUILT (kernel) |
| Reference harness re-pointed at v1 (C15) | apparatus configuration |

**Schema first.** Migration `…0035_peer_results_org_rule.sql`: `get_peer_results`
returns `{hidden:true}` when `respondent_kind = 'organisation'`, before the
`reveal_results` check (`M:0032:1154`). If Q28 = hide: the same migration
nulls `n`, `invited`, `responded`, `completion` in `results_summary` when
`v_n < v_k` (`M:0032:575–583`), and the `DO_NOT_GATE` reasons
(`tests/invariants/threshold-policy.test.ts:297–300`) are re-read.

Negative tests, written first and shown failing:
- `threshold-policy.test.ts` +1: a live token on an organisation survey with `reveal_results` on gets `hidden`, never buckets.
- (+1 if Q28 = hide) `k-surface.test.ts`: `results_summary` at n=4 carries no `n`.
- The two-sided k_for assertion (`threshold-policy.test.ts:274–318`) re-run and pasted: no function references `k_threshold()`; every caller-reachable vault reader calls `app.k_for`.

**UI second.**
- `app/(app)/layout.tsx:18` becomes the frame; remove the nine per-screen `max-w-[…]` (`00-diff.md` b.1); header per NEW:160. Pattern: App shell (unchanged below `md`); the 36 px gutter is a desktop value (RESPONSIVE breakpoints).
- `WideToggle` per Q32 (default: `xl` only; deviation logged).
- `components/AppHeader.tsx:19–25`, `AppNav.tsx:19–26`, `MobileNav.tsx`: `insight` item; `nav.insight` key in both message files. Pattern: App shell.
- `InsightTabs` on `DashboardScreen.tsx:114` and `ReportsScreen.tsx:64`; subtitles. Pattern: Tab rails.
- `scripts/verify/reference.ts:21, 27` renders **both** bundles (Q18): the Phase 1–7 renders are KEPT, not overwritten, and the two sets are named so which-is-which needs no inference — `artifacts/reference/<screen>.png` stays the Phase 1–7 baseline and `artifacts/reference-v1/<screen>.png` is the v1 target. CLAUDE.md and VERIFY.md carry both paths and state which governs what (required edits, outside `docs/v1/`).

**Definition of done.** Gates 1–7, and CI green — which it is not today (see
the carried blocker below). Gate 3a for **all 37 routes** against the v1
references — this is the only phase that compares everything, and
it produces the fidelity list every later phase inherits. Gate 3e all routes
(`verify:responsive`; the frame changes every width). Census ≥ 393 (≥ 394 with
Q28), files 18. 5a3: measured on a reset database and recorded as the floor;
no change expected (no new table or function). Visual baselines untouched
(login and wizard step 0 are not in this phase).

**Carried blocker, found on starting the phase.** CI has been red on `main`
since `cd74022` (the Phase 9 prod-apply commit): `npm ci` fails because
`package-lock.json` is out of sync with `package.json`, so tsc, eslint and the
build are skipped; and the seed-count check fails because migration 0034 added
the `per_virksomhet` section type, making `report_section_types` 11 rows where
`.github/workflows/ci.yml:63` still asserts 10 — so the Phase 9 invariant suite
has never run in CI. Both are fixed in this phase, before anything else: a
phase whose definition of done is "gates green" cannot start on a build that
cannot run them. This is D55's shape recurring and is logged as such.

**Not in this phase.** Any new screen; the wizard; Oversikt's relocation
(V1-1, moved there from V1-6); any dashboard change beyond the heading.

---

## V1-1 — Policy panel, and Oversikt's compliance card

**Scope**

| Surface | Class |
|---|---|
| "Hvem svarer og hva vises" card in the Builder's Innstillinger tab (NEW:577–635) | NOT BUILT |
| `polWarnings` two rules + ready check "Terskel og målgruppe stemmer" (NEW:3527–3529, 4645) | NOT BUILT |
| Lock texts in the Builder (NEW:4847) — reuse `send.lockedBy*` keys | PARTIALLY BUILT |
| Send "Levering" lock note chrome: `--sf2` box with padlock **above** the radios (NEW:2227–2232) | ALREADY BUILT (Phase 9) — fidelity check against NEW |
| Send "Klar til å sendes" policy line (NEW:2273) | ALREADY BUILT — fidelity check only |
| Respondent `optional` banner with the number word + caveat (NEW:4835) | PARTIALLY BUILT |
| Respondent banner chrome (NEW:2326–2331) | ALREADY BUILT to OLD — fidelity change |
| Results threshold line (NEW:2513) | ALREADY BUILT — fidelity check only |
| Library policy line in the **list** view (NEW:1976–1978) and card metrics 11.5 px / 6 px (NEW:1944–1946) | PARTIALLY BUILT |
| "Krever handling" relocated into the lower grid (NEW:305–333) — per Q37 | ALREADY BUILT — fidelity rebuild (C12) |
| Dark compliance card with 12-month timeline (NEW:334–357) — per Q37 | NOT BUILT (data exists) |

**Why Oversikt is here and not in V1-6 (Tor's call, 2026-09-06).** It is the
first screen anyone opens, so it is the most visible difference between the app
and the new bundle, and V1-6 was too late for that. The dependencies allow the
earliest slot: the relocation is a reorder inside `OverviewScreen.tsx`, a file
no other v1 phase touches, and the compliance card reads `duties.next_due_at`
(`M:0006:21`), `reminder_weeks` (`M:0904-0005:16–18`) and `duty_definitions` —
all shipped in Phase 5, with `00-diff.md` § c.10 recording "No gap". It needs
nothing from this phase's policy work, nothing from V1-2's attributed rows, and
nothing from V1-4's dashboard. `goCompliance` opens Rapporter's lov tab
(NEW:4279), which exists today. So V1-1, not V1-2: V1-2 would have been a delay
with no dependency behind it. The two workstreams share only the phase's gates.

**Schema first.** None. Server action `setSurveyPolicy`
(`bygg/actions.ts:350–385`) gains `anonymity` and a ceiling per Q36; the
database guard (`M:0034:76–121`) remains the enforcement.

Negative tests first (new file `tests/db/policy-panel.test.ts`, ≥4): redaktør
refused with the flag off; any change refused on a locked survey; anonymity
change refused on a pack-locked survey; `kThreshold` outside the accepted range
is `invalid`. Unit tests (new file `tests/unit/policy-warnings.test.ts`, ≥4):
target below threshold warns; organisation mode flags a pronoun question;
person mode does not; no target → no warning. The warning rule for pronouns is
a `quality_rules`-shaped rule (data), not a component constant.

**UI second.**
- `PolicyPanel.tsx` in `bygg/`, first card of the Innstillinger tab (`Builder.tsx:297–349`); `bygg/page.tsx:30–35` selects the policy columns and the pack's `legal_ref`. Pattern: Three-pane Builder (sheet below `xl`); chip groups: Tab rails.
- Ready checks (`Builder.tsx:194–200`) gain the sixth item.
- Send: move the lock note above the radios in NEW's chrome (`SendScreen.tsx:568–570`). Pattern: Send screen.
- Respondent: banner classes (`Respondent.tsx:172–174`) and the `optional` branch (`:131–135`) → `promiseChoose` / `promiseChooseLow` keys carrying `kWord`. Respondent-facing: pixel-perfect at 380–420, not RESPONSIVE.md.
- Library list row policy line (`bibliotek/page.tsx:294–305`); card line metrics (`TemplateCard.tsx:77`). Pattern: Data tables (list), grids (cards).
- `ComplianceCard.tsx` under `oversikt/`; `OverviewScreen.tsx:117–192, 194–289` reordered so "Krever handling" is the `minmax(0,1.6fr)` left column of the lower grid and the card is the right. Pattern: content order (RESPONSIVE.md rule 5) when the grid stacks; timeline dots are percentage-positioned.
- The bundle hard-codes both `complianceSummary` ("2 av 4 plikter krever handling i år", NEW:4278) and `complianceTimeline` (a four-row array, NEW:4272–4277). Both are derived from real duty rows here, the way `oversikt/page.tsx:131–164` already derives tones — CLAUDE.md forbids rendering the mock's numbers. An organisation with no duty due inside twelve months has no drawn state in either bundle: choose the minimal consistent option and log it.

**Manifest states.** `bygg`: `policy-open`, `policy-locked-pack` (a psykososial
draft), `policy-locked-answers` (a sent survey), `policy-low-warning`,
`policy-organisation`. `respondent`: an organisation token is V1-2's fixture,
so the organisation banner state waits for V1-2. `oversikt`: the
default already exists; add `frister-tomt` if the empty treatment above needs
one.

**Definition of done.** Gates 1–7; 3a for Builder, Send, Resultater,
Bibliotek, `/s/[token]` and **Oversikt (administrator and leser)**; 3e for the
same. Census ≥ +8 tests, +2 files
(≥ 401 / 20). 5a3 unchanged. k_for assertion re-run (the suite runs whole;
nothing new reads the vault).

**Not in this phase.** Personvern §8 controls (no bundle screen — stop-and-ask
stands, D87). The per-virksomhet report section body (no bundle screen).

---

## V1-2 — Attributed results, organisation results, rounds

The åpenhetsloven wedge. The data path exists and is tested; this phase draws it.

**Scope**

| Surface | Class |
|---|---|
| "Svar per virksomhet" table with filters, expandable rows, footnote (NEW:2537–2590) | NOT BUILT (UI); data path ALREADY BUILT (`M:0034:168–194`) |
| CSV export (NEW:2553) | NOT BUILT |
| Organisation stat set, organisation `resultsScope` line (NEW:4882–4886, 4093) | NOT BUILT |
| "Runde for runde" panel (NEW:2592–2609) | NOT BUILT (UI); data ALREADY BUILT (`get_trends`) |
| Per-question `b.hidden` chrome (NEW:2617–2622) | PARTIALLY BUILT — chrome change |
| Stats "—" + `title` when below k (NEW:4886–4889) — rendering side; the data side was V1-0 per Q28 | NOT BUILT |
| Stat grid `auto-fill` + `title` (NEW:2527–2530) | ALREADY BUILT to OLD — fidelity |
| Peer-results note for organisation respondents (NEW:3985) | NOT BUILT (rule shipped in V1-0) |
| A writer for `surveys.target`, so the policy panel's first warning can fire (D94) | CARRIED IN from V1-1 |
| «Svar per virksomhet» under share scopes (C11, Q30) | rule change if decided |

**Carried in from V1-1 (Tor's call, 2026-09-06): give `surveys.target` a
writer.** `polWarnings`' first rule — a target smaller than its own threshold
can never produce a result — is implemented and tested and permanently silent,
because nothing writes the column it compares (D94). That is worse than an
absent warning: it reads as working. This phase owns Send, which is where
recipients stop being hypothetical, so the writer belongs here. Two parts, and
neither invents a number: `send_round` (or the recipient step that precedes it)
records the count it actually addressed, and the Builder's panel keeps showing
nothing until one exists. The same rule then wants a home on the Send screen's
readiness, where the count is known at the moment it matters.

**Schema first.**
- Key-question designation (Q35): a `role` on the pack question entries in `supabase/seed.sql:19–20` (`brudd`, `policy`) carried into `survey_questions.config` by the pack-use path (`bibliotek/actions.ts`, the wizard). Data, no DDL.
- Migration `…0036_attributed_export_and_scope.sql` **only if Q30 = refuse**: `compose_report` composes `per_virksomhet` as `unavailable / share_scope` for token readers (`M:0034:401–414`).
- No new table. The CSV export is a route handler (`app/(app)/undersokelser/[id]/resultater/csv/route.ts`) that calls `attributed_results` as the viewer and inserts an `audit_events` row `attributed.export` — not a 5a3 surface; covered in `tests/db`.

Negative tests first:
- New file `tests/invariants/attributed-export.test.ts` (≥5): leser → 403; outsider → 403/404; anon → redirect; person survey → refused (`not_attributed`); a successful export writes exactly one audit row naming the survey and no answer text.
- `attributed-results.test.ts` +2: the designated `role` survives pack use into `survey_questions.config`; (+1 if Q30 = refuse) an `alle_ansatte` token gets `per_virksomhet` unavailable with `reason: share_scope`, no organisation name in the payload.
- k_for two-sided assertion re-run and pasted if `compose_report` changes.

**UI second.**
- `AttributedTable.tsx` under `resultater/` on the Brukere row pattern (`administrasjon/UsersPanel.tsx`, D25: `border-b`, no card-in-card). Pattern: Data tables, wide row → cards with label/value pairs; the open-row detail treatment per Q34's answer. Filter rail: Tab rails.
- `RoundsPanel.tsx`; Pattern: Charts (height per Q40).
- `ResultsScreen.tsx:118–155` stats variants; `:215–218` hidden chrome; `resultater/page.tsx:117–128` organisation scope line.
- `PeerResults.tsx`: render the organisation note on `hidden` with `respondent_kind = organisation` — the page already has `respondent_kind` (`s/[token]/page.tsx:131`).

**Fixtures.** `scripts/seed-demo.ts` gains an organisation survey from
`leverandor-apenhetsloven` with named invitations (two answered, one reminded)
and a person survey with two rounds. Manifest states: `resultater`:
`attribuert`, `attribuert-filter-brudd`, `attribuert-rad-apen`, `runder`;
`respondent`: `organisasjon` (new token constant in `tests/db/personas.ts`).

**Definition of done.** Gates 1–7; 3a Resultater (all states), `/s/[token]`
organisation state; 3e the same, table-to-cards checked. Census ≥ +7, +1 file
(≥ 408 / 21). 5a3 unchanged (a route is not a catalogue surface — this is a
recorded limit of the gate, not a gap to close).

### V1-2 outcome (2026-09-06)

Built as planned, plus one thing the plan could not have known: the demo
organisation had never held a survey at **k = 0**, and putting a screen in front
of one found a crash in four SECURITY DEFINER functions.

**Delivered.** Q43 (CSV route, 14 route checks, the audit clause on the stored
row, `attributed-csv.ts` + 18 unit tests, D96 for the format); D94 closed
(migration 0039, `surveys.target` follows the LATEST round, plus the warning's
second home on Send); Q35 (migration 0040, `role`/`short` on the Åpenhetsloven
pack, `lib/questions/roles.ts` with the regex negative, `tests/db/pack-roles.ts`);
the register, the rounds panel, the organisation stat set, the v1 hidden-question
chrome, the Q47 peer note; Q30 and Q48(a) from the batch commit.

**Migrations 0041 and 0042 — a defect class, not a defect.** Four functions built
a cell as `case when coalesce(x, 0) >= v_k then {n, avg} else {insufficient_data}`.
The coalesce turns "no row" into zero, which lands in the else arm at every
threshold this schema had — and reads `0 >= 0` at k = 0, so a group or a round or
a cell with nothing in it took the "here is your number" branch and returned
`{n: null, avg: null}`. `lib/results/types.ts` says in as many words that there is
no third state where `avg` is present but meaningless. 0041 fixed the two the
crash came through (`results_summary`, `get_trends`); a catalogue sweep for the
pattern found two more (`get_heatmap`, `get_benchmarks`) and 0042 fixed those.
Re-swept to zero. Both were proven failing against the pre-fix definitions.

**Carried to V1-6.**
1. `bibliotek/actions.ts` builds a pack question's `config` by hand while the
   wizard uses `configFor`, so `statements` and `multi` survive one path and not
   the other. Same pack, two shapes.
2. `get_trends` returns no `n` for a gated point, so «Runde for runde» shows less
   than Q28 permits — a count of people is not a svarutledet number. Widening it
   means a third entry in Q28's enumerated exemption list, which is a deliberate
   act with its own test, not a UI-phase change.
3. D97: Q43's decision line says `audit_events` is "a table `leser` can read".
   It is administrator-only (`audit_sel`, M:0008:190). The clause stands on
   invariant 7 and on the table being append-only; the line's stated reason is
   what needs the correction.

**Not in this phase.** The register panel (V1-4). Any change to
`compose_report` beyond Q30.

---

## V1-3 — Recurrence

Schema-heavy and the phase where the existing model is wrong before anything
new is drawn (brief 1, risk 1).

**Scope**

| Surface | Class |
|---|---|
| Cadence vocabulary yearly/biennial/custom (NEW:4316–4325, 2941) | PARTIALLY BUILT (5 of 8) |
| Custom cadence editor, Send + Wizard (NEW:2182–2197, 121–136) | NOT BUILT |
| Status row with Pause/Fortsett + Stopp on Send (NEW:2173–2181) | NOT BUILT |
| Inherited-cadence note (NEW:2165–2170) — per Q21 | NOT BUILT |
| Row chip, context-bar chip (NEW:873–875, 228–230) | NOT BUILT |
| Row menu Pause/Stopp gjentakelsen (NEW:899–902) | NOT BUILT |
| Wizard six cadence chips (NEW:4220) | PARTIALLY BUILT (3 of 6) |
| `cadenceSummary` "… til du stopper den", plan chips with year (NEW:4351–4366) | PARTIALLY BUILT |
| `recurStatus` on the rounds panel (NEW:2596) | NOT BUILT |

**Schema first.** Migration `…0037_recurrence.sql`:
- `alter type app.cadence add value 'biennial'`, `'custom'` (`M:0001:20`); "Hvert år" = existing `'annual'`; `'biannual'` stays unused (Q20).
- `schedules` + `every_n int`, `unit text`, `weekday int`, `paused_at timestamptz`, with CHECKs; partial unique index on `(survey_id) where active`; `send_at_local` honoured.
- `app.run_due_schedules` (`M:0027:283–372`) recomputes `next_run_at` from cadence/every/unit/weekday/`send_at_local` and skips paused rows; `send_round` (`M:0032:326–338`) upserts the schedule instead of inserting beside the wizard's row; the wizard write (`undersokelser/actions.ts:179–186`) sets `next_run_at` and `send_at_local`, or is removed in favour of the send upsert.
- Select policy for viewers per Q23 (`M:0030:117` today).
- Pack cadence per Q21: a `cadence` key in `template_packs.policy` applied as the schedule default (or a guard trigger if Q21 = lock).
- Two server actions `pauseSchedule` / `stopSchedule` (editors; RLS).

Negative tests first (new file `tests/invariants/recurrence.test.ts`, ≥10):
one active schedule per survey (wizard then send → one row); paused schedule is
skipped by `run_due_schedules`; resumed schedule computes the next run from
`send_at_local` + weekday, not from `now()`; stopped schedule never runs;
`every 2 weeks, Tuesday 09:00` yields the right `next_run_at`; `biennial` = 730
days; `custom` requires `every_n`/`unit` (CHECK); leser reads the schedule of a
viewable survey (positive control) and an outsider cannot; the pack default
lands on a statutory survey's schedule; (+1 if Q21 = lock) changing an
inherited cadence is refused.

**UI second.**
- `CadenceEditor.tsx` shared by `SendScreen.tsx:470–551` and `Wizard.tsx:284–306`; eight radios from `lib/send/registry.ts:29` + keys; status row; inherited note. Pattern: Send screen; Modals (wizard sheet); all controls `touch-44-field`.
- `SurveyRow.tsx:141–160` chip, `:279–298` two menu items; `undersokelser/page.tsx:45–49` joins `schedules`. Pattern: Data tables (narrow row), menu spacing per D32.
- `SurveyContextBar.tsx:77–82` chip. Pattern: App shell.
- `undersokelser/keys.ts:103–109`, `undersokelser/actions.ts:94–99` (Zod enum).

**Fixtures.** A real recurring send with recipients in `seed-demo.ts`
(today's is test-only, `:277–290`). Manifest states: `send`: `recurring-status`,
`recurring-custom`, `recurring-inherited`, `recurring-paused`; `undersokelser`:
`recurring-row`; `undersokelser-ny`: `hyppighet-tilpasset`.

**Definition of done.** Gates 1–7; 3a Send, Undersøkelser, wizard, context
bar on all three survey screens; 3e the same. Census ≥ +10, +1 file
(≥ 418 / 22). 5a3: `schedules` remains one surface; its positive control moves
to the viewer persona if Q23 = yes. `verify:send` extended to a second sweep
after a pause (a recorded limit: time is not otherwise observable).

**Not in this phase.** The "Sendes" picker and reminder chips (D43 stays
open, Q19). The wizard's use-case chips (V1-5).

---

## V1-4 — Dashboard customisation (without the stream panel)

The largest phase; three tables, two registries, a new state model for the
screen. The stop-and-ask on the customise card's mobile pattern (C14/Q33) is
answered before the UI starts.

**Scope**

| Surface | Class |
|---|---|
| Preset gallery `dashNeedsSetup` (NEW:1042–1075) | NOT BUILT |
| "Tilpass" card, three tabs; filters relocated into it (NEW:945–1041) | NOT BUILT (filters ALREADY BUILT in the header) |
| Panel controls ↑ ↓ width pin × (NEW:1089–1100) | NOT BUILT |
| Save / switch / reset preset (NEW:1018–1040) | NOT BUILT |
| "Frys som rapport" (NEW:940, 3647) | PARTIALLY BUILT (`openPinnedReport` path) |
| Register panel (NEW:1138–1148) | NOT BUILT (UI); `attributed_results` exists |
| Duties panel (NEW:1149–1163) | NOT BUILT (UI); data exists |
| Stream panel in the picker as unavailable (NEW:2962, 3666–3670) — per Q26 | NOT BUILT |
| "Åpne rapport (n)" — per Q29 | ALREADY BUILT; bundle removed it |
| `dashThresholdLine` (NEW:928) — RPC semantics (C7) | PARTIALLY BUILT |

**Schema first.** Migration `…0038_dashboard_layouts.sql`:
- `dashboard_panel_types` (registry; 7 rows; `section_key` FK to `report_section_types` for the four aggregate panels; `requires` text; `available boolean` false for `stream` until Q26 lifts it).
- `dashboard_presets` (registry rows `org_id null`, six per NEW:2974–2981 with `stream` handled per Q27; org-saved rows `org_id, created_by, name, panels jsonb`).
- `dashboard_layouts` per Q25 (default: `(org_id, user_id)` unique; `preset_key`, `panels jsonb [{key, wide}]`).
- RLS in the same migration: registries readable (`PUBLIC_BY_DESIGN` entries with reasons in `scripts/verify/policy-coverage.ts:41–52`); layouts and saved presets own-rows-in-my-org, as `M:0024:35–42`.
- No new RPC. Register panel = `attributed_results` for the org's organisation survey; duties = RLS reads; "Frys som rapport" = `createReport` (`dashboard/actions.ts:75–79`) with the layout's aggregate keys + `method`.

Negative tests first (`tests/invariants/policy-coverage.test.ts` ≥ +15 with
producer fixtures; `report-composition.test.ts` +2): for each of the three
tables, positive control, another organisation, a signed-in non-member, an
anonymous caller, and — for layouts and saved presets — a colleague in the same
org cannot read or overwrite another member's row; a frozen report from a
layout carries only aggregate sections plus `method`, never `register`,
`duties` or `stream` as sections; a leser opening a layout with the register
panel gets the RPC's `forbidden` and no rows.

**UI second.** `CustomizeCard.tsx` (pattern per Q33), `PresetGallery.tsx`
(grid reflow; SVG assets), `Panel` controls in `DashboardScreen.tsx:269–291`
(rule 2 spacing at mobile, looked at, not assumed), `RegisterPanel.tsx`
(grid), `DutiesPanel.tsx` (narrow rows), `DashboardFilters.tsx` moved into
the card, the heading line with the RPC's k (C7), pins per Q29. State model:
server-rendered layout, server action per edit, optimistic client order
(brief 3, risk 2).

**Fixtures.** A saved layout and one saved preset for the demo administrator.
Manifest states: `dashboard`: `velg-oppsett`, `oppsett-valgt`,
`tilpass-utvalg`, `tilpass-paneler`, `tilpass-oppsett`, `register-panel`,
`plikter-panel`, `leser` (register unavailable).

**Definition of done.** Gates 1–7; 3a Dashboard all states; 3e the same with
the Q33 pattern applied and the five-control cluster measured for overlaps.
Census ≥ +17 (≥ 435 / 22). 5a3: +3 enumerated tables; `dashboard_layouts`
and saved presets actively checked through producer fixtures; the two
registries print as `--` with reasons. k_for assertion re-run (no new vault
reader).

**Not in this phase.** The stream panel and its RPC. Use-case cards'
"Dashboard" button (V1-5).

---

## V1-5 — Use-case library and the five packs

Depends on V1-4's presets (each use-case card's "Dashboard" button loads one).

**Scope**

| Surface | Class |
|---|---|
| "Bruksområder" tab with six cards (NEW:1873–1897) | NOT BUILT |
| Category chips = use cases + Lovpålagt + Annet (NEW:4469); `packCatNote` (NEW:4479) | NOT BUILT |
| Card eyebrow = use-case label (NEW:4484) | ALREADY BUILT to OLD — change |
| Five new packs, two re-categorised (NEW:2837, 2842, 2857–2881) | NOT BUILT (seed) |
| Wizard use-case chips + filtered purposes (NEW:60–66, 4195–4197) | NOT BUILT |

**Schema first.** Migration `…0039_use_cases.sql`: `use_cases` registry
(`key, label, short, description, tint, preset_key, sort_order`) + RLS
(public by design, reason recorded); `template_packs.use_case` nullable FK
with a backfill from category and the bundle's `legalFor` mapping
(NEW:2964–2973); `category` CHECK untouched (C8). `supabase/seed.sql` gains
the five packs (`category = 'Annet'`, `use_case` set) and the two re-mappings;
`.github/workflows/ci.yml:63` → `packs <> 22`; `PUBLIC_BY_DESIGN` +
`use_cases`.

Negative tests first: `policy-coverage.test.ts` +4 (anon and outsider can read
the registry — the public-by-design positive; an org's own pack's `use_case`
is not visible to another org — existing pack denial extended); new
`tests/unit/use-of.test.ts` +3 (mapping of every seeded pack to a use case is
total; a Lovpålagt pack maps by `legalFor`; an unmapped pack falls to `annet`).

**UI second.** `UseCaseCard.tsx`; `bibliotek/chips.ts:9, 15` from the
registry; `bibliotek/page.tsx:76–83, 239–253, 195–200`; `Wizard.tsx:138–200`
chips and filtered list (`undersokelser/keys.ts:93–100` retired). Pattern: Tab rails (nine
chips wrap to three rows at 390 px; the "Bruksområder" rail), grid reflow,
Modals (wizard).

**Definition of done.** Gates 1–7; 3a Bibliotek (three tabs, card and list),
wizard step 0 — **then** the `veiviser-formal.png` baseline regenerated in its
own commit (C18). Census ≥ +7, +1 file (≥ 442 / 23). 5a3: +1 registry (`--`).

**Not in this phase.** New use cases beyond the six; any per-use-case navigation (B5).

---

## V1-6 — Carried findings

**Scope**

| Surface | Class |
|---|---|
| Everything carried from V1-0…V1-5 fix passes | as listed by then |

**This phase no longer draws anything.** Q37's two Oversikt surfaces were its
only design work and moved to V1-1 on Tor's call (2026-09-06): Oversikt is the
first screen anyone opens and V1-6 was too late for the most visible difference
between the app and the new bundle. Nothing depended on the delay — see V1-1's
note for the dependency argument.

What remains is the pass this plan always needed and never had a slot for: the
findings each phase's fix pass logged forward rather than fixed, worked in one
place with the whole v1 surface built. Its size is therefore not knowable now,
which is why it keeps a phase of its own instead of being folded into V1-5 —
a carried-findings list with nowhere to land is how findings become permanent.

**Schema first.** Whatever the carried list requires; none is known today.

**UI second.** Likewise.

**Definition of done.** Gates 1–7 over whatever was touched. Census unchanged
unless a carried finding needs a test. 5a3 unchanged.

**Not in this phase.** Anything new. A finding that arrives during V1-6 goes to
V1-7 or to the post-v1 list — the two-pass rule does not restart here.

---

## V1-7 — Stream panel (only if Q26 = build)

**Scope.** Stream panel (NEW:1163–1201; data NEW:3285–3294, 3707–3732) — NOT
BUILT. Presets that lead with it (Q27).

**Schema first.** Migration `…0040_stream_series.sql`: `public.stream_series(p_org,
p_surveys, p_window_days)` SECURITY DEFINER, `revoke from public, anon`,
grant `authenticated`; per-day volume and rolling average over the strictest
`app.k_for` of the selection; the window-step rule from Q41; `available = true`
on the panel-type row.

Negative tests first (`tests/invariants/k-surface.test.ts` +4): n=4 in the
window → gap, n=5 → value; adjacent windows whose difference is below k → the
later window suppressed (the rule Q41 fixes); volume bars absent for a survey
below k in the window; leser and outsider refused. The two-sided k_for
assertion re-run — the function must call `app.k_for` or the suite fails by
construction (`threshold-policy.test.ts:301–318`).

**UI second.** `StreamPanel.tsx`, hand-rolled SVG as the bundle and Oversikt do.
Pattern: Charts (height per Q40).

**Definition of done.** Gates 1–7; census ≥ +4; 5a3 +1 function, protected
(anon revoked) and guarded. This is a **large** phase by the vocabulary above
and the only one that adds a k-gate surface.

---

## Cross-phase constraints (restated so no phase can drop them)

1. **Database before UI, always.** Every phase above lists "Schema first" — where it says "None", that is the statement, not an omission.
2. **Negative tests proven failing before the migration**, with the red-phase output kept as in Phase 8 (`M:0032:12–14` names `scratchpad/redphase2.txt`).
3. **The catalogue-derived k_for assertion, two-sided** (`threshold-policy.test.ts:274–318`), re-run and pasted in V1-0, V1-2 (if `compose_report` changes), V1-4 and V1-7; it runs in every suite regardless.
4. **One verification pass, one fix pass.** Findings from a fix pass are appended to the next phase's "carried" list. A security invariant actually broken stops the line; everything else is logged.
5. **Fidelity check, not rebuild**, for what Phase 8/9 built: Send's policy line and lock note, Resultater's threshold line, the library card's policy line, the respondent's derived banner, Personvern's locked row. The report editor's Filter-tab lines, Innhold "utilgjengelig" and Metode threshold text are brief-derived with no bundle in either version: they are left as built and noted in the phase report as unverifiable against a reference.
6. **No screen the bundle does not contain.** Left out, as stop-and-asks: Personvern §8 controls (brief §8); the «Svar per virksomhet» report section body (brief §6); the optional-mode per-choice consequence texts (brief §4, D85). If any is wanted before a third handoff, it is a decision to build from prose (Q38, Q39).
7. **The apparatus stays frozen.** No new gate. Configuration of existing gates is allowed and required: the reference path (C15), manifest states, seed fixtures, `expected-counts.json`, the 5a3 allowlists, the CI seed count. Limits the gates cannot see — recorded, not built around: `localStorage` state (wide toggle), cron time (pause/resume), window differencing (a new test *shape*, written as a test not a gate), predicate width on the three new tables (VERIFY.md:229), and the CSV route (not a catalogue surface).
8. **Required edits outside `docs/v1/`** (not made in this session): CLAUDE.md design-source path and the two carried counts; VERIFY.md:47–51, 91; `scripts/verify/reference.ts:21, 27`; DECISIONS.md rows Q18+; DEVIATIONS.md D43 and D87 status; RESPONSIVE.md patterns for Q33 and Q40 once decided; `.github/workflows/ci.yml:63`.

## Order rationale

V1-0 first because every later fidelity check is against its frame and its
references, and because the two kernel rules are one-line RPC changes whose
tests are cheap. V1-1 before V1-2 because the policy panel is the control the
attributed view depends on being understood. V1-2 before V1-3 because the
wedge is worth more than the scheduler and touches no schema. V1-3 before V1-4
because the dashboard's register and rounds panels read state V1-2 and V1-3
make real. V1-4 before V1-5 because the use-case cards open presets. V1-6 last
of the certain phases because it is now the carried-findings pass and has to
come after the findings. V1-7 is conditional and last because it is the only
new k-gate surface.

Oversikt was V1-6 on the reasoning that it aggregates everything, which is
Phase 5's own ordering rule — and that rule was wrong here. It governs a screen
whose CONTENT is downstream of other phases; the v1 change is a layout move
plus a card over duty data that shipped in Phase 5, so nothing about it waits
on V1-1…V1-5. Ordering by which screen looks most downstream, rather than by
what it actually reads, put the most visible screen last for no gain.
