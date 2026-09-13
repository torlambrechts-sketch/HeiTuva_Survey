# Walk — summary, and which gate should have caught it

**2026-09-12.** Every gate was green on `f189d13`, confirmed job-by-job on CI run 177, and **two of
the product's screens were completely dead.** That is the whole finding; everything below is detail.

## Priorities

### Fixed (eight)

| # | Severity | What |
|---|---|---|
| W-01 | BLOCKER | Live entirely unusable — `export { Code }` from a `'use server'` file killed all three presenter actions |
| W-02 | BLOCKER | Arbeidsliste entirely unusable — `export const TASK_ERROR_KEY`, same mechanism, eleven actions |
| W-03 | MAJOR | The respondent was promised a reply that cannot be delivered on a share link or QR (`M:0119` + `qcNoReply`) |
| W-04 | MAJOR | «Ord minst 0 personer har skrevet» on the presenter screen, from a `?? 0` over an absent key |
| W-05 | MAJOR | A permanently impossible group delete said «Prøv igjen»; now `group_in_use`, named |
| W-06 | MINOR | A typed-but-unsaved comment was discarded silently; the draft now survives and submits |
| W-07 | MINOR | No `<main>` landmark on the Live page or `/rapporter`; three roots now open one |
| W-14 | LIMITATION | Every gate discarded the server log; the child's output is captured and printed on failure |

### Withdrawn (two) — wrong, and mine

| # | What I claimed | What is true |
|---|---|---|
| W-10 | Both quiz guards enforced by hiding the control, unexplained | The Quiz card is on the **Generelt** tab, always rendered, and says «Malen låser kjøremodus.» or switches the survey to «Med navn» and tells you |
| W-13 | No seeded survey can reach quiz mode | `Utkast uten svar` reaches it in one click — the product switches anonymity for you |

Three stacked locator errors produced both: a regex that could not match a card named «Quiz» +
«Opplæring og sertifisering»; a `.first()` that clicked the hidden mobile copy of «Innstillinger»;
and then the wrong pane entirely. **A control reported missing is a claim about a SCREEN, and it is
only as good as the pane you were looking at.**

### Standing, decided rather than built (four)

| # | Severity | Decision |
|---|---|---|
| W-09 | LIMITATION | A quiz respondent is never shown a score. **Not built** — it is a feature with a real question behind it (should a person be shown they answered wrong, and who else sees it), and Q84 already narrowed this area once |
| W-12 | LIMITATION | Eight of thirteen question types absent from the seed. **Not changed** — extending `seed-demo` moves every capture that lists surveys, so `verify:visual` and `verify:responsive`'s 206 combinations need re-baselining in the same commit. A phase's job, not a walk's |
| W-11 | LIMITATION | «6 svar» is the first scale question's `n`. **Left** — both numbers are right and the k-gate reads the same place; the honest improvement is a label, and presenter labels are the bundle's to decide |
| W-08 | LIMITATION | Firma saves on blur. **Left** — every ordinary path saves, including a nav-link click; only a hard navigation with focus still inside discards, as any unsaved form does |

---

## WHICH GATE SHOULD HAVE CAUGHT THIS

For every BLOCKER and MAJOR: the gate that covers that surface, and why it was green.

### W-01 / W-02 — the two dead screens

**The gate is `verify:browser` (Gate 5), and `verify:interaction` (5c) and `verify:visual` (5g)
cover the same surfaces.** All three were green on run 177. The manifest has a `live` state that
*navigates* to the presenter screen by clicking «Kjør live», and seven `oppgaver` states including
`tavle` and `rad-apen`.

**Why they were green, and it is one sentence: a `'use server'` module is registered lazily, so the
page renders and only the action fails.** The gates load pages and photograph them. Nothing in the
harness presses a button that writes. `verify:interaction` opens menus and tabs — state that lives
in React — and the `tavle` state is reached by setting the **cookie** directly in the manifest
(`heituva.worklist`), not by clicking «Tavle». So the one click that would have failed is the one
click the harness replaces with a fixture.

Three independent reasons the failure was invisible:

1. **No gate invokes a server action from the browser.** `verify:roundtrip` drives *some* server
   actions — it was green, and it does not touch these two screens.
2. **A 500 on a server action is not a page failure.** The capture's page load returns 200; the
   error only exists in a POST the capture never makes.
3. **The server log is discarded** (`stdio: 'ignore'`). Even when the POST happens, the cause is
   thrown away.

**What would catch it, cheaply and without a new gate.** A source-level property, as a unit test in
the existing suite: *no module whose first line is `'use server'` may export anything that is not an
`async function`*. It is a file read, needs no browser and no database, and it is catalogue-derived
rather than a list — exactly the shape D115's zero-catch-all sweep already has. The walk ran it as a
shell loop over all 21 modules and it found both violations in under a second. This is a finding,
not something I built: the apparatus is frozen.

The deeper lesson is the one this repository keeps paying for. **`tsc` and `eslint` were both green
on the broken code, and they are right to be. That is not a gap in either of them and must not be
written up as one** — `export { Code }` is valid TypeScript and valid lint, and a type checker that
started refusing it would be wrong about the language it checks. The constraint is Next's, enforced
at module registration, and nothing in the gate set speaks that language. The honest statement is
that the product has a rule no existing gate is even the right KIND of tool to enforce, which is why
the remedy above is a source-level property test rather than a stricter compiler setting. The same gap produced D162 two days ago: twenty-two SCIM tests passed while the
endpoint was unreachable, because calling a handler as a function never meets the middleware.
**Both are the same shape — a boundary the test harness steps over.**

### W-03 — the promise that cannot be kept

**No gate covers this, and that is correct rather than a gap.** `verify:copy` checks threshold
claims against the database. `verify:i18n` checks that a page is in the language it says. Neither
can know that «Lederen kan svare» is false when `invitation_id is null`, because that is a claim
about a *capability*, cross-referenced against a column on another table and a conditional in a
manager-facing component.

**CLAUDE.md already names the protection and it is not mechanical:** the claim-set sweep, run once
per bundle, comparing the copy against the running product. This sentence entered in C3 and the
sweep that would have caught it is the one that runs over *bundle* prose — this string is ours, not
the bundle's. **The gap is that the sweep's scope is the handoff's copy, not our own.** That is
worth one line in the checklist rather than a gate.

### W-04 — the fabricated zero

**The gate is `verify:copy`, and it was green for a reason worth recording.** That gate strips ICU
placeholders and tests what is left (V2-4 repaired it to do exactly this). `cloudFloor` is
`"Ord minst {floor} personer har skrevet"` — after stripping `{floor}` nothing false remains, and
the gate is right: the *string* is fine. The defect is the **value**, supplied at runtime by a `??
0` over a key the RPC does not return below the threshold.

So the gate that should have caught it is a **browser** gate reading the rendered text in the gated
state — and `artifacts/`'s manifest has no below-threshold live state at all. The `live` state is
captured on the above-k survey, where the floor is real and the subtitle is correct.

**What would catch it: a manifest state for Live below the threshold.** Adding a state is the
ordinary way this project grows its coverage, and the manifest's own header says a state with no
entry is a state nobody is looking at. Logged for the next phase.

---

## What the walk says about the apparatus, in three sentences

1. **The gates prove pages render and schemas hold; nothing proves a button writes.** 96 server
   actions exist and the only gate that invokes any of them is `verify:roundtrip`. Two screens were
   dead for a day behind seventeen green checks.
2. **The seed is the ceiling on what any browser gate can see.** Eight question types, the
   quiz-offerable state and a below-k live screen are all unreachable from it, and every gate that
   walks the seeded path reports complete coverage of a subset.
3. **A discarded log is a discarded diagnosis.** The one line naming both BLOCKERs was written by
   the server on every failed click and thrown away by the harness that provoked it. **Fixed
   2026-09-13** — `stdio: ['ignore', log, log]` and `serverLogTail()` — and it earned itself on the
   first run, diagnosing a stopped Supabase stack that had presented only as a sign-in timeout.

## Numbers, with the command beside them

| Measure | Value | How |
|---|---|---|
| Manifest route entries / states | 42 / 98 | parsed from `tests/routes.manifest.ts` |
| Routes loaded in the walk | 38 + 5 survey sub-routes | `scripts/walk/w9-routes.ts` |
| Application errors on load | 0 | same run |
| Raw message keys rendered | 0 | same run |
| Server actions in the product | 96 | `grep -rl "'use server'"` + `^export async function` |
| Actions driven to a measured write | ~25 | the table in `00-method.md` |
| `'use server'` modules swept | 21 | shell loop over files whose line 1 is the directive |
| Violations of the export property | 2 before, **0 after** | same loop |
| Question types in the registry / in the seed | 13 / 5 | `lib/questions/registry.ts`, `select type … group by type` |
| Question types driven at 400px | 13 | `scripts/walk/w3-thirteen.ts` |
| Findings logged | 14 (2 BLOCKER, 3 MAJOR, 2 MINOR, 7 LIMITATION) | `01-findings.md` |
| **Withdrawn as wrong** | **2** | W-10, W-13 — three stacked locator errors, all mine |
| Findings standing | 12 | 14 − 2 |
| **Fixed** | **8** | W-01, W-02, W-03, W-04, W-05, W-06, W-07, W-14 — `grep -c '· FIXED' docs/walk/01-findings.md` |
| Decided, not built | 4 | W-08, W-09, W-11, W-12 |
