# RESPONSIVE.md — mobile and tablet rules for the app surface

**Why this file exists.** The design bundle is a fixed 1440px canvas with no mobile layouts for authenticated app screens. DECISIONS Q15 puts admin mobile support in v1, so those layouts have to come from somewhere. This file is that somewhere: it is the *specification* Claude Code implements against, so mobile layout is a decided thing rather than an invented one.

**Standing rule this file creates.** For app screens at <1024px, CLAUDE.md's "do not invent" is relaxed **only** to the patterns written below. Anything not covered here is still a stop-and-ask, logged in `docs/DEVIATIONS.md`. Respondent-facing surfaces are unaffected — they have real mobile designs in the prototype and stay pixel-perfect.

## Breakpoints
| Name | Range | Fidelity bar |
|------|-------|--------------|
| `desktop` | ≥1280px | **Pixel-perfect** to the design bundle. Unchanged. |
| `tablet` | 768–1279px | Design system exact (tokens, type, components); layout may reflow per rules below. |
| `mobile` | <768px | Design system exact; layout per rules below. Reference viewport 390px. |

Tailwind: use `md:` (768) and `xl:` (1280). Do not introduce other breakpoints without adding them here first.

## Global rules (all app screens)
1. **No horizontal scroll at 390px.** `document.documentElement.scrollWidth` must not exceed the viewport. This is the D12 defect and it is a blocker, not a deviation.
2. **Tap targets ≥44×44px** for anything interactive.
3. **Tokens never change across breakpoints** — same colours, radii, shadows, fonts, borders. Only layout, spacing scale, and font *size* may step down, and font size only where the design's own hierarchy is preserved.
4. **No feature hidden on mobile.** Reflow, collapse, or paginate — never remove. If something genuinely cannot work at 390px, stop and ask; do not silently drop it.
5. **Content order is preserved** when columns stack: left/primary column first, sidebars after.
6. Sticky elements: page header only. Do not add sticky footers or bottom bars that the design does not have.

## Per-pattern rules

**App shell / header (fixes D12)**
Below `md`: logo + hamburger + user avatar only. Nav items move into a slide-over panel opened by the hamburger; the panel uses `--sf` surface, `--line` border, existing nav item styling at full width, 48px row height. "Ny undersøkelse" becomes the first item in the panel. Language switcher moves into the panel footer. The header must not wrap or overflow at 320px.

**Three-pane Builder**
Below `xl`: the right pane (Add / Settings / Preview) becomes a full-screen sheet opened by a button row pinned under the header — three buttons using the existing tab chip styling. The question list is the base layer. Below `md`: question cards go full-width, the advanced options row collapses into a disclosure ("Flere valg") that is closed by default.

**Data tables (users, reports, recipients, DSR)**
Below `md`: each row becomes a card — primary field as the card title in the design's card styling, remaining fields as label/value pairs, row actions in an overflow menu. Do not use horizontal scrolling tables.

**Heatmap (team × question)**
Below `md`: switch to a grouped list — one section per team, each question as a row with its coloured cell and value. Same colour scale, same `insufficient_data` treatment ("—"). Do not shrink cells below 44px or allow pinch-zoom as the reading mechanism.

**Report editor**
Below `xl`: side tabs (Innhold / Filter / Del) become a sheet, same pattern as the Builder's right pane. The document preview is the base layer at full width. Section reordering uses up/down controls on mobile, not drag.

**Send screen**
Below `md`: channel cards stack full-width; the recipient import panel becomes a sheet; the "Klar til å sendes" summary moves above the send button rather than beside it.

**Modals and the wizard**
Below `md`: full-screen sheets with a close affordance in the top-right, not centred dialogs. Step indicator stays.

**Charts**
Maintain aspect ratio, minimum height 200px, legend below rather than beside. Axis labels may rotate; never truncate to unreadability.

## Verification bar (feeds VERIFY.md Gate 3)
Because there is no mobile reference image for app screens, mobile verification of app routes is **rule-based, not comparison-based**. For each app route at 390px, check:
- no horizontal scroll (blocker if violated)
- nothing clipped, overlapping, or cut off
- every interactive element reachable and ≥44px
- tokens match desktop exactly (colour-pick and compare, do not eyeball)
- the pattern above for that screen type was actually applied
- keyboard/focus still works, focus ring visible

Screenshots are still captured and looked at — but judged against these rules, not against a reference PNG. Respondent-facing routes keep the existing reference-comparison bar.

## What still needs your decision
These are genuinely ambiguous and Claude Code should ask rather than choose:
- Whether the Builder's live phone preview stays available at mobile (it is a phone frame inside a phone) or is hidden behind the sheet only.
- Whether report PDF export is offered from mobile at all.
