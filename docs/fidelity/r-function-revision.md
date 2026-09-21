# R — full function/content revision of v8, all 16 screens

**What this is.** Every geometry pass (T2, T3, T6, N6, N8.2) compared elements we HAVE against v8.
None of them spoke about the elements we LACK; N8.2 counted 19 such and moved on. This is that
other half: FUNCTION and CONTENT, not geometry.

**No building was done in this pass. The report is the deliverable.**

## R0.0 — orientation, because two premises were wrong

| claim | measured |
|---|---|
| the upload is v8 | **yes** — md5 `b4e430eccd9cfac0105b8089b6ef206f`, 11050 lines, byte-identical to `design-reference-v8/heituva-survey-app-design/project/HeiTuva.dc.html` |
| `elements.json` (3423 elements) exists | **it existed and was not committed.** The `git log --diff-filter=A` was true and the wrong question. Tor supplied it: `docs/fidelity/elements.json`, 3423 elements, `build` = 407, all six drag lines present. |
| `docs/fidelity/handoff-inventory.md` covers v8 | **YES. R0 SAID NO AND WAS WRONG — see R0.0-K.** |
| `bundle-geometry-per-element.json` is an inventory | **no** — it is the v7→v8 *diff*, 112 changed elements over 17 gates. Which is the instruction's own point. |

So this pass derives its inventory from the bundle. **Commands, so the next reader re-derives rather than trusts:**

```
md5sum design-reference-v8/heituva-survey-app-design/project/HeiTuva.dc.html
sed -n '26,6181p' <v8> | md5sum
grep -n 'sc-if value="{{ is[A-Za-z]*' <v8>        # the screen gates
```

## R0.0-K — the correction, because R0 rested on a serialisation artefact

**R0 concluded that `handoff-inventory.md` describes a different bundle. It does not. It describes
v8's markup, and the whole mismatch was a trailing newline.**

```
markup region, lines 26..6181 of v8
  sed -n '26,6181p' | md5sum                aa5557057e7f669554ac2b8819c1d43e   <- sed APPENDS a newline
  sed -n '26,6181p' | head -c -1 | md5sum   6efa903fcc59904c7e715ef1af04cbf9   <- what the inventory states
```

Same bytes, two serialisations. The loose file (`c0e3fbdc`, 11049 lines) and v8 (`b4e430ec`, 11050)
differ in **three hunks, all in the LOGIC region** (7943, 9399, 10389). The markup region is
byte-identical, which is exactly why an inventory OF THE MARKUP is valid for both.

**Why this is written down rather than quietly fixed.** This project's 0c check landed on this
correctly once already. R0 met the same trap FROM THE OTHER SIDE — not «two hashes agree, so the
files agree», but «two hashes differ, so the files differ» — and reached a confident wrong
conclusion about a committed document, then acted on it by re-deriving an inventory that already
existed. **A hash is a fact about a BYTE STREAM, and `sed`, `head`, `cat` and an editor do not all
produce the same stream from the same lines.** State how a digest was serialised beside the digest;
`handoff-inventory.md` now does.

**`screens.json` did not arrive.** Named as attached, absent from the uploads directory and from
both `files_*.zip` (each holds the same four `.md`). Only `elements.json` came through.


## R0.1 — screen regions and element census

Gates are the bundle's own `sc-if value="{{ isX }}"`; a screen runs to the next gate.

| screen | lines | span | sub-gates | sc-for | button | input | select | textarea |
|---|---|---|---|---|---|---|---|---|
| dash | 283–519 | 237 | 12 | 22 | 11 | 0 | 0 | 0 |
| build | 520–1283 | 764 | 57 | 70 | 59 | 19 | 4 | 1 |
| svdetail | 1284–2249 | 966 | 43 | 88 | 21 | 0 | 0 | 0 |
| surveys | 2250–2388 | 139 | 7 | 6 | 13 | 1 | 1 | 0 |
| dashboard | 2389–2873 | 485 | 41 | 60 | 37 | 2 | 5 | 0 |
| reports | 2874–3347 | 474 | 25 | 50 | 34 | 3 | 6 | 0 |
| profile | 3348–3428 | 81 | 2 | 8 | 5 | 1 | 0 | 0 |
| livestage | 3429–3545 | 117 | 3 | 14 | 2 | 0 | 0 | 0 |
| help | 3546–3751 | 206 | 8 | 20 | 9 | 2 | 0 | 1 |
| tasks | 3752–3995 | 244 | 15 | 28 | 18 | 4 | 5 | 1 |
| admin | 3996–4687 | 692 | 17 | 74 | 22 | 6 | 5 | 1 |
| packdetail | 4688–4765 | 78 | 3 | 6 | 3 | 0 | 0 | 0 |
| library | 4766–4998 | 233 | 18 | 26 | 22 | 2 | 0 | 0 |
| send | 4999–5366 | 368 | 26 | 24 | 25 | 4 | 7 | 1 |
| respond | 5367–5804 | 438 | 53 | 34 | 34 | 3 | 2 | 6 |
| results | 5805–6170 | 366 | 19 | 46 | 20 | 1 | 1 | 0 |

## R0.2 — content absence, per screen

Every static string v8 draws (`>text<`), matched against `messages/no.json`.

**THE LIMIT OF THIS AXIS, STATED RATHER THAN LEFT TO THE READER.** It sees static text only, never
a `{{ }}` binding, so it is a strong signal and not a verdict. `profile 0` and `tasks 0` mean «no
absent static copy», NOT «complete». Calibrated against eight hand-checked strings: six were
genuinely absent from both `messages/` and the code, one (`＋ Ny rapport`) was a false alarm from a
decorative glyph, one (`Lukk valgte`) is a REFUSAL with a test asserting it
(`tests/unit/worklist-view.test.ts:47`).

| screen | strings | flagged | glyph artefact | refused | **REAL** |
|---|---|---|---|---|---|
| dash | 27 | 5 | 0 | 0 | **5** |
| build | 63 | 10 | 0 | 0 | **10** |
| svdetail | 90 | 32 | 0 | 0 | **32** |
| surveys | 21 | 6 | 0 | 0 | **6** |
| dashboard | 43 | 12 | 0 | 0 | **12** |
| reports | 46 | 3 | 1 | 0 | **2** |
| profile | 8 | 0 | 0 | 0 | **0** |
| livestage | 9 | 2 | 0 | 0 | **2** |
| help | 18 | 6 | 0 | 0 | **6** |
| tasks | 22 | 2 | 1 | 1 | **0** |
| admin | 79 | 21 | 1 | 0 | **20** |
| packdetail | 7 | 2 | 0 | 0 | **2** |
| library | 15 | 2 | 1 | 0 | **1** |
| send | 56 | 21 | 0 | 0 | **21** |
| respond | 19 | 2 | 0 | 0 | **2** |
| results | 26 | 4 | 0 | 0 | **4** |
| **TOTAL** | **549** | 130 | 4 | 1 | **125** |

### The list, with v8 line numbers

**dash** — 5 absent

- `323` NPS i dag
- `339` Kritikere uten svar
- `340` Svar innen 24 timer
- `349` Svar kunden
- `361` Fire alternativer med farge og ikon, nedtelling og resultattavle på storskjerm. Deltakerne bruker mobilen, uten app.

**build** — 10 absent *(status after T5–T8, 2026-09-21: 4 built, 3 refused, 3 open)*

- `534` Lagre og lukk — **BUILT** (T7, `builder.saveClose`)
- `541` Se metodikk — **REFUSED, raised to Tor.** v8's condition is
  `!lint.canPublish`, which counts rows of severity «Blokkert»; `M:0120:51` is
  `check (severity in ('advarsel','forslag'))`, so the banner can never appear.
  See D266 for the three repairs and which of them is not mine.
- `581` Skjul ▴ — **BUILT** (T7, v8:10910-10912)
- `597` Rediger ▾ — **BUILT** (T7, the closed summary)
- `883` Live-innstillinger — **BUILT, with none of v8's ten toggles.** No
  per-survey live storage exists, so all ten would be controls that save
  nothing. `lib/surveys/live-features.ts` + D267.
- `901` Quiz-innstillinger — BUILT already (`QuizPanel`, V2-10)
- `918` Bestått-grense — refused, Q84 (Tor's narrowing)
- `922` Antall forsøk — refused, Q84 (Tor's narrowing)
- `1095` forventet svar — refused, D232 (the estimator was deleted, not hidden)
- `1203` Spørsmålene følger reglene for skala, lengde og rekkefølge — open

**svdetail** — 32 absent

- `1393` Spørsmålsområder med eier og godkjenner
- `1397` Spørsmålsområde
- `1453` Fremdrift per målgruppe
- `1494` Lag tiltak av funnene
- `1551` Hvert spørsmål får maks tre merknader. Blokkeringer stopper utsending, advarsler kan overstyres med begrunnelse.
- `1567` Anslått lengde
- `1576` Spørsmålene følger reglene for skalabruk, lengde og rekkefølge.
- `1608` Svarkurve mot bølgene
- `1609` Bare de som ikke har svart får påminnelse
- `1631` Representativitet
- `1646` Avvik mot rammen i prosentpoeng
- `1654` Hvor vi mister folk
- `1655` Frafall per spørsmål, mens undersøkelsen står åpen
- `1668` Hvor lang tid de brukte
- `1788` Spørsmål for spørsmål
- `1823` Hver runde er sitt eget datasett. Runder under terskelen vises uten antall.
- `1848` Det folk skriver
- `1892` Gruppe eller segment
- `1932` Første spørsmål ligger i e-posten
- `1965` Derfor ligger spørsmålet i e-posten
- `1970` Spørsmål 1 kan ligge i e-posten
- `1971` Ett valg, høyst fem alternativer, ikke sensitivt. Svaret lagres på klikket, og respondenten lander på spørsmål 2.
- `1977` Åpne utsending
- `1987` Fire bølger, påslått fra start
- `1988` Dag 0 → +3 → +7 → +12. Hver bølge går bare til dem som ikke har svart.
- `2010` Om e-posten faktisk kommer fram
- `2028` Gjentakende utsending
- `2034` Avslutt gjentakelsen
- `2049` Kjørte runder
- `2161` Tiltak fra funnene
- `2193` Velges én gang. Konsekvensen står i klartekst, ikke i en innstilling.
- `2214` Personvern og hjemmel

**surveys** — 6 absent

- `2259` Alle undersøkelser dere har laget — aktive, utkast og lukkede. Åpne én for å se detaljene, eller bygg en ny.
- `2294` Lavest svarprosent
- `2364` Lag kopi
- `2366` Lukk undersøkelsen
- `2378` Ingen undersøkelser passer filteret
- `2379` Nullstill søket eller velg et annet statusfilter.

**dashboard** — 12 absent

- `2413` Gi nytt navn
- `2425` TB
- `2429` Gjelder alle paneler
- `2484` Produktteamet
- `2537` Start på nytt fra oppsettvalget
- `2570` Bruk oppsett
- `2628` Velg nøkkeltall
- `2668` Legg til panel
- `2673` Velg panelet som skal inn i den tomme plassen — det settes inn der du klikket.
- `2688` Velg panel til denne plassen
- `2692` Alle tilgjengelige paneler ligger allerede på flaten.
- `2753` Datakilde

**reports** — 2 absent

- `3163` Produktteamet
- `3306` Grupper under virksomhetens terskel vises aldri nedbrutt, uavhengig av filter.

**profile** — 0 absent

_none_

**livestage** — 2 absent

- `3489` Deltakerne fordelte 100 poeng
- `3517` Vises til slutt — dette lukker sløyfa i sanntid

**help** — 6 absent

- `3551` Artikler, forum og direkte kontakt med oss
- `3623` Fikk du ikke svar? Spør i forumet, eller kontakt oss.
- `3690` Spør de andre som holder på med det samme
- `3691` HR-folk, verneombud og innkjøpere deler maler, formuleringer og erfaringer. Skriv med fullt navn eller anonymt.
- `3693` Nytt innlegg
- `3715` Vi svarer på norsk innen én arbeidsdag. Skriv gjerne hvilken undersøkelse det gjelder.

**tasks** — 0 absent

_none_

**admin** — 20 absent

- `4004` Inviter bruker
- `4067` Grupper under 5 personer får aldri egne resultater
- `4154` Låst per mal
- `4170` Kan endres per undersøkelse og per språk
- `4256` Innleide og vikarer
- `4278` Importer til en målgruppe
- `4279` Importen lander i biblioteket, ikke i én utsending.
- `4292` Importer til
- `4308` Feltmapping
- `4357` Synkroniser nå
- `4453` Sist synkronisert
- `4475` Tillatelser
- `4482` Kun lesing. HeiTuva skriver aldri tilbake til katalogen.
- `4512` Synklogg
- `4557` Les undersøkelser, svar på aggregert nivå og oppgaver. Nøkkelen gir aldri tilgang til enkeltsvar.
- `4560` Lag ny nøkkel
- `4562` Sist rotert 12. mars 2026 · logges i personvernsporet
- `4567` Send hendelser til deres eget system. Ingen svartekst sendes med.
- `4601` Standard undersøkelse
- `4607` Sensitive temaer

**packdetail** — 2 absent

- `4694` Bruk malen
- `4733` Lesevisning · ingenting opprettes før du trykker «Bruk malen»

**library** — 1 absent

- `4771` ← Tilbake til undersøkelsen

**send** — 21 absent

- `5028` Velg målgrupper fra én populasjon
- `5065` Engangsliste for denne utsendingen
- `5076` Prøv eksempelfil
- `5081` Skal listen brukes flere ganger? Lagre den som målgruppe med eier og populasjon.
- `5082` Lagre som målgruppe
- `5086` Åpne Målgrupper
- `5104` Velg fra målgruppene
- `5105` Rediger målgrupper
- `5138` Avsender og utseende
- `5161` Aksentfarge
- `5180` Svar nå
- `5210` Last ned PNG
- `5211` Plakat A4
- `5279` 4 runder
- `5280` 8 runder
- `5281` 12 runder
- `5282` 26 runder
- `5326` Mandag 09:00
- `5327` Fredag 15:00
- `5333` Etter 2 dager
- `5334` Etter 5 dager

**respond** — 2 absent

- `5475` Gå videre
- `5756` Fra forrige runde. Dette er grunnen til at det er verdt å svare igjen.

**results** — 4 absent

- `5907` Hver runde er sitt eget datasett. Runder under terskelen vises som — uten antall.
- `6059` Spør folkene dine. Få ærlige svar. Data lagres i Norge og EØS, og anonymiteten styres av terskelen dere setter.
- `6123` Traff dette?
- `6168` Lag undersøkelse med veiviser

## R1 — interaction census

v8 draws behaviour that is not an element. Counted over each screen's region, on the bundle's own
camelCase convention (`onClick`, `onChange`, …) — the first extraction used `on-click` and reported
zero everywhere, which is why the convention is named here.

| screen | handlers | breakdown |
|---|---|---|
| dash | 11 | Click 11 |
| build | 101 | Click 59 · Change 24 · DragStart 5 · DragEnd 5 · DragOver 4 · Drop 4 |
| svdetail | 20 | Click 20 |
| surveys | 15 | Click 13 · Change 2 |
| dashboard | 48 | Click 37 · Change 7 · DragStart 1 · DragOver 1 · Drop 1 · DragEnd 1 |
| reports | 43 | Click 34 · Change 9 |
| profile | 6 | Click 5 · Change 1 |
| livestage | 2 | Click 2 |
| help | 11 | Click 8 · Change 3 |
| tasks | 29 | Click 19 · Change 10 |
| admin | 34 | Click 22 · Change 12 |
| packdetail | 3 | Click 3 |
| library | 24 | Click 22 · Change 2 |
| send | 38 | Click 25 · Change 12 · KeyDown 1 |
| respond | 45 | Click 34 · Change 11 |
| results | 22 | Click 20 · Change 2 |

**Three properties that hold across all sixteen:**

1. **Drag-and-drop exists on TWO screens** — `build` (5 draggable sources, DragStart/End ×5,
   DragOver/Drop ×4) and `dashboard` (1 of each). Nowhere else.
2. **One keyboard handler in the entire bundle** — a single `onKeyDown`, on `send`. v8 draws no
   shortcuts, no tab-order control, no enter/escape handling.
3. **Zero Focus / Blur / MouseEnter / MouseLeave handlers.** Hover and focus are CSS-only, and
   loading / disabled / empty / error are GATE BRANCHES (`sc-if`), not behaviour. That is why
   `respond` carries 53 gates and no non-click handler.

## R2 — the builder

### Drag model, verbatim with line numbers

```
607  <div draggable="true" onDragStart="{{ q.onDragStart }}" onDragOver onDrop onDragEnd   question card, full
744  <div draggable="true" … the same four                                                 block card, full
783  <div draggable="true" … the same four                                                 compact row
807  <div onDragOver="{{ onDropEndOver }}" onDrop="{{ onDropEnd }}"
          onDragLeave="{{ onDropEndLeave }}"   min-height:54px                             END drop zone
821  <button onClick="{{ ct.onAdd }}" draggable="true" onDragStart onDragEnd
          title="Klikk for å legge nederst, eller dra inn i flyten"                        content palette, dual-mode
989  <button onClick="{{ i.onClick }}" draggable="true" onDragStart onDragEnd
          title="{{ i.desc }} · klikk eller dra inn i flyten"                              question palette, dual-mode
```

`onDragLeave` is a seventh handler kind the first census missed.

**Ours: was AVVIST under D235 — OVERTURNED BY TOR, BUILT IN T8 (2026-09-21).** The refusal's two
grounds were no keyboard equivalent and no `docs/RESPONSIVE.md` pattern for the handle. Both are
ANSWERED rather than waived: the arrows and the «Flytt til» select stay — they ARE the keyboard
equivalent — and the handle measures 16×14 painted with a **44×44** hit area at 320px and 390px
(D269). All six drag lines ship, including the end drop zone and the dual-mode palette, which were
consequences of the refusal rather than separate gaps. `lib/surveys/flow-drag.ts` holds the model,
`moveTo` splices rather than swaps (v8:6905), and the splice is confirmed in a real Chromium, not
only in a unit test — see D268 for what that confirmation cost and what it corrected.

### Tabs — the largest structural gap in the builder

v8 has SIX `buildTab` values, drawn as CONTEXTUAL GROUPS of at most two (`10678–10692`):

| group | pills v8 draws |
|---|---|
| `add` / `content` | «Spørsmål» · **«Innhold»** |
| `general` / `settings` | **«Kjøremodus»** · **«Personvern og frekvens»** |
| `lint` | **«Merknader · N»**, or «Ingen merknader» |
| `preview` | «Slik ser den ut» |

**Ours is a flat four** (`Builder.tsx:65`): `general · add · settings · preview`, and its own comment
sources that from **`V2:6472`** — five bundles back. Consequences:

- **`content` has no tab.** `BlockPalette` sits inside `add`.
- **`lint` has no tab.** `MethodPanel` is stacked under `settings` beside `PolicyPanel` — which is
  the very «four panels where the bundle means two» the comment complains about, one level up.
- The contextual grouping does not exist at all.
- Every label differs from v8's.

### The 13 question types

Our `QUESTION_TYPES` (`lib/questions/registry.ts:71`) is **exactly** v8's 13-member set.

What differs is the PALETTE. v8's drawn `typeGroups` (`10740`) is 4 groups / 9 entries and collapses
the whole scale family into one: `["scale","Skala","Én type — velg stil etterpå: tall, ord,
ansikter, 0–10 eller skyvebryter"]`. Style is chosen AFTER insertion.

`addButtons` (`10748`) still enumerates all 13 and is **DEAD** — 0 references in the markup region
(`grep -n addButtons <v8> | awk -F: '$1<6182'`). Q248's shape again: a registry in the drawing that
nothing draws.

### Saving, autosave, versions, undo

Autosave is COPY, not a control: `bSavedLine` = «Utkast · lagres automatisk · N element(er)», or
«{status} · endringer lagres automatisk og gjelder fra neste runde».

**v8 has no versions and no undo in the builder.** Neither appears anywhere in the screen. There is
nothing to be missing.

## R3 — tranches, ordered by share of screen function lost

Not by element count. Each marked: **new data** / **new RPC** / **pure UI**.

| # | tranche | absent | kind |
|---|---|---|---|
| 1 | **svdetail** — question areas with owner+approver, progress per target group, representativity vs frame, drop-off per question, time spent, per-round datasets, first-question-in-email, 4-wave cadence, recurring rounds | 32 | **new data + new RPC** |
| 2 | **send** — target groups from one population, one-off list, save-as-target-group, sender/appearance + accent colour, QR PNG + A4 poster, cadence presets | 21 | mixed |
| 3 | **admin** — invite user, import to target group + field mapping, Entra sync-now/last-synced/permissions/log, API keys, webhooks, default survey, sensitive topics | 20 | **new data + new RPC** |
| 4 | **dashboard** — rename, «Gjelder alle paneler», restart from preset, «Bruk oppsett», choose KPI, add-panel-into-the-clicked-slot, data source | 12 | pure UI (+1 drag) |
| 5 | **builder tabs** — `content` and `lint` as tabs, contextual 2-pill grouping, v8's labels | — | **pure UI** — **DONE** (T5, T5.1: level one moved to the shell rail per v8:9366-9371) |
| 6 | **builder palette** — collapse the scale family to one entry with a post-insert style chooser | — | **pure UI** — **DONE** (T6, found already correct) |
| 7 | **build** — Lagre og lukk, Se metodikk, Skjul/Rediger, Live- and Quiz-innstillinger, Bestått-grense, Antall forsøk | 10 | pure UI — **T7: 4 built, 3 refused on record, `541` raised to Tor (D266), 1 open** |
| 8 | **help** — forum (new post, «Spør de andre…»), contact SLA line | 6 | **new data** |
| 9 | **surveys** — lowest-response-rate sort, Lag kopi, Lukk undersøkelsen, empty-filter state | 6 | UI + 1 RPC |
| 10 | **dash** — NPS i dag, Kritikere uten svar, Svar kunden | 5 | **new data** |
| 11 | **results / respond / livestage / packdetail / library / reports** | 13 | mostly pure UI |
| — | drag-and-drop on build and dashboard | — | **AVVIST D235** — a tranche only if that is overturned |

## What this pass did NOT do

Stated so the next reader does not inherit it as complete:

- **Element-by-element at full grain for all 16.** What exists is: per-screen gate/control/repeater
  counts, the complete static-copy absence list, and the builder in depth.
- **Per-element «delvis» outside the builder.** The copy axis cannot separate partial from absent —
  it sees a string, not a component. Saying «delvis» without naming what is missing would be the
  thing the instruction explicitly forbids.
