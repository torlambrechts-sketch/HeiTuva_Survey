# VERIFY.md — Phase Verification Protocol (reusable)

Paste `## THE PROMPT` after **every** phase, before you review anything yourself. Run the one-time setup below first.

The protocol's premise: **an unverified claim is a hallucination in waiting.** Claude Code must not report status from memory of what it wrote — only from output it just produced. It must also actively try to break its own work; a verification that only looks for confirmation finds nothing.

---

## ONE-TIME SETUP (paste once, after Phase 0)

```
Build the verification harness. This is infrastructure I will reuse every phase.

1. Playwright: install with `npx playwright install --with-deps chromium`.
   Create playwright.config.ts with two projects: "desktop" (1440x900, deviceScaleFactor 2)
   and "mobile" (390x844, iPhone 13 profile).

2. scripts/verify/capture.ts — starts the dev server if not running, logs in as a
   seeded user, navigates to each route in the manifest AT THE VIEWPORTS THAT ROUTE IS
   SPECIFIED FOR (DECISIONS Q15), and for each:
   captures full-page PNG to artifacts/<phase>/<route>.<project>.png, records all
   console messages and failed network requests to artifacts/<phase>/<route>.log.json.
   Routes and their required states live in tests/routes.manifest.ts — a typed list of
   {route, label, viewports:('desktop'|'mobile')[], states:[{name, setup}]} so states
   (empty, warning, error, loading) are captured too, not just happy paths.
   Viewport assignment per DECISIONS Q15: every route is captured at desktop AND mobile,
   because admin mobile is in v1. The two are judged by DIFFERENT bars (see Gate 3) —
   desktop against the design reference, mobile against the rules in docs/RESPONSIVE.md,
   since the prototype contains no mobile app layouts to compare with.
   Also record document.documentElement.scrollWidth per route at 390px to
   artifacts/overflow.json — any value exceeding the viewport is a blocker, not a metric.

   The sweep must be incapable of silently skipping. Three failure modes, all observed:
   - It must run EVERY state of every route, not only a state named `default`. A route
     whose states are named anything else must not be dropped.
   - It must EXECUTE each state's setup before measuring. A screen reachable only by
     clicking (the Builder) is otherwise measured as whatever page linked to it —
     producing a green result for a screen never loaded.
   - Routes not yet built must be declared pending explicitly and matched correctly,
     parameterised segments included. A pending-route matcher that ignores `[` will
     start failing captures the moment any earlier screen links to a later phase's route.
   At the end of the run, print counts: routes declared, measured, skipped, pending —
   and treat `measured < declared - pending` as a failure of the harness, not a pass.
   Any harness fix that widens coverage requires RE-RUNNING earlier completed phases:
   a gate that could not see a defect never proved its absence.

3. scripts/verify/reference.ts — opens the design file
   /design-reference/heituva-survey-app-design/project/HeiTuva.dc.html in Playwright,
   drives its internal state to each screen (the prototype is a single page with JS
   state; set state via page.evaluate rather than guessing click paths), and captures
   artifacts/reference/<screen>.png at 1440 wide. Run once; commit the reference PNGs.

4. tests/db/clients.ts — Supabase clients for each persona: anonClient (no session),
   adminClient, redaktorClient, leserClient (real logins as seeded users, NOT the
   service-role key), and serviceClient used only for arranging fixtures. Any test
   asserting an access rule must use a persona client; using serviceClient to assert
   access proves nothing.

5. tests/db/factories.ts — helpers to create an org with N members, a survey with
   questions, a round with invitations, and to submit K responses via the
   submit_response RPC (never by direct insert — the RPC is the only real path).

6. package.json scripts: "verify:db", "verify:browser", "verify:quality", "verify:all".

Show me the harness running end to end on Phase 0's state before you stop.
```

---

## THE PROMPT (paste after every phase)

```
Verify Phase <N> before I review it. You are not reporting progress — you are trying
to prove your own implementation is wrong. Assume it is until evidence says otherwise.

=== EVIDENCE RULES (these govern everything below) ===
- Every claim in your final report must carry evidence: a command + its actual output,
  a file path with line numbers, or a screenshot path you actually viewed with the Read
  tool. No evidence = the item is UNVERIFIED, never PASS.
- Never write "should work", "is correct", "as expected", or "I implemented X so it does
  Y". If you did not observe it this session, it is UNVERIFIED.
- If you cannot verify something (needs a real inbox, a paid add-on, my decision), mark
  it BLOCKED with the reason. Do not silently skip it and do not approximate it.
- Do not fix anything during gates 1-5. Collect findings, then fix in gate 7. Fixing
  while inspecting hides how many defects existed.
- If a gate cannot run because something is broken, stop and report that. Do not fabricate
  the remaining gates.

=== GATE 1 — SCOPE TRUTH ===
Re-read CLAUDE.md and the phase scope in CLAUDE_CODE_PROMPTS.md. Re-read the relevant
markup in /design-reference/heituva-survey-app-design/project/HeiTuva.dc.html.
Produce a table: every screen, element, state, and behaviour the phase required |
implemented? | file:line where it lives | verified in which gate.
Explicitly list anything in the design you did NOT implement, and anything you built
that the design does not contain (invented features are a defect, not a bonus).

=== GATE 2 — DATABASE: WRITE AND ATTACK ===
Run against a fresh local database (`supabase db reset`) so results are reproducible.
a) Round-trip: for every table this phase writes to, create a row through the actual
   application path (server action or RPC — not raw SQL), then read it back and show the
   row. Prove persistence, defaults, and constraints behave as designed.
b) Attack the access rules with persona clients (tests/db/clients.ts):
   - leser attempts select on responses and answers → must fail
   - a member of org A attempts to read org B's surveys, members, reports → must fail
   - redaktor attempts an administrator-only write (privacy settings, roles) → must fail
   - anon attempts to call aggregate_results and to select any table → must fail
   Show the actual error for each. An empty result set is NOT the same as a denial —
   distinguish them and say which you observed.
c) Invariants for this phase (re-run the whole suite, not just new tests):
   anonymous response carries no invitation_id; aggregate_results and every k-gated RPC
   return insufficient_data at n=4 and data at n=5 (test both sides of the boundary);
   token reuse rejected; audit rows written where required.
d) Constraint proof: deliberately attempt the violation each CHECK/UNIQUE/FK is meant to
   prevent, and show the database rejecting it.
e) `supabase db lint` and the Supabase advisors (security + performance). Report every
   finding, including ones you consider acceptable, with your reasoning.

=== GATE 3 — BROWSER: LOOK AT IT ===
Start the app, run scripts/verify/capture.ts for this phase's routes and states.
a) For each captured screenshot: open it with the Read tool and actually look at it.
   Then open the corresponding artifacts/reference/<screen>.png and compare property by
   property — background, surface, border colour, radius, shadow, font family/size/weight,
   letter-spacing, padding/gaps, chip and button styling, exact Norwegian copy.
   Report mismatches as a list of concrete diffs ("status chip bg #F5C64A, design uses
   #A8D5D2 — src/components/StatusChip.tsx:14"). Do not claim a match you did not look at.
   Note: pixel-diff tooling is for regression against your own earlier screenshots;
   comparison against the design is your visual judgement, because the DOM differs.
b) Console and network: report every console error/warning and every failed request from
   the logs. Zero errors is the bar; warnings need a stated reason to be acceptable.
c) Interaction: for each interactive element in this phase, actually click/type it in
   Playwright and assert the resulting state. Include the failure paths — submit an empty
   required field, save with an invalid value, open a record that doesn't exist.
d) Keyboard and focus: tab through each screen, confirm focus order is sensible and the
   3px focus outline from CLAUDE.md is visible. Screenshot one focused state as proof.
e) Mobile (390px), every route in the phase. Two different bars:
   - Respondent-facing routes (/s/[token], report share, splash): compare against the
     design reference exactly as in (a). These have real mobile designs.
   - App routes: judge against docs/RESPONSIVE.md, NOT against a reference image. Check
     per its verification bar — no horizontal scroll (blocker), nothing clipped or
     overlapping, every control reachable and >=44px, tokens identical to desktop
     (colour-pick, do not eyeball), and the named pattern for that screen type actually
     applied (shell slide-over, table-to-cards, builder sheet, heatmap list, etc.).
     Report which RESPONSIVE.md pattern you applied per screen. If a screen needs a
     pattern that file does not cover, that is a stop-and-ask, not a judgement call.
f) i18n: switch to English and re-capture. Report any hardcoded string that did not
   change, with file:line. Report any key rendering as a raw key.

=== GATE 4 — CODE QUALITY ===
Report each with file:line, no summaries without locations:
- `tsc --noEmit` and eslint output (must be clean; do not disable rules to achieve it)
- every `any`, `as unknown as`, `@ts-ignore`, and non-null `!` added this phase, each
  with a justification or a fix
- any import of the service-role client outside a server action/route handler
- any user-facing string not going through next-intl
- any client-side query touching responses/answers (must not exist)
- missing Zod validation on any server action or route handler input
- duplicated logic that should be shared, and dead code
- obvious N+1 query patterns or unbounded selects
- error handling: what happens when a Supabase call fails — is it surfaced to the user
  or swallowed? Show one path end to end.

=== GATE 5 — TEST QUALITY (the tests must be able to fail) ===
a) Run the full suite; show output including counts. Zero skipped, zero `.only`,
   zero snapshots updated to make things pass.
a2) Hermeticity. Every test must pass from any starting database state, in any order,
   run twice in a row. No `.single()` on a query that another test or a fixture could
   make return more than one row; no assertion on a count that grows when unrelated data
   is added. Prove it: run the suite, run a round-trip that creates extra rows, run the
   suite again. A suite whose green depends on nothing else existing is not a suite.
b) Mutation check — this is mandatory and the most important step in this gate:
   pick the three most safety-critical behaviours this phase touches (for security phases
   these must include a k-anonymity gate and an RLS denial). For each: deliberately break
   the implementation (e.g. change the k threshold to 1, remove a policy, drop the CHECK),
   re-run the suite, and show me the test that failed. Then revert the break with `git
   checkout` and confirm the suite is green again. A behaviour whose test still passes
   while the behaviour is broken is not tested — say so and write a real test.
c) List behaviours from Gate 1 that have no automated test, and state which are acceptable
   as manual checks and which need tests written now.

=== GATE 6 — REPORT ===
Output in this exact structure, nothing else:
1. VERDICT: READY FOR REVIEW / NOT READY — one line, and if not ready, why.
   READY is not available while any gate this protocol declares remains UNVERIFIED.
   Fixing defects does not close an unrun gate: if Gate 3a compared three screens of
   twenty, or 3c/3d/3f were not exercised, the verdict stays NOT READY until they are
   actually run. Defects and unrun gates are separate debts and both must clear.
2. Evidence table: claim | gate | evidence (command output excerpt, file:line, or
   screenshot path).
3. DEFECTS: numbered, each with severity (blocker/major/minor), location, and proposed fix.
4. UNVERIFIED and BLOCKED items with reasons.
5. DEVIATIONS from the design, each with a reason — append these to docs/DEVIATIONS.md.
6. What I (the human) should look at personally, ranked — where your own judgement is
   weakest.

=== GATE 7 — FIX ===
Only now: fix every blocker and major defect. Re-run gates 2, 3, and 5 for what you
touched. Show the re-run output. Leave minors in the report for my decision. Do not
declare done until the re-run is clean.
```

---

## SHORT VERSION (mid-phase spot-check, cheap to run)

```
Spot-check what you just built, evidence only, no memory claims.
1. Screenshot the screen(s) you changed at their specified viewports only (DECISIONS Q15
   — mobile applies to respondent-facing routes), open the PNGs and the design reference,
   list concrete visual diffs with file:line.
2. Console errors and failed requests: paste them.
3. tsc + eslint + the test suite: paste output.
4. Break one behaviour you claim is tested, show the test failing, revert it.
5. State plainly what you did NOT verify.
No fixes until I've seen the list.
```

---

## WHY EACH PIECE IS THERE (so you can judge if it's working)

- **Evidence rules** — the single biggest source of false "done" is the model reporting from what it intended to write. Requiring a command output or a file:line for every claim removes the space where that happens.
- **No fixing during inspection** — lets you see the true defect count per phase. A phase producing twelve blockers is telling you something a silently-repaired phase hides.
- **Persona clients, never service role** — the classic false-green in Supabase work: tests that "prove" RLS while running as service role, which bypasses RLS entirely.
- **Empty result ≠ denial** — the other classic: a query returning `[]` because of a filter bug reads as a passing security test.
- **Both sides of the k boundary (n=4 and n=5)** — a gate that always returns `insufficient_data` passes a one-sided test while being completely broken.
- **Mutation check** — the only way to know a test suite can fail. Green tests over broken code are worse than no tests, because they buy false confidence.
- **Model-eye visual comparison, not just pixel-diff** — your implementation's DOM differs from the prototype's, so pixel-diff against the design is noise; pixel-diff belongs against its own previous screenshots for regression.
- **"Where your judgement is weakest"** — invites the model to surface its own uncertainty rather than smoothing over it, which is where your review time is best spent.
