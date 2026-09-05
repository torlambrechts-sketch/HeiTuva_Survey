# Q17 (forslag) — konfigurerbar terskel med lovforankret gulv

**Status: forslag.** Erstatter R1 i ekspertpanelets veikart. Dette er den eneste endringen i hele utvidelsesarbeidet som rører sikkerhetskjernen, så den skal ha egen beslutning, egen migrasjon og egne negative tester før noen koder på den.

## Beslutningen

k=5 går fra å være en global, uforanderlig konstant til en **policy per undersøkelse med et gulv som avhenger av respondenttype og lovgrunnlag**. Standard er fortsatt 5, og standard er det som gjelder om ingen tar et valg.

| Respondenttype | Gulv | Standard | Kan endres av |
|---|---|---|---|
| Ansatte i egen virksomhet | 3 | 5 | Administrator |
| Eksterne fysiske personer (kunder, medlemmer, deltakere, innbyggere) | 3 | 5 | Administrator |
| Organisasjoner (leverandører, tilbydere) | ingen terskel | attribuert | Administrator, låst ved første runde |
| Lovpålagt mal | malens eget gulv | malens eget | **ingen** |

Under 3 finnes ikke som terskel. Vil man se enkeltsvar, er svaret anonymitetsmodus «med navn» — ikke terskel 1 med et anonymitetsløfte på skjermen.

## Lovforankrede låser (bæres av malen, ikke av brukeren)

`template_packs` og `duty_definitions` får en `policy jsonb` som følger malen inn i undersøkelsen og ikke kan overstyres:

| Lovgrunnlag | Låst policy |
|---|---|
| aml. § 4-3 psykososial kartlegging | anonym, gulv 5 |
| aml. kap. 2A varsling og trakassering | anonym, gulv 5 |
| Likestillingsloven § 26 / ARP | anonym, gulv 5 |
| Åpenhetsloven §§ 4–5 | navngitt, organisasjon, attribuert |
| Anskaffelsesloven (RFI, kravsvalidering) | navngitt, organisasjon, attribuert |
| Plan- og bygningsloven (høring) | navngitt, offentlig, terskel gjelder ikke |

Velger man «Psykososial kartlegging», følger anonymitet og terskel med malen, og feltene vises låste med en kort forklaring på hvorfor. Da er det ikke et valg noen tar under tidspress.

## Det som gjør endringen forsvarlig

**1. Løftet genereres fra innstillingen.** Respondentskjermens anonymitetstekst skal utledes av `anonymity` + `k_threshold`, aldri være fast kopi. Ved gulv 5: «Resultater vises først når minst fem har svart.» Ved 3: samme setning med tre. Ved attribuert: «Svaret ditt vises med navn og virksomhet.» En fast tekst som lover mer enn innstillingen holder, er den eneste virkelige feilen i hele denne endringen.

**2. Låst ved første svar.** `k_threshold` og `respondent_kind` kan settes fritt så lenge undersøkelsen er utkast og ingen runde er åpnet. Ved første respons er de uforanderlige — håndhevet av trigger, ikke av skjermbildet. Å senke i ettertid er å love fem og vise ved tre.

**3. Synlig der tallene leses.** Resultatskjerm og rapport viser hvilken terskel som gjelder. Den som leser et resultat skal vite om «3,8» hviler på fem svar eller tre.

**4. Administrator, ikke redaktør.** Å endre terskelen er en personverninnstilling, og ligger hos den rollen som allerede eier personvernfanen. Loggføres i `audit_events`.

**5. Konsekvensen sies rett ut i skjermbildet.** Under 5 er aggregatet ikke lenger opplagt anonymt i personvernrettslig forstand — oppbevaringstid, innsyn og sletting kan gjelde for resultatene. Én setning ved valget, ikke en advarsel som må klikkes bort.

## Migrasjonsskisse

```sql
-- respondenttype og terskel per undersøkelse
alter table public.surveys
  add column respondent_kind text not null default 'person'
    check (respondent_kind in ('person','organisation')),
  add column k_threshold int not null default 5
    check (k_threshold >= 3 or respondent_kind = 'organisation'),
  add column policy_locked boolean not null default false;

-- malen bærer sitt eget regelverk
alter table public.template_packs   add column policy jsonb;
alter table public.duty_definitions add column policy jsonb;

-- app.k_threshold() blir oppslag, ikke konstant
create or replace function app.k_for(p_survey uuid) returns int
language sql stable security definer set search_path = public as $$
  select case when s.respondent_kind = 'organisation' then 0
              else greatest(s.k_threshold, 3) end
  from public.surveys s where s.id = p_survey
$$;
```

Alle aggregerings-RPC-er bytter `app.k_threshold()` mot `app.k_for(p_survey)`. Trigger på `surveys` avviser endring av `respondent_kind`, `k_threshold` og `anonymity` når `policy_locked` er satt; `policy_locked` settes av `send_round`.

## Negative tester som må følge med

Ingen av disse er valgfrie — de er hele grunnen til at endringen er trygg:

1. En eksisterende undersøkelse uten eksplisitt valg aggregerer fortsatt på 5.
2. `k_threshold = 2` avvises av CHECK for `respondent_kind = 'person'`.
3. Terskel og respondenttype kan ikke endres etter første respons — trigger avviser.
4. En undersøkelse opprettet fra en lovpålagt mal avviser ethvert forsøk på å endre terskel eller anonymitet, også som administrator.
5. `respondent_kind = 'organisation'` gir attribuerte svar, men kan aldri settes på en undersøkelse som allerede har person-svar.
6. Respondentskjermens løftetekst samsvarer med innstillingen — test alle fire kombinasjoner, inkludert at teksten endres når terskelen gjør det.
7. Redaktør kan ikke endre terskelen; administrator kan, og hendelsen havner i `audit_events`.
8. `get_quotes` og heatmap-cellene bruker samme `app.k_for` — ingen vei rundt via en RPC som glemte oppslaget.

## Det som ikke endres

Strukturell anonymitet står urørt: et anonymt svar har fortsatt ingen `invitation_id`, ingen bruker, ingen IP, og time-avrundet tidsstempel. `responses` og `answers` har fortsatt ingen leserettighet for noen klientrolle. Terskelen styrer hva som *vises*; koblingen finnes fortsatt ikke å vise.
