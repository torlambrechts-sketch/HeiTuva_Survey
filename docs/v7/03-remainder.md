# V7-4 / V7-5 — the rest of the v7 bundle, DECIDED

**2026-09-17, revised twice the same day.** The first version of this file was a LIST; the second
decided everything but one item; **this third one answers that item and closes the two sections that
were waiting on it** (§ 1's rail, § 2's density switch), leaving exactly one ASKED — and that one is
a question about a SPECIFICATION rather than about a screen.
Tor's instruction on reading it: *«anything the drawing draws but no decision covers gets DECIDED,
not carried. A list that survives a phase becomes a list nobody owns.»* So every section below now
ends in one of four states — **BUILT**, **ALREADY TRUE**, **REFUSED** (with the reason), or
**ASKED** (one item, named) — and nothing is left as a description.

Bundle citations are `v7:<n>` against `4d8fde3aea0f56e481bfe2416c811f96` (10558 lines) and `v6:<n>`
against the seventh handoff (10152 lines).

---

## 0. THREE CORRECTIONS TO THIS FILE'S OWN EARLIER VERSIONS

Recorded rather than silently fixed, because all three were written from a hunk header or a first
line without reading to the end of the construct — the shape CLAUDE.md names as *a right conclusion resting on reasoning that is not
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
components. **§ 3 now records the word that sentence needed** — «their own FULL components».

**c. § 5's «HEADER CARDS» ARE WHOLE-SCREEN SHELLS, AND THE PATTERN IS v6's.** Both are the entire
screen inside one bordered card, and `border-radius:0 0 19px 19px` occurs 0 times in v5, **15 in
v6** and 18 in v7. Read from the header lines and attributed to the new bundle; measured, neither
half held. See § 5.

---

## 1. THE BUILDER'S HEADER CARD — the counts BUILT, the rail ANSWERED (Q243)

### BUILT: what the flow is made of (v7:10217)

`bFlowChips` draws «Spørsmål N · Innhold N · Seksjoner N» — the drawing answering a question the
builder only acquired when the flow gained a second kind of member. Three chips, real counts, one
derivation (`flowCounts`, `lib/surveys/blocks.ts`), placed in the row that already states the
survey's length rather than in a new card. **That reason has half expired and the placement still
holds:** the card's other contents were the two-level rail and the density switch; Q243 refused the
rail and Q244 built the switch — into this same row, which is v7's own adjacency. What remains of
v7's card is the BORDER, and that belongs with § 5's shell card, whose scope is four screens rather
than one row.

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

### ANSWERED (Q243): the survey rail stays, and v7's outer level is NOT adopted

**Tor, 2026-09-17.** On `screen === "build"` v7's subnav shows FOUR builder groups plus the
«Undersøkelsen» exit and nothing else (v7:8901-8906); our `/bygg` shows the eight survey tabs. The
measurement was right and the answer is no:

> *«Adopting v7's four builder groups means Send, Resultater and Målgruppe stop being one click from
> the editor — an editor writing a question would have to leave the builder to see who receives the
> survey. That is a worse working surface, and the bundle draws it without knowing the rail
> exists.»* Third time in V7 that the drawing assumes a structure the product does not have.

So Q233 stands as written: «Bygger» is an exit BECAUSE the builder sits on the survey rail.

**And the distinction that stops this returning as an omission:** the four builder groups may be
worth having as an **inner** level inside the builder, and that is its own decision — it turns on
whether the groups help, not on v7 having drawn them in the shell.

---

## 2. THE FLOW ROW'S TWO DENSITIES — BUILT (Q244), with «Flytt til plass»

V7-4 refused this for two reasons and **both have expired**, which is why it is built rather than
re-deferred:

1. «The switch lives in the header card's chip row, so it arrives with § 1's rail, which is asked.»
   **Q243 answered the rail.** The chip row is ours and the switch goes in it, beside the three
   counts — v7's own adjacency.
2. «Its own hint names a control we do not have»: `flowDragHint` (v7:10191) says «…eller bruk
   piltastene og «Flytt til»». **The answer is to build the pair the drawing pairs**, not to hold
   both forever. `moveInFlow(flow, from, to)` has taken an ABSOLUTE target since V7-3b, so «Flytt
   til plass» introduces no second reorder path — the arrows are its special case.

What ships: a Full/Kompakt segmented control (`flowViewChips`, v7:10187), one-line rows
(`q.compact`, v7:759-782) with the badge, the status dot, an ellipsised label, the kind pill, the
move select and ↑ ↓ ×, and `flowGrid`'s re-proportioning — `2.4fr/.85fr` compact against the
`1.35fr/.9fr` this screen already shipped.

**Three things deliberately not reproduced, each with its reason on the line:**

- **The grab handle.** D235 refuses the drag. A `cursor:grab` ⠿ that cannot be grabbed is D221's
  third face — a control whose appearance claims an ability the code does not have. The full cards
  keep theirs because they keep the arrows beside it; a one-line row with a handle and no drag is
  just a lie about a pixel.
- **The first sentence of the hint.** Only «Kompakt visning gir overblikk i lange undersøkelser.»
  ships, in both languages, and `flow-row.test.ts` test 9 asserts the drag clause is absent —
  proven RED against v7's full sentence.
- **`typeShort`.** The pill uses the product's own thirteen type names rather than v7's second,
  shorter set. See D246; reversible in one line.

**Driven, not merely tested** (five-item mixed flow, a throwaway draft, deleted afterwards): row 1
→ last place, saved, reloaded, and the database's own positions read back `B0 Q1 B2 Q3 Q4` —
contiguous across two tables, accepted by the deferred `app.guard_flow_position`, no console or HTTP
errors.

---

## 3. THE QUESTION ROW'S BADGE — ALREADY TRUE **of the full row**, and V7-4's sentence needed that word

V7-4 read `badgeIsNum` / `badgeIsIcon` as keys that exist only because the bundle renders both kinds
of flow row with ONE component, and concluded the property was already structurally true because we
have `QuestionCard` and `BlockCard`. **That is true of the FULL row and was silent about the compact
one.**

Compacted, the two kinds ARE one shape — same height, same columns, differing only in the badge and
the tint — so `CompactFlowRow` is one component that branches, and the two keys are real for us
there. Two components would have been two copies of one row, which is the shape that drifts.

Recorded rather than quietly fixed: it is the enumeration shape again, inside a sentence that was
itself correcting an enumeration. A property established about one rendering of a thing is not a
property of the thing.

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

## 5. THE «HEADER CARDS» ON SEND AND RESULTATER — ASKED (Q245), and this section was wrong twice

**They are not header cards.** Both are the WHOLE SCREEN wrapped in one bordered card: a header row
on `--sf`, then a `border-top` body on `--bg` that holds the rest of the screen and closes with
`border-radius:0 0 19px 19px` (v7:4942, v7:5738). Written from the header lines without reading to
the closing div — the third correction this file has had to make to itself, and the same cause each
time.

**And the pattern is not v7's.** `grep -c 'border-radius:0 0 19px 19px'`:

| v5 | v6 | v7 |
|---|---|---|
| 0 | **15** | **18** |

It arrived a handoff earlier; v7 adds three. *A figure found while reading a new bundle is not
thereby the new bundle's* — the fourth instance of that in this tranche.

**Where it lands, swept over every screen marker** (`<sc-if value="{{ isX }}">` + the card signature
within 14 lines): exactly **four screens** — `isBuild` (v7:508), `isSvDetail` (1269), `isSend`
(4907) and `isResults` (5716). Every app-level screen — Surveys, Dashboard, Reports, Tasks, Library,
Admin, Profile, Help — has none. **So it is not two headers and not an inconsistency: it is «the
survey's own screens are one object», applied to the four of them.**

**What blocks it is the specification, and that is the ask.** `docs/RESPONSIVE.md` § Data tables:
*«Never nest a card in a card… the bundle contains no nested-card treatment and inventing one is
restyling.»* The shell card wraps screens that are already full of cards, so adopting it needs that
clause changed — and the clause's stated reason has expired (D247). Editing a specification to
unblock my own phase would be answering my own question, so it is Q245.

**The one part decided on its own merits stays decided:** Resultater's «Bytt undersøkelse» keeps its
VISIBLE label. v7 replaces it with an `aria-label`, which removes the label for everyone not using a
screen reader, and `verify:responsive` counts controls rather than labels so no gate would report
it. D244, unchanged, whatever happens to the card.

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
