# Fidelitetsrevisjon — skjerm for skjerm

Mot **v6** (`design-reference-v6/heituva-survey-app-design/project/HeiTuva.dc.html`, md5
`7c25573d…`, 10152 linjer). Bundelsitat skrives `v6:<linje>`. Appsitat skrives `fil:linje`.

Rekkefølgen er bundelens egen: skallet, veiviseren, og så hver `is*`-gate i markup-rekkefølge.

Klassene er definert i `00-method.md § 0.1`: **BESLUTTET · STYRT AV ELDRE BUNDEL · FORENKLING ·
VÅRT**.

---

## 0. Kommandoene, ved siden av tallene

```
# skjermlisten, utledet fra bundelen
grep -n '<sc-if value="{{ is[A-Z]' design-reference-v6/heituva-survey-app-design/project/HeiTuva.dc.html

# de 513 distinkte statiske tekstnodene, og de 176 som ikke finnes i messages/no.json
#   (skriptet ligger i 00-method.md § 1.1 punkt 2; regionen er linje 14–5952)

# app-renderingene
npm run verify:browser      # -> captured 205, failed 0
```

---

# DEL I — SKALLET

Skallet er den delen v6 tegner rundt hver skjerm. Tre av funnene her er **flerskjermsfunn**: de
opptrer på fire til seks skjermer hver, og de er derfor ett funn og ikke seks.

## S1. Header — `v6:161-226`

**LASTET** (`artifacts/phase-5/oversikt.default.desktop.png`) **og lest fra kilden**
(`components/AppHeader.tsx`).

**(a) mangler helt** — ingenting. Logo+ordmerke, nav, «?», arbeidsflate-chip, brukerknapp med
meny, språkvelger, breddebryter og «Logg ut» finnes alle.

**(b) annen form**
- `v6:177-179` tegner en **«Logg inn»-knapp i headeren** når `loggedOut`. Appen har ingen
  utlogget headertilstand: `app/(app)/layout.tsx:16` kaller `requireViewer()`, som redirigerer.
  **VÅRT / BESLUTTET** — en utlogget bruker ser aldri appskallet, så tilstanden er
  uoppnåelig, ikke uteglemt.

**(c) egenskaper**
- Nav-etikett: `v6:7660` `["tasks","Oppgaver"]` mot `messages/no.json:40` `"tasks": "Handlinger"`.
  **BESLUTTET — Q171** (DECISIONS.md:827): «Handlinger» er kort OG sant om en liste som
  inneholder både oppgaver og tilbakemeldinger; «Oppgaver» er usant om halve innholdet.

**(d) vårt** — ingenting utover ovenstående.

**Dom: FAITHFUL.**

## S2. Subnav-stripen — `v6:227-240`, gate `v6:8599-8600`, innhold `v6:8616-8653`

**LASTET og lest fra kilden** (`components/AppSubnav.tsx`).

**(a) mangler helt — og dette er et flerskjermsfunn**

`hasSubnav` (`v6:8600`) er sann på **seks** skjermer. Appen rendrer stripen på **fem**, og
skjæringen stemmer ikke:

| bundelens skjerm | `subnavLabel` / innhold | appen |
|---|---|---|
| `dashboard` | «Innsikt» — Dashbord · Rapporter · Lovpålagt · Maler · Bygger (`v6:8619`) | JA, men **to piller** (Dashboard · Rapporter), ikke fem |
| `reports` | samme fem | JA, samme to |
| `svdetail` | «Undersøkelse» — **elleve** faner (`v6:8629`) | JA, **åtte** faner (`lib/surveys/tabs.ts:3`) |
| `tasks` | «Arbeidsliste» — Alt · Oppgaver · Tilbakemeldinger (`v6:8644`) | JA, identisk |
| `admin` | «Administrasjon» — seks faner (`v6:8639`) | **NEI** |
| `surveys` | «Undersøkelser» — Alle · Aktive · Utkast · Lukket (`v6:8634`) | **NEI** |
| — | — | `bibliotek` — **VÅRT**, Q172 |

- **`admin`: BESLUTTET.** `AppSubnav.tsx:26-40` fører begrunnelsen: `AdminTabs` rendrer allerede
  ni faner i siden, bundelens subnav-liste har seks, og bundelens EGEN `adminTabs` (`v6:8657`)
  har åtte. Seks er en opptelling av fanene som fantes da linjen ble skrevet — CLAUDE.md-tabellens
  femte rad, én skjerm bortenfor. To kontroller som gjør én jobb, der den ene er tre faner
  utdatert, er verre enn én.
- **`surveys`: FORENKLING.** Ingen begrunnelse noe sted. Undersøkelseslistens statusfiltre er
  bygget, men som chips **inne i siden** (`app/(app)/undersokelser/page.tsx:279-286`) — se S3c og
  U1.
- **De tre manglende Innsikt-pillene** (Lovpålagt · Maler · Bygger) er **FORENKLING**: alle tre
  destinasjonene finnes som ruter/faner på `/rapporter`, så pillene ville løst.

**(c) egenskaper** — stripen selv er trofast: `--sbg`, 11px versaler, `rounded-b-[15px]`,
`py-[7px]`-piller. `touch-cluster`-avstanden under 768px er **VÅRT**, logget (D164/RESPONSIVE.md).

## S3. Brødsmulen — `v6:1158, 2127, 2473, 2797, 3668, 4616`

**LASTET og lest fra kilden.**

**(a) mangler helt — flerskjermsfunn, og det reneste eksemplet i hele revisjonen**

Bundelen tegner brødsmulen på **seks** skjermer. Appen har den på **to**.

| bundel | skjerm | appen |
|---|---|---|
| `v6:4616` | Bibliotek | `app/(app)/bibliotek/page.tsx:141-146` ✔ |
| `v6:3668` | Handlinger | `app/(app)/oppgaver/WorklistPanel.tsx:255-259` ✔ |
| `v6:2127` | **Undersøkelser** | **mangler** |
| `v6:2473` | **Innsikt / Dashboard** | **mangler** |
| `v6:2797` | **Rapporter** | **mangler** |
| `v6:1158` | **Undersøkelse-detalj** | **mangler** |

Kommandoen: `grep -rn 'opacity-50">→' app/` gir nøyaktig to treff.

**Hvorfor dette er ett funn og ikke fire:** brødsmulen er én delt flate. Den ble bygget i V5-1/Q172
på de to skjermene den fasen hadde åpne, og aldri forplantet. Klassen står i `02-summary.md § 2.1`.
**FORENKLING.**

## S4. «På tvers»-kortet — `v6:2140, 2484, 2808, 4628`

**(a) mangler helt — flerskjermsfunn, og det største**

Bundelen tegner et oppsummeringskort øverst til høyre på **fire** skjermer: Undersøkelser
(`v6:2136-2152`), Innsikt (`v6:2482-2496`), Rapporter (`v6:2806-2818`) og Bibliotek
(`v6:4626-4638`). Det bærer en overskrift «På tvers», et totall, en primærknapp («＋ Ny» /
«＋ Ny rapport») og tre til fire statistikk-chips.

**Appen har det på ingen.** `grep -rn 'På tvers\|crossStats\|insStats' app/ messages/` gir **null
treff.**

Konsekvensen er strukturell, ikke kosmetisk: v6s sidehode er et **togkolonners rutenett**
(`v6:2130`: `grid-template-columns:minmax(0,1.1fr) minmax(330px,.9fr)`) der venstre kolonne er
tittel + telling + ingress og høyre kolonne er dette kortet. Uten kortet kollapser rutenettet, og
alle fire skjermene har fått et enkolonners hode med knappene flyttet til høyre marg.

**FORENKLING**, på fire skjermer, av én flate.

## S5. Undersøkelsens kontekstlinje — `v6:242-269`, gate `v6:8522`

**LASTET** (`artifacts/phase-2/bygg.default.desktop.png`) **og lest fra kilden**
(`app/(app)/undersokelser/[id]/SurveyContextBar.tsx`).

**(b) annen form** — bundelens `ctxSteps` (tre nummererte piller, `v6:259-265`) er flyttet til
subnav-stripen som fanerailen. **BESLUTTET — V6-2**, begrunnet i `SurveyContextBar.tsx:22-43`:
to kontroller for én jobb er verre enn én, og fjerning fra kontekstlinjen er betingelsen flyttingen
hviler på.

**(c)** tilbakeknapp, tittel, målgruppe, statuspille (de tre literale hex-verdiene), ↻-chip og
«Kjør live» er alle på plass, med bundelens mål.

**Dom: FAITHFUL (re-parentet, med beslutning).**

## S6. Bunnteksten — `v6:5821-5857`

**LASTET og lest fra kilden** (`components/AppFooter.tsx`).

**(c) egenskaper / kopi — alle BESLUTTET (D164), men ett tall i den beslutningen er nå feil**

Fire av tegningens påstander ligger ikke ute, hver med målt grunn: «Data lagres i Norge og EØS»
→ «Data lagres i EØS» (ingenting er i Norge); «DPIA gjennomført» borte; driftsstatuslinjen borte;
versjonslinjen borte. Tre merker ble to. Den juridiske linjen byttet subjekt fordi
`organizations` ikke har kolonnen.

> **KORREKSJON TIL `docs/v2/00-diff.md § 0.3e`.** Den tabellen fører «Alle tjenester kjører
> normalt» som 1 → 0 og teller den blant «fire avslag som landet». **Den forsvant ikke — den ble
> omskrevet.** `v5:7674` «Alle tjenester kjører normalt» → `v6:8596` «Alle tjenester i normal
> drift». Det samme gjelder versjonen: `v5:7675` «Versjon 2.4 · september 2026» → `v6:8597`
> «Versjon 3.4 · » + orgName, som er MER spesifikk, ikke fjernet. **Avslag som landet er tre, ikke
> fire.** Dette er nøyaktig formen CLAUDE.md advarer mot: et strengnærvær-diff rapporterer en
> fjerning der det var en erstatning. Funnet krever ingen kodeendring — bunnteksten er riktig som
> den er; det er MÅLINGEN som må rettes.

## S7. Tuva — `v6:5858-5952`, gate `v6:8965`

**Lest fra kilden.** Ingen app-rendering finnes å laste, av grunnen under.

**(a) mangler helt — og dette er den største enkeltflaten i revisjonen**

`tvShow` (`v6:8965`) er sann på **hver skjerm unntatt** `surveys`, `respond`, `splash` og `login`.
Panelet bærer: overskrift + kort tekst (`v6:5867`), et spørsmålsfelt (`v6:5870`), spørsmålschips
(`v6:5876`), et svar med kilde og handling (`v6:5881-5887`), en vurderingskontroll «Traff dette?»
(`v6:5892-5902`), tipskort (`v6:5909-5914`), en fremdriftsliste (`v6:5918-5937`), «Lag undersøkelse
med veiviser» (`v6:5939`) og en flytende boble (`v6:5942`).

**Ingenting av det rendres.** `lib/tuva/answers.ts` — registeret V6-5 bygde — **importeres bare av
sin egen test**:

```
$ grep -rn "lib/tuva/answers" app/ components/ tests/
tests/unit/tuva-answers.test.ts:4:import { TUVA_ANSWERS, tuvaHref, tuvaKeyFor, … }
```

`git show --stat 9a54a99` bekrefter det: V6-5 la til `lib/tuva/answers.ts`, testen, og **36
`tuva.*`-meldinger i begge språk** — og ingen komponent. Kopien er sådd i `ui_messages` og når
ingen skjerm.

Det som ER bygget er **svTuva**, analytikeren på undersøkelseslisten (`AnalystPanel.tsx`), som er
en annen flate med et annet register. Se U1.

**Ikke bygget, med beslutning bak seg** (`lib/tuva/answers.ts:31-40`): av/på-bryteren (Q183 —
`tvShow` leser `options.tuva`, en nøkkel bundelens eget `options` aldri setter), tommel opp/ned
(`tvRated`) og `tvTrackOpen` — alle tre mangler en skriver.

**Men selve panelet er ikke besluttet bort noe sted.** Det er **FORENKLING**, og den eneste i
revisjonen der kopien ligger ute uten leser.

---

# DEL II — SKJERMENE, I BUNDELENS REKKEFØLGE

## W. Veiviseren — `v6:30-158`

**LASTET** (`artifacts/phase-2/undersokelser-ny.formal.desktop.png`) **og lest fra kilden**
(`app/(app)/undersokelser/ny/Wizard.tsx`).

Fire steg, stegprikker, fremdriftslinje, «Start fra blankt»-snarveien, «Hvem skal svare?»,
«Hva vil dere finne ut?», antallsskyveren, spørsmålsforhåndsvisningen, gruppevalget,
hyppighetschipsene med «Tilpasset»-grenen, oppsummeringen og Tilbake/Neste/Opprett.

`messages/no.json` `wizard` har 42 nøkler som dekker samtlige.

**Dom: FAITHFUL.** Ingen funn i noen av de fire kategoriene.

## O. Oversikt — `v6:270-507`

**LASTET** (`artifacts/phase-5/oversikt.default.desktop.png` + fire arbeidsflatevarianter)
**og lest fra kilden** (`app/(app)/oversikt/OverviewScreen.tsx`, 462 linjer).

**(a) mangler helt**
- **nps-kortet** (`v6:307-343`) — «NPS i dag», «Kritikere uten svar», «Svar kunden».
  **BESLUTTET — Q126.**
- **«Kom i gang»-kortet** (`v6:445-470`) finnes (`OverviewScreen.tsx:436-450`); det var borte i
  standardfangsten fordi tilstanden var fullført, ikke fordi flaten mangler.

**(c) egenskaper / kopi**
- `v6:349` «Fire alternativer med farge og ikon …» → appen dropper «Fire».
  **BESLUTTET — Q121:** `quizzable` er `choice | yesno | dropdown`, og `yesno` har to. En
  beskrivelse av en klasse kan ikke bære en opptelling av instansen foran seg.
- `v6:288` «Oppsett: Arbeidsmiljø» → appen «Dashboard følger oppsettet «Arbeidsmiljø»».
  **VÅRT**, lengre og mer presist; ikke logget som avvik. Lavt anslag.

**(d) vårt** — en liten «Oversikt»-etikett over overskriften, som bundelen ikke tegner der.

**Dom: NEAR-FAITHFUL.** Modulrutenettet, arbeidsflate-chippen, «Sløyfen lukket», «Svaraktivitet»
med søyler og streak-prikker, «Krever handling», «Kom i gang» og det svarte
lovpålagte-frister-kortet med tidslinjen er alle bygget, med v4s mål.

## B. Byggeren — `v6:508-1151`

**LASTET** (seks tilstander: `bygg.default/avansert/vis/innstillinger/policy-open/policy-low-warning`)
**og lest fra kilden** (`Builder.tsx` 783 linjer, `QuestionCard.tsx` 668, `PolicyPanel.tsx` 306,
`RunModePanel.tsx` 339, `EngagementPanel.tsx` 278, `PreviewPane.tsx` 236, `BankPicker.tsx` 246).

**(a) mangler helt**
- **Den femte fanen i høyrerailen.** `v6:9848` bygger fem: `general · add · lint · settings ·
  preview`, der `lint` («Metodikk») bærer et **antallsmerke** —
  `label + " · " + bl.rows.filter(r => !r.dismissed).length`.
  `Builder.tsx:45` har fire: `['general','add','settings','preview']`.
  **BESLUTTET (delvis)** — `MethodPanel.tsx:22-27`: rådet ligger i `settings`, ved siden av
  klarhetslisten, fordi å folde det INN i listen ville fått en metodisk mening til å se ut som
  en forutsetning, hvilket er det Q178 nekter. **Men fanen med antallsmerket er en egen flate**,
  og antallet — hvor mange merknader som står åpne — er ikke synlig noe sted i railen.
  **FORENKLING (liten).**
- **«Se metodikk»-knappen i `goSendBlocked`-banneret** (`v6:520-525`). **BESLUTTET — Q178**:
  ingenting blokkerer en utsending, så banneret finnes ikke.
- **`quizPass` / `quizTries`** — «Bestått-grense» og «Antall forsøk» (`v6:787-794`).
  **BESLUTTET — Q84.**
- **Metatittel-kortets sammenslåtte tilstand** (`v6:543-551`, «Rediger ▾» / «Skjul ▴»).
  **FORENKLING (liten)** — appen har alltid feltene åpne.

**(c) egenskaper / kopi**
- `v6:1055` og `v6:1073` — lint-kortets ledetekst og tomtilstand er omskrevet.
  **BESLUTTET — Q178** (blokkeringsspråket er usant om produktet) og **Q181** (ingen empiriske
  tall). `MethodPanel.tsx:9-21` fører begge.

**Dom: NEAR-FAITHFUL.** Alle tretten spørsmålstyper, kvalitetsflaggene, `advanced`-blokka,
matrise/bilde/rangering-redigeringen, `polLocked`, terskelchipsene, klarhetslisten,
logikkreglene, engasjementspanelet og forhåndsvisningen er bygget.

## D. Undersøkelse-detalj — `v6:1152-2117`

**Lest fra kilden.** Ingen app-rendering finnes å laste av hodet, av grunnen under; hver av de
åtte bygde fanene er fanget som egen rute.

Dette er bundelens største skjerm — 965 linjer, elleve faner, og et delt hode over dem alle.
**Det er også skjermen med størst avstand til appen.**

### D.0 Hodet — `v6:1155-1252` — **FORENKLING, og den nest største i revisjonen**

`v6:1155-1252` ligger UTENFOR alle `sd.tab*`-gatene: det vises på alle elleve faner. Det bærer

| flate | bundel |
|---|---|
| brødsmule | `v6:1158` |
| tittel + `UND-xxxx` + versjon + målgruppe | `v6:1168-1169` |
| «Rediger» · «Del» · primærknapp | `v6:1176-1178` |
| eier med initialer | `v6:1183-1186` |
| **sju faktarader** — Målgruppe · Periode · Kanal · Spørsmål · Personvern · Oppfølging · Runder | `v6:1188-1196` |
| **svarmåleren** — antall, «av N har svart», prosent, «N mangler (P %)», «Snitt X av 5,0» | `v6:1200-1207` |
| **KPI-kort** | `v6:1212-1221` |
| **«Fordeling»-stripe** med etiketter | `v6:1223-1233` |
| notat | `v6:1237-1242` |
| **underfane-railen** | `v6:1243-1252` |

**Appen har ingen av det.** `app/(app)/undersokelser/[id]/page.tsx:12-16` er en 16-linjers
`redirect()` til `/bygg`, med en kommentar som siterer **den FØRSTE bundelen**
(«HeiTuva.dc.html:3397 … Bygg er det første steget») — en beskrivelse v6 har erstattet.
Det appen viser i stedet er `SurveyContextBar`: tilbakeknapp, tittel, målgruppe, status, ↻, «Kjør
live».

Deler av hodet er svar-avledet («Snitt», KPI-ene, «Fordeling») og ville trengt `app.k_for`.
Resten — identitet, kanal, periode, spørsmålstall, personverntilstand — er det ikke.

**«Oversikt-fanen er besluttet NOT NOW» dekker ikke dette.** `sd.tabOver` er `v6:1255-1370`;
hodet er `v6:1155-1252`. De er to flater, og beslutningen gjelder den nederste.

### D.1 Underfane-railene — `v6:7139-7151` — **FORENKLING**

Sju av elleve faner har en egen underrail, til sammen **28 underfaner**:

| fane | underfaner |
|---|---|
| over | Sammendrag · Innhold |
| sporsmal | Alle spørsmål · Skala · Fritekst |
| resultat | Matrise · Per spørsmål · Sammenligning · Runder · Fordeling · Frisvar |
| malgruppe | Grupper · Segmenter · Levering |
| utsending | Invitasjon · Bølger · Leveranse · Kanaler · Påminnelser · Gjentakelse · Oppsett |
| kommentarer | Alle · Venter svar · Besvart |
| tiltak | Åpne · Alle · Med hjemmel |

**Appen har null underfaner.** `lib/surveys/tabs.ts` har ett nivå.

### D.2 Fanerailen selv

| # | bundel `v6:8629` | appen `lib/surveys/tabs.ts:3` | klasse |
|---|---|---|---|
| 1 | over | — | **BESLUTTET** (DECISIONS.md:885) |
| 2 | sporsmal | sporsmal → `/bygg` | se D.3 |
| 3 | **metodikk** | — | **BESLUTTET (delvis)** — panelet ligger i Byggeren, `MethodPanel.tsx:22`; fanen finnes ikke |
| 4 | resultat | resultat → `/resultater` | ✔ |
| 5 | **feltarbeid** | — | **BESLUTTET** (DECISIONS.md:876) |
| 6 | malgruppe | malgruppe | halv, **BESLUTTET** |
| 7 | utsending | utsending → `/send` | ✔ |
| 8 | kommentarer | kommentarer | ✔ |
| 9 | tiltak | tiltak | ✔ |
| 10 | personvern | personvern | ✔ |
| 11 | historikk | historikk | ✔ |

**(c) rekkefølge.** Appen er `sporsmal · utsending · resultat · malgruppe · …` — Bygg/Send/
Resultater-arbeidsflyten. Bundelen er `… sporsmal · metodikk · resultat · feltarbeid · malgruppe ·
utsending …`. `utsending` flytter fra 7. til 2. plass. **VÅRT**, udokumentert.

### D.3 Fane «Spørsmål» — `v6:1371-1412` — **(b) ANNEN FORM**

Bundelen tegner en **skrivebeskyttet sjukolonners tabell** — `#`, Spørsmål, Type, Krav, Tema,
Besvart, Snitt (`v6:1382-1388`) — med en «Åpne byggeren»-knapp (`v6:1377`) ved siden av, som
beviser at byggeren er en annen skjerm. Appen mapper fanen rett til `/bygg`
(`lib/surveys/tabs.ts`, `TAB_SEGMENT.sporsmal = 'bygg'`), altså **redigeringsverktøyet i stedet
for oversikten**. Kolonnene Tema, Besvart og Snitt finnes ingen steder.

### D.4 Fane «Resultat» — `v6:1553-1732`

Seks underfaner. Appens `/resultater` (`ResultsScreen.tsx`, 874 linjer) dekker innholdet i
**Per spørsmål**, **Runder**, **Fordeling** og **Frisvar** — men som én rullende side, ikke som
underfaner. **Matrise** (`v6:1558-1588`, en gruppe×tema-matrise med skalalegende) og
**Sammenligning** (`v6:1595-1649`, runde-mot-runde med endringskolonne og totalrad) er nærmere
Dashboard/Rapporter-flatene og finnes ikke på denne skjermen. **FORENKLING (middels)** —
overlappet mot dashbordets heatmap er reelt og bør veies før noe bygges.

### D.5 Fane «Målgruppe» — `v6:1733-1792` — **BESLUTTET, halv**

`app/(app)/undersokelser/[id]/malgruppe/page.tsx:10-33` fører beslutningen i klartekst: «hvem får
den» bygges, «hvem faller fra» er Feltarbeid under et annet navn og avslås av samme grunn.
`tests/unit/audience-half.test.ts` fester det til kilden.

**Men to kolonner er ikke den avslåtte halvdelen:** bundelens tabell (`v6:1760-1766`) har
`Type` og `Kilde`, som er `groups.kind` og `groups.source` — gruppemetadata, ikke svardata, og
begge finnes i skjemaet og vises allerede på Målgrupper-skjermen. Appen viser to kolonner: navn og
antall. **FORENKLING (liten).**

### D.6 Fane «Utsending» — `v6:1793-2000` — **(b) ANNEN FORM**

Sju underfaner. Appen mapper fanen til `/send`, redigeringsskjermen. Bundelens fane er en
**lese-visning av en utsending som allerede er satt opp**, og to av underfanene finnes ingen
steder i appen:

- **«Invitasjon»** (`v6:1795-1849`) — en gjengivelse av selve e-posten: Fra, Emne + lengde, formål,
  tid, **spørsmål 1 lagt i e-posten** med alternativene, anonymitetslinjen, og kortet «Derfor
  ligger spørsmålet i e-posten» med regelen «Ett valg, høyst fem alternativer, ikke sensitivt».
  **FORENKLING.**
- **«Bølger»** (`v6:1851-1872`) — fire bølger dag 0 → +3 → +7 → +12, hver til dem som ikke har
  svart. Appen har én påminnelse (`send.reminderAfter`). **FORENKLING**, og den nærmeste
  slektningen til Feltarbeid — men bølgene navngir ingen; de er en tidsplan.
- **«Leveranse»** (`v6:1874-1890`) — leveringsstatistikk. **BESLUTTET de facto**: D133 sier at
  `sent_at` betyr AKSEPTERT AV LEVERANDØREN, det finnes ingen webhooks, og `bounced_at` har ingen
  skriver. Et leveransepanel her ville vært oppdiktede tall.
- Kanaler, Påminnelser, Gjentakelse og Oppsett finnes alle på `/send`.

### D.7 Fanene «Kommentarer», «Tiltak», «Personvern», «Historikk»

**Alle fire lest fra kilden og fanget** (`kommentarer`, `tiltak`, `personvern`, `historikk`).

| fane | bundel | appen | klasse |
|---|---|---|---|
| Kommentarer `v6:2001-2024` | rad med hvem/dato/merkelapp/status, «Til: {spørsmål}», **«Svar»** og **«Lag tiltak»** | `surveyComments`, 7 nøkler: liste uten de to handlingene | **VÅRT/BESLUTTET** — svar og tiltak eies av Handlinger; et andre inngangspunkt til samme register er det V5-2 og `tiltak/page.tsx:18-21` uttrykkelig avviser |
| Tiltak `v6:2026-2054` | femkolonners tabell Tiltak · Type · Hjemmel · Eier · Frist | `surveyTasks`, 4 nøkler: liste + «Åpne Handlinger» | **FORENKLING (liten)** — Hjemmel, Eier og Frist finnes alle på `tasks` |
| Personvern `v6:2056-2094` | **«Modus»-velger** med tre knapper og konsekvenstekst, `minNPreview`, `privRows`, avsluttende setning | `surveyPrivacy`, 17 nøkler: radene + `edit`/`editLocked` som lenker til Byggeren | **(b) ANNEN FORM**, riktig: én kontroll, ikke to |
| Historikk `v6:2096-2114` | **en hendelseslogg** — hvem gjorde hva når (`sd.log`) | **runder** — `round_no`, status, åpnet/lukket, spørsmålstall | **(b) ANNEN FORM, BESLUTTET** — `historikk/page.tsx:10-23` fører hvorfor: runder er ikke svar-avledet, og et svarantall per runde på en liten undersøkelse er nøyaktig arrangementet Feltarbeid ble avslått for |

**Q187 er halvt anvendt, og den andre halvparten har ingen flate å lande på.** Beslutningen sa
«interpoler fra `organizations.retention_months`, BEGGE steder». `privRows` er gjort —
`personvern/page.tsx:6,82` kaller `retentionOf()`. `rlAnonRows` på respondentflaten er ikke, fordi
hele det arket ikke er bygget. Se R1.

## U1. Undersøkelser — `v6:2118-2466`

**LASTET — begge sider.** Appen: `artifacts/phase-2/undersokelser.default.desktop.png`.
Tegningen: `artifacts/reference-v6/undersokelser.png`. Dette er paret som utløste revisjonen, og
de to bildene ved siden av hverandre er hele beviset.

**(a) mangler helt**

| flate | bundel | appen |
|---|---|---|
| subnav-rail «Alle · Aktive · Utkast · Lukket» | `v6:8634` | **mangler** (S2) |
| brødsmule | `v6:2127` | **mangler** (S3) |
| ingress «Velg en undersøkelse i listen …» | `v6:2134` | **mangler** |
| **«På tvers»-kortet** med 4 chips og «＋ Ny» | `v6:2136-2152` | **mangler** (S4) |
| **visningsvelgeren** Liste · Liste og detalj · Kort | `v6:2211-2216`, register `v6:8947` | **mangler** |
| **blandingsstripen** — aktive/utkast/lukket-prikker, prosent, «N av M svar» | `v6:2226-2238` | **mangler** |
| **sekskolonners tabell** Undersøkelse · Svar · Sendt · Status · Eier · Handling | `v6:2301-2392`, overskrifter `v6:2305-2310` | **mangler** |
| **fem ikonknapper per rad** | `v6:2339-2352` | **mangler** — appen har «…»-meny |
| **den utvidbare raden** (`r.open`, `v6:2357-2387`) med svart/mangler-stripe, snitt, statuslinje, eierens e-post | `v6:2357` | **mangler** |
| **«Liste og detalj»-panelet** «Valgt undersøkelse» med seks felt og seks handlinger | `v6:2261-2299` | **mangler** |
| Tuva i sidespalte ELLER flytende boble | `v6:2414-2465` | **annen form**, se under |

**(b) annen form — to, og begge er klassiske**

1. **Tabellen er kort.** `svView` står til `liste` (`v6:8942`: `rowsOn: (st.svView || "liste") ===
   "liste"`), altså er tabellen bundelens STANDARD. Appen bygde `boxOn`-visningen — kortene — og
   gjorde den til den eneste. Tre visninger ble én, og det ble den bundelen viser sist.
2. **Omfangsfiltrene er statusfiltrene.** Bundelen har BEGGE: `svScopes` (`v6:8943`) er
   **Alle · Mine · Lav svarprosent · Gjentakende · Delt med meg** i kortets hode, og
   statusfiltrene ligger i subnav-railen (`v6:8634`). Appen har tre chips —
   `keys.ts:16` `['alle','aktiv','utkast']` — i kortets hode. Altså: **omfangsfiltrene mangler
   helt, og statusfiltrene er rendret på omfangsfiltrenes plass**, med «Lukket» dessuten borte.
3. **svTuva.** `v6:9014` `svTuvaSide: st.svTuvaDocked !== false` — **den dokkede sidespalten er
   standarden**, den flytende boblen (`v6:9015`) er alternativet, og de to er brukervalgbare
   (`onSvTuvaDock` / `onSvTuvaUndock`, `v6:9017-9018`). Appen rendrer **ingen av dem**: et
   fullbreddes `<aside>` øverst på siden (`AnalystPanel.tsx:29-32`), uten bryter. Kortet i
   sidespalten står på `--sbg` med 56px-ansikt og tre tipskort med egen knapp; appens er en
   punktliste med understrekede lenker.

**(c) egenskaper**
- Overskriften: `v6:2132` `font-size:32px` mot `page.tsx:223` `text-[28px]`.
- Tellelinjen: `v6:2133` er `{{ surveyCounts }} | {{ svScopeLine }}` — to ledd; appen har ett.

**(d) vårt**
- Filter, søk, sortering og delepanelet ligger i URL-en i stedet for i komponenttilstand.
  Dokumentert i `page.tsx:28-32`; rendringen er uendret. Riktig, og bedre enn tegningen.
- «Tom undersøkelse» ved siden av «Ny undersøkelse».

**Dom: den største avstanden i revisjonen. Ti navngitte flater mangler, to er i feil form.**

### U1-DEFEKT. svTuvas aritmetikk — **LEVENDE DEFEKT, rapportert separat**

`«700 % har svart»` og `«ligger lavest på 100 %»` reproduserer nøyaktig fra produksjonsdata,
lest 2026-09-14 via Supabase MCP.

`lib/tuva/analyst.ts:70-74`:

```ts
const totalTarget    = surveys.reduce((a, s) => a + (s.target ?? 0), 0)   // = 2
const totalResponses = surveys.reduce((a, s) => a + s.responses, 0)       // = 14
const pct = totalTarget > 0 ? Math.round((totalResponses / totalTarget) * 100) : null  // = 700
```

Prod har ni undersøkelser. To har `target = 1`; de sju andre har `target = null` — blant dem
«Medarbeiderpuls høst» (7 svar) og «Påmelding til fagdag» (5 svar).

**Årsaken er ikke en manglende klemme.** `Math.min(100, …)` ville skrevet `100 %` og fortsatt vært
usant. **Teller og nevner regnes over ulike populasjoner:** `totalResponses` summerer over alle ni,
`totalTarget` over de to som har et mål. Vakten på linje 74 beskytter mot nevner NULL — feilen
prosjektet allerede kjenner — og sier ingenting om en nevner hentet fra et UTVALG av radene
telleren kom fra.

Den samme splittelsen gjør `lowest` usann: `rate()` (`analyst.ts:59-60`) returnerer `null` når
`target` er `null`, så de to undersøkelsene som faktisk har lav deltakelse **faller ut av
`rated`** (`analyst.ts:76-80`), og «lavest» blir en av de to `1/1`-radene:
`Math.round(1.0 * 100)` = `100 %`.

Panelet er det første på `/undersokelser` (`page.tsx:245`).

## I. Innsikt / Dashboard — `v6:2467-2790`

**LASTET** (`dashboard.default` + fem tilstander) **og lest fra kilden**
(`DashboardScreen.tsx` 644, `CustomizeCard.tsx` 408, `page.tsx` 373).

**(a) mangler helt**
- brødsmulen `v6:2473` — **FORENKLING**, S3
- **«På tvers»-kortet** `v6:2482-2496` — **FORENKLING**, S4
- tre av fem subnav-piller — **FORENKLING**, S2
- overskriften «Nøkkeltall» over statistikkortene (`v6:2649`) — kortene finnes
  (`dashboard.statSurveys/statResponses/statRate/statAvg`), overskriften ikke. **FORENKLING
  (triviell).**

**(c) egenskaper / kopi** — kandidatene fra kopi-sveipet er **parafraser, ikke hull**, og er lest
før de ble forkastet: `v6:2641` «Bruk oppsett» → `dashboard.useSetup` «Bruk dette oppsettet»;
`v6:2608` → `startOver` «Start på nytt»; `v6:2617-2618` → `chooseSetup` / `chooseSetupNote`, der
siste ledd er «Du kan endre alt etterpå» mot bundelens «Du kan legge til og fjerne paneler
etterpå». Ingen av dem er funn.

**Dom: FAITHFUL i kroppen, FORENKLET i hodet.** Tilpass-arket med sine tre faner, oppsettvalget,
panelregisteret med alle seks rendrere (bars, heat, text, register, duties, stream), pin, bredde,
rekkefølge, frys og terskellinjen er alle bygget — 105 `dashboard`-nøkler.

## R. Rapporter — `v6:2791-3260`

**LASTET** (`rapporter.lovpalagte/standardmaler/mine-rapporter/plikt-innstillinger`,
`rapport-editor.innhold/filter/del`) **og lest fra kilden.**

**(a) mangler helt** — brødsmulen (`v6:2797`), «På tvers»-kortet (`v6:2806-2818`) og tre subnav-
piller. **Alle tre er flerskjermsfunnene S3, S4 og S2.** Ingen andre.

**Dom: FAITHFUL i kroppen.** 158 `reports`-nøkler dekker pliktkortene, ansvarlig, rytme
(halvår/årlig/annethvert år), varsel før (2/4/8 uker), publisering, signering med foreldet
signatur, arkiv, malene, rapportlisten, redigereren med seksjoner, periode- og gruppefilter,
sitatvelgeren, delingsomfangene, PDF og PowerPoint, planlagt utsending — og terskelsetningen
`v6:3219` som `reports.groupThreshold`.

## P. Profil — `v6:3261-3341`

**LASTET** (`profil.default/notify-toggled/saved`) **og lest fra kilden.**

**(a) mangler helt** — **ingenting av substans.** «Om meg» med fire felt, rollenotatet, de fire
varslene, språkchipsene og øktlisten med «Logg ut overalt» finnes alle (31 `profile`-nøkler).

**(c)** ingen. Bundelens hode har en stor avatar og linjen
`{{ profileRole }} · {{ profileGroup }} · Nordisk Studio` (`v6:3265-3268`), og appen har begge:
64px initial-sirkel på `--ac3` (`profil/page.tsx:47-49`) og rollelinjen
(`profil/page.tsx:56-58`), der gruppeleddet faller bort helt når medlemmet er uten gruppe
i stedet for å vise en tom skilletegn.

*Denne raden sto først som en forenkling i utkastet. Den ble lest og er feil: linjene finnes.
Rettet her i stedet for stilltiende fjernet, fordi et funn som forsvinner uten spor er hvordan
et annet funn overlever.*

**Dom: FAITHFUL.**

## L. Live — `v6:3342-3458`

**LASTET** (`live.default`) **og lest fra kilden** (`LiveStage.tsx` 326).

**(a) mangler helt** — **«Lagtavle»** (`v6:3441-3453`), som er quiz. **BESLUTTET — Q84.**

**(d) vårt, og riktig** — bundelen tegner fire ekstra paneler som fulle flater: Ordsky,
Prioriteringsøvelse, Deltakerspørsmål, Kunngjøringsskjerm. Appen har alle fire **som navngitte
utilgjengelige kort** (`live.cloudTitle`/`cloudGated`/`cloudEmpty`, `priorityTitle`/
`priorityUnavailable`, `audienceTitle`/`audienceUnavailable`, `closingTitle`/`closingUnavailable`,
`fullscreenTitle`/`fullscreenUnavailable`). Det er den ærlige behandlingen: flaten er der, og den
sier hvorfor den er tom, i stedet for å fylle den med oppdiktede tall.

**Dom: FAITHFUL, med navngitte avslag.**

## H. Hjelp — `v6:3459-3664`

**LASTET** (`hjelp.default/artikkel/kontakt`) **og lest fra kilden** (`HelpScreen.tsx`).

**(a) mangler helt** — **forumfanen** (`v6:3590-3622`: forumstatistikk, «Spør de andre som holder
på med det samme», «Nytt innlegg», trådliste). **BESLUTTET — Q74**, og `HelpScreen.tsx:118` sier
det i klartekst: to faner, ikke tre; forumet er ikke bygget og tegnes ikke som om det var.

**(d) vårt, og riktig** — «Driftsstatus» og kontaktkanalene finnes, men sier hva som ikke er satt
opp: `help.statusNone` «Vi publiserer ikke driftsstatus ennå», `help.channelsNone` «Chat, telefon
og fast rådgiver er ikke satt opp ennå». Samme disiplin som bunntekstens fjernede statuspåstand.

**Dom: FAITHFUL.** Artikkelvisningen har både de nummererte stegene (`HelpScreen.tsx:260`) og
mock-panelet med bildetekst (`:304-324`) — begge kandidater fra sveipet som IKKE var hull.

## T. Handlinger / Arbeidsliste — `v6:3665-3911`

**LASTET** (`oppgaver.default/lovpalagt/rad-apen/tavle/tom`) **og lest fra kilden.**

**(a) mangler helt**
- **«Lukk valgte»** i massehandlingslinjen (`v6:3763`) og **«Lag tiltak»** på en
  tilbakemeldingsrad (`v6:3855`). **BESLUTTET — V5-2**, og festet som egenskaper i
  `tests/unit/worklist-rows.test.ts`.

**Dom: FAITHFUL.** Brødsmule, eierpanel, omfangsrail, typerail i skallet, listevisning med
bøtteoverskrifter og avkrysning, tavlevisning, radutvidelsen med stegene, tildeling, frist,
«Flytt ett steg», anonymitetsnotatet, svartråden og de interne notatene er alle bygget.

## A. Administrasjon — `v6:3912-4603`

**LASTET** (ti fanetilstander) **og lest fra kilden.** 299 `admin`-nøkler + 119 `integrations`.

**(a) mangler helt**
- **subnav-stripen** — **BESLUTTET**, S2.
- **«Inviter bruker»-knappen i sidehodet** (`v6:3920`). Invitasjon finnes på Brukere-fanen
  (`admin.invite`); knappen i hodet gjør ikke. **FORENKLING (triviell).**
- **«API-nøkkel»- og «Webhooks»-kortene** (`v6:4470-4492`). **BESLUTTET** og skrevet ned to
  steder: `IntegrationsPanel.tsx:19` og `lib/directory/catalogue.ts:20`.
- **Målgrupper: «Frosne medlemskap»** (`v6:4321-4334`) og **«Endringslogg»** (`v6:4337-4350`).
  Fryse-semantikken ER bygget i databasen (V2-3a/Q64, `audience-freeze`), og
  `audit`-hendelsene finnes. **FORENKLING** — to lesere som mangler over data som er der.
- **Målgrupper: «Importer til en målgruppe»** med **«Feltmapping»** (`v6:4192-4262`). Import
  finnes på Send; den biblioteksrettede importen med kolonnemapping og
  total/nye/duplikat/reservert/ugyldig-oppsummeringen finnes ikke. **FORENKLING.**
- **«Synkroniser nå»** (`v6:4273`). **BESLUTTET de facto** — `admin.mgSyncUnavailable`.
- **Profil og avsender: «Låst per mal»** (`v6:4068-4080`) og **«Standard emnefelt»** per språk
  (`v6:4083-4094`). **FORENKLING.** Avsenderkortet selv er **BESLUTTET utsatt**
  (`admin.brandSenderDeferred`).

**(d) vårt** — appens fanerail har **ni** faner mot bundelens åtte `adminTabs`: Språk er vår
(oversettelsesredigereren). Dokumentert.

**Dom: NEAR-FAITHFUL, med fem navngitte hull i Målgrupper og Profil og avsender.**

## BI. Bibliotek — `v6:4604-4837`

**LASTET** (`bibliotek-maler.default/lovpalagt/liste`, `bibliotek-bank`,
`bibliotek-firmaets-maler`, `bibliotek-leser`) **og lest fra kilden.**

**STYRT AV ELDRE BUNDEL (v5) — ingen v6-fase rører Bibliotek**, og v6 tegner hodet på nytt.
Ført som informasjon, ikke som gjeld:

- **«På tvers»-kortet** `v6:4626-4638` — S4, fjerde forekomst. Mangler.
- **32px-overskrift + tellelinje + ingress** (`v6:4621-4623`) mot appens Handlinger-ramme
  (brødsmule, helteikon, kort) — **BESLUTTET, Q172 + D170**, der helteikonet uttrykkelig er
  loggført som vårt.
- `v6:4670` bruksområde-ingressen «Seks områder HeiTuva brukes til …» — appen har egen ordlyd.
  **BESLUTTET** — `use_cases` er data, og antallet er en opptelling av raden som finnes.
- Listevisningen (`isListView`, `v6:4697`) og kortvisningen (`isCardView`) finnes **begge**
  (`bibliotek-maler.liste` er fanget). **Dette er den ene skjermen der visningsvelgeren
  overlevde.**

**Dom: FAITHFUL mot v5, som er bundelen den styres av.**

## SE. Send — `v6:4838-5177`

**LASTET** (`send.default/import-open/sms/recurring/arbeidsflate-kunder`) **og lest fra kilden**
(`SendScreen.tsx` 980, `CustomCadence.tsx` 153).

**(a) mangler helt — fem flater, og den første er den største**

| flate | bundel | målt |
|---|---|---|
| **«Avsender og utseende»** — avsendervalg, aksentfargevalg, emnefelt, e-postforhåndsvisning med «Svar nå», og `hasBrandOverride`/«Nullstill» | `v6:4946-4992` | `grep -E 'senderOptions\|accentOverride\|brandPreview' SendScreen.tsx` → **null** |
| **«Sendes»-velgeren** — Med en gang · Mandag 09:00 · Fredag 15:00 | `v6:5125-5131` | null |
| **«Last ned PNG» / «Plakat A4»** på QR-kortet | `v6:5016-5017` | null |
| **«Prøv eksempelfil»** i importarket | `v6:4888` | null |
| **«Lagre som målgruppe» / «Åpne Målgrupper»** | `v6:4893-4898` | null |

Avsenderkortet er den vesentlige: bundelen lar en utsending **overstyre** merkevaren
(`overrideNote`, «Nullstill»), mens appen bare har organisasjonens faste merkevare på
Administrasjon → Profil og avsender. Det er en flate, ikke en innstilling.

**Dom: NEAR-FAITHFUL i kroppen** — kanalkortene, importarket med alle seks kilder og `.xlsx`-
avslaget, mottakerlisten, målgruppevelgeren med blandingsadvarselen, hyppighet med tilpasset
kadens, rundeantall, rotasjon, leveringsmodusene, påminnelse og testutsending er alle bygget
(151 `send`-nøkler) — **men fem navngitte flater mangler.**

## RE. Respondentflaten `/s/[token]` — `v6:5178-5578`

**LASTET** (`respondent.default/answered/required-blocked`, `respondent-closed`, desktop og mobil)
**og lest fra kilden** (`Respondent.tsx`, `QuestionInput.tsx`, `Shell.tsx`, `CommentThread.tsx`,
`QuestionComment.tsx`, `PeerResults.tsx`).

**(a) mangler helt — tre, og alle tre står i Q186 som «i omfang»**

| flate | bundel | i appen |
|---|---|---|
| **`rlAnonOpen` — «hva betyr dette?» → arket «Slik behandles svaret ditt»** med `rlAnonRows` | `v6:5234-5260` | **nei** — 84 `respondent`-nøkler, ingen av dem dette |
| **`rlSkipShow`** — «Svar likevel» / «Gå videre» når et obligatorisk spørsmål hoppes over | `v6:5282-5288` | **nei** |
| **`rlSections`** — seksjonsprikker og seksjonsetikett over fremdriftslinjen | `v6:5266-5274` | **nei** |

`rlShowBar` og `rlShowTime` ER bygget, i annen form: en fremdriftslinje styrt av
`show_progress` (`Respondent.tsx:381-386`) og `respondent.secondsLeft` / `takeYourTime`.
`rlHasResume` er **BESLUTTET bort — Q186** (en andre skriveveg mot invariant 2).

**`rlAnonOpen` er det som betyr noe, og Q187 peker rett på det.** Beslutningen sa at
oppbevaringssetningen skal interpoleres fra `organizations.retention_months` **begge steder**.
`privRows` er gjort (D.7). `rlAnonRows` kan ikke gjøres, fordi arket det står i ikke finnes — så
respondenten har i dag **ingen** opplysning om oppbevaring på sin egen flate, verken riktig eller
gal. **FORENKLING**, og den eneste i revisjonen som ligger på en respondentflate.

**(c) kopi**
- `v6:5529-5530` «Du sa · vi gjorde» / «Fra forrige runde. Dette er grunnen til at det er verdt å
  svare igjen.» finnes ikke. `respondent.peerTitle`/`peerNote` er Q47s andre flate.
  **FORENKLING (liten).**

**Dom: NEAR-FAITHFUL på selve spørreløpet** — alle tretten typer, quizfliser, matrise, rangering,
skyvebryter, nedtrekk, bildevalg, oppfølgingsspørsmålet, kommentar per spørsmål, samtaletråden,
takkeskjermen, testmodus-rammen og de tre sluttilstandene (lukket/erstattet/allerede svart) er
bygget — **men respondentens egen anonymitetsopplysning mangler.**

## RS. Resultater — `v6:5579-5857`

**LASTET** (`resultater.default/for-fa-svar/ikke-sendt/tema-valgt/bransje-valgt`) **og lest fra
kilden** (`ResultsScreen.tsx` 874, `AttributedTable.tsx` 270, `RoundsPanel.tsx` 102,
`TeamBoard.tsx` 61, `ShareThemes.tsx` 45).

**(a) mangler helt** — ingenting navngitt.

**Dom: FAITHFUL.** Undersøkelsesvelgeren, statistikkortene, «Svar per virksomhet» med filtre, CSV-
eksport og radutvidelsen, «Runde for runde», resultatblokkene med skjulte celler og
terskelnotatet, «Hva svarene forteller» med innsiktene, «Mot bransjen», «Mot forrige runde» med
lagscorene, «Temaer i frisvarene» med deling, «Legg til et svar» og «Tilbake til oversikten» — alle
bygget.

---

# DEL III — SKJERMER v6 IKKE TEGNER

Dømt mot bundelen de ble bygget fra, per `docs/v2/00-diff.md § 0.3`. Ført opp for fullstendighet;
**ingen av dem er funn i denne revisjonen**, fordi v6 ikke sier noe om dem.

| skjerm | rute | styrt av | status |
|---|---|---|---|
| Splash | `/` | **v2** (V2-8) — v3, v4, v5 og v6 leverte ingen splash-fil | bygget, `verify:splash` |
| Logg inn | `/logg-inn` | original | bygget |
| Kom i gang | `/kom-i-gang` | original | bygget |
| Bruksområder | `/bruksomrader` | **v2** (V2-8) — samme grunn som splash | bygget |
| Personvern, Databehandleravtale | `/personvern`, `/databehandleravtale` | original, kopi flyttet av Q55 | bygget |
| Delt rapport | `/r/[token]` | original | bygget, fanget av `verify:export` |
| Kortlenke | `/l/[code]` | ingen bundel | vår |
| Testmodus | `/undersokelser/[id]/test` | **v2** (V2-7) | bygget; v6 tegner den som `testMode` inne i respondentflaten (`v6:5180-5199`), som appen gjør i egen rute |
| Integrasjoner + Entra-detalj | `/administrasjon/integrasjoner[/entra]` | **v5**, omskrevet av I2 | bygget. v6 tegner dem på nytt (`v6:4355-4497`); **ingen v6-fase rører dem**, så de er STYRT AV ELDRE BUNDEL. De tretten integrasjonene er **BESLUTTET** ikke bygget |
| Quiz | ingen egen rute | **v2** (V2-10) | `QuizPanel` i Byggeren; `quizPass`/`quizTries`/sertifikat **BESLUTTET** bort (Q84) |
