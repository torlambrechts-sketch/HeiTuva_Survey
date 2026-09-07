# Designbrief — terskel, respondenttype og panelarketyper i HeiTuva

*Del A: terskel og respondenttype (Q17). Del B: dashboardarketyper. Del B forutsetter Del A — den attribuerte visningen er den samme skjermen begge steder.*

Til Claude Design. Utvider et eksisterende produkt; bruk HeiTuva-designsystemet («Varme») uendret: `--bg #FCF6E9`, `--sf #FFFDF6`, `--ink #191510`, `--mut #5F5849`, `--line #E8DFC9`, `--ac #F5C64A`, `--ac2 #A8D5D2`, `--ac3 #FBD5C4`, `--sbg #FBEBBE`, `--sbg2 #F6EEDD`, radius 16, skygge `0 2px 10px rgba(25,21,16,.05)`, Playfair Display / DM Sans / Bricolage Grotesque, 14px grunnstørrelse. Ingen nye farger, ingen nye komponenttyper der en eksisterende gjør jobben.

---

## Hva som endrer seg, og hvorfor det er et designproblem

HeiTuva viser i dag aldri resultater under fem svar, og lover respondenten at ingen kan slå opp hvem som svarte hva. Det gjelder fortsatt som standard. Men to ting skal nå kunne variere per undersøkelse:

- **Respondenttype.** Fysisk person (ansatt, kunde, medlem, innbygger) eller organisasjon (leverandør, tilbyder). Organisasjoner svarer på vegne av et selskap, og da er attribusjon hele poenget — en aktsomhetsvurdering etter åpenhetsloven er verdiløs hvis du ikke vet hvilken leverandør som svarte hva.
- **Terskel.** Standard 5, gulv 3 for personer, ingen terskel for organisasjoner. Lovpålagte maler bærer sin egen låste policy som ingen kan overstyre.

**Designproblemet er ikke innstillingen. Det er at løftet til respondenten og betydningen av tallene må endre seg sammen med den.** I dag er anonymitetsteksten fast. Den kan den ikke lenger være, og ingen skjerm der resultater leses kan late som om terskelen alltid er fem.

Gjennomgående prinsipp: **innstillingen skal aldri være det mest fremtredende på skjermen, men konsekvensen skal alltid være synlig der den betyr noe.** Den som lager undersøkelsen skal se hva hun lover. Den som svarer skal se hva som skjer med svaret. Den som leser resultatet skal se hva tallet hviler på.

---

## 1. Bygg — nytt panel «Hvem svarer og hva vises»

Plasseres i høyre pane under Innstillinger, over «Klar til utsending?». Ikke i engasjementspanelet — dette er ikke svarprosent, det er personvern.

**Standardtilstand (person, terskel 5).** Kollapsert oppsummering på én linje i eksisterende stil: *«Fysiske personer · anonyme svar · resultater fra 5 svar»* med «Endre» som sekundærknapp. De aller fleste skal aldri åpne dette.

**Utvidet tilstand.** Tre valg, i denne rekkefølgen:

1. **Hvem svarer** — to chips: `Fysiske personer` / `Organisasjoner`. Under chipsene én forklaringslinje som bytter: *«Ansatte, kunder, medlemmer eller innbyggere. Svarene beskyttes av en terskel.»* / *«Leverandører eller tilbydere som svarer på vegne av en virksomhet. Svarene vises med virksomhetens navn.»*
2. **Anonymitet** — eksisterende tre chips (Anonym / Med navn / Valgfritt). Ved `Organisasjoner` låses dette til «Med navn» og vises som låst, ikke skjult.
3. **Terskel** — vises bare ved `Fysiske personer`. Et lite tallvalg (3, 4, 5, 8, 10) med 5 forhåndsvalgt og teksten *«Anbefalt: 5»* under. Ikke fritekstfelt.

**Når terskelen settes under 5** vises en varselboks i `--sbg` (samme behandling som eksisterende advarsler, ikke rød): *«Med terskel 3 kan svar fra små grupper bli lettere å knytte til enkeltpersoner. Resultatene kan da regnes som personopplysninger, med de kravene til sletting og innsyn det innebærer. Vurder «Med navn» i stedet hvis dere faktisk ønsker å se hvem som har svart.»* Ingen bekreftelsesdialog. Setningen står, valget gjøres.

**Låst av mal.** Når undersøkelsen er laget fra en lovpålagt mal, vises panelet med feltene låste og en linje øverst: *«Låst av malen — Arbeidsmiljøloven § 4-3 krever anonyme svar og terskel 5.»* Lovhenvisningen kommer fra malen. Design en lås-tilstand som ser bevisst ut, ikke som en deaktivert knapp: felt i `--sf2`, en liten hengelås, forklaringen i `--mut`.

**Låst av at det finnes svar.** Etter første svar: samme visuelle behandling, annen tekst: *«Kan ikke endres etter at svar har kommet inn.»*

---

## 2. Bygg — advarsel når løftet ikke stemmer

Utvid den eksisterende anonymitetsadvarselen (den som utløses av skjemafelt som samler navn eller e-post). Nå skal den også dekke:

- Terskel under 5 kombinert med målgruppe merket som mindre enn terskelen — *«Gruppen har 4 mottakere. Med terskel 5 vil resultatet aldri vises.»* Dette er den viktigste nye advarselen: den fanger opp at noen har laget en undersøkelse som per definisjon aldri kan gi et resultat.
- Organisasjonsmodus med spørsmål som spør om enkeltpersoners forhold — *«Spørsmålet handler om enkeltpersoner, men svarene attribueres til virksomheten.»*

---

## 3. Send — «Klar til å sendes» må si det høyt

Oppsummeringen før utsending har i dag mottakere, kanal og tidspunkt. Legg til én rad med samme vekt som de andre:

*«Anonyme svar · resultater vises fra 5 svar»* eller *«Navngitte svar · attribuert til virksomhet»*.

Dette er siste sted noen kan oppdage at undersøkelsen lover noe annet enn de trodde. Ikke gjem det i en «vis detaljer».

---

## 4. Respondentflaten — løftet genereres, ikke kopieres

Dette er den viktigste skjermen i hele briefen. Teksten i anonymitetsbanneret er i dag fast. Den skal nå ha fire varianter, og designet må tåle at de har ulik lengde:

| Situasjon | Tekst |
|---|---|
| Anonym, terskel 5 | «Svarene er anonyme. Resultater vises først når minst fem har svart.» |
| Anonym, terskel 3 | «Svarene er anonyme. Resultater vises først når minst tre har svart. I små grupper kan svar likevel være gjenkjennelige.» |
| Med navn | «Svaret vises med navnet ditt.» |
| Organisasjon | «Du svarer på vegne av {virksomhet}. Svaret vises med virksomhetens navn og kan bli gjort offentlig tilgjengelig.» |

Andre setning i terskel 3-varianten er ikke pynt — den er forskjellen mellom et ærlig og et uærlig løfte. Design banneret så to linjer ikke ødelegger rytmen på mobil.

Ved «Valgfritt» beholdes dagens valg, men konsekvensteksten under hvert alternativ må også være avledet av terskelen.

---

## 5. Resultater — terskelen må være lesbar i tallet

**Ny linje under sidetittelen:** *«Resultater fra 5 svar eller flere»* i `--mut`, samme størrelse som dagens metalinje. Ved terskel 3: *«Resultater fra 3 svar eller flere — små grupper kan være gjenkjennelige.»*

**Utilstrekkelig data.** Dagens «—» beholdes, men får en forklarende tilstand ved hover/trykk: *«Vises fra 5 svar. Nå: færre.»* Aldri det faktiske antallet — det er i seg selv en opplysning om gruppen.

**Ny visning: attribuerte resultater.** Dette er den største nye skjermen. Ved `respondent_kind = organisasjon` gir ikke aggregering mening — hver leverandør er ett svar, og formålet er å lese dem enkeltvis.

Tegn den som en **tabell med én rad per virksomhet**: navn, svardato, status (svart / ikke svart / påminnet), og en sammendragskolonne for de mest kritiske spørsmålene (ja/nei-svarene i en aktsomhetsvurdering). Rad utvides til fullt svarsett. Filter på «har avdekket brudd», «mangler policy», «ikke svart». Eksport.

Dette er faktisk en *leverandøroversikt*, ikke en resultatskjerm — og bør se slik ut. Bruk eksisterende tabellmønster fra Administrasjon → Brukere, ikke resultatskjermens kortmønster. På mobil: rader blir kort per RESPONSIVE.md.

---

## 6. Rapporter — det vanskeligste problemet i briefen

**Terskelen må stå i rapporten.** En publisert rapport er et dokument som lever videre. Metodeseksjonen skal alltid vise hvilken terskel som gjaldt. Legg det inn som fast del av «Metode og spørsmål»-seksjonen: *«Resultater vises fra {N} svar. Grupper under terskelen er ikke brutt ned.»*

**Rapporter som blander undersøkelser med ulik terskel.** En rapport kan hente fra flere undersøkelser. Hvis én har terskel 5 og en annen 3, gjelder **den strengeste for hele rapporten** — alt annet ville la et dokument avsløre via én seksjon det en annen skjuler. Design:

- Ved valg av kilder i Filter-fanen: en linje som viser *«Strengeste terskel blant valgte undersøkelser: 5»*, som oppdateres når kilder legges til.
- Hvis en valgt kilde har lavere terskel enn rapporten bruker: *«Undersøkelsen «X» har terskel 3, men rapporten bruker 5.»* Informasjon, ikke feil.

**Ny rapportseksjon: «Svar per virksomhet».** For åpenhetsloven-rapporten. Tabellform, én rad per leverandør, valgbare kolonner. Denne seksjonen skal *ikke* kunne legges inn i en rapport som inneholder personundersøkelser — vis den som utilgjengelig med begrunnelse i seksjonsvelgeren, ikke skjult.

**Delingsomfang og terskel sammen.** «Alle ansatte»-lenken viser i dag samlet uten nedbryting. Med variabel terskel må delingspanelet vise begge deler i samme setning: *«Ledere ser bare sitt eget team, og bare der minst 5 har svart.»*

---

## 7. Bibliotek — malen bærer sin policy

På hvert malkort under lovpålagt-merket: en liten linje som viser policyen malen bringer med seg — *«Anonym · terskel 5 · låst»* eller *«Navngitt · organisasjon · attribuert»*. Dette gjør det synlig *før* valget at malen bestemmer, og fjerner overraskelsen i byggeren.

---

## 8. Administrasjon → Personvern

Dagens rad «Skjul resultater under 5 svar» er merket som alltid på. Erstattes av:

**«Standard terskel for nye undersøkelser»** med et tallvalg (3–10, standard 5) og forklaringen: *«Gjelder nye undersøkelser med fysiske personer. Lovpålagte maler har sin egen terskel som ikke kan endres. Enkeltundersøkelser kan settes høyere, aldri under 3.»*

Under: **«Tillat at redaktører senker terskelen»** — av som standard. Når den er av, kan bare administrator endre terskel på en enkeltundersøkelse.

Anonymitetsforklaringen i samme fane må skrives om: dagens tekst lover kategorisk fem. Ny tekst må si at anonyme svar aldri lagres med kobling til bruker (det er fortsatt kategorisk sant), og at terskelen for visning er fem som standard og aldri lavere enn tre.

---

## Tilstander som må tegnes

For hver skjerm over: normaltilstand, låst-av-mal, låst-av-svar, terskel under standard, organisasjonsmodus, og utilstrekkelig data. Det er kombinasjonene som er vanskelige — særlig rapport med blandede kilder og resultatskjerm i organisasjonsmodus.

## Hva som ikke skal designes

- Ingen bekreftelsesdialog for å senke terskelen. Setningen om konsekvensen holder.
- Ingen rød feilfarge noe sted i dette. Alt her er lovlige valg med ulike konsekvenser; `--sbg` og `--ac3` bærer alvoret godt nok.
- Ingen visning av et **svarutledet tall** under terskelen, noe sted, uansett rolle.
  Snitt, fordelinger, temaer og sitater er utledet av hva folk *svarte*, og skjules.
  Antall svar og svarprosent er derimot *deltakelse* — hvor mange **personer** som
  har deltatt, ikke hva noen sa — og vises som før, på undersøkelseslisten, på
  Oversikt og i deltakelsesseksjonen i rapporten. Briefen sa tidligere «faktisk
  antall svar», som motsier både produktet og designbundelen (radens «N av T»);
  DECISIONS Q28 avgjorde skillet 2026-09-06.
- Ingen ny innstilling for å slå av terskelen helt for personer. Den finnes ikke, og skal ikke finnes i grensesnittet heller.

---

# Del B — dashboard: fire arketyper, ikke ett per bruksområde

Panelet som vurderte utvidelse fant 36 bruksområder i seks kategorier (HR, kundeopplevelse, intern tjenestekvalitet, leverandørkjede, offentlig sektor, medlem og frivillighet). Fristelsen er ett dashboard per bruksområde. Det er feil vei: forskjellen mellom en CSAT-visning og en arbeidsmiljøvisning er etiketter, ikke struktur.

**Det som faktisk varierer er spørsmålsformen leseren stiller.** Der finnes bare fire:

| # | Arketype | Spørsmålet leseren stiller | Status |
|---|---|---|---|
| 1 | Aggregat over personer | «Hvordan står det til, og hvor er det verst?» | Finnes — dagens Dashboard og Resultater |
| 2 | Register per respondent | «Hvem har svart hva, og hvem mangler?» | **Mangler — må tegnes** |
| 3 | Pliktstatus over tid | «Hva må gjøres, av hvem, innen når?» | Finnes — Rapporter og Oversikt |
| 4 | Hendelsesstrøm | «Hvordan utvikler dette seg akkurat nå?» | **Mangler — må tegnes** |

Et «bruksområde-dashboard» er derfor et **forhåndsoppsett av paneler**, ikke en ny skjerm — på samme måte som en undersøkelsesmal er et forhåndsoppsett av spørsmål. Brukeren kan endre oppsettet etterpå.

## B1. Panelbiblioteket må bli synlig i grensesnittet

Dagens dashboard har faste paneler. Det skal bli et sett brukeren setter sammen:

- **«Legg til panel»** åpner et velgerpanel gruppert etter arketype, med samme mønster som seksjonsvelgeren i rapportredigereren. Gjenbruk det mønsteret — ikke tegn et nytt.
- Hvert panel i velgeren viser navn, én forklaringslinje, og om det krever data som ikke finnes ennå (*«krever runder over tid»*, *«krever organisasjonsrespondenter»*).
- Paneler som ikke passer det valgte utvalget vises som utilgjengelige med begrunnelse, ikke skjult — samme regel som «Svar per virksomhet» i rapportbriefen.

## B2. Forhåndsoppsett ved oppstart

Når en virksomhet åpner Dashboard første gang, tilbys tre til fire navngitte oppsett i stedet for en tom skjerm: *Arbeidsmiljø*, *Kundeopplevelse*, *Intern tjenestekvalitet*, *Leverandøroppfølging*. Tegn dette som valgkort i onboarding-mønsteret som allerede finnes på Oversikt, ikke som en modal.

**Viktig innholdsregel:** et forhåndsoppsett skal ikke inneholde sammenligningspaneler («Mot bransjen») før tallene er reelle. Et ferdig «Servicedesk-oppsett» med bransjetall skaper en forventning produktet ikke kan innfri. Utelat panelet heller enn å vise seedede tall.

## B3. Arketype 2 — register per respondent

Dette er samme skjerm som «attribuerte resultater» i Del A, punkt 5. Tegn den én gang og bruk den begge steder: én rad per virksomhet, sammendragskolonner, utvidbar rad, filter på *ikke svart* / *avdekket brudd* / *mangler policy*, eksport. Tabellmønsteret fra Administrasjon → Brukere, ikke resultatskjermens kortmønster. På mobil: rader blir kort per RESPONSIVE.md.

Som dashboardpanel trenger den i tillegg en kompakt variant: antall svart av totalt, antall med avvik, antall forfalt — tre tall og en lenke til fullvisningen.

## B4. Arketype 4 — hendelsesstrøm

For transaksjonell måling (CSAT etter sak, servicedesk) er det ikke runder, men en løpende strøm. Den trenger en annen tidsakse enn arketype 1:

- Rullerende vindu (7 / 30 / 90 dager) i stedet for rundevelger.
- Løpende snitt med enkel trendlinje, ikke stolper per runde.
- Volum per dag som sekundærakse — et fall i svar er like viktig som et fall i skår.
- Samme k-behandling: perioder under terskelen viser «—», aldri et tall.

Tegn den som ett panel i eksisterende panelmønster, ikke som en egen seksjon i navigasjonen.

## B5. Det som ikke skal tegnes

- **Ingen ny toppnavigasjon per bruksområde.** Ett Dashboard, ulike oppsett.
- **Ingen bransjesammenligning i forhåndsoppsett** før datagrunnlaget finnes.
- **Ingen egen skjerm for arketype 3.** Rapporter og Oversikt dekker den; et tredje sted for frister ville konkurrere med dem.

## Hvorfor grensen går her

Hver nye visningsflate er en ny port som må verifiseres mot terskelen — et heatmap-felt eller et sitatpanel som glemte oppslaget er nøyaktig der feil gjemmer seg. Med paneler som register er antallet flater konstant uansett hvor mange bruksområder som legges til. Med ett dashboard per bruksområde vokser verifikasjonsarbeidet i takt med produktkatalogen, og det er den veksten som til slutt gjør at noe slipper gjennom.
