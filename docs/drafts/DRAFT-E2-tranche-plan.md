# DRAFT — E2 tranche plan, from E1c's ranking

**NOT STARTED. No tranche begun, no screen touched.** For Tor's sequencing.

Ordered from the measured geometry diff (`docs/fidelity/bundle-geometry-diff.json`), not from
impression. One verification pass and one fix pass per tranche; fix-pass findings go to the next
tranche, never a third round.

---

## The ranking this is built from

| screen | changed | added | removed |
|---|---|---|---|
| dashboard | 16 | 0 | 0 |
| surveys | 15 | 0 | 3 |
| build | 13 | 0 | 0 |
| `_shell` | 10 | 0 | 0 |
| reports | 10 | 0 | 0 |
| library | 8 | 0 | 0 |
| dash | 5 | 0 | 0 |
| tasks | 4 | 0 | 0 |
| results | 3 | 0 | 1 |
| send | 3 | 0 | 1 |
| **packdetail** | **0** | **16** | **0** |

Zero difference, and therefore no tranche: **`admin`, `help`, `livestage`, `profile`, `respond`,
`svdetail`.**

---

## WHICH SCREENS PHASE D WILL TOUCH — the constraint that sets the order

Phase D (threshold and banner, per the amendment) changes copy and controls on:
**`bygg` · `send` · `resultater` · `rapporter` · `admin` · `respondent`.**

**These cannot be done twice.** A geometry pass before D would be re-verified after D changes the
same surfaces, which spends two verification passes on one screen and makes any regression
unattributable. So the rule for this plan is:

> **A screen Phase D touches is not eligible for an E2 tranche until D has closed.**

That removes `build`, `send`, `results`, `reports`, `admin` and `respond` from the early tranches —
including `build` at rank 3 and `reports` at rank 5, which are otherwise the obvious next items.

`admin` and `respond` have **zero** geometry change, so for them the constraint costs nothing:
they need no E2 tranche at all, only D's copy work.

---

## Proposed order

### Tranche 1 — `dashboard` (16 changed)
The largest single geometry move and **Phase D does not touch it**. Borders 29 → 52 declarations,
border-radius 45 → 79, font-size 63 → 116: this is a re-export of the screen, not a tweak. Doing it
first also exercises the new bundle's conventions on the screen that has most of them, so tranche 2
inherits answers rather than questions.

### Tranche 2 — `surveys` (15 changed, 3 removed)
Second largest, untouched by D, and the only screen besides `results`/`send` with **removals** —
`margin-bottom:7px`, `margin-left:2px`, `padding-right:20px` all disappear. A removal is the case a
`changed` count under-reports, because nothing replaces it; it has to be read in the markup.

Carries a known hazard: `/undersokelser` is the route eleven manifest labels reach their screen
through, and it is where `verify:responsive`'s order-dependence bites (D249). **Reset before
verifying this tranche**, per the runbook line.

### Tranche 3 — `_shell` (10 changed) + `library` (8) + `dash` (5) + `tasks` (4)
Grouped because `_shell` is rendered on every screen and cannot be verified in isolation — a shell
change has to be looked at against several bodies, and these three are the bodies D leaves alone.
`_shell` first within the tranche, then the three in rank order.

### Tranche 4 — `packdetail` (16 added, a new screen)
**Not a fidelity pass — a build.** Every element is `added` by construction because the screen exists
in no earlier bundle. It is the smallest screen in the handoff (3 controls, 48 elements, 2 headings,
lines 4689–4760), and it needs a route, a manifest entry and a `SCREENS` line before it can be
verified at all. Deliberately last of the non-D work: it is the only tranche that can be wrong about
*what to build* rather than *how it looks*.

### AFTER PHASE D — tranche 5 and 6
- **Tranche 5 — `build` (13 changed) + `reports` (10).** Both substantial, both D-touched.
- **Tranche 6 — `results` (3 changed, 1 removed) + `send` (3 changed, 1 removed).** Small, and both
  D-touched.

`admin` and `respond`: **no tranche.** Zero geometry difference; D's copy work is all they need.

---

## What this plan does not settle

- **The bundle is not named or promoted** (0b, and DRAFT-0.3g). No tranche can start until it is,
  because there is nothing for a phase to read as its governing drawing.
- **Whether the six refused sub-tabs get reversed.** Bølger, Sammenligning, Frisvar, Levering,
  Leveranse and Matrise are drawn by the handoff and refused by the product. They are Tor's to
  reverse by name; this plan assumes they stay refused and touches none of them. **Sitat, Segmenter
  and the nps card's right half are not in scope at any fidelity, in any tranche.**
- **Whether `verify:reference` should gain a ninth baseline set at all**, given D242/D243 — see
  DRAFT-0.3g's closing section.
