# v1 bundle — Round 0: three-way diff (evidence only)

Old bundle → new bundle → current application. No opinions, no proposals, no
estimates. Every line carries a file:line or a command output. Where something
could not be determined it is marked UNKNOWN with what would settle it.

**Paths.** The prompt names `/design-reference/project/HeiTuva.dc.html`; the
bundle actually unpacks one level deeper. Throughout this document:

- `OLD` = `design-reference/heituva-survey-app-design/project/HeiTuva.dc.html` (4097 lines)
- `NEW` = `design-reference-v1/heituva-survey-app-design/project/HeiTuva.dc.html` (4901 lines)
- `M:NNNN` = `supabase/migrations/20260902000NNN_*.sql` for NNNN ≤ 0016 and `supabase/migrations/20260904000NNN_*.sql` for NNNN ≥ 0017 (those numbers exist only in that series). The three low-numbered files of the 2026-09-04 series are written out: `M:0904-0005` (duty_card_fields), `M:0904-0006` (report_templates), `M:0904-0013` (overview_activity). 2026-09-03 files are cited by full name. App paths are repo-relative.

The new bundle was unpacked from the uploaded zip
(`fd2f388d-20260906_HeiTuva_survey_app_designhandoff_v1.zip`) into
`design-reference-v1/` in this session; it was not in the repository before.

---

## a) BUNDLE DIFF

### a.1 What changed at file level

`md5sum` over both bundles:

| File | OLD | NEW | Result |
|---|---|---|---|
| `project/HeiTuva.dc.html` | `e435ebb2…` | `671bf469…` | **changed** (353 160 → 446 676 bytes; 4097 → 4901 lines) |
| `project/HeiTuva Splash.dc.html` | `b15c0c1e…` | `b15c0c1e…` | identical |
| `project/support.js` | `951ae391…` | `951ae391…` | identical |
| `project/image-slot.js` | `ffd58db3…` | `ffd58db3…` | identical |
| `README.md` | `c8bf4085…` | `c8bf4085…` | identical |
| `project/uploads/` | 8 PNGs | 8 PNGs + 5 PNGs + `Designbrief_terskel_Q17.md` | 6 files added, none removed |

`git diff --no-index --stat`: `8 files changed, 1173 insertions(+), 177 deletions(-)`
(the 8 = one HTML file + 7 uploads). `diff -u OLD NEW` = 1778 lines, **69 hunks**.

The uploaded `Designbrief_terskel_Q17.md` is byte-identical to
`docs/Designbrief_terskel_Q17.md` (`9be8a54f…` both). The five new PNGs are
working captures, not design sources: two are screenshots of the prototype
itself (old Oversikt; new "Innsikt" preset gallery), one is a broken-render
capture of the wizard, and two are third-party stock images ("SurveyMoon",
a purple dashboard tile). None is referenced from the HTML.

### a.2 State diff — the `sc-if` list, verified

Command (both files): `grep -o '<sc-if value="{{ [^}]*}}"' … | sort -u`

| Measure | OLD | NEW | Δ |
|---|---|---|---|
| `<sc-if` tags | 131 | 175 | +44 |
| distinct `sc-if` expressions | 126 | 166 | **+40, 0 removed** |
| distinct `sc-for` lists | — | — | **+26 new, 1 removed** (`complianceItems`) |

**The 22-name list in the prompt is correct as far as it goes** — all 22
appear in NEW and none in OLD. It is incomplete: **18 loop-scoped
conditionals** are also new and belong to the same clusters. Full list of the
40, clustered, with the NEW line where each first appears in markup:

| Cluster | New `sc-if` expressions (NEW markup line) |
|---|---|
| Q17 policy panel (Builder) | `hasPolWarnings` (583), `polOpen` (590), `polLocked` (592, and 2227 on Send), `polAnonNote` (614), `polIsPerson` (618), `polLowWarn` (627) |
| Attributed vs aggregate (Resultater) | `resAttrib` (2537), `attribNote` (2550), `r.open` (2576), `resAggregate` (2591) |
| Rounds / per-block hiding (Resultater) | `hasRounds` (2592), `b.hidden` (2617) |
| Dashboard customisation | `dashReady` (934, 939, 1075), `customizeOpen` (945), `custData` (956), `custPanels` (992), `i.req` (1005), `custLayout` (1018), `dashNeedsSetup` (1042), `p.il1`…`p.il6`, `p.il0` (1049–1055), `p.mine` (1058), `pn.canPin` (1095), `pn.isRegister` (1138), `pn.isDuties` (1149), `pn.isStream` (1163) |
| Use-case library | `showUseCases` (1873), `t.hasPolicy` (1944 card, 1976 list) |
| Recurrence / rounds | `wizIsCustom` (121), `hasCtxRecur` (228), `s.hasRecur` (873), `s.isRecur` (899), `recurInherited` (2165), `hasRecurStatus` (2173), `isCustomCadence` (2182) |

New `sc-for` lists (26): `wizUses`, `langCodes`, `complianceTimeline`,
`polWarnings`, `polKinds`, `polAnonChips`, `polThresholds`, `insightTabs`,
`customizeTabs`, `dashPickerGroups`, `presetChips`, `dashPresets`, `p.panels`,
`pn.regStats`, `pn.duties`, `pn.wins`, `pn.volBars`, `pn.segments`, `pn.gaps`,
`useCaseCards`, `u.examples`, `attribFilters`, `attribCols`, `attribRows`,
`r.details`, `roundStats`.
Removed `sc-for` (1): `complianceItems` — its markup at OLD:261–272 is gone;
the JS still builds the array at NEW:4280 (dead data). Two further JS
properties are built and never rendered: `useChips` (NEW:4258) and
`complianceNext` (NEW:4268) — no `{{ useChips` / `{{ complianceNext` in any
markup line ≤ 2753.

### a.3 Changed markup inside states that already existed

A state diff cannot see these. All 69 hunks were read; grouped by screen.
"Markup" = lines 1–2753 of NEW (the `<script data-dc-script>` block starts at
NEW:2754; OLD:2301).

**Global frame (every screen).** Every per-screen container lost its own
`max-width` and the wrapper `padding:0 36px` (OLD:319) became
`width:calc(100% - 72px); max-width:{{ frameMax }}; margin:0 auto`
(NEW:364; also the header NEW:160, context bar NEW:220, Oversikt NEW:243).
`frameMax` is `1120px`, or `none` when `st.wide` is on (NEW:4007); `wide` is
read from and written to `localStorage["heituva.wide"]` (NEW:3117, 4011). The
header gains a 38 px round "wide" toggle with two SVG paths (NEW:181–183) and
becomes `flex-wrap:wrap; gap:12px 16px; padding:14px 26px` (OLD:138 had
`padding:16px 26px`, no wrap). Old per-screen widths: Oversikt 1140 (OLD:215),
Undersøkelser/Dashboard/Rapporter/Admin/Bibliotek 1080 (OLD:688, 809, 905,
1371, 1558), Profil 900 (OLD:1295); all now `frameMax`.

**Navigation.** `screens` goes from five items to four: Dashboard and
Rapporter are replaced by `["insight","Innsikt"]` (NEW:3513 vs OLD:2942).
`go()` routes `insight` to whichever of `dashboard`/`reports` was last open
(`insightLast`, NEW:3222, 3206) and routes `library` straight to the new
use-case tab (`libTab:"usecases"`). Both Dashboard (NEW:918–928) and Rapporter
(NEW:1205–1214) now render the heading **"Innsikt"** with a two-chip rail
(`insightTabs` — Dashboard / Rapporter, NEW:3639–3641) beside it; the Dashboard
subtitle reads `Levende tall · {{ docFilterLine }} · {{ dashThresholdLine }}`
(NEW:928), the Rapporter subtitle `Fryste og delte rapporter · {{ repCounts }}`
(NEW:1214). The "Innsikt" nav item is active for both screens (NEW:3598).

**Wizard (`wizOpen`).** Step 0 gains a heading "Hvem skal svare?" and a row of
six use-case chips `wizUses` above "Hva vil dere finne ut?" (NEW:60–66;
OLD:60 had only the purpose heading). `wizPurposes` is no longer the fixed six
packs (OLD:3504) but "the first six packs whose `useOf()` is the chosen use
case" (NEW:4197). Cadence chips go from three (OLD:3520: once/weekly/monthly)
to six (NEW:4220: + quarterly, yearly, custom); `wizIsCustom` reveals an inline
editor — number `Hver` 1–52, unit select dag/uke/måned, weekday select
mandag–fredag, `<input type="time">`, and a generated sentence
`wizCustomLine` (NEW:121–136, 4213–4219). `wizSummary` uses `CAD` labels
(NEW:4223–4228). `onWizFinish` writes a `recur` object onto the survey unless
the pack's cadence is inherited (NEW:4229–4236).

**Survey context bar (`inSurvey`).** A `--sbg` chip `↻ {{ ctxRecur }}` after
the status pill when `hasCtxRecur` (NEW:228–230; `ctxRecur = recurLine(sv)`,
NEW:4088).

**Oversikt (`isDash`).** The "Krever handling" card (OLD:229–261, first
element under the greeting) moves into a two-column grid **below** the
"Sløyfen lukket / Svaraktivitet" pair, as the left `minmax(0,1.6fr)` column
(NEW:305–333). The "Lovpålagte frister" chip row (OLD:263–272) is replaced by
a dark `--ink` card-button in the right column (NEW:334–357): eyebrow +
"Se alle →", `{{ complianceSummary }}` in Playfair 22px, a 6 px timeline bar
with absolutely-positioned dots from `complianceTimeline` (`pos` in %,
NEW:342–345), axis labels "nå" / "12 mnd", and a list with `{{ c.when }}`
chips. `goCompliance` opens Rapporter's lov tab (NEW:4279). The
`complianceTimeline` data is a hard-coded four-row array (NEW:4272–4277) and
`complianceSummary` a literal `"2 av 4 plikter krever handling i år"` (NEW:4278).

**Builder (`isBuild`).** Grid becomes `minmax(0,1.35fr) minmax(0,.9fr)`,
`padding-top:28px` (NEW:367); the question-card header row gains
`flex-wrap:wrap` and the text input `flex:1 1 220px; min-width:0` (NEW:385–387);
image-option grid becomes `repeat(auto-fill,minmax(280px,1fr))` (NEW:481).
The Innstillinger tab gains a **new first card "Hvem svarer og hva vises"**
(NEW:577–635), inserted above "Klar til utsending?" (NEW:636): summary line
`polSummary`, "Endre/Lukk" button, `--ac3` warning boxes from `polWarnings`
(NEW:583–589), and when open: the `--sf2` padlock line `polLockText`
(NEW:592–596), "Hvem svarer" chips (`polKinds`, NEW:599–606) with
`polKindNote`, "Anonymitet" chips (`polAnonChips`, NEW:607–616) with
`polAnonNote`, and — persons only — "Terskel for visning" chips
`polThresholds` = 3/4/5/8/10 (NEW:618–626, 4855) with "Anbefalt: 5" and the
`--sbg` `polLowText` box below 5 (NEW:627–630, 4857–4858). `polWarnings`
(NEW:3527–3529) has two rules: target smaller than threshold, and — in
organisation mode — up to two questions whose text matches
`/\b(du|deg|din|ditt|dine|jeg|meg|min|mitt|mine)\b/i`. `readyChecks` gains
"Terskel og målgruppe stemmer" (NEW:4645) and `anonWarn` now reads `pol.anon`
(NEW:4659). `polLockedNow = pol.locked || sv.responses.length > 0` (NEW:3526).

**Undersøkelser (`isSurveys`).** Row gains `↻ {{ s.recurLine }}` chip before
the share chip (NEW:873–875); the ··· menu gains `{{ s.pauseLabel }}` and
"Stopp gjentakelsen" when `s.isRecur` (NEW:899–902); `s.isRecur` is
`cadence !== "once" && status === "Aktiv"` (NEW:4137). Row meta still prints
`{{ s.resp }}` = `"N av T"` (NEW:4136) regardless of threshold.

**Dashboard (`isDashboard`) — the largest change (hunks 16–18, +228/−31).**
Header: period/group selects and `repSurveyChips` leave the header
(OLD:819–830, 843–848); "Åpne rapport (n)" leaves the header — `pinnedLabel` /
`onOpenPinned` survive only in JS (NEW:3734) with **no markup reference**. In
their place, when `dashReady`: a bordered "Tilpass" toggle button (NEW:936) and
an `--ac` "Frys som rapport" button (NEW:940, `onFreeze` NEW:3647–3650 → opens
the report editor with `summary` + the layout's aggregate panels + `method`).
New inline card "Tilpass dashboardet" (`customizeOpen`, NEW:945–1041) with a
three-chip rail: *Utvalg og periode* (survey chips + `dashThresholdLine` +
Periode/Gruppe selects, NEW:956–990), *Paneler* (picker grouped by four
archetypes with italic question, per-item `req` chip and a Legg til / Lagt til ✓ /
Ikke tilgjengelig button, NEW:992–1016), *Oppsett* (save-as-preset input +
"Lagre", `presetChips` to switch, "Start på nytt fra oppsettvalget",
NEW:1018–1040). When `dashNeedsSetup` (no layout yet): a "Velg et oppsett å
starte fra" gallery of `dashPresets` cards, each with one of seven inline SVG
illustrations (`p.il1`…`p.il6`, `p.il0` for saved ones), title, description,
panel chips and "Bruk oppsett" (NEW:1042–1075); saved presets carry a "×"
(`p.mine`, NEW:1058). Panels render from `dashLayout` (NEW:3671) instead of the
fixed four (OLD:3045): each header gains ↑ ↓ (30 px round), a width toggle
"Halv/Full bredde", the pin (only when `pn.canPin`, i.e. aggregate panels,
NEW:1095, 3680) and a "×" remove (NEW:1089–1100). Three new panel bodies:
**register** (`pn.regStats` three stat tiles + "Åpne leverandøroversikten →",
NEW:1138–1148, data NEW:3690–3700), **duties** (row per duty with tone dot,
law · owner, due, NEW:1149–1163, data from the hard-coded `DUTIES` NEW:3701–3706)
and **stream** (7/30/90-day chips, rolling average, an SVG with per-day volume
bars, gapped polyline and "—" markers, NEW:1163–1201; data `streamData`
NEW:3285–3294, 3707–3732). `dashThresholdLine` = "strengeste terskel blant
valgte undersøkelser: N" where N is the max threshold over **all person surveys
in the org**, not the selection (NEW:3533).

**Rapporter (`isReports`).** Heading and subtitle as above; standard-template
grid becomes `auto-fill,minmax(280px,1fr)` (NEW:1341). **No other change**:
the duty cards, the editor (`repEditing`, Innhold/Filter/Del) and the document
are byte-identical to OLD apart from line shift. In particular the bundle still
does **not** draw: the "Strengeste terskel …" Filter-tab lines (brief §6), a
«Svar per virksomhet» section body (brief §6), or a threshold line in the
Metode section.

**Profil / Administrasjon.** Padding/`max-width` only (NEW:1600, 1676).
**The Personvern tab is unchanged** — the brief's §8 controls (default
threshold picker, "Tillat at redaktører senker terskelen") are in neither bundle.

**Bibliotek (`isLibrary`).** Tab rail goes from two to three: "Bruksområder"
first (NEW:4460 vs OLD:3717). New tab body (NEW:1873–1897): an intro sentence
("Seks områder HeiTuva brukes til …") and six `useCaseCards` — tinted card,
title, description, up to three example-pack chips, `{{ u.count }} · {{ u.live }}`
("N maler · M lovpålagt" / "K undersøkelser hos dere"), buttons "Se maler" and
"Dashboard" (the latter loads the matching `DASH_PRESETS` entry, NEW:4478).
Category chips are now Alle + the six use cases + Lovpålagt + Annet
(NEW:4469 vs OLD:3726: Alle/Ansatte/Lovpålagt/Kunder/Annet); `packCatNote`
shows the use case's description (NEW:4479). Card eyebrow becomes the use-case
label instead of the pack category (NEW:4484). Card and list rows gain
`{{ t.policyLine }}` under the legal badge when `t.hasPolicy` (NEW:1944–1946,
1976–1978); the value is derived by regex on the audience string
(NEW:4486). Grids become `auto-fill,minmax(280px,1fr)` (NEW:1878, 1898, 1937);
list columns become `minmax(...)` (NEW:1962, 1966). `PACKS` gains five packs —
"Servicedesk etter sak", "IT og verktøy" (cat `Intern`), "Innbyggerundersøkelse",
"Brukerundersøkelse tjeneste" (cat `Offentlig`), "Frivillige etter arrangement"
(cat `Medlem`) (NEW:2857–2881) — and re-categorises two: "Medlem og innbygger"
`Annet`→`Medlem` with audience "Medlemmer og foreldre · årlig" (NEW:2837), "Kurs
og opplæring" `Annet`→`Intern` (NEW:2842). `useOf()` maps a pack to a use case
by category, or by `legalFor` regex for `Lovpålagt` packs (NEW:2972–2973).

**Send (`isSend`).** Import-source grid `auto-fill,minmax(200px,1fr)` (NEW:2050);
QR grid rows `minmax(0,1fr)` (NEW:2127). Under the cadence radios: a `--sf2`
padlock note `recurInheritNote` when `recurInherited` (NEW:2165–2170; text
"Hyppigheten er arvet fra plikten (…) — hver …", NEW:4337); `cadenceOptions`
grow from five to eight — + "Hvert år / Lovpålagte kartlegginger", "Annethvert
år / Lønnskartlegging etter ARP", "Tilpasset / Velg intervall, ukedag og
klokkeslett selv" (NEW:4316–4325) — and `onPick` is a no-op when inherited
(NEW:4325). Inside the recurring panel, two new blocks above "Antall runder":
a status row `↻ {{ recurStatus }}` with "Pause rundene/Fortsett rundene" and
"Stopp" (`hasRecurStatus`, NEW:2173–2181; hidden for drafts NEW:4338), and the
same custom-cadence editor as the wizard (`isCustomCadence`, NEW:2182–2197).
`cadenceSummary` says "… i N runder" or "… til du stopper den" (NEW:4365).
`cadencePlan` uses `CAD.step` and appends the year for steps ≥ 365 days
(NEW:4351–4363). "Levering" gains the padlock note `polLockText` when
`polLocked` (NEW:2227–2232); `anonModes` (NEW:2234–2244) read `pol.anon` and refuse clicks when
locked or organisation (NEW:4600–4602). The "Klar til å sendes" card gains one
line `{{ policyLine }}` under `channelSummary` (NEW:2273; text NEW:4812:
"Anonyme svar · resultater vises fra N svar" / "Navngitte svar · attribuert til
virksomhet" / "Respondenten velger · …"). **Unchanged**: the "Sendes" select
(Med en gang / Mandag 09:00 / Fredag 15:00, NEW:2245–2251) and the reminder
chips (NEW:2260–2263) — D43's two items are still drawn and still not built.

**Respondent (`isRespond`).** Language rail replaces `langChips` (two) with
`langCodes` — four code chips NO/SV/DA/EN, 11 px bold, `title`/`aria-label` =
language name (NEW:2320–2324, 4013). Banner: `align-items:flex-start;
padding:12px 14px`, text `13px; line-height:1.5; text-wrap:pretty`
(NEW:2326–2331; OLD:1955–1958 had `align-items:center; padding:11px 14px;
12.5px; 1.45`). `anonBanner` is derived from `BANNER[lang]` × `NUMWORD` ×
policy (NEW:4832–4836): organisation → `org(orgName)`; named; optional →
`choose(n)` plus the small-group caveat below 5; anonymous → `anon(n)` plus
caveat below 5. `peerEnough` is false for organisation surveys and `peerNote`
reads "Svar fra virksomheter vises ikke samlet — de leses enkeltvis."
(NEW:3984–3985). Image grids `auto-fill` (NEW:2400, 2425).

**Resultater (`isResults`).** New line under the scope line:
`{{ resultsThresholdLine }}` (NEW:2513; text NEW:4862). Stat grid becomes
`auto-fill,minmax(200px,1fr)` and each card carries `title="{{ s.title }}"`
(NEW:2527–2530). New block `resAttrib` — "Svar per virksomhet" (NEW:2537–2590):
count line, four-segment filter rail (Alle / Har avdekket brudd / Mangler policy /
Ikke svart, NEW:4863), an `--ac2` note pill, "Eksporter CSV" (NEW:2553;
`onAttribExport` only sets a 2-second note, NEW:4880), a fixed-width header row
(Virksomhet · Svardato 80 px · Status 104 px · up to four 96 px key-question
columns from `attribCols` · 24 px chevron), one expandable row per organisation
with status pill and per-column Ja/Nei pills tinted `--ac3`/`#E4F2E0`
(NEW:2560–2583), a two-column detail grid `r.details` when `r.open`
(NEW:2576–2584), and a footnote "Hver virksomhet er ett svar og leses
enkeltvis. Ingen terskel — svarene er attribuert etter åpenhetsloven."
(NEW:2588). Key columns are the first four `yesno` questions; "brudd" and
"policy" columns are found by regex on question text (NEW:3536–3540). The
whole aggregate view is wrapped in `resAggregate` (NEW:2591 … 2703). New
panel "Runde for runde" when `hasRounds` (more than one round, NEW:4345):
`recurStatus` at right, one bar per round with avg, label, `count` and
"under terskel" note; below-threshold rounds draw at 4 % height in `--sf2`
with "—" and no count (NEW:2592–2609, 4342–4344). Per-question blocks gain
`b.hidden` — a Playfair 30px "—" plus `{{ b.hiddenNote }}` ("Vises fra N svar.
Nå: færre.") when the whole survey is below threshold (NEW:2617–2622,
4893–4894). `resultStats` has an organisation variant (Har svart / Avdekket
brudd / Mangler policy / Ikke svart) and, for persons below threshold, shows
"—" with the note in `title` (NEW:4882–4892); `avgScore` becomes "—" below
threshold (NEW:4442). `prevAvg`/`trendLabel` now come from the per-round
series when two gated-ok rounds exist (NEW:4443–4444). `resultsScope` has an
organisation variant "Attribuerte svar · synlig for HR og ansvarlig for
åpenhetsloven" (NEW:4093).

**Data and JS constants (no markup).** `CAD` (NEW:2941): once/custom/weekly/
biweekly/monthly/quarterly/yearly(365)/biennial(730). `LEGAL_CADENCE`
(NEW:2942): Arbeidsmiljø→monthly, Psykososial→yearly, Trakassering→yearly,
Likestilling→biennial, Leverandør→yearly, Klima→yearly. `DEFAULT_POLICY`
(2945), `ORGS` (14 supplier names, 2946), `NUMWORD` (2947), `BANNER` in
no/sv/da/en (2948–2953), `ARCHE_LABEL` (2954), `PANEL_LIB` (2955–2963: trend,
heatmap, drivers, themes [agg]; register [reg]; duties [duty]; stream
[stream]), `USE_CASES` (2964–2971: hr, kunder, intern, leverandor, offentlig,
medlem — each with `preset` and `tint`), `DASH_PRESETS` (2974–2981: six
presets; Kundeopplevelse and Intern tjenestekvalitet lead with `stream`,
Leverandøroppfølging = register + duties). `mkSurvey` derives `policy` (locked
for `Lovpålagt`, organisation when the audience matches `/leverand/`) and
`recur` (inherited when `LEGAL_CADENCE` has the pack) (NEW:3077–3085). The
seed adds a fourth survey s4 "Leverandør — åpenhetsloven" with 9 responses and
`target = 14` (NEW:3094–3097). `seedResponses` yes/no values change from
"Yes"/"No" to "Ja"/"Nei" (NEW:3065).

---

## b) APPLICATION DIFF

Classification: **ALREADY BUILT** (Phase 8/9 or earlier), **PARTIALLY BUILT**
(what is missing), **NOT BUILT**. Fidelity note says whether the built thing
matches NEW, OLD, or the design brief (built from prose, no bundle in either
version — D87). Phase 8 = commit `8e19873` (migration `20260904000032`,
`…033`); Phase 9 = `a56878b` (`…034`); both applied to prod on 2026-09-05
(`docs/OPERATIONS.md:29–47`).

### b.1 Frame, header, navigation

| Surface (NEW) | What exists today | Class | Fidelity |
|---|---|---|---|
| Shared frame `calc(100% - 72px)`, `max-width:1120px` (NEW:364, 160, 220, 243) | Layout wraps children in `mx-5` only (`app/(app)/layout.tsx:18`); each screen sets its own width: 1140 (`oversikt/OverviewScreen.tsx:86`, `send/SendScreen.tsx:181`), 1080 (`undersokelser/page.tsx:160`, `dashboard/DashboardScreen.tsx:111`, `rapporter/ReportsScreen.tsx:61`, `rapporter/ReportEditor.tsx:51`, `bibliotek/page.tsx:71`, `administrasjon/layout.tsx:20,48`), 900 (`profil/page.tsx:46`); Builder and Resultater have none (`bygg/Builder.tsx:358`, `resultater/ResultsScreen.tsx:158`). Header: `mx-5 mt-4 … px-[26px] py-4` (`components/AppHeader.tsx:31`) | PARTIALLY BUILT — widths match OLD, not NEW | Matches OLD on every screen; every screen differs from NEW by container width and the header by padding/wrap |
| "Wide" toggle button in header (NEW:181–183, 4007–4011) | No equivalent; header right cluster is CTA + LangPicker + MobileNav + UserMenu (`components/AppHeader.tsx:44–75`) | NOT BUILT | — |
| Four-item nav with "Innsikt" (NEW:3513, 3598) | Five items dash/surveys/dashboard/library/reports (`components/AppHeader.tsx:19–25`), active key by path prefix (`components/AppNav.tsx:19–26`), same list in the slide-over (`components/MobileNav.tsx:101–116`); labels in `messages/no.json:19–31` (no `insight` key) | NOT BUILT | Matches OLD:2942 |
| Innsikt tab rail on Dashboard and Rapporter (NEW:921–926, 1207–1212) | Dashboard heading "Dashboard" (`DashboardScreen.tsx:114`); Rapporter heading "Rapporter" + three-tab rail (`ReportsScreen.tsx:64, 77–80`; tabs `rapporter/page.tsx:25–35`) | NOT BUILT | Matches OLD |

### b.2 Wizard

| Surface (NEW) | What exists today | Class | Fidelity |
|---|---|---|---|
| "Hvem skal svare?" use-case chips, purposes filtered by use case (NEW:60–66, 4195–4197) | Step 0 lists a fixed six packs by key (`undersokelser/keys.ts:93–100`; rendered `undersokelser/ny/Wizard.tsx:138–200`) | NOT BUILT | Matches OLD:3504 |
| Six cadence chips incl. custom editor (NEW:114–135, 4213–4222) | Three chips once/weekly/monthly (`undersokelser/keys.ts:103–109`; `Wizard.tsx:284–306`); server accepts only those three (`undersokelser/actions.ts:94–99`) | PARTIALLY BUILT — quarterly, yearly, custom and the editor missing | Matches OLD:3520 |
| Wizard writes `recur` incl. every/unit/weekday/hour (NEW:4229–4236) | Wizard inserts a `schedules` row with `runs_total: 0` and nothing else — no `next_run_at`, no `send_at_local` (`undersokelser/actions.ts:179–186`) | PARTIALLY BUILT | See c.3: this row is never picked up by the scheduler |

### b.3 Survey context bar, survey list

| Surface (NEW) | What exists today | Class | Fidelity |
|---|---|---|---|
| Context-bar recurrence chip (NEW:228–230) | Title, audience, status pill, step rail only (`undersokelser/[id]/SurveyContextBar.tsx:58–107`) | NOT BUILT | Matches OLD:194–211 |
| Row recurrence chip (NEW:873–875) | Row meta = audience · people; share chip (`undersokelser/SurveyRow.tsx:141–160`); list query selects no schedule fields (`undersokelser/page.tsx:45–49`) | NOT BUILT | Matches OLD |
| Row menu Pause/Fortsett + Stopp gjentakelsen (NEW:899–902) | Menu: rediger, send, resultater, lag rapport, svar selv, del, kopier, lukk (aktiv only), slett (`SurveyRow.tsx:214–311`) | NOT BUILT | Matches OLD:766–801 |

### b.4 Oversikt

| Surface (NEW) | What exists today | Class | Fidelity |
|---|---|---|---|
| "Krever handling" moved into the lower grid's left column (NEW:305–333) | Card is first under the greeting (`oversikt/OverviewScreen.tsx:117–170`) | ALREADY BUILT (OLD position) | Matches OLD:229–261, not NEW |
| Dark compliance card with 12-month timeline (NEW:334–357) | A chip row per duty definition with tone and "days" text (`OverviewScreen.tsx:172–192`), computed from `duties.next_due_at` (`oversikt/page.tsx:131–164`) | NOT BUILT (the data exists) | Matches OLD:263–272 |
| Grid order "Sløyfen lukket / Svaraktivitet" above the new row (NEW:257–304) | Same two cards, currently below the chips (`OverviewScreen.tsx:194–289`) | ALREADY BUILT | Order differs from NEW |

### b.5 Builder — policy panel

| Surface (NEW) | What exists today | Class | Fidelity |
|---|---|---|---|
| "Hvem svarer og hva vises" card (NEW:577–635) | Innstillinger tab = readiness checks + logic + EngagementPanel (`bygg/Builder.tsx:297–349`); the page selects no policy columns (`bygg/page.tsx:30–35`) | NOT BUILT | D87: waited for the bundle; the bundle now has it |
| Server side: change threshold / respondent kind | `setSurveyPolicy` exists — administrator only, `kThreshold` 3–50, `respondentKind` (`bygg/actions.ts:350–385`), no caller (D87: "an action with no caller") | ALREADY BUILT (kernel), unused | Chip values 3/4/5/8/10 (NEW:4855) vs `max(50)` at `bygg/actions.ts:352`; anonymity is not part of the action |
| Lock texts (pack / answers) (NEW:4847) | The same two texts exist on Send: `send/page.tsx:67–83` derives `lockedReason`; keys `send.lockedByPack`, `lockedByPackAttributed`, `lockedBySent` (`messages/no.json:396–398`) | PARTIALLY BUILT — text exists on Send, not in the Builder | Matches NEW copy |
| `polWarnings` two breach rules (NEW:3527–3529) and ready check "Terskel og målgruppe stemmer" (NEW:4645) | Field-question anonymity warning by type (`Builder.tsx:192`, `QuestionCard.tsx:253`); ready checks title/questions/texts/quality/anonymity (`Builder.tsx:194–200`) | NOT BUILT | — |

### b.6 Send

| Surface (NEW) | What exists today | Class | Fidelity |
|---|---|---|---|
| Eight cadence options (NEW:4316–4325) | Five (`lib/send/registry.ts:29`; radios `send/SendScreen.tsx:470–483`; Zod `send/actions.ts:34`) | PARTIALLY BUILT — yearly, biennial, custom missing | Matches OLD:3592 |
| Custom cadence editor (NEW:2182–2197) | none | NOT BUILT | — |
| Status row with Pause/Stopp (NEW:2173–2181) | none — Send has no notion of an existing schedule | NOT BUILT | — |
| Inherited-cadence padlock note (NEW:2165–2170) | none | NOT BUILT | — |
| Levering padlock note (NEW:2227–2232) | `lockedReason` rendered as a plain `<p class="mt-2 text-[12.5px] text-mut">` under the radios (`SendScreen.tsx:568–570`) | ALREADY BUILT (Phase 9) | Brief-derived; NEW draws a `--sf2` box with a padlock icon above the radios — position and chrome differ |
| Anonymity radios disabled when locked/organisation (NEW:4600–4602) | Disabled when `lockedReason !== null` (`SendScreen.tsx:561`) | ALREADY BUILT | Organisation surveys are locked via `policy_locked`/CHECK, not via kind; matches in effect |
| "Klar til å sendes" policy line (NEW:2273, 4812) | Same four variants (`SendScreen.tsx:625–633`; keys `messages/no.json:395` ff.) | ALREADY BUILT (Phase 9) | Matches NEW position and copy |
| "Sendes" select and reminder chips (NEW:2245–2262) | Not built (D43, `docs/DEVIATIONS.md:860–883`) | NOT BUILT | Unchanged in NEW; D43 stands |
| Grid reflow (import auto-fill, QR minmax) | `sm:grid-cols-2 lg:grid-cols-3` (`SendScreen.tsx:253`) | ALREADY BUILT | Breakpoint-based vs auto-fill; desktop identical |

### b.7 Respondent

| Surface (NEW) | What exists today | Class | Fidelity |
|---|---|---|---|
| Derived banner text (NEW:4832–4836) | `anonymityPromise()` (`lib/respondent/anonymity-promise.ts:49–64`) → keys `promiseAnonymous/Low/Named/Organisation` (`Respondent.tsx:131–135`); `optional` renders fixed `t('choose')` without the threshold (D85, `docs/DEVIATIONS.md:1593–1603`) | PARTIALLY BUILT — optional variant lacks `choose(n)` + caveat | Matches NEW for the three other cases |
| Banner chrome (NEW:2326–2331) | `items-center px-3.5 py-[11px] text-[12.5px] leading-[1.45]` (`Respondent.tsx:172–174`) | ALREADY BUILT to OLD | Differs from NEW (flex-start, 12px 14px, 13px, 1.5, text-wrap) |
| Four language code chips (NEW:2320–2324) | Chips for offered locales only, `l.toUpperCase()`, `px-[13px] py-[7px] text-xs` (`Respondent.tsx:152–169`); offered = `surveys.langs ∩ ACTIVE_LOCALES` (`s/[token]/page.tsx:55–69`) | ALREADY BUILT to OLD | NEW always shows NO/SV/DA/EN at 6px 8px / 11px; conflicts with Q11 (`DECISIONS.md:19`) and D73 |
| Peer results hidden for organisation surveys (NEW:3984–3985) | `PeerResults.tsx:34–44` renders whatever `get_peer_results` returns; the RPC gates on `app.k_for` = 0 for organisation surveys (`M:0032:1152, 1176–1178`) | NOT BUILT (and the RPC returns data) | — |
| Optional-choice chips "Vær anonym / Vis navnet" (`Respondent.tsx:180–201`) | present in the app | — | UNKNOWN provenance: no such chips in OLD or NEW markup (grep `Vær anonym|anonChoice` = 0 hits in both) |

### b.8 Resultater

| Surface (NEW) | What exists today | Class | Fidelity |
|---|---|---|---|
| Threshold line under the scope line (NEW:2513) | `thresholdLine / thresholdLineLow / thresholdLineAttributed` (`resultater/ResultsScreen.tsx:163–169`) | ALREADY BUILT (Phase 9) | Matches NEW |
| Stats "—" + hover note when whole survey below k (NEW:4886–4889) | Stats show `summary.n`, completion %, avg (`ResultsScreen.tsx:118–155`); `results_summary` returns `n`, `invited`, `responded`, `completion` unconditionally (`M:0032:575–583`) | NOT BUILT | Also a policy question — see c.13 |
| Stat grid auto-fill + `title` (NEW:2527–2530) | `grid-cols-1 md:grid-cols-2 xl:grid-cols-4`, no title (`ResultsScreen.tsx:190–202`) | ALREADY BUILT to OLD | Desktop identical at four cards |
| Per-question `b.hidden` "—" + note (NEW:2617–2622) | Gated block renders a `--sf2` box with `insufficient` text and `title` (`ResultsScreen.tsx:215–218`, keys `results.insufficient/insufficientTitle`, `messages/no.json` results:12, 80) | PARTIALLY BUILT — same information, different chrome | NEW's big-dash treatment is new in this bundle |
| Attributed table "Svar per virksomhet" (NEW:2537–2590) | Nothing on screen (D87); RPC `attributed_results` exists (`M:0034:168–194`) and is tested (`tests/invariants/attributed-results.test.ts:143–215`) | NOT BUILT (UI); ALREADY BUILT (data path) | — |
| CSV export (NEW:2553) | none | NOT BUILT | — |
| "Runde for runde" (NEW:2592–2609) | `get_trends` returns per-round gated points (`M:0032:587–635`); the screen uses only the last two (`ResultsScreen.tsx:103–108`, 377–396) | NOT BUILT (UI); data exists | — |
| Organisation `resultsScope` line (NEW:4093) | Scope label from editors + `results_scope` (`resultater/page.tsx:117–128`) | NOT BUILT | — |
| Organisation stat set (NEW:4882–4886) | none | NOT BUILT | — |

### b.9 Dashboard

| Surface (NEW) | What exists today | Class | Fidelity |
|---|---|---|---|
| Fixed four panels trend/heatmap/drivers/themes | `DashboardScreen.tsx:187–255` | ALREADY BUILT | Matches OLD:3045 order and spans |
| Pins per panel + "Åpne rapport (n)" | `PinButton.tsx`, `OpenPinnedButton.tsx`, `dashboard/actions.ts:20–80`, table `M:0024` | ALREADY BUILT (Phase 5) | NEW keeps the pin on aggregate panels (NEW:1096) but **removes the "Åpne rapport" button from the markup** (only JS NEW:3734) |
| Filters in header (period, group, survey chips) | `DashboardFilters.tsx`, `DashboardScreen.tsx:119–133, 147–175` | ALREADY BUILT to OLD | NEW moves all three into the "Tilpass" card (NEW:956–990) |
| "Tilpass" card, three tabs (NEW:945–1041) | none | NOT BUILT | — |
| Preset gallery `dashNeedsSetup` (NEW:1042–1075) | none | NOT BUILT | — |
| Layout: order, width, remove per panel (NEW:1089–1100, 3671–3688) | none | NOT BUILT | — |
| Save / switch / reset preset (NEW:1018–1040, 3644–3665) | none | NOT BUILT | — |
| "Frys som rapport" (NEW:940, 3647) | `openPinnedReport` creates a report from pins (`dashboard/actions.ts:61–80`) | PARTIALLY BUILT — the creation path exists, the source (layout vs pins) differs | — |
| Register panel (NEW:1138–1148) | `attributed_results` (`M:0034:168–194`) | NOT BUILT (UI) | — |
| Duties panel (NEW:1149–1163) | Duty rows read on Oversikt (`oversikt/page.tsx:35–39`) and Rapporter | NOT BUILT (UI) | — |
| Stream panel (NEW:1163–1201) | No per-day, per-survey series exists; `overview_activity` is org-wide participation (D65, `docs/DEVIATIONS.md:1262–1281`) | NOT BUILT | — |
| `dashThresholdLine` (NEW:928, 3533) | Heat-map note and gated hover use the RPC's `k` over the **selection** (`DashboardScreen.tsx:41–44, 216, 219`; `M:0032:973`) | PARTIALLY BUILT — semantics differ (org-wide in NEW) | — |

### b.10 Rapporter and the editor

| Surface (NEW) | What exists today | Class | Fidelity |
|---|---|---|---|
| Heading "Innsikt" + rail, subtitle (NEW:1205–1214) | "Rapporter" + counts (`ReportsScreen.tsx:61–66`) | NOT BUILT | Matches OLD |
| Standard grid auto-fill (NEW:1341) | `grid-cols-1 md:grid-cols-2 xl:grid-cols-3` (`ReportsScreen.tsx:119`) | ALREADY BUILT to OLD | Breakpoint grid vs auto-fill; desktop identical at three columns |
| Filter tab "Strengeste terskel…" / "… har terskel 3, men rapporten bruker 5" | Built (`rapporter/ReportSidePanel.tsx:359–366`; keys `messages/no.json:635–637`) | ALREADY BUILT (Phase 9) | **Brief-derived; not in OLD or NEW** |
| «Svar per virksomhet» in Innhold picker, unavailable with reason | Built (`ReportSidePanel.tsx:103, 172, 206`) | ALREADY BUILT (Phase 9) | Brief-derived; not in either bundle |
| «Svar per virksomhet» section body | Status line only (`ReportDocument.tsx:297`, `lib/reports/print.ts:132`, `lib/reports/pptx.ts:134`; D88) | PARTIALLY BUILT | Not drawn in either bundle |
| Metode section threshold text | Built (`ReportDocument.tsx:279`, `print.ts:124`, `pptx.ts:131`) | ALREADY BUILT (Phase 9) | Brief-derived; not in either bundle |

### b.11 Bibliotek

| Surface (NEW) | What exists today | Class | Fidelity |
|---|---|---|---|
| "Bruksområder" tab and six cards (NEW:1873–1897) | Two tabs (`bibliotek/chips.ts:15`; `bibliotek/page.tsx:76–83`) | NOT BUILT | Matches OLD:3717 |
| Category chips = use cases (NEW:4469) | Five categories bound to the DB CHECK (`chips.ts:9`, `bibliotek/page.tsx:239–253`) | NOT BUILT | Matches OLD:3726 |
| Card eyebrow = use-case label (NEW:4484) | Eyebrow = `p.category` (`bibliotek/page.tsx:195–200`) | ALREADY BUILT to OLD | Differs from NEW |
| Policy line on card and list (NEW:1944–1946, 1976–1978) | Card: `policyLineFor` → `mt-1.5 text-[12px] text-mut` (`bibliotek/page.tsx:189–194`, `TemplateCard.tsx:77`; keys `messages/no.json:902–903`). List view: no policy line (`bibliotek/page.tsx:294–305`) | PARTIALLY BUILT — list row missing; card built from the brief | NEW: `font-size:11.5px; margin-top:6px` (card), `11.5px; margin-top:4px` (list); app card 12px / 6px |
| Five new packs, two re-categorised (NEW:2837, 2842, 2857–2881) | Seed has 17 packs with categories Ansatte/Kunder/Lovpålagt/Annet (`supabase/seed.sql:4–38`); CI asserts `packs = 17` (`.github/workflows/ci.yml:63`) | NOT BUILT | — |
| Grids auto-fill | `md:grid-cols-2 xl:grid-cols-3` (`bibliotek/page.tsx:219, 264`) | ALREADY BUILT to OLD | Desktop identical |

### b.12 Personvern (Administrasjon)

| Surface | What exists today | Class | Fidelity |
|---|---|---|---|
| Brief §8 default-threshold picker and redaktør switch | Not in OLD, **not in NEW** (adminPersonvern block unchanged apart from padding, NEW:1771 ff.). App: locked row states the org default (`administrasjon/PrivacyPanel.tsx:59–77`); columns exist (`M:0034:14–23`; `privacy.redaktor_may_lower` read by `M:0034:107–114`) | NOT BUILT (no bundle screen — D87 stop-and-ask stands) | — |

### b.13 Copy (ui_messages / messages/no.json)

Exists: `send.policyAnonymous/Named/Optional/Organisation` (395 ff.),
`send.lockedByPack*`/`lockedBySent` (396–398), `library.policyPerson/
policyOrganisation` (902–903), `results.thresholdLine*` (483 ff.),
`results.insufficientTitle` (80 in the namespace), `reports.strictestK/
strictestNone/sourceLowerK/methodK/methodAttributed` (635–639),
`admin.pMinResponses*` (698–699), `respondent.promise*` (1006 ff.).
Absent (0 hits): `nav.insight`, `cadYearly`, `cadBiennial`, `cadCustom`,
`wizard.cadenceQuarterly/Yearly/Custom`, `library.catMedlem/catIntern/
catOffentlig`, `library.tabUseCases`, and every dashboard-customisation,
preset, panel-kind, attributed-table, rounds-panel, pause/stop and
recurrence-status string. The splash namespace has its own six "use cases"
(`splash.useCases1…6`, `messages/no.json:1180–1218`) that are marketing tiles,
not the bundle's `USE_CASES`.

---

## c) SCHEMA DIFF — what each new surface needs that the schema does not have

Inventory only. "Exists" cites the migration; "GAP" states the missing thing.

### c.1 Policy panel (Builder)
- `surveys.respondent_kind`, `k_threshold`, `policy_locked` — exist (`M:0032:17–29`); floor CHECK (`M:0032:28–29`); organisation ⇒ named CHECK (`M:0034:37–39`).
- Pack lock and legal reference for `polLockText` — `template_packs.policy` (`M:0032:31`), `legal_ref` (`M:0003:7`) exist.
- `polWarnings` rule 1 needs `surveys.target` — exists (`M:0003:40`).
- Guard/audit — `app.guard_survey_policy` (`M:0034:76–121`) writes `threshold.change` audit rows.
- GAP: none structural. Note: `setSurveyPolicy` accepts 3–50 (`bygg/actions.ts:352`) while the panel offers 3/4/5/8/10 (NEW:4855) and the org default is CHECK-bound to 3–10 (`M:0034:19–20`).

### c.2 Attributed results table and CSV export
- Rows, status (`svart/paaminnet/ikke_svart` from `reminded_at`), answers — `app.attributed_rows` / `attributed_results` (`M:0034:127–194`), administrator+redaktør only, refuses person surveys.
- Key-question columns and the "brudd"/"policy" filters — NEW derives them by regex on question text (NEW:3536–3540). **GAP**: nothing in the schema designates which questions are the summary columns; `template_packs.questions` jsonb (`M:0003:10`) and `survey_questions.config` (`M:0003:60`) carry no such flag.
- CSV export — **GAP**: no export path; `report_exports` is report-scoped (`M:0006:99–106`); `audit_events.action` is free text with `'report.export'` as the documented example (`M:0007:32`) — no attributed-export action exists.
- Organisation `resultsScope` line — derivable from `surveys.respondent_kind`; no gap.

### c.3 Recurrence: status, pause/stop, custom cadence, inherited cadence
- Cadence vocabulary — `app.cadence` = `once, weekly, biweekly, monthly, quarterly, biannual, annual` (`M:0001:20`). NEW uses `yearly` (365 d), `biennial` (730 d) and `custom` (NEW:2941). **GAP**: no two-year value (`biannual` is six-monthly), no `custom`; the app exposes only five (`lib/send/registry.ts:29`).
- Custom interval (every N × unit, weekday, time) — `schedules.send_at_local time` exists but is **not read** by `app.run_due_schedules`, which sets `next_run_at = now() + interval` by cadence (`M:0027:357–367`); **GAP**: no `every_n`, `unit`, `weekday` columns; `send_at_local` unused.
- Status line "Runde N av M · neste …" — `schedules.runs_done`, `runs_total`, `next_run_at` exist (`M:0004:59–64`); `runs_done` starts at 1 on send (`M:0032:330`). No gap for the text.
- Pause — **GAP**: `schedules.active` is the only flag (`M:0004:65`) and the scheduler sets it false when runs are exhausted (`M:0027:365–366`); a resumable pause has no column.
- Stop — `active = false` expresses it; "Avsluttet etter runde N" is derivable.
- Two schedule rows per survey — the wizard inserts one with `next_run_at NULL` (`undersokelser/actions.ts:181–186`) and `send_round` inserts another when `p_cadence <> 'once'` (`M:0032:326–338`); `schedules` has no uniqueness on `survey_id` (`M:0004:55–68`). The wizard row never matches `next_run_at <= now()` (`M:0027:301–302`).
- Inherited cadence — **GAP**: no cadence on `template_packs` or in `template_packs.policy`; `duty_definitions.default_interval_months` exists (12/12/24/12, `supabase/seed.sql:56–72`) but is a duty property, and NEW's `LEGAL_CADENCE` maps the non-duty pack "Arbeidsmiljø" to monthly (NEW:2942). No lock mechanism for cadence (the policy guard covers anonymity/threshold/kind only, `M:0034:81–83`).
- Visibility — `schedules` select is `app.can_edit_survey` (`M:0030:117`): a `leser` cannot read recurrence state.

### c.4 "Runde for runde"
- Per-round gated averages — `get_trends` (`M:0032:587–635`). `recurStatus` as c.3. No gap.

### c.5 Dashboard customisation
- Layout (ordered panel keys, per-panel width), chosen preset, saved presets — **GAP**: no tables. `dashboard_pins` is `(org, user, panel_key)` with `panel_key` FK → `report_section_types` (`M:0024:16–26`).
- Panel library — `PANEL_LIB` (NEW:2955–2963) has seven keys; four are section types (`trend, heatmap, drivers, themes`, `M:0904-0006:38–49`); **`register`, `duties`, `stream` are not registry rows anywhere**, so they cannot be pinned (FK) — consistent with `pn.canPin` false for them (NEW:3680).
- Presets — `DASH_PRESETS` (NEW:2974–2981) **GAP**: no registry; no org-saved preset table.
- "Frys som rapport" — `reports.sections/filters/base_template` exist (`M:0006:64–67`); `createReport` path exists (`dashboard/actions.ts:75–79`). Sections limited to aggregate panels in NEW (NEW:3647).
- Register panel — `attributed_results` exists; "avvik"/"forfalt" need c.2's designation and `paaminnet` status.
- Duties panel — `duties`, `duty_definitions`, `owner_member_id` exist (`M:0006:3–24`).
- Stream panel — **GAP**: no per-day, per-survey series RPC; `overview_activity` is org-wide participation (`M:0904-0013`, D65); `get_trends` is per round.
- `dashThresholdLine` — RPCs compute `k` over the selection (`M:0032:973, 1043`); NEW's org-wide max (NEW:3533) has no counterpart.

### c.6 Use-case library and packs
- **GAP**: `template_packs.category` CHECK admits only `Ansatte, Kunder, Lovpålagt, Annet` (`M:0003:6`); NEW packs carry `Medlem`, `Intern`, `Offentlig` (NEW:2837, 2842, 2857–2881).
- **GAP**: no use-case registry (key, label, description, tint, preset); `useOf()` is a function of category + regex (NEW:2972–2973).
- Counts ("N maler · M lovpålagt", "K undersøkelser hos dere") are derivable from `template_packs` and `surveys.template_pack_key` (`M:0003:34`).
- CI seed assertion `packs <> 17` (`ci.yml:63`) and `PUBLIC_BY_DESIGN` allowlist (`scripts/verify/policy-coverage.ts:41–52`) are tied to today's registries.

### c.7 Wizard
- Use-case chips: c.6. Cadence: c.3. `WizardInput.cadence` enum (`undersokelser/actions.ts:98`).

### c.8 Navigation "Innsikt", frame, wide toggle
- No schema. `wide` is `localStorage` in NEW (NEW:3117, 4011); `profiles` has no such column (`M:0002:56–65`).

### c.9 Respondent
- Four language chips: `organizations.active_langs` (`M:0002:11`) and `surveys.langs` (`M:0003:33`) exist; Q11 keeps `sv`/`da` inactive. No schema gap; a decision.
- Peer results for organisation surveys: `get_peer_results` gates only on `app.k_for` (`M:0032:1152, 1176`), which is 0 for organisation surveys → returns buckets. **GAP** is in the RPC's rule, not a column.
- `optional` banner with number word: `k_threshold` already in the token payload (`M:0033:44`).

### c.10 Oversikt compliance card
- `duties.next_due_at` (`M:0006:21`), `reminder_weeks` (`M:0904-0005:16–18`), `duty_definitions` — exist. "Krever handling i år" count and 12-month positions are derivable. No gap.

### c.11 Library policy line
- `template_packs.policy` — exists (`M:0032:31`, seeded `supabase/seed.sql:80–85`). No gap.

### c.12 Per-question hidden state
- `aggregate_results` returns `insufficient_data` per question (`M:0032:385–389`). No gap.

### c.13 Results stats below threshold
- NEW hides `n`, svarprosent and snitt with "Vises fra N svar. Nå: færre." (NEW:4886–4889); `results_summary` returns `n`, `invited`, `responded`, `completion` regardless of `k` and nulls only `avg` (`M:0032:471–474, 575–583`). The threshold test file exempts participation-count functions from the k assertion by design (`tests/invariants/threshold-policy.test.ts:297–300`). Whether `n` is a result or a participation count is not settled anywhere in DECISIONS.md; NEW itself still prints "N av T" on the survey row (NEW:4136). **UNKNOWN which rule applies** — settled by a decision (see `04-decisions.md`).

### c.14 Copy
- Every new string is a `ui_messages` row seeded from `messages/*.json` (`docs/DEVIATIONS.md:1062–1089`); see b.13 for what is absent.

---

## d) Verification apparatus facts relevant to the diff (no proposals)

- The reference harness renders **the old bundle**: `scripts/verify/reference.ts:21` = `design-reference/heituva-survey-app-design/project/HeiTuva.dc.html`; VERIFY.md:47–51 names the same path; CLAUDE.md names `/design-reference/` as the source of truth.
- Route/state manifest: 37 routes (`tests/routes.manifest.ts`, `grep -c "route:"`), two pending (`:876–880`). The Send `recurring` state clicks "Hver uke" (`:522–535`); Dashboard states are default / gruppe-under-terskel / siste-runde (`:756–782`); Resultater has no organisation-survey state (`:707–755`).
- Census manifest: 18 files / 392 tests (`tests/expected-counts.json`; sum of the values). Gate 5a3 last recorded 55 of 71 surfaces (`CLAUDE.md:126–127`); the post-Phase-9 catalogue count is **UNKNOWN** in this session (no local Supabase; `npm run verify:policy` not run) — settled by running `npm run verify:policy` on a reset local database.
- Visual baselines pinned: `logg-inn`, `logg-inn-feil`, `veiviser-formal` (desktop+mobile) (`tests/visual/screens.spec.ts-snapshots/`); `veiviser-formal` captures wizard step 0, which NEW changes (a.3 Wizard).
- CI: `static` (tsc, eslint, build) and `invariants` (db reset, seed-count check incl. `packs = 17`, `sections = 10`, invariant suite, db lint) (`.github/workflows/ci.yml:13–75`).
