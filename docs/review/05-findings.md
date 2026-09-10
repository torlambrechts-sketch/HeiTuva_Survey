# 05 — What would have to change

## The headline

**The content is there. The order, the default and the vocabulary tell a
different story than the catalogue does.**

Twenty-two packs, sixteen of them non-statutory, four use cases beyond HR, and a
design bundle that is itself customer-first by 213 references to 161. What a
buyer meets is a wizard pre-selected to «HR og arbeidsmiljø», a Bibliotek rail
led by the same chip, a question bank whose eleven categories contain no
customer, member, citizen or service, and an Oversikt headed «Lovpålagte
frister».

**That is a SEED and COPY problem, not a product problem** — which is the best
kind of finding this review could have produced. Nothing here asks for a feature.

Prioritised. Each item: what a non-statutory buyer meets · what it costs · the
class of change.

---

### 1 — The wizard opens pre-selected to HR · **SEED** · cheap

`Wizard.tsx:71` is `useState(useCases[0]?.key ?? '')` — not a chosen default but
the first row of a registry ordered `hr = 10`. Every new survey starts by
answering «HR og arbeidsmiljø» to a question the buyer was not asked.

**Cost:** the first decision in the product is a correction. **Fix:** either no
pre-selection, or `use_cases.sort_order` reordered — a row update, not code.
**Note it is a DECISION which:** an unselected wizard step is a different screen
and is not drawn.

### 2 — Oversikt leads with «Lovpålagte frister» · **COPY / LAYOUT** · not cheap

The three MISPLACED strings in `03-wedge.md`, all in one panel, on the first
screen after login, rendering «0 av 0 plikter» or «Ingen plikter krever handling
i år» for a customer who has none.

**Cost:** the screen that decides whether a buyer thinks they bought a survey
product or a compliance product says compliance. **Fix:** conditional on the
organisation having duties — which is LAYOUT, not a string swap, and needs the
empty-state treatment looked at. **Blocked on section 2's captures.**

### 3 — The question bank has no customer categories · **SEED** · cheap

Twelve questions, eleven categories, none customer-facing. A buyer with existing
NPS wording who builds from the bank finds «Turnover» and «Ledelse».

**Cost:** the second path into the product — skip the packs, use the bank — has
nothing for the first customer. **Fix:** seeded rows. Note the bank is *small*
(12) regardless; that is a separate observation, not this finding.

### 4 — `medlem` is last of six with two packs · **SEED** · cheap

One of the three named first-customer profiles sorts sixth. **Fix:** `sort_order`.
**Cost is modest** — a chip further right — but it compounds with 1, since the
same order sets the wizard's default.

### 5 — Quiz was unreachable and said so · **DONE** · see `04-quiz.md`

Fixed in this pass, because it was a sentence telling customers something untrue
about the product.

---

## What should NOT change

**The wedge stays.** `library.noteLovpalagt` and `library.useCasesNote` are
LOAD-BEARING and well-written; the second is the register the whole product
should be in — «der loven krever det», offered rather than assumed.

**And the honest answer to one thing is «the product does not do this»:** there
is no customer-experience *analysis* — no NPS calculation, no driver analysis, no
verbatim coding beyond the algorithmic themes. The packs ask NPS questions and
the results screens treat the answers as scale data. **Do not present the
product as an NPS tool.** It is a survey product that can ask NPS questions,
which is a different and defensible thing.
