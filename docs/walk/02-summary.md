# Walk — summary, and which gate should have caught it

**2026-09-12.** Every gate was green on `f189d13`, confirmed job-by-job on CI run 177, and **two of
the product's screens were completely dead.** That is the whole finding; everything below is detail.

## Priorities

### Fixed in this run (three)

| # | Severity | What |
|---|---|---|
| W-01 | BLOCKER | Live entirely unusable — `export { Code }` from a `'use server'` file killed all three presenter actions |
| W-02 | BLOCKER | Arbeidsliste entirely unusable — `export const TASK_ERROR_KEY`, same mechanism, eleven actions |
| W-04 | MAJOR | «Ord minst 0 personer har skrevet» on the presenter screen, from a `?? 0` over an absent key |

### Act on next, in this order

| # | Severity | What | Why it is first |
|---|---|---|---|
| W-03 | MAJOR | The respondent is promised «Lederen kan svare…» on share-link and QR surveys, where the manager is told there is no thread | It is a promise to a respondent that the product cannot keep, on the surface whose credibility everything else rests on |
| W-05 | MAJOR | «Kunne ikke lagre. Prøv igjen.» for a group delete that can never succeed | Sends an administrator in a loop and hides a constraint explainable in one sentence |
| W-13 | LIMITATION | No seeded survey on which quiz mode can be switched on | Blocks driving `setRunMode`/`setQuizSettings` at all; one fixture survey closes it and unblocks the untested half of Quiz |
| W-12 | LIMITATION | Eight of thirteen question types absent from the seed | Any respondent-path gate exercises 5 of 13 renderers and looks complete |
| W-06 | MINOR | A typed-but-unsaved comment vanishes with no warning | Cheap to fix, and it is respondent-entered text |
| W-09 | LIMITATION | A quiz respondent is never told anything, including that it was a quiz | Needs a decision, not code |
| W-11 | LIMITATION | «6 svar» is one question's `n`, not the participants | Needs a decision about what the presenter's number means |
| W-07 | MINOR | No `<main>` on the Live page and on `/rapporter` | Two elements |
| W-08 | LIMITATION | Firma saves on blur, invisible pending state | Affects one form |
| W-10 | LIMITATION | Quiz guards enforced by hiding the control, unexplained | Affects discoverability, not correctness |
| W-14 | LIMITATION | Every gate discards the server log | Apparatus change — see below |

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
on the broken code, and they are right to be** — `export { Code }` is valid TypeScript and valid
lint. The constraint is Next's, enforced at module registration, and nothing in the gate set speaks
that language. The same gap produced D162 two days ago: twenty-two SCIM tests passed while the
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
   the server on every failed click and thrown away by the harness that provoked it.

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
| Findings | 14 (2 BLOCKER, 3 MAJOR, 2 MINOR, 7 LIMITATION) | `01-findings.md` |
| Fixed in this run | 3 | W-01, W-02, W-04 |
