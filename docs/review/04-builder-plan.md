# 04 — Builder and question bank: the plan

Derived from the measurement in **`docs/review/07-builder-fidelity.md`**, which is source-against-
bundle and carries no screen. Decisions this plan depends on are in **`docs/review/05-decisions.md`**
(Q103–Q110); each phase names the ones it needs answered before it starts.

Four phases, dependency order. **Each is closable in one verification pass and one fix pass.**

## Constraints this plan is written under

- Database before UI, always.
- Any phase touching an aggregate path carries the **two-sided catalogue-derived `k_for` assertion**:
  nothing calls the old constant, everything reading the vault calls `k_for`. **No phase below
  touches an aggregate path** — stated per phase, and stated as the reason the assertion is absent
  rather than omitted silently.
- No phase builds a screen absent from a bundle. B3 builds the picker overlay, which **is drawn**
  (`V2:650-693`) and simply does not exist in the app — a different thing from inventing one.
- Anything already built is a **fidelity check against the corrected v2**, not a rebuild.
- Any phase introducing a screen with no seedable state extends the demo seed **in the same phase**.
- The apparatus stays frozen. A check the gates cannot make is logged as a limit, not built.
- Docker is unavailable, so **every visual half below is UNVERIFIED unless Q110 gives it an
  environment.** Source-reading is not filed as seeing a screen.

## The numbers this plan starts from

| | Value | Re-derive with |
|---|---|---|
| census | **978 tests across 69 files** | `node -e 'const c=require("./tests/expected-counts.json");…'`, or `CENSUS_WRITE=1 npx vitest run` |
| Gate 5a3 | **65 of 90** (last measured V2-10; needs a database) | `npm run verify:policy 2>&1 \| grep -cE '^  (ok\|NO DATA)'` against `grep -E 'enumerated'` |

**5a3 does not move in any of the four phases, and that is a fact about what 5a3 enumerates, not
a gap.** It sweeps RLS tables and SECURITY DEFINER functions in `public`. B0–B3 add **no table and
no such function**: B1 and B3 reuse `survey_questions.answer_index` / `points` (`M:0085`) and
`addBankQuestion`, and B0/B2 touch no SQL at all. Every phase below therefore reports **65 of 90**,
and reports it as unchanged-by-construction.

---

# B0 — Citation discipline, and one dead class

**Depends on:** Q105. **No database.**

### Scope
1. `QuestionCard.tsx:276` — `<details className="mt-[11px] md:open" open>`.
2. Backfill bundle prefixes on the 28 `HeiTuva.dc.html:NNN` citations under `bygg/` and `bibliotek/`.

### Fidelity diffs closed
- **`md:open` matches nothing.** `open` is a Tailwind *variant*, never a utility;
  `grep -rn "md:open"` returns this one site and the compiled CSS has no `.md\:open`. The `open`
  attribute beside it is unconditional, so the disclosure is expanded at every width while the
  comment three lines up says it is «closed by default» below `md`. Fix: drop the dead class, make
  `open` conditional on the `md` breakpoint (or drop `<details>` for a state-driven disclosure) so
  the comment becomes true. — `app/(app)/undersokelser/[id]/bygg/QuestionCard.tsx:274-277`
- **28 citations name a file that exists three times.** Worked case: `QuestionCard.tsx:106` cites
  `:387` for `flex:1 1 220px` — correct in **v1**, where that line is the input; in **v2** line 387
  is a header `div` and the control is at **:412**, still carrying `flex:1 1 220px`. The property is
  right and only the pointer is stale. V2-10 already writes `V2:3399-3408`; this adopts that.

### RESPONSIVE.md pattern
**§ Three-pane Builder** — the advanced block is the disclosure that section describes. Nothing else
on the screen changes, so no other pattern applies.

### Explicitly NOT in this phase
Any other Builder property. Any bundle citation outside `bygg/` and `bibliotek/`. Renaming
`QuestionCard`'s props. Touching `PreviewPane`.

### Numbers it produces
- Census **978 → 980** — two tests on the disclosure: closed below `md`, open at `md` and up
  (`tests/unit/…`, extending an existing file rather than adding one, so the file count holds at 69).
- **The citation backfill carries NO test, deliberately.** A test asserting a comment convention is
  a meta-check, and the apparatus is frozen. It is verified in the phase report by
  `grep -rn "HeiTuva\.dc\.html:[0-9]" app/ | grep -v "V1:\|V2:\|L:"` returning nothing.
- 5a3 **65 of 90**, unchanged by construction.

---

# B1 — Quiz reaches the preview

**Depends on:** Q109 (the green), Q110 (where §2's proof runs). **Database first, and the answer is
that it is already done.**

### Database step, done before any UI
`M:0085` already carries `survey_questions.answer_index int` (CHECK: only `choice`/`yesno`/`dropdown`)
and `points int not null default 100 check (points between 0 and 1000)`. **Both have writers** —
`bygg/actions.ts:163` writes `points`, and the answer-key select writes `answer_index` — so CLAUDE.md's
«who writes this column?» is answered before the phase opens, not discovered inside it. The phase
opens with that check re-run against the live catalogue and the result in the report; **if either
turns out to have no writer, the writer is this phase's first commit and the renderer waits.**

This phase reads no aggregate. `aggregate_results`, `get_quotes` and the heatmap RPCs are untouched,
so **the two-sided `k_for` assertion does not apply** — stated, not omitted.

### Scope, and it is exactly the three unbuilt `isQuizMode` regions
| Region | Bundle | What it draws |
|---|---|---|
| `V2:645` | tabAdd note | «Quizmodus: flervalg med inntil fire alternativer vises som store fargefelt med figurer. Flere enn fire blir en vanlig liste.» on `--sbg`, `radius 11`, `11px 13px`, `12.5px`, `line-height 1.5` |
| `V2:900` | preview score/timer bar | `--ac`, `9px 12px`, `radius 11`, two spans at `11.5px/700`, `justify-content:space-between`, `margin-bottom:12px` |
| `V2:6506-6516` | the key, marked | `quizLine` = «Riktig svar: alternativ N · P poeng» / «Riktig svar: første alternativ» when `answerIndex` is undefined / «Ikke poenggivende i quiz» for a type that cannot carry one. Correct chip: `bg #E4F2E0`, `border #2F5D2A`, `fg #2F5D2A`, mark «✓ riktig» |

### Fidelity diffs closed
- `app/(app)/undersokelser/[id]/bygg/PreviewPane.tsx` contains **no occurrence** of `quiz`, `riktig`,
  `correct`, `#E4F2E0` or `#2F5D2A`. The editor half is built (`QuestionCard.tsx:467-501`:
  `quizAnswerKey`, `quizPoints`, `quizNoKey`, `quizNotKeyable`) and writes the columns; **only the
  renderer is missing.**
- `Builder.tsx:288-296` renders the tabAdd panel with no `isQuizMode` branch.

### What this phase does NOT build, and why it is not a defect
**`V2:908`, `quizPreview.chips`.** The bundle renders `(st.quizPass || 70) + " % for å bestå"` and an
attempt count unconditionally. **Q84 built neither a pass mark nor an attempt limit**, and `QuizPanel`
already says so on the face of the product (`quizCertificateUnavailable`: «Ikke bygget. Quiz har ingen
beståttgrense.»). Rendering the chips would be fabricating data in the UI. **The bundle draws them; we
do not; V2-10 decided that and it stands.** Written here in the two-clause form because this exact line
was once read as an outstanding defect.

### RESPONSIVE.md pattern
- Right pane (tabAdd note) — **§ Three-pane Builder**.
- Preview phone frame — the bundle fixes it at `width:300px` (`V2:897`); it is already narrower than
  390px, so **no pattern applies and none is invented**.
- The correct-answer mark — **§ Global rule 2, 44px hit areas** does *not* apply (a preview chip is
  not interactive), but **colour must not be the only channel**: «✓ riktig» is the second channel and
  the phase asserts it, the way `quiz-tiles` asserts the tiles' shape channel.

### Explicitly NOT in this phase
A pass mark. An attempt limit. A certificate. Instant answer reveal. The leaderboard (built, V2-10).
The respondent tiles (built, V2-10). Any change to `submit_response`.

### Numbers it produces
- Census **980 → 991**: `quizLine`'s three branches including the `answerIndex === undefined` case (3),
  the non-keyable types (2), the chip's colour + mark two-channel assertion (3), the tabAdd note's
  gating (1), and the contrast ratios for `--ok`/`--okbg` recomputed from the token values if Q109
  goes that way (2). One new file, `tests/unit/quiz-preview.test.ts` → **70 files**.
- 5a3 **65 of 90**, unchanged by construction.
- **Unblocks §2's second photograph** («designate a correct answer and see the preview mark ✓ riktig»),
  which cannot be taken today.

---

# B2 — The right pane's fourth tab, and the add panel's grid

**Depends on:** Q107. **No database.**

### Scope
1. Split `Builder.tsx:36`'s `['add','settings','preview']` into the bundle's four
   (`V2:6472`: `Generelt · Legg til · Innstillinger · Vis`), moving `RunModePanel` and `QuizPanel`
   into `general` and leaving `PolicyPanel` + `EngagementPanel` in `settings`.
2. The add panel's type-group grid.

### Fidelity diffs closed
| | Bundle | App today |
|---|---|---|
| tabs | four (`V2:6472`) | three — `Builder.tsx:36` |
| `Generelt` contents | Kjøremodus, Byggemodus, mode-gated Live/Quiz (`V2:564-645`) | all four panels stacked under `settings` — `Builder.tsx:338, 362, 386, 440` |
| type-group layout | `grid-template-columns:1fr 1fr` (`V2:697`) | `flex flex-col` — single column, `Builder.tsx:299` |
| tint square | `20×20`, `radius 6` (`V2:699`) | `h-[26px] w-[26px] rounded-lg` — 26px, radius 8 |
| type label | `12.5px/600`, `line-height 1.25` | `text-[13.5px] font-semibold` |
| type button | `10px 11px`, `radius 10` | `px-[13px] py-[11px] rounded-[11px]` |

All five geometry rows are **v1 properties v2 moved**; the app is faithful to the bundle it was built
against and stale against the one that now governs.

### RESPONSIVE.md pattern
- **§ Tab rails and chip groups** for the four-tab rail — it already names «Builder mode chips»; a
  fourth tab is what that section exists to absorb, and `verify:responsive` is the gate.
- **§ Three-pane Builder** for the pane itself.
- The two-column type grid collapses to one column below `md`. **That is the current app layout, so
  the change is additive at `md` and up and the 390px rendering does not move** — worth saying,
  because it means the responsive gate should be flat across this phase and a red there is a real
  finding rather than expected churn.

### Explicitly NOT in this phase
`PolicyPanel`'s and `EngagementPanel`'s own contents. The mode chips' behaviour. Anything under
`tabPreview`. The picker overlay — B3.

### Numbers it produces
- Census **991 → 998**: the four-tab set and its labels (2), each panel resolving to the right tab (4),
  and the add-panel grid's column count at both breakpoints (1). Extends existing files → **70 files**.
- 5a3 **65 of 90**, unchanged by construction.

---

# B3 — The question-bank picker overlay, and the bank's confirmation

**Depends on:** Q106, Q108. **Database first, and the answer is reuse.**

### Database step, done before any UI
The insert path already exists — `bibliotek/actions.ts` `addBankQuestion`, reached today from
`BankRow.tsx` with a `targetSurveyId`. The phase opens by proving that action is callable from the
Builder's own route with the Builder's survey id and refuses for a `leser`, **before a line of the
overlay is written**. No migration is expected; if the proof fails, the fix is the phase's first
commit.

No aggregate path is touched, so **the two-sided `k_for` assertion does not apply.**

### Seed, in this phase, because the constraint says so
**`scripts/seed-demo.ts` seeds no `question_bank` rows** — `grep -n "question_bank" scripts/*.ts`
returns nothing. An overlay whose entire content is bank rows would open empty on a fresh reset, which
is the shape CLAUDE.md names six times: green for something structurally invisible. The phase seeds a
bank spanning the categories the chips are built from (`["Alle","Egne", …cats]`, `V2:6204`), including
at least one `own` row so the delete affordance has a subject and one validated row so the badge has
both states.

### Scope — the overlay, to the bundle's properties
Scrim `position:fixed; inset:0; z-index:60; rgba(25,21,16,.42)`, `padding:28px`. Panel `max-width:660px`,
`max-height:82vh`, `radius 20`, `--sf`, `box-shadow 0 30px 70px rgba(25,21,16,.3)`. Title Playfair `500`
`22px` «Spørsmålsbanken»; subtitle `12.5px --mut` «Legges rett inn i {draftTitle} · {pickerCount}»;
close `34×34` `radius 10`. Search `12px 15px` `radius 10` `--bg` `13.5px`. Category chips `7px 13px`
`radius 999` `12px/600`. Row `13px 0` with `1px --line` bottom, text `14px/500`, badge `3px 9px`
`radius 999` `10.5px/700`, then `{cat} · {type}` at `11.5px --mut`, action «Legg til» `9px 16px`
`radius 10` `--sbg` `12.5px/600`. Footer `16px 24px` `--bg` with top border: `{pickAddedNote}` left,
«Åpne biblioteket» (outline) and «Ferdig» (`--ac`, `13px/700`) right.

Plus the bank tab's confirmation, per Q108: header `--ac2` pill «Lagt til i {title} ✓», cleared at
**2200 ms** (`V2:4431-4432`), replacing the permanent in-button state at `BankRow.tsx:75-87` — which
today also makes a question addable exactly once, a restriction nothing in the schema asks for.

### Fidelity diffs closed
- **The overlay does not exist in any form.**
  `grep -rl 'pickerOpen|pickQuery|pickerRows|pickAddedNote|Legges rett inn' app/ lib/ components/` → no files.
  `Builder.tsx:290-296` renders the bundle's label and colour as `<Link href="/bibliotek?fane=bank">`,
  which leaves the Builder; `bibliotek/page.tsx:520` then has to rediscover the draft. The app already
  implements the overlay's semantics on a different screen, having discarded the state that made them cheap.
- `BankRow.tsx:75-87` vs `V2:4431-4432` — placement, copy (no draft name) and the missing 2200 ms clear.

### RESPONSIVE.md pattern
- **§ Modals and the wizard** for the overlay. Its `max-width:660px` and `padding:28px` scrim need the
  section's narrow-viewport treatment; at 390px the panel is full-bleed within the scrim's gutter.
- **§ Data tables → narrow rows** for the picker's rows. **Count the controls, do not trust a sentence:**
  the row carries text + badge + `{cat} · {type}` + «Legg til». That is the exact clause D129 was filed
  against — S3 broke it by adding a fourth control while quoting it approvingly — so this phase counts
  them at 390px and lets `verify:responsive` decide, rather than asserting they fit.
- The bank tab keeps **§ Data tables → narrow rows** as it has it; only the confirmation moves.

### Explicitly NOT in this phase
Multi-select in the picker. Reordering after insert. Any change to what a bank row *is*. The Library's
other tabs. Search ranking. Bank deletion semantics.

### Numbers it produces
- Census **998 → 1014**: the overlay's open/close and focus trap (3), the insert action reached from the
  Builder route and refused for a `leser` (4), the filter chips built from the seeded categories (2),
  `pickerCount` and `pickAddedNote` deriving rather than counting a literal (3), the 2200 ms clear (2),
  and the add-twice case the current button forbids (2). One new file,
  `tests/db/bank-picker.test.ts` → **71 files**.
- 5a3 **65 of 90** — `question_bank` is an existing RLS table already in the denominator
  (`M:0003:78`, policies at `M:0008:79`), and the phase adds no SECURITY DEFINER function.

---

## What this plan does not cover, stated so it is not mistaken for complete

- **The Library beyond its bank tab.** §1 scoped the measurement to the bank tab and the plan keeps that
  scope; `bibliotek/`'s templates, packs and Bruksområder were not measured against the corrected v2.
- **Any screen outside `bygg/` and `bibliotek/`.** The corrected bundle's revision touched `hjelp`,
  `admin-personvern` and `rapport-editor` too; those are copy, closed in `docs/v2/00-diff.md § 0.3`, and
  their *geometry* has not been re-measured against v2.
- **A visual pass on anything.** Until Q110 gives this work an environment, every phase above closes with
  its visual half **UNVERIFIED**, and that is recorded in the Gate 6 report as a limit rather than a pass.
