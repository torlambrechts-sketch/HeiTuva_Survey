# V7-4 — the rest of the v7 bundle, DECIDED

**2026-09-17, revised the same day after running it.** The first version of this file was a LIST.
Tor's instruction on reading it: *«anything the drawing draws but no decision covers gets DECIDED,
not carried. A list that survives a phase becomes a list nobody owns.»* So every section below now
ends in one of four states — **BUILT**, **ALREADY TRUE**, **REFUSED** (with the reason), or
**ASKED** (one item, named) — and nothing is left as a description.

Bundle citations are `v7:<n>` against `4d8fde3aea0f56e481bfe2416c811f96` (10558 lines) and `v6:<n>`
against the seventh handoff (10152 lines).

---

## 0. TWO CORRECTIONS TO THIS FILE'S OWN FIRST VERSION

Recorded rather than silently fixed, because both were written from a hunk header without reading
both sides — the shape CLAUDE.md names as *a right conclusion resting on reasoning that is not
true*, and in the second case the conclusion was wrong too.

**a. «A FIFTH BREADCRUMB, ON THE ARBEIDSLISTE» (old § 6) IS NOT A NEW BREADCRUMB.** `v6:3668` draws
it identically — «Oversikt → Oppgaver og tilbakemeldinger» — and F3 already built it
(`CRUMBS.tasks`). The only v7 change in that hunk is `padding-left:18px` on two containers. So the
sentence «Q234 was decided against three instances of the trail. There are five» was **false**.

Counted mechanically instead, `grep -n 'opacity:.5">→'` with each line's spans:

| | v6 | v7 |
|---|---|---|
| survey detail's back trail | 1158 | 1275 |
| Undersøkelser · Innsikt · Rapporter · Handlinger · Bibliotek | 2127 · 2473 · 2797 · 3668 · 4616 | 2244 · 2542 · 2866 · 3737 · 4685 |
| **build · send · resultater** | — | **511 · 4910 · 5719** |

**v6 draws six, v7 draws nine, and the three arrivals are exactly the three Q234 refused.** There
is no fourth or fifth instance and nothing reopens.

**b. FOUR OF THE 23 «ARRIVALS» ARE NOT FEATURES AT ALL.** `q.qFull`, `q.blockFull`,
`q.badgeIsNum` and `q.badgeIsIcon` exist because the bundle renders both kinds of flow row with
ONE component and has to branch inside it (`badgeIsNum: !q.block, badgeIsIcon: !!q.block`,
v7:10092). We render two components — `QuestionCard`, which shows `{index + 1}` at line 118, and
`BlockCard`, which shows the type's icon chip. **The property the four keys express is already
structurally true**, and building anything for them would have been implementing a branch we do
not have because we do not need it.

So the arrivals worth acting on are 19, not 23, and the derivation is: a key that exists only to
distinguish two kinds inside one component is not a feature when the two kinds have their own
components.

---

## 1. THE BUILDER'S HEADER CARD — the counts BUILT, the rail ASKED

### BUILT: what the flow is made of (v7:10217)

`bFlowChips` draws «Spørsmål N · Innhold N · Seksjoner N» — the drawing answering a question the
builder only acquired when the flow gained a second kind of member. Three chips, real counts, one
derivation (`flowCounts`, `lib/surveys/blocks.ts`), placed in the row that already states the
survey's length rather than in a new card: the card's other contents are the rail and the density
switch, and both are blocked, so a card around one row would be a frame with nothing new in it.

**Two sub-decisions, both against the drawing (Q240, Q241):**

- **«Seksjoner» states its real count, INCLUDING ZERO.** The bundle's own expression is
  `String(secs || 1)` (v7:10221), so a survey with no section block draws «1 Seksjoner» — a
  fabricated value in the sense CLAUDE.md names, indistinguishable from a real one in review.
  Driven: the chips read «1 Spørsmål · 0 Innhold · 0 Seksjoner» on the seeded draft.
- **The minute estimate counts blocks, at `previewMeta`'s rate and not `bMinutes`'.** And the
  attribution matters more than the rate: **0.6 min per question is OURS**, shipped since Phase 2
  in `estimatedMinutes` with a test pinning it, and `previewMeta` (v7:10259) agrees. `bMinutes`
  (v7:10208) says `0.4/0.25` for the same quantity, so **the bundle disagrees with itself** and the
  one adopted is the one whose question rate the product already states. *This is the third time
  this tranche that a figure read as the new bundle's turned out to be ours.*

  The real defect underneath was ours: `estimatedMinutes(count)` took a question count and nothing
  else, which was the whole of a survey until M:0127 — **a correct function made incomplete by its
  surroundings**, the fourth instance of that shape in this tranche. It now takes
  `{ questions, blocks }` as a NAMED object, so a caller holding a flow cannot pass its length as
  the question count, which is F1's two-population defect made unexpressible.

### ASKED: the two-level rail

**This is the one item I am not deciding, and the reason is a measurement.** On
`screen === "build"` v7's subnav shows FOUR builder groups plus the «Undersøkelsen» exit — and
**nothing else** (v7:8901-8906). The survey's own tabs are not on the rail while you are in the
builder; the only way back is the exit, to `svdetail`.

Our `/bygg` shows the **eight survey tabs**. Adopting v7's outer level means removing them from the
builder and replacing them with four builder-group pills — so Send, Resultater and Målgruppe stop
being one click from the editor.

**It contradicts a decision that is three days old.** Q233 made «Bygger» an EXIT rather than a
ninth tab and suppressed it on `/bygg`, because «an exit pointing at the page you are standing on
is not an exit» — and that reasoning rests on the builder being ON the survey rail. v7's build
screen says it is not. CLAUDE.md's standing rule covers exactly this: *when the bundle and a
decision disagree, ASK*; and Tor's own boundary — *a refusal is mine; a scope is not* — puts «which
pills appear on which screen» on his side.

**Assumption I built under, so the answer costs an edit rather than a rebuild:** the survey rail
stays as it is, and the builder's own four tabs stay in the right pane. Nothing in this phase
depends on the answer.

---

## 2. THE FLOW ROW'S TWO DENSITIES — REFUSED, with the reason

`flowViewChips` (v7:10187) and `flowGrid` (v7:10186) switch a two-column split and every row then
renders under `q.compact` or `q.qFull`/`q.blockFull`. **Refused for this tranche, for two reasons
that are both about the drawing rather than about effort:**

1. **The switch lives in the header card's chip row**, beside `buildTabs` — so it arrives with § 1's
   rail, which is asked. Building the switch somewhere else would be inventing a position.
2. **Its own hint names a control we do not have.** `flowDragHint` (v7:10191) is «Dra i håndtaket
   for å flytte, **eller bruk piltastene og «Flytt til»**. Kompakt visning gir overblikk i lange
   undersøkelser.» The second clause is the keyboard path D235 refused the drag for lacking — so v7
   itself pairs compact with a control that is a separate decision.

The need is real (`LONG_SURVEY_THRESHOLD` exists for the same one). It belongs with § 1's card and
the «Flytt til» control, as one piece of work rather than three.

---

## 3. THE QUESTION ROW'S BADGE — ALREADY TRUE

See § 0b. `badgeIsNum` / `badgeIsIcon` is one component branching on kind; we have two components
that already do it. Nothing to build, and the measurement is the answer.

---

## 4. THE BREADCRUMB ON BYGG / SEND / RESULTATER — REFUSED, and the count corrected

Q234, Tor, 2026-09-17: *«Don't draw it — the context bar already says it.»* Unchanged, and now
with a mechanical count beside it (§ 0a): v7 adds exactly three trails, all
`Undersøkelser → {tittel} → <screen>`, all three inert spans replacing a 28px Playfair header, and
`svdetail` keeps its back button (v7:1275) so they are an ADDITION rather than a replacement.

On our screens the trail's words are already on the page twice — `SurveyContextBar`'s
«← Undersøkelser» plus the title IS «Undersøkelser → {tittel}», and the subnav's current pill is
the leaf. `crumbs.test.ts`'s negative list stands unedited and names two of the three paths
explicitly.

---

## 5. THE HEADER CARDS ON SEND AND RESULTATER — one REFUSED, the rest deferred with § 1

- **Send** (v7:4914-4942) — «Utsending», `sendChips`, the CTAs, and a readiness strip on `--sbg`
  carrying a status dot, `sendReadyLine` and a «Velg målgrupper fra én populasjon» pill under
  `sendBlocked`. **That refusal is one our screen already enforces** (the mixed-population guard),
  stated further down the form. Moving it into a header is the same restructure as § 1's and waits
  with it.
- **Resultater** (v7:5721-5738) — the header becomes a card, the scope and threshold merge onto one
  line, and the «Bytt undersøkelse» select moves into it **with an `aria-label` in place of a
  visible `<label>`**. **That last change is REFUSED on its own merits**: replacing a visible label
  with an accessible name removes the label for everyone who is not using a screen reader, and
  `verify:responsive` counts controls rather than labels, so no gate would have reported it. The
  card can arrive later; the label does not go.

---

## 6. (merged into § 0a and § 4)

There was never a fifth breadcrumb. The section is kept as a numbered stub so the correction is
visible to anyone who read the first version.

---

## 7. THE DRAG MECHANISM AND THE END DROP ZONE — REFUSED (D235)

`paletteDrag` (v7:6801), `insertFlowAt` (v7:6808), `moveFlowTo` (v7:6818), the end drop zone
(v7:10226-10236) and `draggable` on the palette's own buttons (v7:974). A drag with no keyboard
equivalent is a control half this product's users cannot reach, and `docs/RESPONSIVE.md` has no
pattern for one. If it is ever built, «Flytt til» (§ 2) is the keyboard half v7 itself names and
both belong to one phase.

---

## 8. FOURTEEN `filter(q => !q.block)` GUARDS — ALREADY TRUE, and that is Q236's argument arriving as a measurement

v7 adds the same clause at fourteen existing consumers — `sdBuild` (v7:7174), the length note
(v7:9732-9735), `previewQs` (v7:10261), the logic rules (v7:10075), the comment box (v7:7751), the
choice tiles (v7:7822), `attribRows.details` (v7:10534), `resultBlocks` (v7:10550-10551) and the
rest. **Under two tables every one is a no-op**: `survey_questions` does not contain blocks, so
there is nothing to filter. Listed so a future reader diffing the bundles does not mistake fourteen
absent filters for fourteen gaps.

---

## 9. `/undersokelser/[id]` — BUILT: it means the survey's front door, derived

It redirected to a hard-coded `/bygg` under a comment describing the pre-F5-2 world («the survey
context is a step rail over Bygg / Send / Resultater, and Bygg is the first step»). Both halves had
stopped being true — the fifth instance of *a correct line made wrong by its surroundings*.

Now `TAB_SEGMENT[SURVEY_TABS[0]]`: the registry already decides which tab is first, so reordering
it moves the redirect. And the ONE caller that depended on the index — the library's «Bruk mal»,
measured as the only one — names `/bygg` itself, because it has just created a survey from a
template and there is nothing to read yet. The test asserts the DERIVATION rather than the
destination, so it keeps holding when the registry is reordered; proven RED against the literal.

---

## 10. THE BLOCK FLOW IS PHOTOGRAPHED NOW — BUILT, closes D239

One manifest state on `/s/<DEMO_BLOCKS_TOKEN>`. **One is enough by a property of the fixture rather
than by luck**: the seeded survey has `one_question: false`, so whole-list mode renders the section,
the info block, the fact box and the divider on a single screen — four of the six types, at both
widths. A separate survey from `DEMO_SHARE_TOKEN`'s, so no `verify:visual` baseline moves.

---

## 11. THE TWO «UNVERIFIABLES» — both SETTLED

- **The bundle's missing assets.** v7 references `<image-slot>` (v7:5403) and `tuva/faces/f07.png`
  and no asset directory accompanied the upload. **Settled, not open:** V7-3c's image block serves
  the CUSTOMER'S OWN upload through our route, so no bundle asset is needed by anything we ship.
  The `<image-slot>` is the drawing's placeholder component; the faces are its fixture. Nothing to
  request.
- **Whether v7 supersedes v6 or explores beside it.** Settled by installation: it is the eighth
  handoff, `docs/v2/00-diff.md § 0.3f` governs per surface, and `verify:reference`'s target is
  derived from the last `BUNDLES` entry. The file still does not say so itself; the project's
  answer is the one that binds.

---

## 12. AND ONE THING THE RUN FOUND THAT NO SECTION PREDICTED

**Four of the 35 v7 baselines are not reproducible, and `verify:reference` cannot see it.**
Re-rendering the same bundle changed `live`, `live-revealed`, `send` and `undersokelser`; a second
run flipped `undersokelser` back to the committed hash exactly. Measured:

```
live            731 px differ, bbox 54 x 18     "no/qblmm" -> "no/q5obh"
live-revealed   656 px differ, bbox 54 x 18     the same join code
send           1206 px differ, bbox 93 x 25
undersokelser 256150 px differ (3.87 %), bbox 2640 x 1482 — alternates between TWO states
```

The three small ones are `uid()` (v7:6405, `"q" + Math.random().toString(36)`) — **the only
`Math.random()` in the bundle**, and both `new Date(...)` calls are fixed literals, so there is no
clock dependence. `undersokelser`'s whole-content difference is a layout race: the first table
separator sits at device row 832 in one state and 915 in the other, an 83 px shift with identical
text, so something above it is 41.5 CSS px taller in one render.

**The churn was REVERTED rather than committed.** Committing either state would make the baseline a
picture of one run instead of a picture of the drawing — the same trap as re-rendering an older set
under a newer Chromium. The gate's distinctness check is real and clean (35 files, 35 distinct
hashes, verified independently); what it cannot do is notice that a capture is not stable.

**And a second thing the same probe established:** the bundle's Google Fonts stylesheet and its
unpkg React both fail `ERR_CERT_AUTHORITY_INVALID` in this container, `document.fonts.size` is 0,
and `fc-list` finds no Playfair or DM Sans locally. **Every `artifacts/reference-*` baseline is
therefore rendered in fallback fonts**, and the harness's `await page.evaluate(() =>
document.fonts.ready)` is vacuous — `document.fonts.check()` returns true when there is no
`@font-face` to load. That is a property of the environment rather than a defect in the drawing,
and it is worth writing down because every pixel comparison against these baselines inherits it.
