# Fidelitetsrevisjon — metode, avgrensning og hva som faktisk ble målt

**En måling, ikke en fase.** Ingen produktkode er endret. Funn samles; de rettes ikke.

Utført 2026-09-14 på `9a54a99` (branch `claude/vedlagt-md-instruksjoner-qya32n`, identisk med
`origin/main` — null divergens, verifisert med `git log --oneline origin/main` og
`git merge-base origin/main HEAD` før noe ble lest som bevis).

---

## 0. Hvilken bundel er autoritativ — avklart før noe annet

Instruksen ga to filer og ba om at spørsmålet ble avgjort først.

| fil | md5 | linjer | distinkte `sc-if`-nøkler |
|---|---|---|---|
| `HeiTuva.dc_4.html` (vedlagt) | `07fc1e2cc4df7cb10c2ec6ce6c3806e7` | 10109 | 295 |
| `design-reference-v6/…/HeiTuva.dc.html` (installert) | `7c25573daee30103642ccf67781b44f4` | 10152 | 298 |

**Tilstandsdiffen er ensrettet.** v6 har tre nøkler `dc_4` mangler — `svTuvaFloat`, `svTuvaOpen`,
`svTuvaSide` — og `dc_4` har ingen v6 mangler. Linjediffen er fem hunks: **9 linjer bare i
`dc_4`** (en generisk `surveys:`-oppføring i den delte `tuvaFor`-mappen, med tre tips, blant dem
«Se hvem som mangler → Feltarbeid») og **52 linjer bare i v6** (det dedikerte svTuva-panelet, i
begge sine former). Det er en **erstatning**, ikke et tillegg.

**Konklusjon: den installerte v6 er gjeldende. `dc_4` er tidligere.** Alt under er målt mot v6.

## 0.1 Hva «mot bundelen» betyr når sju bundler finnes

CLAUDE.md og `docs/v2/00-diff.md § 0.3` sier at **en flate dømmes mot bundelen den ble bygget
fra**, ikke mot den nyeste. Det er riktig for et byggeoppdrag og ville gjort denne revisjonen
verdiløs: undersøkelseslisten var «riktig» mot sin egen bundel hele tiden.

Så denne revisjonen måler **alt mot v6**, og klassifiserer hvert avvik i én av fire bøtter i
stedet for å kalle alt et funn:

| klasse | betyr |
|---|---|
| **BESLUTTET** | En avgjørelse i `DECISIONS.md` eller `docs/DEVIATIONS.md` sier at dette ikke skal bygges, eller skal bygges annerledes. **Ikke et funn.** |
| **STYRT AV ELDRE BUNDEL** | v6 har flyttet noe under en flate ingen v6-fase rørte. Informasjon, ikke gjeld — men det er her neste handoff vil koste. |
| **FORENKLING** | Flaten ble bygget mot en bundel som tegnet dette, og det ble ikke bygget. **Dette er klassen revisjonen finnes for.** |
| **VÅRT** | Finnes i appen, ikke i tegningen. Sjekket mot `DECISIONS.md` før det kalles drift. |

## 1. Metoden, per skjerm

Fire spørsmål i denne rekkefølgen, slik instruksen sier:

a. Hvilke flater finnes i tegningen og **ikke i appen i det hele tatt**?
b. Hvilke finnes i begge, men i **en annen form**?
c. Hvilke finnes i begge og **avviker i egenskaper**?
d. Hvilke finnes i appen og **ikke i tegningen**?

**Skjermlisten er utledet fra bundelen, ikke fra rutemanifestet.** Kommandoen er
`grep -n '<sc-if value="{{ is[A-Z]' <bundel>` over markup-regionen (linje 14–5952), som gir
seksten skjermgater pluss skallet, veiviseren og Tuva. Rutemanifestet har 39 `page.tsx`; det kan
per konstruksjon ikke navngi en skjerm appen aldri bygde.

### 1.1 Tre mekaniske sveip, og hva hvert av dem kan og ikke kan si

1. **Strukturell sveip** — hver `<sc-if>`/`<sc-for>`-gate og hver synlige tekstnode i bundelens
   markup, med linjenummer, mot appens komponenttre. Dette er sveipet som svarer på (a).
2. **Kopi-sveip** — 624 statiske tekstnoder i bundelen, 513 distinkte, matchet mot
   `messages/no.json`. **176 finnes ikke der.** Det tallet er en KANDIDATLISTE, ikke et funn:
   en flate kan finnes med annen ordlyd, og en streng kan mangle fordi en avgjørelse fjernet
   den. Hver av de 176 er lest før den er ført opp. Kommandoen ligger i `01-per-screen.md § 0`.
3. **Bildesammenligning** — `artifacts/reference-v6/*.png` (35 renderinger AV TEGNINGEN) mot
   `artifacts/phase-*/*.desktop.png` (205 renderinger AV APPEN, tatt på nytt i denne økten med
   `npm run verify:browser` — «captured 205, failed 0»).

**Hva sveip 2 strukturelt ikke kan se, og det er verdt å si rett ut:** en streng som ikke finnes
i noen tegning kan heller ikke mangle fra den. Sveipet finner bare det bundelen skriver ned.
Ikoner, spalteoppsett, tabeller uten overskrift og kontroller uten etikett er usynlige for det —
og en tabell rendret som kort (undersøkelseslisten selv) beholder hver eneste streng. **Sveipet
ville ikke ha funnet defekten denne revisjonen ble bestilt på grunn av.** Bare (1) og (3) fant
den.

## 2. Lastet eller lest fra kilden

**Begge, og det står per skjerm i `01-per-screen.md`.**

- **Kapabilitet målt før noe ble påstått** (`npm run verify:capability`, CLAUDE.md-regelen):
  `docker-daemon` OK (29.3.1), `local-db` OK (`migrations=148`), Chromium tilgjengelig.
  Produksjons-Postgres er som alltid uten rute herfra (CONNECT-proxy, 443 bare) — irrelevant for
  denne revisjonen, som leser lokalt.
- **205 app-skjermbilder ble tatt på nytt** i denne økten, desktop og mobil, 0 feil. Hver skjerm
  merket «LASTET» under er sett som bilde.
- **Alt er i tillegg lest fra kilden.** For spørsmål (a) er kilden det sterkeste beviset: en
  komponent som ikke finnes kan ikke rendre, og et skjermbilde av en flate som mangler ser ut
  som et skjermbilde av en skjerm.
- **Ingen skjerm var utilgjengelig.** Det er ingen «kunne ikke nås»-liste.

**Avgrensningen som gjenstår, sagt ærlig:** spørsmål (c) — farge, størrelse, vekt, avstand,
radius — er målt **stikkprøvevis**, ikke uttømmende. En uttømmende egenskapsdiff er
`verify:visual`s jobb, og den sammenligner appen mot baseline av appen (se `02-summary.md § 3`).
Der (c) er ført opp, er det fordi et av de tre sveipene traff det, ikke fordi hver egenskap på
hver kontroll er sammenlignet. **Revisjonen er derfor sterk på (a), (b) og (d), og delvis på
(c).**

## 3. Hva som er utenfor

- `legal.privacy*`-oppbevaringspåstanden, prod-synken av `M:0114`–`M:0119` og Vercel-deployen er
  Tors egne og bæres ikke som blokkere.
- Beslutte-ikke-bygget-flatene står som beslutninger og ikke som funn: Feltarbeid,
  Oversikt-fanen, Målgruppes frafallshalvdel, nps-kortet, cx-arbeidsflaten, uitest,
  `quizPass`/`quizTries`/`sertifikat`, og de tretten integrasjonene.
