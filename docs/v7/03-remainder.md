# V7-4 — the rest of the v7 bundle, as a LIST

**2026-09-17.** Everything v7 draws, or the product has, that V7-1 to V7-3 did not touch. **A list,
not a build**, so the sequencing is Tor's.

Bundle citations are `v7:<n>` against `4d8fde3aea0f56e481bfe2416c811f96` (10558 lines) and `v6:<n>`
against the seventh handoff (10152 lines).

---

## 0. HOW THIS LIST WAS DERIVED, AND WHERE IT IS BLIND

Three measurements, because one of them cannot see reversals and this file already records what that
costs.

**a. The `sc-if` key sets.** 298 in v6, 318 in v7 — **23 arrivals, 3 departures**:

```
keys(){ grep -o 'sc-if value="{{ [a-zA-Z0-9_.]*' "$1" | sed 's/.*{{ //' | sort -u; }
comm -13 <(keys v6) <(keys v7)   # 23
comm -23 <(keys v6) <(keys v7)   #  3
```

| arrived (23) | what it is | state |
|---|---|---|
| `respondOne.rIsBlock` · `rBlockIsImg` · `rBlockIsVideo` · `rBlockIsRule` · `rBlockHasBody` · `rBlockHasCaption` | the respondent's block flow | **BUILT (V7-3c)** |
| `q.blockFull` · `q.blockHasTitle` · `q.blockHasBody` · `q.blockHasCaption` · `q.blockHasMedia` · `q.blockHasUrl` · `q.blockIsRule` | the builder's block row | **BUILT (V7-3b)** |
| `contentEmpty` | the content pane's empty state | **BUILT (V7-3b)** |
| `tabContent` | the builder's FIFTH tab, as v7 places it | **§ 1 — not built** |
| `q.compact` · `q.qFull` | the flow row's two densities | **§ 2 — not built** |
| `q.badgeIsIcon` · `q.badgeIsNum` | the question row's number-or-icon badge | **§ 3 — not built** |
| `sSecCh` · `sSecRec` · `sSecSender` · `sSecTime` | the send section filter | **REFUSED (Q235)** |

| departed (3) | state |
|---|---|
| `svTuvaFloat` · `svTuvaOpen` · `svTuvaSide` | **already reached independently by G5/G6** — `docs/v2/00-diff.md § 0.3f` records it as a confirmation with two riders |

**b. The line diff, because a key-set comparison is blind to substitution.** 92 changed regions,
726 changed lines:

```
diff -u0 <(sed 's/^[ \t]*//' v6) <(sed 's/^[ \t]*//' v7) | grep -c '^@@'   # 92
```

That is what found §§ 4, 5, 6 and 8 below — **none of which arrives as a new key.** § 4 is a
breadcrumb replacing a page header, § 5 is the same header rebuilt as a card, § 6 is a fifth
breadcrumb on a screen nobody was looking at, and § 8 is fourteen `filter(q => !q.block)` guards
added at existing consumers.

**c. Where this list is still blind.** It reports what the DRAWING changed. It does not report a v7
identifier whose MEANING moved while its spelling held — the `qcSaved` shape — because that is not
a mechanical operation. The one protection that reaches it is the reference harness's
pairwise-distinct check, and `npm run verify:reference` has not been re-run since V7-0 installed the
bundle. Worth one run before anything here is built.

---

## 1. THE BUILDER'S RAIL BECAME TWO LEVELS, AND EVERY LABEL CHANGED

**The largest item on this list, and the one V7-3b deliberately did not do** (D234).

v6:9847-9852 is a flat five: `Generelt · Legg til · Metodikk · Innstillinger · Vis`. v7:10192-10202
is a **context-dependent rail that shows only the current GROUP's siblings**, with the outer level
in the shell subnav (v7:8901-8906) and the inner level in the page:

| subnav group (v7:8901-8906) | in-page pills (v7:10195-10198) |
|---|---|
| Bygg | «Spørsmål» · **«Innhold»** |
| Metodikk | «Merknader · N» *or* «Ingen merknader» |
| Innstillinger | «Kjøremodus» · «Personvern og frekvens» |
| Forhåndsvis | «Slik ser den ut» |

And the card around it is new (v7:521-551): a 20px-radius panel whose header carries `bBoxTitle`
(«Flyt» / «Metodikk» / «Forhåndsvisning» / «Innstillinger», v7:10211), a `buildTabs` chip group,
`bFlowChips` — three counted chips, «Spørsmål N · Innhold N · Seksjoner N» (v7:10217) — `bMinutes`,
the density switch, «Bibliotek» and a guarded «Gå til utsending».

**What makes it a phase rather than an edit:** it relabels every builder tab, splits one rail into
two levels across two files, and adds a header card that owns four counts. V7-3b put the content
palette beside the question palette instead, which is one control in the pane the editor is already
in; moving it into «Innhold» is one line once this rail exists.

**Two things to decide before building it**, both measured:
- `bFlowChips`'s «Seksjoner» is `secs || 1` (v7:10221) — **an invented floor.** A survey with no
  section blocks draws «1 Seksjoner». Never-fabricate applies.
- `bMinutes` is `qn*0.4 + bn*0.25` (v7:10208) and `previewMeta` is `qn*0.6 + bn*0.3` (v7:10259).
  **Two different estimates of the same survey's length, in one bundle**, and D232 already decided
  what to do with an unmeasured figure the customer can check.

---

## 2. THE FLOW ROW HAS TWO DENSITIES

`flowViewChips` is `[["full","Full"],["compact","Kompakt"]]` (v7:10187) and `flowGrid` switches the
two-column split with it (v7:10186). Every flow row then renders under `q.qFull` / `q.compact`
(question) or `q.blockFull` (block), so **compact is a second rendering of every row**, not a CSS
change.

`flowDragHint` (v7:10191) states the reason: «Kompakt visning gir overblikk i lange undersøkelser.»
That is a real need — `LONG_SURVEY_THRESHOLD` exists in `bygg/types.ts` for the same one.

Its cost is the drag mechanism, which **V7-3b refused** (D235): the hint's own first clause is «Dra i
håndtaket for å flytte, eller bruk piltastene og «Flytt til»» — so v7 itself offers a keyboard path,
`«Flytt til»`, that we do not have. A phase that builds compact should decide whether it also builds
that, because the hint names both.

---

## 3. THE QUESTION ROW'S BADGE

`q.badgeIsNum` / `q.badgeIsIcon` (arrived in v7). The flow row's leading badge is the question's
POSITION NUMBER for a question and the type's ICON for a block, where v6 had one treatment. Small,
self-contained, and it belongs with § 1 or § 2 rather than alone.

---

## 4. THE PAGE HEADER ON BYGG / SEND / RESULTATER BECAME A BREADCRUMB

**The one item that reverses a measured decision rather than extending one, and Tor has already
refused it once** (Q234, 2026-09-17): «Don't draw it — the context bar already says it.»

| screen | v6 removed | v7 added |
|---|---|---|
| build | `v6:509-518` | `v7:509-511` |
| send | `v6:4840-4844` | `v7:4909-4910` |
| results | `v6:5580-5585` | `v7:5717-5719` |

Three inert spans, «Undersøkelser → {tittel} → Bygger», no `onClick` and no link, replacing a 28px
Playfair header — and `svdetail` KEEPS its back button (v7:1272), so it is an ADDITION to the work
screens rather than a replacement of the back control.

**Listed rather than closed**, because § 6 found a FIFTH location after Q234 was decided, and a
refusal decided over three instances is worth re-reading against five. `crumbs.test.ts`'s negative
list still names `/undersokelser/abc-123/bygg` and `/undersokelser/abc-123/send` explicitly, so
implementing this fails a shipped test **on purpose** — which is the test doing its job and the
reason it needs a decision before a phase rather than a red gate during one.

---

## 5. THE THREE WORK SCREENS GAINED A HEADER CARD

Independent of § 4's breadcrumb, and it is the same shape three times:

- **Build** (v7:521-551) — § 1.
- **Send** (v7:4914-4942) — «Utsending», `sendChips`, «Gå til bygger», the send button, and then a
  READINESS STRIP on `--sbg`: a status dot, `sendReadyLabel`, `sendReadyLine`, and a
  «Velg målgrupper fra én populasjon» pill under `sendBlocked`. **That last one is a real
  refusal our screen already enforces** — the mixed-population guard — currently stated further
  down the form.
- **Results** (v7:5721-5738) — «Resultater» with `{resultsScope} · {resultsThresholdLine}` merged
  onto one line under it, and the «Bytt undersøkelse» select moved INTO the header with an
  `aria-label` in place of a visible `<label>`. **The label change is a decision, not a copy:** an
  `aria-label` on a select removes the visible text, and `verify:responsive` counts controls, not
  labels.

---

## 6. A FIFTH BREADCRUMB, ON THE ARBEIDSLISTE

`v7:3736-3738` — «Oversikt → Oppgaver og tilbakemeldinger», the same three inert spans, on a screen
neither the four claims nor the review's § 2 mentioned. **Found by the line diff, not by the key
diff**, because a breadcrumb is markup and carries no `sc-if`.

It matters for § 4: Q234 was decided against three instances of the trail. There are five.

---

## 7. THE DRAG MECHANISM AND THE END DROP ZONE

`paletteDrag` (v7:6801), `insertFlowAt` (v7:6808), `moveFlowTo` (v7:6818), `dropEndOver` /
`dropEndBd` / `dropEndBg` / `dropEndLabel` / `onDropEnd` (v7:10226-10236), and `draggable` on the
question palette's own buttons (v7:974).

**Refused in V7-3b with the reasoning written down** (D235): a drag with no keyboard equivalent is a
control half this product's users cannot reach, and `docs/RESPONSIVE.md` has no pattern for one. It
is on this list because a refusal is not an absence — if it is ever built, `«Flytt til»` (§ 2) is the
keyboard half v7 itself names, and both belong to one phase.

---

## 8. FOURTEEN `filter(q => !q.block)` GUARDS WE GOT FOR FREE

v7 adds the same clause at fourteen existing consumers — `sdBuild` (v7:7174), the length note and
«for lang» (v7:9732-9735), `previewQs` (v7:10261), the logic rules (v7:10075), the comment box
(v7:7751), the choice tiles (v7:7822), `attribRows.details` (v7:10534), `resultBlocks` (v7:10550-10551)
and the rest.

**Under two tables every one of them is a no-op**, which is Q236's whole argument arriving as a
measurement: `survey_questions` does not contain blocks, so nothing needs filtering. Listed so that
a future reader diffing the bundles does not mistake fourteen absent filters for fourteen gaps.

---

## 9. `/undersokelser/[id]` STILL REDIRECTS INTO THE EDITOR

`app/(app)/undersokelser/[id]/page.tsx:12-15` redirects to `/bygg`, and its doc comment still
describes the pre-V6-2 world. F5-2 moved «Spørsmål» to the read view with the builder one click
further on (`lib/surveys/tabs.ts:60-63`), so the survey's own index lands somewhere the tab registry
no longer treats as its front door.

Not a defect — the route resolves and the rail lights «Spørsmål» through `TAB_ALIAS` — but § 1's
two-level rail and § 4's breadcrumb both name a screen in their leaf, so **what
`/undersokelser/[id]` MEANS should be decided rather than inherited.**

---

## 10. TWO THINGS THAT ARE NOT V7's AND ARE OPEN ANYWAY

- **No manifest state photographs a content block.** The apparatus is frozen, so V7-3c seeded the
  flow (`/s/<DEMO_BLOCKS_TOKEN>`) and added no state. One state in whole-list mode would cover the
  section, the image, the video card and the divider in a single screen. See **D239**.
- **`npm run verify:reference` has not run since v7 was installed.** V7-0 added the `BUNDLES` entry
  and committed `artifacts/reference-v7/`, and the pairwise-distinct check is the only thing in this
  project that has ever caught a handoff removing a state (v6's `qcSaved`). v7 removes three keys.

---

## 11. AND THE TWO THINGS THAT REMAIN UNVERIFIABLE

Unchanged from `docs/v7/00-review.md § 4`, restated because neither has been resolved:

- **Whether v7's `<image-slot>` and `tuva/faces/f07.png` reference assets that were never handed
  over.** No asset directory accompanied the upload. V7-3c's image block needs no bundle asset — it
  serves the customer's own upload — so this is now only a question about the drawing's fixtures.
- **Nothing in the bundle says whether it supersedes v6 or explores beside it.** It is installed as
  the eighth handoff and `docs/v2/00-diff.md § 0.3f` governs per surface, which is the project's
  answer; the file itself still does not say.
