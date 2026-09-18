# T2 / T3 — the geometry measurement, before either is built

**Status: measurement only. No screen touched.** Written because T2 and T3 are specified as
«geometry, as already specified», and the only existing ranking is the unapproved
`docs/drafts/DRAFT-E2-tranche-plan.md`. This file is the half of that work that is not blocked.

Sources, and both sides come from the SAME extractor over the SAME markup-region rule
(`scratchpad/extract.py`, line after `</helmet>` .. line before `</x-dc>`; values compared as
sorted multisets of literals, no hashing):

| | file | md5 | lines |
|---|---|---|---|
| handoff | `HeiTuva.dc.html` (uploaded, not installed) | `b4e430eccd9cfac0105b8089b6ef206f` | 11050 |
| v7 | `design-reference-v7/project/HeiTuva.dc.html` | `4d8fde3aea0f56e481bfe2416c811f96` | 10558 |

---

## THE TWO SCREENS MOVE IN OPPOSITE DIRECTIONS, AND THE RANKING DID NOT SAY SO

`DRAFT-E2-tranche-plan.md` ranks by CHANGED PROPERTY COUNT — dashboard 16, surveys 15 — which
reads as «two comparable jobs». Measured by declarations rather than by keys:

| screen | region (handoff) | region (v7) | declarations over changed properties | reading |
|---|---|---|---|---|
| dashboard | 2389–2872 (484 lines) | 2536–2858 (323 lines) | 386 → 656 (**+270**) | the screen GREW |
| surveys | — | — | 462 → 220 (**−242**) | the screen SHRANK by more than half |

**A count of changed properties is 16 against 15. The work behind them is not comparable.**
This is the project's own recorded shape: a key-set comparison answers «which identifiers
exist» and is silent about direction and magnitude.

---

## T2 — dashboard: ADDED CONTENT, plus one reversal that is not geometry

+161 lines and +270 declarations, with every value multiset rising (borders 22→34,
`font-size:12.5px` 23→39). That arithmetic is a bigger screen, not a restyle, so most of the
16 «changed» properties are content arriving rather than elements being re-styled.

**The one that a count cannot see, and it is a product change wearing geometry's clothes:**

| | v7 (`:2547`) | handoff (`:2406`) |
|---|---|---|
| content | the fixed word «Innsikt» | `{{ dashTitle }}` — INTERPOLATED |
| element | `<div>` | `<span style="display:block">` |
| font-size | 32px | 27px |
| font-weight | 600 | 500 |
| line-height | 1.1 | 1.15 |
| | | gains `text-wrap:pretty` |

The heading stopped being a label and became a title. **That is a decision about what the
dashboard IS**, not a size change, and it is the single thing in T2 that cannot be applied
from the drawing alone: nothing here says what `dashTitle` holds.

Six further values disappeared from v7 (`gap:15px`, `line-height:1.6`, `max-width:460px`,
`width:28px`, and two `grid-template-columns` that are the screen's whole two-column frame:
`minmax(0,1.1fr) minmax(330px,.9fr)` and `repeat(auto-fit,minmax(340px,1fr))`, replaced by
three narrower tracks at 180/210/220px). **The frame changed, so this is a re-export of the
screen and not a tweak** — which is what the draft plan said, and it is right about dashboard.

## T3 — surveys: a card list became a TABLE, and we may already be most of the way there

13 of 15 properties lost values; 25 distinct `padding` values and 10 `width` values are gone.
What arrived is the opposite of decoration:

```
grid-template-columns: minmax(220px,2.2fr) 118px minmax(120px,1fr) 78px 166px   (:2308, :2318)
min-width: 820px
padding: 0 12px · 0 13px · 0 14px · 0 15px · 0 16px · 13px 22px   (row paddings, not box paddings)
```

Per-card radii (`11px 12px 13px 16px 18px`) and per-card paddings are gone. **v7 drew cards;
the handoff draws a five-column table with a horizontal minimum.**

**And we already ship a table.** `app/(app)/undersokelser/SurveyTable.tsx` is the same shape
built in flex rather than grid:

| | ours (`SurveyTable.tsx`) | handoff |
|---|---|---|
| frame | `min-w-[804px] md:min-w-[760px]` (:99) | `min-width: 820px` |
| title col | `flex-[2.2_1_200px] min-w-[150px]` (:101) | `minmax(220px,2.2fr)` |
| owner col | `flex-[1.2_1_140px] min-w-[110px]` (:105) | `minmax(120px,1fr)` |
| fixed cols | — | `118px`, `78px`, `166px` |

The `2.2` is in both, so ours was built from a bundle that already carried this row. **T3 is
therefore a narrowing — flex tracks to declared grid tracks, 804 → 820 — not a rebuild**, and
it is much smaller than the changed-property count suggests. `SurveyCards.tsx` and
`ViewSwitcher.tsx` exist, so the card layout is a VIEW we ship deliberately; whether the
handoff dropping cards means dropping that view is a product question, not a geometry one.

---

## WHAT BLOCKS THE BUILD, AND IT IS ONE RESERVED DECISION

**The handoff bundle is not installed.** It has no directory, no `BUNDLES` entry in
`scripts/verify/reference.ts`, no `.gitignore`/`.eslintignore` line, no `docs/v2/00-diff.md`
§ 0.3 row and no rendered baseline under `artifacts/`. Tor reserved both the naming and that
diff table.

The consequence is not administrative. **`verify:reference` and `verify:visual` compare against
`artifacts/reference-*`, so with no baseline for this handoff there is nothing for a geometry
change to be judged against** — the pixel gates would stay green while every screen moved,
which is this project's «green for something that structurally could not be seen», eighth
instance, with the baseline as the thing unseen. Applying T2 to the dashboard now would be
restyling a screen verified by nothing.

So the two halves split cleanly:

- **Unblocked:** this measurement, and the reading that T3 is a narrowing rather than a rebuild.
- **Blocked on one decision:** installing the handoff (its directory name, its § 0.3 row), after
  which the seven-step checklist in CLAUDE.md applies — including the security-copy sweep over
  the new bundle's prose, which is per-bundle and has not been run for this one.
