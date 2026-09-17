# v7 — review of the four claims against the code

**2026-09-17.** Measured against the repository at `f57fef5` (working tree clean) and against the
uploaded bundle. No product code was written, nothing was installed, no migration was applied.

---

## 0. WHAT WAS MEASURED, AND HOW IT IS CITED

Tor asked for every bundle line to be cited by HASH rather than by version name, because there are
two candidates and the names have been imprecise. Both files:

| cited as | file | md5 | lines |
|---|---|---|---|
| **`U:<n>`** | the uploaded bundle (`3cdc19af-HeiTuva.dc_6.html`, copied to `/tmp/claude-0/v7/bundle.html`) | `4d8fde3aea0f56e481bfe2416c811f96` | 10558 |
| **`v6:<n>`** | the INSTALLED bundle, `design-reference-v6/heituva-survey-app-design/project/HeiTuva.dc.html` | `7c25573daee30103642ccf67781b44f4` | 10152 |

Everything below that says «the drawing» means `U`. Where `U` and `v6` differ, both are cited,
because **three of the four claims are true of `U` and false of `v6`**, and one is the reverse.

The scoping rule from the instruction — *«decisions already taken are not gaps»* — is applied
throughout against `DECISIONS.md`, and the decisions it lands on are named by Q number.

**No live defect was found.** Nothing in this review needs acting on before the plan is written.

---

## 0.1 THE CORRECTION THAT CHANGES THE FRAME: `U` IS NOT `v6`, AND THE DIFFERENCE IS THE SUBJECT

Before the four: the uploaded bundle is **an eighth handoff**, not the seventh. That is not a
labelling point. Three of the four claims describe things that arrived in `U` and are absent from
the bundle this project has been building against for the whole v6/F/G tranche — so a plan derived
from «the drawing» and a phase report derived from `v6` are describing two different documents, and
that is exactly the collision this review exists to catch.

Measured, as CLAUDE.md's bundle-diff rule asks — key sets first, then the changed lines:

```
sc-if keys   v6: 298     U: 318
  arrived (23): contentEmpty tabContent q.compact q.qFull q.blockFull q.blockHasBody
                q.blockHasCaption q.blockHasMedia q.blockHasTitle q.blockHasUrl q.blockIsRule
                q.badgeIsIcon q.badgeIsNum
                respondOne.rIsBlock rBlockHasBody rBlockHasCaption rBlockIsImg rBlockIsRule
                rBlockIsVideo
                sSecCh sSecRec sSecSender sSecTime
  departed (3): svTuvaFloat svTuvaOpen svTuvaSide
```

The three departures are the half a key count would have reported and a count of ARRIVALS would
not. They matter, and § 2.1 is about them.

And the changed lines — 91 hunks, 161 lines removed, 567 added — carry two reversals that **no key
moved for at all**, which is CLAUDE.md's own «diffing keys tells you what a handoff added; only
reading the markup tells you what it changed away»:

- the `svdetail` rail went from **eleven** pills to **twelve** (`v6:8629` → `U:8922`);
- the `resultat` sub-rail went from **six** sub-tabs to **four** (`v6:7141` → `U:7397`).

---

## 1. THE FOUR

### a. THE `svdetail` RAIL — the twelve pills, the step rail, and how the nine sub-tabs are reached

**The claim.** «The drawing has twelve pills — over, bygger, sporsmal, metodikk, resultat,
feltarbeid, malgruppe, utsending, kommentarer, tiltak, personvern, historikk. V6-2 decided to keep
/bygg, /send, /resultater as paths with the step rail between them. F5 then built nine SUB-tabs
under sporsmal, kommentarer and tiltak — three of those twelve parents.»

**Verdict: MEASURED-TRUE about `U`, MEASURED-FALSE about `v6`, and the middle sentence is
MEASURED-FALSE outright.**

**The twelve are `U`'s, and `v6` has eleven.** `U:8922` is the array in the claim, exactly. `v6:8629`
is the same array **without `["bygger","Bygger"]`** — eleven pills, and its `.map` is a plain
`const on = (st.sdTab || "over") === k` with no `bygger` special case. So «twelve» is a fact about
the uploaded file only, and the twelfth pill is the newest thing on that rail.

**The «step rail between them» does not exist, and has not since V6-2.** `SurveyContextBar` is
identity-only — back link, title, audience, status pill, the ↻ series chip, «Kjør live» — and its
own header says so: *«IDENTITY ONLY since V6-2 … the three-step rail moved to `AppSubnav`»*
(`app/(app)/undersokelser/[id]/SurveyContextBar.tsx:22-41`). There is no Bygg → Send → Resultater
step control anywhere in the product. What sits between the paths is the SUBNAV's eight-pill tab
rail (`components/AppSubnav.tsx:219-227`), which is the same control the claim's own first sentence
is about. A plan that schedules work «on the step rail» is scheduling work on a component that was
deleted.

**Which of the twelve resolve.** `SURVEY_TABS` (`lib/surveys/tabs.ts:45-54`) is **eight**, and
`TAB_SEGMENT` (`:59-71`) maps them to routes:

| `U` pill | app tab | route | state |
|---|---|---|---|
| `over` Oversikt | — | — | **DECIDED-NOT-BUILT.** `DECISIONS.md:879` — «a tab that gathers figures from three other tabs is a fourth copy of them, and copies drift». Not a gap. |
| `bygger` Bygger | — (no pill) | `/undersokelser/[id]/bygg` **exists** | The ROUTE resolves; the PILL does not. `TAB_ALIAS = { bygg: 'sporsmal' }` (`tabs.ts:103`) lights «Spørsmål» while you are in the builder. See (c). |
| `sporsmal` Spørsmål | `sporsmal` | `/sporsmal` | built |
| `metodikk` Metodikk | — | — | **BUILT, AS A PANEL NOT A TAB.** `MethodPanel` inside the builder's Innstillinger pane (`app/(app)/undersokelser/[id]/bygg/Builder.tsx:512-531`), reading `method_rules` (`M:0120`, `bygg/page.tsx:180`). Advisory only, Q178/Q183. Not a gap; a different placement. |
| `resultat` Resultater | `resultat` | `/resultater` | built |
| `feltarbeid` Feltarbeid | — | — | **DECIDED-NOT-BUILT.** `DECISIONS.md:876-878`. Not a gap. |
| `malgruppe` Målgruppe | `malgruppe` | `/malgruppe` | built (half, on purpose — `tabs.ts:36-43`) |
| `utsending` Utsending | `utsending` | `/send` | built |
| `kommentarer` Kommentarer | `kommentarer` | `/kommentarer` | built |
| `tiltak` Tiltak | `tiltak` | `/tiltak` | built |
| `personvern` Personvern | `personvern` | `/personvern` | built |
| `historikk` Historikk | `historikk` | `/historikk` | built |

**Eight of twelve are pills. Nine of twelve resolve to a screen** (the eight plus `/bygg`).
**Three of twelve are decided or re-placed** (`over`, `feltarbeid`, `metodikk`), none of them a gap.
**Zero of twelve are unbuilt work nobody has decided about.**

Two survey routes exist that the drawing gives no pill and the app deliberately does not light:
`/live` and `/test` (`tabs.ts:105-113` — «no pill is current» and «the first pill is current» are
different claims, and only one of them is true there).

**HOW THE NINE SUB-TABS ARE REACHED — and the answer is NOT the structural gap the claim fears.**

Said plainly, as asked: **they are reached by a visible rail, rendered in the page, on every one of
the three parents.** `SubTabRail` (`components/SubTabRail.tsx`) is a `<Link>` rail over `?vis=`,
mounted at:

- `app/(app)/undersokelser/[id]/sporsmal/page.tsx:254`
- `app/(app)/undersokelser/[id]/kommentarer/page.tsx:142`
- `app/(app)/undersokelser/[id]/tiltak/page.tsx:126`

and each page resolves the parameter through the same registry function the rail marks current with
(`resolveSubTab`, `lib/surveys/subtabs.ts`), so the rail and the content cannot disagree. Links, not
buttons, deliberately — `aria-current` is a fact about the URL (`SubTabRail.tsx:23-30`).

So: **not a parameter without parent navigation.** The specific failure the claim names — «each
sub-tab works in isolation and no gate can see the gap» — does not obtain. It is worth saying which
half of the worry WAS real: the rail is at the **bottom of the card**, under the content it filters
(`sporsmal/page.tsx:254` is the last child of the `<section>`), which is where `U:1243-1252` draws
it, so it is fidelity rather than a defect — but a reader who never scrolls does not meet it.

**And the sub-tab set moved under F5's feet.** `U:7397`'s `resultat` row is
`matrise · sporsmal · sammenlign · frisvar` — **`runder` and `fordeling` are gone**, where
`v6:7141` has all six. The bundle's own 27 sub-tabs are now **25**. Two consequences:

- The drawing has now itself dropped `fordeling`, which F5-3 refused on the grounds that
  distribution and free text are rendered INSIDE «Per spørsmål» rather than beside it
  (`subtabs.ts`, `'resultat/fordeling'`). The refusal and the newer drawing agree.
- `runder` left with no note. The app renders the rounds panel inside the results screen
  (`resultater/ResultsScreen.tsx:389-397`), so nothing is lost — but a plan that still counts 27
  sub-tabs is counting two that `U` no longer draws.

---

### b. THE SUBNAV REGISTRY — how many of the eight exist

**The claim.** «The bundle has eight branches — build, send, results, dashboard/reports, svdetail,
tasks, surveys, admin — each with its own label and pill set. Measure what the app has per screen
against what the bundle draws per screen, and say how many of the eight exist.»

**Verdict: MEASURED-FALSE on the enumeration itself, on both ends.** The list names one branch the
bundle refuses to render and omits one it has.

**`results` has a LABEL and no RAIL.** `U:8874` opens with
`hasSubnav: st.screen === "results" ? false : …` — the FIRST test in the expression, and it is a
refusal. `subnavLabel` (`U:8892`) still carries `st.screen === "results" ? "Resultater"`, and
`subnavItems` (`U:8893-8949`) has **no `results` arm at all**. So `results` is a label for a strip
that never renders: a leftover, the same shape as `repTabs` (defined in v6's script, rendered
nowhere), which F3 read as the bundle stating a re-parent by leaving a dead key behind.

**There is a NINTH arm, and it is dead for the same reason.** `U:8946-8949` is an else-fallback,
`[["dashboard","Dashboard"],["reports","Rapporter"]]`. `hasSubnav`'s final clause (`U:8877`) is true
only for `svdetail · tasks · surveys · admin · dashboard · reports`, every one of which is caught by
an earlier arm — so **nothing reaches the fallback with `hasSubnav` true**. It is unreachable code,
not a branch.

So the honest count of the drawing is **seven arms that render** — `send`, `build`,
`dashboard|reports`, `svdetail`, `surveys`, `admin`, `tasks` — plus one label with no rail and one
rail with no screen.

**What the app has, per screen.** `AppSubnav` (`components/AppSubnav.tsx`) has **five** branches:

| `U` arm | `U` label | `U` pills | app | app location |
|---|---|---|---|---|
| `send` (`U:8893-8899`) | «Del av utsendingen» | Alt · Kanaler · Mottakere · Avsender · Tidspunkt **+ «Undersøkelsen»** | **ABSENT** — `/send` has no subnav and no section filter; the page is one form (`send/SendScreen.tsx`, nine `<section>`s, no rail) | — |
| `build` (`U:8900-8908`) | «Bygger» | Bygg · Metodikk · Innstillinger · Forhåndsvis **+ «Undersøkelsen»** | **ABSENT from the shell**; the builder has its OWN in-page `role="tablist"` with four tabs — Generelt · Legg til · Innstillinger · Vis (`bygg/Builder.tsx:45-51, 317-335`) | in page |
| `results` | «Resultater» | *(none — `hasSubnav` false)* | correctly absent | — |
| `dashboard\|reports` (`U:8909-8920`) | «Innsikt» | Dashbord · Rapporter · Lovpålagt · Maler · **Bygger** | **PRESENT, four of five** | `AppSubnav.tsx:110-127` |
| `svdetail` (`U:8921-8928`) | «Undersøkelse» | the twelve | **PRESENT, eight of twelve** | `AppSubnav.tsx:219-227` |
| `surveys` (`U:8929-8935`) | «Undersøkelser» | Alle · Aktive · Utkast · Lukket **+ «Bygger»** | **PRESENT, four of five** | `AppSubnav.tsx:137-155` |
| `admin` (`U:8936-8940`) | «Administrasjon» | Firma · Brukere · Grupper · Integrasjoner · Personvern · Alternativer | **ABSENT from the shell by decision** — the app renders **nine** tabs in the page instead (`administrasjon/layout.tsx:58-79`) | in page, D164 |
| `tasks` (`U:8941-8945`) | «Arbeidsliste» | Alt · Oppgaver · Tilbakemeldinger | **PRESENT, three of three** | `AppSubnav.tsx:164-183` |
| *(fallback, `U:8946-8949`)* | — | unreachable | — | — |

Plus one the drawing gives no subnav at all: **`bibliotek`**, in the shell strip by Tor's decision
Q172 (`AppSubnav.tsx:185-200`).

**So: four of the seven renderable arms exist** (`dashboard|reports`, `svdetail`, `surveys`,
`tasks`), **two are absent with the navigation living in the page instead** (`build`, `admin`),
**one is absent outright** (`send`), and the app has **one arm the drawing does not** (`bibliotek`).

`admin` is not a gap: `AppSubnav.tsx:31-40` records why, and it is a measurement rather than a
preference — the bundle's six-item list is missing Profil og avsender, Målgrupper and Språk, so
adopting it would mean two controls doing one job with one of them three tabs out of date. **That
reasoning survives `U` unchanged**: `U:8936-8940` is still six items, and the app still has nine.
The condition the decision sets is «a shell rail may absorb an in-page one only when its list is
COMPLETE», and six of nine is not.

`build` and `send` ARE genuinely absent, and neither has a decision behind it — see § 2.2, because
in `U` both are a great deal more than a pill set.

---

### c. THE TWO KINDS OF PILL

**The claim.** «Four rails end in a JUMP rather than a filter — «Undersøkelsen» on send and build,
«Bygger» on surveys and svdetail — styled weight 700, never pilled, full opacity regardless of
state. Does the app's rail component distinguish the two kinds, or does it treat every pill as a
filter? A jump rendered as a filter is a pill that never lights.»

**Verdict on the styling half: MEASURED-TRUE for three of the four, MEASURED-FALSE for the fourth,
and the claim is missing a fifth jump.**

| jump | line | `pill` | `weight` | `textOpacity` | matches the claim |
|---|---|---|---|---|---|
| «Undersøkelsen» on `send` | `U:8898` | `transparent` | `"700"` | `"1"` | **yes** |
| «Undersøkelsen» on `build` | `U:8907` | `transparent` | `"700"` | `"1"` | **yes** |
| «Bygger» on `surveys` | `U:8934` | `transparent` | `"700"` | `"1"` | **yes** |
| «Bygger» on `svdetail` | `U:8922-8928` | `transparent` | **`"500"`** | **`".7"`** | **no** |
| «Bygger» on `dashboard\|reports` | `U:8912-8918` | **lights** when `st.repEditing` | `700` when lit | `1` when lit | not in the claim |

The fourth is the interesting one and it is worth the sentence. `svdetail`'s «Bygger» is not
appended with `.concat` like the other three; it is a member of the twelve-pill array, and the array's
own guard is `const on = (st.sdTab || "over") === k && k !== "bygger"` (`U:8923`) — an explicit
clause that forces it never to light. So it jumps like the others and is **styled as an inactive
filter**, which is precisely the «pill that never lights» the claim warns about, drawn that way on
purpose by the bundle itself. The two kinds are therefore not two; they are **three** — a filter, a
jump styled as an emphasis, and a jump styled as a dormant filter.

The fifth, on `dashboard|reports`, inverts the property: it jumps (into the report editor,
`repEditing:true`) and it **is** `cur`-able, lighting whenever the editor is open. So «four rails end
in a jump, and a jump never lights» is an enumeration of the three that behave alike, read as a
property of jumps.

**Verdict on the app half: the component does NOT distinguish them — and it has nothing to
distinguish, because no jump pill is built.**

`AppSubnav`'s item type is `type Item = { label: string; href: string }` (`AppSubnav.tsx:61`), and
every item renders through one `<Link>` whose entire state is `const on = currentHref === it.href`
(`:250-261`), applying exactly the drawing's three filter properties:

```tsx
background: on ? 'var(--sf)' : 'transparent',
fontWeight:  on ? 700 : 500,
opacity:     on ? 1 : 0.7,
```

There is no second kind. Measured against the five branches: **none of the app's rails contains a
jump.** `/undersokelser` has the four status filters and no «Bygger» (`:149-152`); `dashboard`/
`rapporter` has four of the drawing's five and the fifth — «Bygger» — is **refused in writing**, with
the reason at `AppSubnav.tsx:76-81`: the editor is `?rapport=<id>` of a report that exists, so a
«Bygger» pill would be a deep link that does not resolve (V6-5's standing rule, and Q178's
tranche-wide constraint at `DECISIONS.md:869-872`), and «＋ Ny rapport» is already the affordance.

So the claim's consequence is **correct as a prediction and false as a description**: if a jump were
added today with an `href`, `currentHref === it.href` would be false on the screen it is drawn on,
and it would render at weight 500 / opacity 0.7 — the OPPOSITE of the drawing's three matching
jumps, and coincidentally identical to the fourth. Nothing in the component would catch it, and no
gate would either: a pill at the wrong weight is not an overflow, not a missing message, not a
status code.

**What that makes the real question**, and it is a design question rather than a measurement:
`AppSubnav`'s items are `<Link>`s because every rail it has is navigation between URLs. A jump is
also navigation between URLs. The difference the drawing encodes is not behavioural at all — it is
purely a STYLE flag saying «this one is an exit, not a member of the set». So the smallest honest
shape is a third field on `Item` (`kind: 'filter' | 'exit'`), not a second component.

---

### d. SITAT, BILDE, VIDEO — against the code

**The claim.** «I decided Sitat is editor-written text only, and that Bilde is an upload while Video
is a URL. If either is already half-present in the product — an upload path, a quote source,
anything — say so. I decided both from the drawing alone.»

**First, what these are.** `U:6858-6867` is `blockDefs()`, **seven CONTENT BLOCK types** — not
question types:

```
section  Seksjon      Starter en ny del med egen tittel og innledning
info     Tekst        Forklaring, bakgrunn eller læringsstoff før spørsmålene
img      Bilde        Illustrasjon, skjermbilde eller figur med bildetekst
video    Video        Lenke til film eller opplæringsvideo
quote    Sitat        Utsagn fra forrige runde, med kilde
fact     Faktaboks    Kort huskeliste eller presisering som skal stikke seg ut
rule     Skillelinje  Luft mellom to deler, uten tekst
```

They are absent from `v6` entirely. This is the single largest thing `U` adds. § 2.2 treats it as a
feature; here only the three the claim names.

**Verdict: BOTH decisions are sound, and BOTH are already half-present — in opposite ways. The
Sitat one is not merely a preference; it is a security decision, and the drawing proposes the unsafe
reading by name.**

**Sitat — a quote source exists, and it is `get_quotes`.**

`U:6875`'s seed for the block is:

```
quote: { title:"Fra forrige runde",
         body:"Prioriteringene endres midt i uken, og da rekker vi ikke det vi har lovet.",
         caption:"Anonymt svar, mars" }
```

and its own description at `U:6864` is **«Utsagn fra forrige runde, med kilde»**. That is not
editor-written text with a decorative attribution. It is a respondent's free text from a previous
round, with a source line, **rendered to a respondent inside a survey** (`U:5399-5430` renders
blocks in the respondent flow).

The product has exactly that datum and exactly that path: `get_quotes`, a SECURITY DEFINER RPC
called from `lib/results/read.ts:56`, which returns respondent free text and is the thing
k-anonymity is built around — it refuses below the threshold and strips group labels
(`app/s/[token]/QuestionComment.tsx:13`, `lib/respondent/anonymity-sheet.ts:47`), and a `leser`
sending `p_group` to it is refused (`lib/dashboard/layout.ts:137`). So «wire Sitat to the previous
round's quotes» is not a feature that would need building — it is **one call away**, from a module
that is already imported on the results path.

Against invariant 1 and invariant 3's corollary, that call would be wrong three times over, and it
is worth writing down because the drawing makes it look obvious:

- `get_quotes`' k gate protects a MANAGER's view of answers. A respondent-facing page has no role,
  no `auth.uid()` and no threshold context; there is no version of the RPC that answers safely there.
- The corollary V4-0 made standing — *no per-organisation value may reach a respondent-facing
  surface unless a decision says so by name* — is about a WORD leaking an organisation. This would
  leak a SENTENCE another employee wrote.
- «Anonymt svar, mars» is a source line on a surface that promised no linkage at all. A quote plus a
  month plus a round is a set of three facts about one person.

**So the decision is right, and the reason to write it down as a security decision rather than an
editorial one is that the drawing's label, seed and placement all point the other way.** Recommend
the refusal be stated ON the block («Sitat er tekst du skriver selv — vi henter ikke sitater fra
svarene»), which is the habit `SubTabRefusals` already institutionalises; a block that is simply
text reads as one somebody did not finish wiring up.

**Bilde — an upload path exists, and a placeholder for it is already shipped to respondents.**

Two independent halves:

1. **A working Storage upload + signed-URL path exists**, with validation, in the org-logo flow:
   `.upload(path, file, { upsert:true, contentType })` at
   `app/(app)/administrasjon/actions.ts:836` and `.createSignedUrl(path, 3600)` at `:857`, read back
   at `administrasjon/profil/page.tsx:39`. Bucket `org-logos`. Two more `.upload()` call sites exist
   for generated artefacts (`rapporter/[id]/pdf/route.ts:98`, `.../pptx/route.ts:90`). So «Bilde is
   an upload» does not start from nothing — the pattern, the bucket convention and the signed-URL
   read are all in the product.
2. **A shipped question type is already waiting on exactly this.** `image` («Bildevalg») is one of
   the thirteen seeded question types (`lib/questions/registry.ts:121-127`, `imageOptions: true`),
   and the respondent renderer says in its own comment:

   > `app/s/[token]/QuestionInput.tsx:296` — *«The image URLs a Builder upload will write are not in
   > the schema yet, so the card renders its label on the design's tinted panel rather than a fake
   > photo. docs/DEVIATIONS.md D39.»*

   It renders a 120px tinted band where the picture goes. **That is the never-fabricate rule holding
   a place open for the upload path this decision would build** — and it means «images in surveys»
   already has one consumer in production that is not the Bilde block.

   The plan should treat these as ONE piece of work or say why not. Building a Bilde block with its
   own upload while `image`'s options keep rendering tinted bands would be two image paths, one of
   them still a placeholder.

**Video — a URL. Nothing half-present, and the decision has a second half nobody has taken.** The
seed is `video: { title:"Kort innføring", url:"https://", caption:"2 minutter…" }` (`U:6874`) and
`U:5406-5419` renders it in the respondent flow. There is no video path anywhere in the product.
The open half: a `<iframe>` or `<video>` on `/s/[token]` pointed at a URL an editor typed is a
third-party request made from the respondent's browser — a surface that has been kept free of
anything that could observe the respondent. That is a stop-and-ask, not a detail.

---

## 2. THE OMISSIONS — what `U` draws, or the product has, that the four do not touch

The four claims are all about ONE thing: **navigation chrome on the survey and insight screens.**
Three are literally rails; the fourth is three of seven block types. Asked what the list stands for
and what else belongs to it, the answer is that **`U`'s actual subject is the BUILDER and the SEND
screen, and the four touch the edge of each.** Derived from the key diff and the 91 changed hunks,
not from the claims:

### 2.1 `svTuva` IS GONE FROM THE DRAWING — and that settles G5 and G6 from the other side

`svTuva`'s markup — both placements, the floating bubble at `v6:2414-2437` and the docked side
column at `v6:2439-2455` — **is absent from `U` entirely.** All ten remaining `svTuva*` occurrences
are at `U:9312-9335`, inside the script (which opens at `U:6096`): **zero in the markup.** The panel
is computed and rendered nowhere.

And in its place, two changes that are unmistakably deliberate:

| | `v6` | `U` |
|---|---|---|
| `tvShow`'s exclusion list | `["surveys","respond","splash","login"]` (`v6:8965`) | `["respond","splash","login"]` (`U:9263`) — **`surveys` removed** |
| `tuvaFor`'s keys | 10, no `surveys` (`v6:7062ff`) | **11, with a `surveys` entry** (`U:7103-7108`) |

So the newer drawing gives `/undersokelser` the GLOBAL helper, with its own answer set, and has
deleted the screen's bespoke panel. **That is G5 and G6, drawn** — Tor's overrule of V6-5's
four-screen exclusion and of my `TUVA_SUPPRESSED`, and G6's «one bubble carrying svTuva's content»,
arrived at independently by the designer. Q219–Q229 are confirmed rather than disturbed.

Two riders:

- This is also the clean instance of CLAUDE.md's «a right conclusion can rest on reasoning that is
  not true». G6's argument for one bubble was measured against `v6`, where two buttons existed and
  had six differences including two accessible names. That argument was sound and `U` did not exist
  when it was made. What establishes the conclusion NOW is `U`'s own two edits, not that argument.
- **`U`'s `surveys` answer set contains a deep link to a screen this project decided against.** Its
  third tip is `["Se hvem som mangler","Feltarbeid per undersøkelse", go({ screen:"svdetail",
  sdTab:"feltarbeid" })]` (`U:7108`). Q178's standing constraint — *«a deep link must resolve or it
  is not drawn»*, `DECISIONS.md:869-872` — refuses it, and the app's own guard would too: F5's
  registry test requires every Tuva destination to be a route that exists. The plan must name the
  substitute for that third tip rather than leaving the phase to notice.

### 2.2 THE CONTENT BLOCKS ARE A FEATURE, NOT THREE BLOCK TYPES — and they reach the respondent

Claim (d) treats Sitat, Bilde and Video as three decisions. Measured, they are three of seven
members of a new model that touches the builder, the schema, the respondent flow and the previews:

- **The builder gains a whole second object in the question list.** Blocks live IN `sv.questions`
  with `block:true` (`U:6869-6881`), and **every consumer filters them out** — `U:7174`
  (`sdBuild`), `U:9732`/`U:9735` (length estimate and «too long»), `U:10002` (preview),
  `U:10075` (logic rules), `U:7751`/`U:7822` (comment box, choice tiles). That is fifteen-odd call
  sites that each had to learn the distinction.
- **A new builder pane.** `tabContent` = `buildTab === "content"` (`U:10206`), markup at
  `U:800-817` with its own empty state `contentEmpty` (`U:10237`).
- **New row chrome.** `q.compact`, `q.qFull`, `q.blockFull`, `q.badgeIsNum`, `q.badgeIsIcon`
  (`U:10083-10091`) — a compact/full flow view with a numeric badge for questions and an icon badge
  for blocks.
- **The respondent flow renders them** (`U:5399-5430`, `respondOne.rIsBlock` and five siblings), and
  two behavioural consequences that are easy to miss: blocks **count as steps** in the progress
  label, which becomes «Les · steg N av M» (`U:10442`), and the free-text comment box is
  **suppressed** on a block step (`U:8102`).
- **The schema has no room for this as drawn.** `survey_questions.type` is
  `app.question_type`, an enum of exactly thirteen question types
  (`supabase/migrations/20260902000001_foundation.sql:10-11`); the table has `required`,
  `comment_mode`, `follow_up_on_low` and `unique (survey_id, position) deferrable`
  (`.../20260902000003_surveys.sql:50-65`). Seven block types are not question types, and the
  shared `position` ordering is what decides whether this is seven new enum values or a second
  table — the one thing the plan must settle before anything is built, because the answer also
  decides what `get_survey_for_token` returns to the respondent.

### 2.3 THE SEND RAIL IS A SECTION FILTER, NOT A PILL SET

Claim (b) counts the `send` arm as one of eight branches. What it actually does: its five pills
drive four `sc-if` gates over the Send screen's sections — `sSecCh` (channels), `sSecRec`
(recipients), `sSecSender`, `sSecTime` (`U:10386-10389`), applied at `U:4945`, `U:4961`, `U:5046`,
`U:5096`, `U:5109`, `U:5129`, `U:5139`. So adopting it is not «add a rail»; it is **sectioning the
Send screen**, on a page the app renders as one continuous form (`send/SendScreen.tsx`).

`U` also **removes** the Send screen's 28px page header (`v6:4840-4844`, «Send» + `channelSummary`)
and the yellow «Klar til å sendes» summary card (`v6:5148-5156`). Neither is in claim (b).

### 2.4 THE BUILDER'S OWN RAIL BECAME TWO LEVELS, AND EVERY LABEL CHANGED

`v6:9847-9852` is a flat five: `Generelt · Legg til · Metodikk · Innstillinger · Vis`. `U:10192-10202`
is a context-dependent rail that shows only the CURRENT GROUP's siblings, with new labels:

| subnav group (`U:8901-8906`) | in-page pills (`U:10195-10198`) |
|---|---|
| Bygg | «Spørsmål» · «Innhold» |
| Metodikk | «Merknader · N» *or* «Ingen merknader» |
| Innstillinger | «Kjøremodus» · «Personvern og frekvens» |
| Forhåndsvis | «Slik ser den ut» |

The app has v6's flat shape, four tabs, and never had `lint` as a tab at all
(`bygg/Builder.tsx:45-51`; Metodikk is a panel, Q178). So the builder's navigation is a **two-level
restructure with a full relabel**, and claim (b) touches only the outer level.

### 2.5 THE PAGE HEADERS ON BYGG / SEND / RESULTATER BECAME BREADCRUMBS — and that collides with a shipped guard

`U` replaces the 28px Playfair page header on all three survey work screens with a breadcrumb,
identically shaped each time — «Undersøkelser → {title} → Bygger / Send / Resultater»:

| screen | `v6` removed | `U` added |
|---|---|---|
| build | `v6:509-518` | `U:509-511` |
| send | `v6:4840-4844` | `U:4909-4910` |
| results | `v6:5580-5585` | `U:5717-5719` |

**This is the one omission that reverses a measured decision rather than extending one.** F3 built
the breadcrumb as a registry and measured, line by line, that `v6` draws it on **five** screens and
that the survey detail's control is a back BUTTON rather than a breadcrumb — with the reasoning at
`lib/shell/crumbs.ts:16-26`, and a guard that asserts it in both directions:

> `tests/unit/crumbs.test.ts:24-32` — *«And nowhere else. The survey detail is the sharp one … a
> prefix match would put the list's crumb on all eight survey tabs»* — the negative list explicitly
> names `/undersokelser/abc-123/bygg` and `/undersokelser/abc-123/send`.

So implementing `U` here **fails a shipped test on purpose**. That is the test doing its job: the
plan must say the property changed and what it changed TO, rather than a phase discovering it as a
red gate and widening the list. Note also that `U` keeps the survey detail's back button, so the
breadcrumb is an ADDITION to the survey work screens, not a replacement of the back control — which
is two navigation controls on one screen, the condition `AppSubnav.tsx:31-40` is written about.

`U` also rebuilds the Results screen's header as a card carrying «Resultater», the scope and
threshold line merged onto one line, and the «Bytt undersøkelse» select moved INTO it with an
`aria-label` instead of a visible `<label>` (`v6:5587-5596` → `U:5721-5730`).

### 2.6 ONE THING THE PRODUCT HAS THAT NEITHER THE CLAIMS NOR `U` ACCOUNT FOR

`/undersokelser/[id]` is a redirect to `/bygg` — straight into the EDITOR
(`app/(app)/undersokelser/[id]/page.tsx:12-15`). Its doc comment still describes the pre-V6-2 world
(«the design's survey context is a step rail over Bygg / Send / Resultater … and Bygg is the first
step»), and F5-2 has since moved «Spørsmål» to the read view with the builder one click further on
(`lib/surveys/tabs.ts:60-63`). So the survey's own index lands somewhere the tab registry no longer
treats as the survey's front door. Not a defect — the route resolves and the rail lights «Spørsmål»
through `TAB_ALIAS` — but with `U` adding an `over` pill and a breadcrumb whose leaf names the
screen, the plan should decide what `/undersokelser/[id]` means rather than inherit it.

---

## 3. ON THE SEQUENCE

Section 4 of the instruction asked whether the plan's proposed order survives what was measured.
There is no plan document, so there is no order to judge. What the measurements constrain, stated as
constraints rather than as an order, so the plan can carry them:

1. **The block model's storage shape decides three other phases.** Enum-vs-table and the shared
   `position` ordering determine what the builder writes, what `get_survey_for_token` returns, and
   whether the respondent's step count changes. Nothing about blocks can close before it.
2. **`build` and `send` are restructures, not rails.** Any phase scoped as «add the subnav branch»
   for either will not close: `send`'s rail is a section filter over a page that has no sections,
   and `build`'s is the outer half of a two-level rail whose inner half is relabelled throughout.
3. **The breadcrumb change is a property change with a guard on it** (§ 2.5). It needs a decision
   before a phase, not a red test during one.
4. **Sitat's refusal should land before the block feature, not inside it.** The unsafe wiring is one
   import away from a module the results path already uses, and the drawing's own label invites it.
5. **`U`'s `surveys` Tuva answer set has a dead destination** (§ 2.1) and must be edited before it
   is built, per Q178's standing constraint.

---

## 4. UNVERIFIABLE

Two, with the reason, as the instruction asks rather than inferring:

- **Whether `U` supersedes `v6` as the governing bundle, or is a parallel exploration.** It has not
  been installed (this review installed nothing), CLAUDE.md's seven-bundle table and
  `docs/v2/00-diff.md § 0.3` still govern per surface, and nothing in the file says. Every «the
  drawing does X» above is a statement about `4d8fde3a…` and about nothing else.
- **Whether `U` references images that were never handed over.** The respondent block markup uses
  `<image-slot>` (`U:5403`) and the Tuva panels use `tuva/faces/f07.png`, and no asset directory
  accompanied the upload — the same pair noted at G6. Not measurable from the HTML alone.
