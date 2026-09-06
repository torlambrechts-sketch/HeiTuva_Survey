# v1 bundle — Round 2: conflicts

Every disagreement between the six briefs, and every place the bundle
contradicts a committed decision. Each is either **RESOLVED** by a rule that
already governs the project (the rule is named) or **TOR'S CALL**, with one
recommended answer and no split difference. Tor's-call items are restated as
one-liners in `04-decisions.md` under the Q number given here.

References as in `00-diff.md` (`NEW:`, `OLD:`, `M:`).

---

## C1 — Where the organisation-survey peer-results hide lives (security vs frontend)

- Security reviewer: in `get_peer_results` (`M:0032:1130–1195`); a token holder can call the RPC directly.
- Frontend architect (implied by the reuse table): `PeerResults.tsx` is "no new component", i.e. the natural place to branch.

**RESOLVED — the RPC.** CLAUDE.md invariant 1: result reads go through SECURITY
DEFINER RPCs that enforce the rule; the client never decides what it may see.
The component renders `hidden` exactly as it renders it today
(`app/s/[token]/PeerResults.tsx:34`). Ships in V1-0 with its negative test first.

## C2 — Whether and where below-threshold stats are hidden (security vs bundle vs DECISIONS)

Two questions inside one conflict.

*Where.* If `n`, svarprosent and snitt are hidden below k, the hiding happens
in `results_summary` (`M:0032:422–584`), not in `ResultsScreen.tsx`.
**RESOLVED** — invariant 1 again ("never a client-supplied value",
`DECISIONS.md:28`).

*Whether.* The brief forbids showing the actual count below the threshold
anywhere, for any role (`docs/Designbrief_terskel_Q17.md:133`). The bundle
hides it on Resultater (NEW:4886–4889) and still prints "N av T" on every
survey row (NEW:4136). The app treats response counts as participation, not
results: `survey_response_counts` and `overview_activity` are exempt from the
k assertion by name and reason (`tests/invariants/threshold-policy.test.ts:297–300`;
D65, `docs/DEVIATIONS.md:1262–1296`). No row in DECISIONS.md decides which
reading holds.

**TOR'S CALL → Q28.** Recommendation: keep the app's reading. A count of
responses is a fact about participation and is shown on the row, on Oversikt
and in the `participation` report section already; a count that disappears on
one screen and not the others is the bundle's own inconsistency, not a rule.
Gate answer-derived scalars only (`avg` is already nulled, `M:0032:471–474`).
If Tor overrules, `n`, `invited`, `responded` and `completion` go null in
`results_summary` below k **and** the row/Oversikt counts must follow, which
also invalidates the `DO_NOT_GATE` exemptions.

## C3 — Dashboard layout ownership (database architect vs frontend architect vs bundle)

- Database architect: `dashboard_layouts` keyed `(org_id, user_id)` — mirrors pins (`M:0024:9–11`: "a pin is one person's, not the organisation's").
- Frontend architect: the layout is the organisation's; per-member override only on request.
- Bundle: component state, nothing persisted (NEW:3115–3117).

The bundle's answer is not an option (a saved preset must reappear "neste
gang", NEW:1023). Between the two remaining, nothing in DECISIONS.md decides.

**TOR'S CALL → Q25.** Recommendation: **per member**, with presets per
organisation. The precedent is the pins table and its stated reason; the brief
speaks of the organisation only for the *first-run* offer of presets
(`docs/Designbrief_terskel_Q17.md:163`), which is what org-level presets give.
A shared org layout that any redaktør can rearrange under a colleague's feet
is the support ticket, not the other way round.

## C4 — Inherited statutory cadence: a lock or a default (database architect vs product; bundle draws a lock)

- Bundle: the cadence picker refuses clicks when `recurInherited` (NEW:4325) and shows a padlock (NEW:2165–2170).
- Database architect: a lock needs a trigger on `schedules`, mirroring `guard_survey_policy`.
- Product reviewer: cadence is not in Q17's law-anchored table (`docs/Q17_terskel_forslag.md:19–31` locks anonymity, respondent kind and threshold only); a lock the scheduler cannot honour to the day is a promise the product cannot keep.

**TOR'S CALL → Q21.** Recommendation: **default, not lock** — the pack's
cadence pre-fills the schedule and the padlock note becomes an explanatory
note ("Anbefalt fra plikten …"). If Tor wants the lock as drawn, it is a
trigger (data rule, service role included, per D31's reasoning), and a fourth
negative test joins the recurrence set.

## C5 — Four respondent language chips vs DECISIONS Q11

- Bundle: NO / SV / DA / EN always (NEW:2320–2324, 4013).
- DECISIONS Q11 (confirmed): Norwegian and English at launch; sv/da seeded but inactive (`DECISIONS.md:19`). D73 already removed sv/da from the splash on exactly this ground (`docs/DEVIATIONS.md:1373–1385`).

**RESOLVED — DECISIONS wins.** The app keeps rendering `surveys.langs ∩
ACTIVE_LOCALES` (`app/s/[token]/page.tsx:55–69`); the chip chrome (11 px code,
`title` = language name) is adopted from NEW; the two inactive chips are not
drawn. Logged as a deviation with Q11 as the driver.

## C6 — Threshold ceiling: chips 3/4/5/8/10, org default 3–10, action max 50

- Panel: five values (NEW:4855).
- `organizations.default_k_threshold` CHECK 3–10 (`M:0034:19–20`).
- `setSurveyPolicy` accepts 3–50 (`app/(app)/undersokelser/[id]/bygg/actions.ts:352`).
- Q17: "aldri under 3", no ceiling stated for a single survey (`DECISIONS.md:25`).

**TOR'S CALL → Q36.** Recommendation: the server accepts 3–10, matching the
org default's range and the panel's top value; the panel is the only writer.
A ceiling is a product choice Q17 left open, so it is confirmed rather than
assumed.

## C7 — What "strengeste terskel blant valgte undersøkelser" counts

- Bundle: the maximum over **all** person surveys in the organisation (NEW:3533).
- App/RPCs: the maximum over the **selection** (`M:0032:973, 1043`; `DashboardScreen.tsx:41–44`).

**RESOLVED — the RPC's k.** The line describes the gate that was applied to
the panels on screen; a number the RPCs did not apply is a fabricated claim
(CLAUDE.md, "Never fabricate data in the UI"). The bundle wins on visuals, not
on what a number means. The copy is kept verbatim; the value is the RPC's.

## C8 — New pack categories: widen the CHECK or add a registry

- Database architect: widen `template_packs.category` CHECK (`M:0003:6`) **or** add a `use_case` column.
- Product/frontend: a `use_cases` registry (data-not-code).

**RESOLVED — registry plus column, CHECK untouched.** CLAUDE.md "Data-not-code":
a use case is a registry row with a label, description, tint and preset; a
pack points at it (`template_packs.use_case`, nullable, backfilled from
category and the bundle's `legalFor` mapping, NEW:2964–2973). `category` keeps
its four values and stays internal; the five new packs are seeded with
`category = 'Annet'` and their use case set. Widening the CHECK would make the
category carry two meanings.

## C9 — The stream panel: build now or defer (frontend vs security, product, verification)

- Frontend: it is drawn; CLAUDE.md says match the bundle.
- Security: a per-survey, per-day series with an unresolved differencing rule.
- Product: no transactional data model exists; the picker has an "Ikke tilgjengelig" treatment (NEW:2962, 3666–3670).
- Verification: a new SECURITY DEFINER vault reader that `threshold-policy.test.ts` #8b fails by construction until it calls `app.k_for`, and a test shape (window differencing) the suite has never had.

**TOR'S CALL → Q26.** Recommendation: **defer** behind a flag
(`feature_flags.event_stream_panel`); the panel appears in the picker as the
bundle's own unavailable state, with its `req` chip. The bundle sanctions
drawing its absence, so this is not hiding a feature.

## C10 — The wide toggle below 1192 px (RESPONSIVE rule 4 vs an inert control)

- RESPONSIVE.md:23: no feature hidden on mobile; "if something genuinely cannot work at 390px, stop and ask".
- D26: a control that silently does nothing is worse than one that says why it cannot.

**TOR'S CALL → Q32.** Recommendation: render the toggle at `xl` and above
only, log the deviation under rule 4's own escape clause. It has no meaning
where the frame is already `calc(100% - 72px)`.

## C11 — «Svar per virksomhet» under share scopes (security)

`compose_report` skips `teams`/`heatmap` for `alle_ansatte` (`M:0034:340–343`)
but composes `per_virksomhet` for any scope when all sources are organisation
surveys (`M:0034:401–414`). An all-employees or team-leader share link on an
åpenhetsloven report therefore renders supplier names and answers to a reader
with no session. Åpenhetsloven requires the *redegjørelse* to be published
(`duty_definitions.publish`, `supabase/seed.sql:57–58`); it does not require
the per-supplier answers to be.

**TOR'S CALL → Q30.** Recommendation: `per_virksomhet` composes only for a
member reader at `ledelse` scope; share tokens receive it as `unavailable`
with reason `share_scope`. Negative test first (`attributed-results.test.ts`
C-block gains one case).

## C12 — Oversikt layout: bundle vs app (app matches OLD)

**RESOLVED — the bundle wins on visuals** (CLAUDE.md, "When ambiguous"). The
"Krever handling" card moves into the lower grid and the chip row becomes the
dark compliance card. This is a fidelity rebuild of an ALREADY BUILT screen,
not a new screen; data is unchanged (`app/(app)/oversikt/page.tsx:131–164`).

## C13 — Charts minimum height 200 px vs the bundle's 120 px and 172 px charts

- RESPONSIVE.md:64–65: "Maintain aspect ratio, minimum height 200px".
- Bundle: rounds panel 120 px (NEW:2598), stream SVG 172 px (NEW:1175).

RESPONSIVE.md governs below 1280 px only and calls itself a specification, not
a suggestion (CLAUDE.md). At desktop the bundle's heights stand. Below `md`
the rule as written makes the mobile chart taller than the desktop one.

**TOR'S CALL → Q40.** Recommendation: amend RESPONSIVE.md's Charts rule to
"never smaller than the design draws it; never below 44 px per interactive
mark", and drop the 200 px floor — the floor predates any chart in the product.

## C14 — The customise card's mobile treatment (frontend guess vs responsive reviewer)

- Frontend (predicted): a full-screen sheet below `md`, like the Builder pane.
- Responsive reviewer: it is inline content, not a pane; RESPONSIVE.md has no pattern and says so is a stop-and-ask (`docs/RESPONSIVE.md:5`).

**TOR'S CALL → Q33.** Recommendation: it stacks in place (rule 5, content
order); its three tabs wrap (Tab rails); the picker's two columns become one.
Whichever answer, it is written into RESPONSIVE.md as a named pattern before
V1-4's UI starts — the file is the specification and may not be improvised.

## C15 — Which bundle the reference harness renders

`scripts/verify/reference.ts:21`, VERIFY.md:47–51 and CLAUDE.md name the old
path. The frame change (NEW:364) alters every screen, so an "unchanged" screen
rendered from OLD is not a valid reference for anything.

**RESOLVED — v1 for every screen.** Re-pointing the path is configuration of
an existing gate, not a new gate; the old bundle stays in the repository for
history. The path edits to CLAUDE.md, VERIFY.md and `reference.ts` are outside
`docs/v1/` and are listed in `03-plan.md` V1-0 as required edits, not made in
this session.

## C16 — Who may read recurrence status (security vs product)

- Today `schedules` is readable by editors only (`M:0030:117`); the row chip and the context chip would be invisible to a leser.
- Security: a widening of an RLS surface, with its own positive control and outsider denial.
- Product: cadence, next run and round count are not answer data.

**TOR'S CALL → Q23.** Recommendation: viewers may read
(`app.can_view_survey`); writes stay with editors; tests first.

## C17 — Pins without an opener (product reviewer)

The new bundle keeps "Legg i rapport" on aggregate panels (NEW:1095–1097)
and drops the "Åpne rapport (n)" button from the markup (`pinnedLabel` only
in JS, NEW:3734); "Frys som rapport" reads the layout, not the pins
(NEW:3647). The app has both pins and the opener (`OpenPinnedButton.tsx`, D46
closed in `M:0024`).

**TOR'S CALL → Q29.** Recommendation: keep the app's "Åpne rapport (n)"
beside "Frys som rapport" and log the deviation; removing a working consumer
to match a bundle that forgot it would leave pins storing a fact nobody can
use.

## C18 — When the wizard's visual baseline is regenerated (frontend vs verification)

**RESOLVED — its own commit, after the Gate 3a look at the new step 0**
(`tests/visual/screens.spec.ts:34–35`: "deliberately, never reflexively").

## C19 — Where the leser's register-panel refusal lives

Not a conflict once stated: the RPC refuses (`M:0034:176–178`, tested), and
the panel renders the bundle's unavailable treatment with a reason. Control in
the database, message in the UI. **RESOLVED.**

## C20 — A stream RPC in `DO_NOT_GATE` (database architect vs verification)

**RESOLVED — no.** `DO_NOT_GATE` is for functions that read the vault for
participation counts only (`threshold-policy.test.ts:297–300`); a function
returning averages calls `app.k_for` or does not exist. Moot while C9 defers.

## C21 — D43 and recurrence (product reviewer vs the prompt's premise)

The prompt's premise is that recurrence "appears to resolve D43". It does not:
the "Sendes" picker and the reminder chips are still drawn and still unbuilt
(NEW:2245–2263), and D43's open question (how a scheduled survey appears on
the list) is answered by the row chip (NEW:3269–3272).

**TOR'S CALL → Q19.** Recommendation: D43 stays open on its two controls;
recurrence is built as the bundle draws it; the row chip closes D43's question.

## C22 — Use-case catalogue as product surface (product reviewer vs nothing in DECISIONS)

The bundle commits the six-category catalogue as a tab, a chip rail, a wizard
step and pack eyebrows. No decision exists.

**TOR'S CALL → Q24.** Recommendation: commit, as a registry (C8), because the
cost is data and the value is discoverability; the 36-use-case list behind the
six categories stays outside the product until a pack exists for it.
