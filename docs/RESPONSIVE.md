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
2. **Touch *area* ≥44×44px** for anything interactive — the *painted control keeps its design size*. This is a hit-area requirement, not a sizing requirement: reach 44px with transparent padding or an `::after` overlay (`position:absolute; inset:-Npx; content:''`), never by growing the visual. The design's switch (46×26), secondary buttons (39px), and tab chips (40px) all keep their exact dimensions at every breakpoint.
   - **Expanded areas must not overlap.** Where two controls sit close enough that their 44px regions would collide, increase the *spacing* between them at mobile — spacing is layout and may change; the control is a token and may not. Verify with an overlap check, not by eye.
   - Implement once as a shared utility/component (e.g. a `touch-target` class or a wrapper), not per instance. A finding count in the hundreds is one systemic fix, not hundreds of edits.
   - Note: 44px is a product bar above WCAG 2.1 AA (which requires no minimum) and matches WCAG 2.5.5 AAA and Apple HIG. It is about thumbs, not compliance, which is exactly why it belongs in the hit area rather than the paint.
3. **Tokens never change across breakpoints** — same colours, radii, shadows, fonts, borders. Only layout, spacing scale, and font *size* may step down, and font size only where the design's own hierarchy is preserved.
4. **No feature hidden on mobile.** Reflow, collapse, or paginate — never remove. If something genuinely cannot work at 390px, stop and ask; do not silently drop it.
5. **Content order is preserved** when columns stack: left/primary column first, sidebars after.
6. Sticky elements: page header only. Do not add sticky footers or bottom bars that the design does not have.
7. **Two intrinsic minimum widths cause almost every overflow, and neither is visible in the markup.** Rule 1 says the bar; this says where the breach comes from. Both were measured in V2-3a, where `admin-malgrupper` was the only screen in the app over 320px (`scrollWidth=385`).
   - **A `<fieldset>` carries a UA `min-inline-size: min-content`** — it will not shrink below its content no matter what you set on the child. **`min-w-0` is needed on the FIELDSET as well as on the flex item inside it, and neither alone does anything.** Isolated in Chromium at 320px, `scrollWidth` per variant: bare **357** · `max-width:100%` on the select **357** · `+min-width:0` on the select **357** · `+min-width:0` on the fieldset **320**. A `<select>` inside a plain `<div>` needs only `min-w-0`; inside a `<fieldset>` it needs both. Any fieldset in a later phase inherits this.
   - **A `<select>` takes its intrinsic width from its WIDEST OPTION**, so a long option label sets the page's minimum width from inside a closed control. In V2-3a the offender was «stillingsprosent — ikke tilgjengelig ennå» — copy a decision required, setting a layout bound nobody wrote. `min-w-0 max-w-full` lets the UA clip it; do not shorten the label to fix layout.

   Both fixes are inert at ≥1280px, which is the only form CLAUDE.md's pixel rule permits — and the general form is rule 1's own sentence: **remove the width constraint**. Find the constraint by measuring `getBoundingClientRect()` across every element and sorting by `right`, not by reading the classes; the offender is routinely a parent that grew, not the element you suspect.

## Per-pattern rules

**App shell / header (fixes D12)**
Below `md`: logo + hamburger + user avatar only. Nav items move into a slide-over panel opened by the hamburger; the panel uses `--sf` surface, `--line` border, existing nav item styling at full width, 48px row height. Language switcher moves into the panel footer. The header must not wrap or overflow at 320px.

**WHAT THE PANEL CARRIES IS A PROPERTY, NOT THE LIST BELOW (Q127, 2026-09-12).** The rule is:
**the panel carries every affordance the header drops at this width, including the primary create
action, whatever the desktop header happens to hold at the time.** It is written as a property
because the previous sentence here — «the nav, the CTA and the language switcher» — was an
enumeration of what the header contained the day it was written, and v4 moved the create CTA out of
the header onto the pages. That made the list false and said nothing about what should happen here,
which is row 5 of CLAUDE.md's table: a specification's worked example goes stale the moment a phase
moves the example.

Applied: «Ny undersøkelse» is the panel's first item and stays. Below `md` the header has no create
affordance at all, so the panel is the only place one can live; removing it would leave the product's
primary action reachable at 390px only by navigating to a page that offers it. v4's header change is
not an instruction about this surface — **no bundle draws the slide-over**, and a bundle governs what
it draws.

**Three-pane Builder**
Below `xl`: the right pane (Generelt / Add / Settings / Preview) becomes a full-screen sheet opened by a button row pinned under the header — **one button per tab**, using the existing tab chip styling, and the row **wraps** rather than shrinking. (It read «three buttons» until B2 added «Generelt» per V2:6472, and four `flex-1` tabs put every `bygg` state at scrollWidth 329 against 320px. **D129's failure a THIRD time in this file — which is now enough instances to state the rule about
the file itself: A SPECIFICATION'S WORKED EXAMPLE IS THE PART THAT AGES FASTEST AND IS QUOTED MOST.**
The three: § Data tables' «email + role select + status», which S3 broke while quoting it
approvingly; D141's «14px between painted edges», measured on one pair of ~30px chips and applied
to a 15px text link; and this one. Each was true when written, each is a COUNT or a MEASUREMENT of
what existed that day, and each reads as a property because it sits inside a rule. **Read the rule
the example illustrates; then check whether your change moves the example.** Count the tabs; do not trust this sentence.) The question list is the base layer. Below `md`: question cards go full-width, the advanced options row collapses into a disclosure ("Flere valg") that is closed by default.

**Tab rails and chip groups** (Administrasjon tabs, Undersøkelser filters, Bibliotek categories, Rapporter tabs, Builder mode chips, Resultater/Dashboard survey chips)
Below `md`: **wrap to multiple rows.** Remove the width constraint and let the existing `flex-wrap` do the work. Chips keep their exact design dimensions, styling, order, and active state — nothing is hidden, no new interaction is introduced, and the page still has no horizontal scroll.
- Do **not** use horizontal scroll with snap: it moves tabs off-screen (a discoverability loss the design never intended) and reads as if the page itself scrolls.
- Do **not** collapse to a `<select>`: that substitutes a different control, which is restyling.
- Row gap must be large enough that the 44px touch areas of vertically adjacent chips do not overlap (global rule 2). With 40px chips this means a minimum 4px vertical gap purely for hit-area separation — use the design's existing spacing step at or above that, never a smaller one.
- Left-align rows; do not justify or centre. The active chip keeps its position in reading order.

**Data tables (reports, recipients, DSR, and any wide row)**
Below `md`: never horizontally scroll a table. Which treatment applies depends on the row, not on the fact that it is a table:

- **Wide rows — 4+ fields, or controls that cannot fit at 390px:** each row becomes a card. Primary field as the card title in the design's card styling, remaining fields as label/value pairs, row actions in an overflow menu.
- **Narrow rows — the row's fields and controls fit at 390px:** keep the row. Stack label/value only if needed, and let a control cluster **wrap** before you reach for the card treatment. Do **not** convert to a card and do **not** move controls into an overflow menu; a menu that hides two controls costs more than it saves. (Brukere is this case. **Its controls are whatever that row currently carries — count them, do not trust this sentence:** it read «email + role select + status fit cleanly» until S3 added a group select, and a fourth `flex-none` control pinned the section at scrollWidth 418 at every viewport. The example was a COUNT of the controls that existed the day it was written, and the phase that broke it quoted it approvingly in the same edit. `verify:responsive` is the gate that catches this and it now runs on every push.)

Two constraints that override the card treatment in either case:
- **Consequential controls stay visible.** Anything that changes permissions, access, state, or deletes data — a role select, a deactivate action, a retention setting — is never placed behind an overflow menu on any viewport. Burying it is a safety regression, not a layout choice.
- **Never nest a card in a card, EXCEPT the survey shell card.** Where the table already sits on a card surface, the rows keep the surface they have; **inventing a nested-card treatment is restyling.** The one drawn exception is the **survey shell card** — a bordered card whose header row sits on `--sf` and whose body sits on `--bg` and closes `border-radius:0 0 19px 19px`, wrapping a whole screen. It applies to the **four survey screens and to nothing else**: `/bygg`, the survey detail, `/send` and `/resultater`. Inside it, the rules above are unchanged: a row that becomes a card becomes ONE card, on the shell's body surface, and nothing nests a third level.

  **The reason this clause carried until 2026-09-17 was «the bundle contains no nested-card treatment», and that reason EXPIRED rather than being wrong.** Measured: `grep -c 'border-radius:0 0 19px 19px'` returns **0 in v5, 15 in v6, 18 in v7**, and swept over every screen marker it lands on exactly `isBuild`, `isSvDetail`, `isSend` and `isResults` — the survey's own screens, no app-level screen. So the drawing acquired the treatment, deliberately and with a meaning (the survey's screens are one object), and a clause whose premise had gone stale was refusing a drawn pattern rather than an invented one. **That is the same shape as this section's own narrow-row example** (D129): a true statement about the material that existed the day it was written, read afterwards as a property. See Q245 and D247; the boundary is what makes the rule usable, and deleting it would have lost the protection it still gives.

**Expandable rows (the attributed table, DECISIONS Q34)**
Below `md`: **card per row**, by the wide-row rule above — the attributed table carries organisation, status, date and an answer summary, which is past four fields before the expand affordance. Three constraints specific to it:
- The detail grid opens **inside** the card, as a single column, in the same order it uses on desktop. It does not become a sheet, a dialog, or a second screen: the row's detail is the row's detail, and moving it elsewhere loses which organisation it belonged to.
- **No overflow menu**, even though the row is wide. The general rule bans a menu only for consequential controls, and this row has none — the reason here is simpler: the only action is "expand", and hiding one affordance behind a second tap costs more than it saves.
- The expand control keeps its 44px area against the card's own tap target; a card that is itself a link with an expander inside it needs the two separated, not nested.

**The «Tilpass» card (Dashboard, DECISIONS Q33)**
Below `md`: **it stacks in place.** The card is inline content on the Dashboard, not a
pane, so the Builder's full-screen-sheet pattern does not apply to it — inline content
keeps its position in reading order and its width collapses.
- Its three tabs («Utvalg og periode» / «Paneler» / «Oppsett») **wrap as a Tab rail**, by
  the Tab rails rule above. They are chips in a `--sf2` pill group; the group loses its
  width constraint and wraps, and every constraint of that rule applies unchanged — no
  horizontal scroll, no `<select>`, no chip hidden, 4px minimum vertical gap for hit areas.
- The data tab's `1.3fr .7fr` and the layout tab's `1fr 1fr` **become one column**, in
  content order: selection chips, then the threshold line, then period, then group; and
  save-a-preset before switch-preset.
- The panel picker's `repeat(auto-fill, minmax(320px, 1fr))` already collapses to one
  column at 390px and needs no rule — do not add one.
- The threshold line stays **directly under the survey chips it describes**. It is the
  sentence saying which gate the panels on screen were drawn under (Q42), and separating
  it from the selection it belongs to would make it read as a property of the page.
- **A panel card's control row uses `.touch-cluster`.** Five controls at 30px
  with 44px hit areas need 14px between painted edges (7px overflow each side);
  the design draws 6px, which is right above `md` where there is no overlay and
  wrong below it. One shared utility, not a per-instance gap — Gate 3e reported
  228 blockers from this single cause, which is what global rule 2 means by
  "a finding count in the hundreds is one systemic fix".
- No panel, preset or filter is removed on any viewport. The card is the only way to reach
  the filters after Q46 moved them out of the header, so hiding any part of it would hide
  a feature, which the global rules forbid.

**Heatmap (team × question)**
Below `md`: switch to a grouped list — one section per team, each question as a row with its coloured cell and value. Same colour scale, same `insufficient_data` treatment ("—"). Do not shrink cells below 44px or allow pinch-zoom as the reading mechanism.

**Report editor**
Below `xl`: side tabs (Innhold / Filter / Del) become a sheet, same pattern as the Builder's right pane. The document preview is the base layer at full width. Section reordering uses up/down controls on mobile, not drag.

**Send screen**
Below `md`: channel cards stack full-width; the recipient import panel becomes a sheet; the "Klar til å sendes" summary moves above the send button rather than beside it.

**Modals and the wizard**
Below `md`: full-screen sheets with a close affordance in the top-right, not centred dialogs. Step indicator stays.

**Charts** (amended per DECISIONS Q40)
Maintain aspect ratio; legend below rather than beside. Axis labels may rotate; never truncate to unreadability.
- **Never smaller than the design draws it**, and never below **44px per interactive mark** — a bar, point or cell a reader can tap or focus is a control and carries the same hit-area rule as any other (global rule 2).
- **The old "minimum height 200px" floor is dropped.** It was a number with no source: it let a chart with twelve interactive bars satisfy the file at 200px while every bar was 16px tall, and it forbade a two-bar chart that would have been perfectly readable at 120px. A floor on the container answers the wrong question; the mark is what a thumb has to hit.
- A chart with no interactive marks (a pure sparkline, a static illustration) has no 44px obligation and keeps the design's own height.

## Verification bar (feeds VERIFY.md Gate 3)
Because there is no mobile reference image for app screens, mobile verification of app routes is **rule-based, not comparison-based**. For each app route at 390px, check:
- no horizontal scroll (blocker if violated)
- nothing clipped, overlapping, or cut off
- every interactive element reachable, with a ≥44px touch area and no overlapping hit regions — measured on the hit area, not the painted control, which must match desktop pixel-for-pixel
- tokens match desktop exactly (colour-pick and compare, do not eyeball)
- the pattern above for that screen type was actually applied
- keyboard/focus still works, focus ring visible

Screenshots are still captured and looked at — but judged against these rules, not against a reference PNG. Respondent-facing routes keep the existing reference-comparison bar.

## What still needs your decision
These are genuinely ambiguous and Claude Code should ask rather than choose:
- Whether the Builder's live phone preview stays available at mobile (it is a phone frame inside a phone) or is hidden behind the sheet only.
- Whether report PDF export is offered from mobile at all.
