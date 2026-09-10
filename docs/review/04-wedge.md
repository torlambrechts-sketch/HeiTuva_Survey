# 04 — Where the statutory wedge helps, and where it costs

**The wedge is the position.** No competitor has it, a Norwegian buyer
recognising their own legal vocabulary is an advantage, and a review that
concluded «remove it» would have measured the wrong thing. The question is
placement.

All seven in-app statutory strings, classified.

## LOAD-BEARING — 2

| string | why |
|---|---|
| `library.noteLovpalagt` | «Malene dekker kartleggingsplikter i arbeidsmiljøloven § 4-3, aktivitets- og redegjørelsesplikten i likestillingsloven, åpenhetsloven…» — the wedge stated precisely, and it renders **only when someone has chosen the Lovpålagt chip**. This is the sentence that closes a statutory sale. |
| `library.useCasesNote` | «Seks områder HeiTuva brukes til. Hvert område har egne maler, et dashboard-oppsett og — **der loven krever det** — de lovpålagte kartleggingene.» The conditional is doing real work: it offers the capability without asserting the customer needs it. **This is the register the whole product should be in.** |

## CORRECTLY PLACED — 2

| string | why |
|---|---|
| `library.catLovpalagt` | one filter chip among nine, opt-in, never the default |
| `library.useCaseCountLegal` | «{count} maler · {legal} lovpålagt» — a count on a card, factual, and zero when it is zero |

## MISPLACED — 3, and they are the same panel

All three are Oversikt's compliance block: **the first screen after login**, for
every customer, before they have chosen anything.

| # | string | what it costs |
|---|---|---|
| 1 | `dash.statutoryDeadlines` «Lovpålagte frister» | A **panel heading** on the screen that establishes what the product is. A membership organisation's first impression of HeiTuva is a compliance dashboard. |
| 2 | `dash.complianceSummary` «{urgent} av {total} plikter krever handling i år» | For a customer with no duties this renders **0 av 0** — a counter of a thing they do not have, which is worse than absent because it looks like something they have failed to set up. |
| 3 | `dash.complianceNoneUrgent` «Ingen plikter krever handling i år» | The empty state **asserts the frame rather than dropping it.** «No duties require action» answers a question an NPS customer never asked, in vocabulary they do not use. |

**The cost, stated once:** these three do not make the product worse at
compliance — they make it *read* as a compliance product with survey capability,
on the one screen that decides which of those two a buyer thinks they bought.
The same code is either product depending on what is in front of the reader.

**And the fix is placement, not deletion.** § 1.5 shows the drawing already
solved this: the bundle carries 161 statutory references against 213 customer
ones, and its own HR entry puts the law in a trailing clause. Nothing here needs
inventing — it needs the build to read the way the drawing does.
