# Fidelitetsrevisjon — sammendrag

Mot **v6** (md5 `7c25573d…`, 10152 linjer), på `9a54a99`. Metode og avgrensning i `00-method.md`;
bevis per skjerm i `01-per-screen.md`. **Ingen produktkode er endret.**

---

## 1. Rangering — hvor langt hver skjerm er fra tegningen

**Målet, sagt rett ut:** skjermene er rangert etter **antall navngitte flater som ikke finnes i
appen i det hele tatt** (spørsmål a). Formsubstitusjoner (b) teller nest mest, egenskaper og kopi
(c) minst. Dette er ikke et piksel-mål: en manglende tabell og en feil `padding` er ikke samme
sak, og en rangering som blander dem sier ingenting. Beslutninger og eldre-bundel-styring er
**holdt utenfor tallene** og ført i egne kolonner, fordi de ikke er gjeld.

| # | skjerm | mangler helt (a) | annen form (b) | egenskap/kopi (c) | holdt utenfor |
|---|---|---|---|---|---|
| 1 | **Undersøkelse-detalj** | **hodet med sju faktarader, svarmåler, KPI-kort og fordelingsstripe** · **28 underfaner i sju railer** · Invitasjon-visningen · Bølger-visningen · Resultatmatrisen · Sammenligningen · Type+Kilde på Målgruppe · Hjemmel+Eier+Frist på Tiltak | Spørsmål→Byggeren · Utsending→Send | fanerekkefølge | Oversikt-fanen, Feltarbeid, Målgruppes frafall, Metodikk-fanen, Historikks form, Leveranse (D133) |
| 2 | **Undersøkelser** | subnav-rail · brødsmule · ingress · **«På tvers»** · **visningsvelger** · **blandingsstripe** · **sekskolonners tabell** · fem radikoner · utvidbar rad · «Liste og detalj»-panel | **tabell→kort** · **omfangsfiltre→statusfiltre** · svTuva-plassering | h1 32→28px · tellelinje | — |
| 3 | **Send** | **«Avsender og utseende»** (fire kontroller + forhåndsvisning + overstyringsnotat) · «Sendes»-velger · «Last ned PNG»/«Plakat A4» · «Prøv eksempelfil» · «Lagre som målgruppe» | — | — | — |
| 4 | **Skallet (Tuva)** | **hele panelet** — spørsmålsfelt, chips, svar med kilde og handling, tipskort, fremdriftsliste, boble — på ~12 skjermer | — | — | bryter, tommel, `tvTrackOpen` (Q183) |
| 5 | **Administrasjon** | «Frosne medlemskap» · «Endringslogg» · «Importer til en målgruppe» + «Feltmapping» · «Låst per mal» · «Standard emnefelt» · «Inviter bruker» i hodet | — | — | subnav, API-nøkkel, Webhooks, Synk, avsenderkortet |
| 6 | **Respondentflaten** | **`rlAnonOpen` — «Slik behandles svaret ditt»** · `rlSkipShow` · `rlSections` | `rlShowBar`/`rlShowTime` → linje + sekunder | «Du sa · vi gjorde» | `rlHasResume` (Q186) |
| 7 | **Skallet (delte flater)** | **brødsmule på 4 av 6 skjermer** · **«På tvers» på 4 av 4** · subnav på `surveys` · tre Innsikt-piller | — | — | subnav på `admin` (D164), bibliotek-rail (Q172) |
| 8 | **Byggeren** | «Metodikk»-fanen med antallsmerket · metakortets sammenslåtte tilstand | Metodikk→panel i Innstillinger | lint-kopi | banneret, quizPass/quizTries |
| 9 | **Innsikt / Dashboard** | «Nøkkeltall»-overskrift | — | tre parafraser, ingen av dem funn | — |
| 10 | **Rapporter** | — (bare de delte, rad 7) | — | — | — |
| 11 | **Bibliotek** | «På tvers» (rad 7) | Handlinger-rammen | — | **styrt av v5** — Q172, D170 |
| 12 | **Oversikt** | — | — | «Oppsett:»-linjen | nps-kortet (Q126), «Fire» (Q121) |
| 13 | **Live** | — | — | — | Lagtavle (Q84); fire paneler bygget som navngitte avslag |
| 14 | **Hjelp** | — | — | — | forumet (Q74) |
| 15 | **Handlinger** | — | — | — | «Lukk valgte», «Lag tiltak» (V5-2) |
| 16 | **Resultater** | — | — | — | — |
| 17 | **Veiviseren** | — | — | — | — |
| 18 | **Profil** | — | — | — | — |

**Seks skjermer har null funn i alle fire kategoriene.** Det er ikke et tilfeldig utvalg, og hvilke
fem det er, er selve klasseanalysen — se § 2.7.

---

## 2. KLASSEANALYSEN — hvilken SLAGS forenkling som gjentar seg

Instruksen er tydelig: mistet fire skjermer et sidepanel, er det ett funn og ikke fire. Under er
mønstrene, og hvert av dem dekker flere av radene over.

### 2.1 Den delte flaten, bygget der fasen tilfeldigvis sto

**Det reneste mønsteret, og det som forklarer hele rad 7.**

| flate | tegnet på | bygget på |
|---|---|---|
| brødsmule | 6 skjermer | **2** — Bibliotek og Handlinger |
| «På tvers»-kortet | 4 skjermer | **0** |
| subnav-rail | 6 skjermer | 5, og skjæringen stemmer ikke — `surveys` mangler, `bibliotek` er lagt til |

Brødsmulen ble bygget i V5-1/Q172, på de to skjermene de fasene hadde åpne, og aldri forplantet.
«På tvers» hadde ingen fase i det hele tatt. **En delt flate har ingen eier når fasene er per
skjerm**, og ingen port kan se at den mangler på skjerm fem når den finnes på skjerm én og to.

Dette er også hvorfor det ER ett funn: å bygge brødsmulen fire steder til er ett stykke arbeid,
ikke fire.

### 2.2 Sidehodet som var to kolonner og ble én

Fire skjermer — Undersøkelser, Innsikt, Rapporter, Bibliotek — har i tegningen et
**togkolonners rutenett** (`v6:2130`: `minmax(0,1.1fr) minmax(330px,.9fr)`): tittel, telling og
ingress til venstre, «På tvers»-kortet til høyre. **Alle fire er enkolonners i appen**, med
knappene flyttet til høyre marg.

Dette er 2.1 sett fra layoutsiden, og verdt en egen linje fordi konsekvensen er strukturell:
kortet er ikke et tillegg man kan lime på — det er den andre halvdelen av et rutenett som ikke
finnes.

### 2.3 Visningsvelgeren: tre visninger ble den sist tegnede

Undersøkelseslisten har i tegningen **tre** visninger — `Liste` (tabell, standard),
`Liste og detalj`, `Kort` (`v6:8947`). Appen bygde **Kort** og gjorde den til den eneste. Og
`Kort` er den bundelen tegner SIST i markup (`v6:2394`), altså den man leser til slutt.

**Motbeviset står i samme revisjon og er derfor viktig:** Bibliotek har to visninger i tegningen
(`isListView` / `isCardView`, `v6:4697`/`4718`) og **begge er bygget**
(`bibliotek-maler.liste` er fanget). Så dette er ikke en systemisk regel om hvordan vi bygger
visningsvelgere — **det er én skjerm, og den kunne vært gjort riktig**, hvilket gjør den til en
forenkling og ikke en begrensning.

### 2.4 Lesevisningen som ble slått sammen med redigeringsskjermen

**To faner, samme feil.**

- `sporsmal` → `/bygg`. Tegningen har en skrivebeskyttet sjukolonners tabell MED en «Åpne
  byggeren»-knapp ved siden av (`v6:1377`) — bundelen sier selv at de er to skjermer.
- `utsending` → `/send`. Tegningen har sju underfaner som VISER en utsending som er satt opp;
  appen viser verktøyet som SETTER den opp.

Konsekvensen er ikke bare et annet oppsett: **kolonnene som bare gir mening i en lesevisning
forsvinner med den.** Tema, Besvart og Snitt per spørsmål; Invitasjonen som den faktisk ser ut;
bølgeplanen. De er ikke fravalgt — de hadde ingen skjerm å ligge på.

### 2.5 Det andre navigasjonsnivået kom aldri

28 underfaner i sju railer (`v6:7139-7151`) → **null**. Tre av fem Innsikt-piller → borte.

Appen bygger railer på ett nivå. Der tegningen har rail-i-rail, blir det ene nivået til en side
som ruller — Resultater er det klareste eksemplet: seks underfaner ble én 874-linjers skjerm som
faktisk inneholder fire av dem.

**Dette er den dyreste klassen å rette**, fordi hver underfane er en egen datavei, og fordi to av
dem (Matrise, Sammenligning) overlapper med Dashboard.

### 2.6 Hjelperen som la ut dataene sine og ikke skjermen sin

Tuva står alene, og er derfor sin egen klasse — men formen er kjent: **et register uten leser.**
`lib/tuva/answers.ts` importeres bare av sin egen test; 36 `tuva.*`-meldinger er sådd i begge
språk og når ingen skjerm.

Det er CLAUDE.md-invariant 8 — «hvem SKRIVER denne kolonnen?» — speilvendt: her finnes skriveren
og **leseren mangler**. Og det er den formen ingen port kan se: en melding uten leser er per
konstruksjon usynlig for en port som ser på rendrede sider.

### 2.7 Motbeviset, og det er det viktigste i hele sammendraget

**Seks skjermer har null funn: Veiviseren, Resultater, Handlinger, Hjelp, Live og Profil.**

De har én ting felles: **hver av dem var hele oppdraget til minst én fase.** V1-2/V1-6 for
Resultater, V5-2 for Handlinger, V2-6/Q74 for Hjelp, V2-9 for Live, V1-5 for Veiviseren, V2-2 for Profil.

Og de gjør noe mer enn å være komplette — de **navngir det de ikke kunne bygge**: Live har fire
utilgjengelige paneler med grunn, Hjelp sier at driftsstatus og chat ikke er satt opp, bunnteksten
fjernet fire påstander og skrev ned hvorfor (D164), Målgruppe skriver sin avslåtte halvdel inn i
siden. **Disiplinen finnes og den virker.**

> **Så konklusjonen er ikke at vi forenkler. Den er at vi bygger det en fase eier, fullt og ærlig,
> og at det ingen fase eier ikke blir bygget i det hele tatt — og at ingenting i apparatet kan se
> forskjell på de to.**

Hver eneste forenkling i § 1 ligger på en flate som var **delt** (brødsmulen, «På tvers»,
subnaven, Tuva), **sekundær i sin fases oppdrag** (undersøkelseslistens tabell, Sends
avsenderkort, Målgruppers fryselogg), eller **på en skjerm ingen fase har hatt som oppdrag**
(undersøkelse-detaljens hode).

---

## 3. HVORFOR INGEN PORT FANGET DET

Dette er argumentet for at revisjonen finnes, så det står rett ut.

### 3.1 Pikselpakken dekker TRE skjermer, og den sier selv at den ikke er et fidelitetsbevis

`verify:visual` kjører Playwright-pakken i `tests/visual/screens.spec.ts`. Den har **seks
committede baselines over tre skjermer** — `logg-inn`, `logg-inn-feil`, `veiviser-formal`, hver i
desktop og mobil (`ls tests/visual/screens.spec.ts-snapshots` → 6 filer). **Undersøkelseslisten er
ikke blant dem.** Ingen av de atten skjermene i § 1 er det, med unntak av Veiviserens første steg.

Grunnen står i filens egen topptekst og er god: de andre skjermene leser fra en database som
muterer på hver kjøring, og en baseline over dem ville feilet av grunner som ikke har noe med
diffen å gjøre — «a suite that cries wolf gets switched off».

**Og filen sier allerede, ordrett, det denne revisjonen konkluderer med:**

> «WHAT THESE BASELINES ARE, AND ARE NOT. They are regression guards: they catch a screen changing
> when nobody meant it to. **They are NOT proof of fidelity to the design — they were generated
> from this implementation, so they can only ever confirm it still looks like itself.**»
> — `tests/visual/screens.spec.ts:21-24`

Det er nøyaktig riktig, det ble skrevet ned, og det stoppet ingenting.

### 3.2 Setningen rett etter den peker på en port som ikke lukker hullet

Samme kommentar fortsetter:

> «`npm run verify:reference` is the fidelity gate; it renders the design bundle and compares
> against that.» — `tests/visual/screens.spec.ts:24-25`

**Første ledd er sant, andre ledd er ikke.** `scripts/verify/reference.ts` sier i sin egen
topptekst hva den gjør: «Captures the design prototype itself, screen by screen … Run once per
design-bundle update; **commit the PNGs**.» Den **produserer** bilder av tegningen og
sammenligner dem mot sine egne committede bilder av tegningen. Det den kan oppdage er at en
baseline driver under en ny Chromium — hvilket er en reell fare og grunnen til at den finnes.
**Den ser aldri på appen.** Den er et referansemateriale, ikke en port over produktet.

Så den ene setningen i repoet som navngir hullet, peker i samme åndedrag på en port som ikke
lukker det. Det er den samme formen CLAUDE.md allerede fører tabell over: **en påstand om hva et
apparat fastslår, som ingen har utledet på nytt.**

### 3.2b De to bildesettene finnes, og ingenting sammenligner dem

Repoet inneholder **begge halvdeler**:

- `artifacts/reference-v6/*.png` — 35 renderinger **av tegningen** (`verify:reference`)
- `artifacts/phase-*/*.desktop.png` — 205 renderinger **av appen** (`verify:browser`)

`grep -rln "reference-v6" scripts/ tests/` gir **én fil: `scripts/verify/reference.ts`**, altså
den som lager dem. Ingenting leser dem igjen. De to settene ligger i samme mappe og har aldri møtt
hverandre.

Sammenligningen som avgjorde denne revisjonen tok to filer og ett blikk:
`artifacts/reference-v6/undersokelser.png` mot
`artifacts/phase-2/undersokelser.default.desktop.png`. Det er ikke et manglende verktøy — det er
en manglende sammenligning mellom to verktøy vi allerede kjører.

**Hvorfor det likevel ikke er en port man bare slår på:** en tegning og en app viser ulike data,
ulik tekstlengde og ulike tilstander, så en pikseldiff mellom dem ville vært rødt overalt og
verdiløs. Det som ville virket er en **strukturell** sammenligning — finnes flaten — og det er
nøyaktig det denne revisjonen gjorde for hånd. Apparatet er fryst (VERIFY.md), så dette er
loggført, ikke bygget.

### 3.2c Og det som faktisk dekker de andre 202 skjermbildene, måler ikke utseende

`verify:browser` er harnesket som fanger alle de andre skjermene. Det feiler på
**konsollfeil, HTTP-feil, uventede redirects og uoversatte nøkler** — og det gjør den jobben godt;
den fanget 205 tilstander uten feil i denne økten. **Den sammenligner ingen piksler mot noe.** En
skjerm som mangler halvparten av tegningen sin laster like rent som en som ikke gjør det.

### 3.3 Hver port måler noe annet enn tilstedeværelse

| port | hva den kan fastslå | hvorfor den er blind her |
|---|---|---|
| `verify:visual` | **tre** skjermer ser ut som forrige gang | baselinen er appens egen, og listen er ikke blant de tre |
| `verify:browser` | 205 tilstander laster uten konsollfeil, HTTP-feil, redirect eller uoversatt nøkkel | den sammenligner ingen piksler mot noe |
| `verify:reference` | bundelen renderer, 35 filer, 35 hasher | den ser aldri på appen |
| `verify:responsive` | to kontroller overlapper ikke ved 320/390px | en flate som ikke finnes kan ikke overlappe |
| `verify:i18n` | en engelsk side viser norsk tekst | **CLAUDE.md-tabellens rad 12**: den kan bare rapportere defekter som kolliderer med en streng den allerede har. `tuva.*` har ingen leser, så ingen side kan vise dem, så porten ser dem aldri |
| `verify:copy` | terskelsetninger interpolerer `{k}` | den ser på strenger, ikke skjermer |
| `verify:policy` (5a3) | hver RLS-tabell og definer-funksjon er beskyttet OG bevist | **en komponent er ikke en katalogflate** |
| census | ingen testfil sjekker færre enn før | den teller tester, ikke flater |
| Playwright e2e | fasens egne flyter går gjennom | fasens egne |

**Ingen rad i tabellen kan svare på spørsmål (a).** «Finnes denne flaten» er ikke en egenskap noen av portene måler — ikke fordi noen glemte det, men fordi hver port sammenligner produktet med seg selv, og en flate som aldri ble bygget er like fraværende i baselinen som i koden.

### 3.4 Og den strukturelle grunnen, som er den samme som CLAUDE.md allerede skriver ned

To ting i apparatet gjør denne klassen usynlig ved konstruksjon:

1. **VERIFY.md krever «alle tilstander fra designet nåbare».** «Designet» løses opp til
   *bundelen den fasen bygde fra*, avgrenset til *skjermene den fasen rørte*. En flate ingen fase
   rørte er ikke i noen fases definisjon av ferdig. **Definisjonen er korrekt og fullstendig for
   hver fase, og summen av dem dekker ikke produktet.**
2. **Bundeldiffen mellom handoffs teller `sc-if`-nøkler.** Den sier hva et handoff LA TIL, og
   CLAUDE.md sier allerede at bare lesing av linjene sier hva det endret BORT. Denne revisjonen
   legger til en tredje ting den ikke kan si: **en flate appen aldri bygde gir ingen
   nøkkelendring i det hele tatt.** Den er usynlig for den ene sammenligningen prosjektet faktisk
   kjører mellom bundler.

Det er den samme formen som resten av dette prosjektet har snudd på: **bevis som var til stede og
ble feiltolket.** Alle 35 bildene av tegningen lå i `artifacts/`. Alle 205 bildene av appen kunne
lages med én kommando. Det som manglet var setningen som setter dem ved siden av hverandre.

---

## 4. Det som må ut av denne revisjonen uansett hva som prioriteres

- **Én levende defekt.** `lib/tuva/analyst.ts:70-74` og `:76-80` — teller og nevner over ulike
  populasjoner. `«700 % har svart»` og `«ligger lavest på 100 %»` reproduserer fra
  produksjonsdata i dag, øverst på `/undersokelser`. Rapportert separat; ikke rettet her.
- **Én måling som må korrigeres.** `docs/v2/00-diff.md § 0.3e` fører «Alle tjenester kjører
  normalt» som fjernet av v6. Den ble **omskrevet** til «Alle tjenester i normal drift»
  (`v5:7674` → `v6:8596`), og versjonslinjen likeså (`v5:7675` → `v6:8597`). Avslag som landet er
  **tre, ikke fire**. Bunnteksten vår er riktig som den er.
- **Én halv beslutning uten sted å lande.** Q187 sa «interpoler oppbevaringen fra
  `organizations.retention_months`, begge steder». `privRows` er gjort; `rlAnonRows` kan ikke
  gjøres fordi arket ikke er bygget — så respondenten har ingen oppbevaringsopplysning på sin egen
  flate. Det er den eneste forenklingen i revisjonen som ligger på en respondentflate.
- **Én død modul med levende kopi.** `lib/tuva/answers.ts` + 36 meldinger i to språk, ingen leser.

**Ingen plan.** Den er din når du kan se helheten.
