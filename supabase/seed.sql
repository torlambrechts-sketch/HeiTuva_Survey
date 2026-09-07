-- HeiTuva seed — registries and standard content (idempotent-ish: run on fresh DB)
-- Standard template packs (org_id NULL) — verbatim from the design bundle PACKS.

insert into public.template_packs (org_id, key, category, legal_ref, title, audience, questions, sort_order) values
(null,'ukentlig-puls','Ansatte',null,'Ukespuls — Produkt','Produktteamet',
 '[{"text":"Hvordan har uken på jobb vært?","type":"scale"},{"text":"Jeg har det jeg trenger for å gjøre jobben min godt","type":"scale"},{"text":"Hvor gikk mest tid tapt denne uken?","type":"choice","options":["Møter","Uklare prioriteringer","Venting på andre","Verktøy","Ingenting spesielt"]},{"text":"Hva ville gjort neste uke bedre?","type":"text"}]',1),
(null,'oppstartssjekk','Ansatte',null,'Oppstartssjekk — 30 dager','Nyansatte',
 '[{"text":"Den første måneden svarte til forventningene","type":"scale"},{"text":"Hadde du en fadder den første uken?","type":"yesno"},{"text":"Hva hjalp deg mest i oppstarten?","type":"choice","options":["Fadderordningen","Dokumentasjon","Teamets rutiner","1:1 med leder"]},{"text":"Hva var forvirrende de første ukene?","type":"text"}]',2),
(null,'arrangement','Ansatte',null,'Samling i Bergen','Deltakere',
 '[{"text":"Hvordan vil du vurdere samlingen totalt?","type":"scale"},{"text":"Hva var best av de to dagene?","type":"choice","options":["Workshopene","Strategiøkten","Sosial kveld","Fritid"]},{"text":"Bør vi gjenta det neste år?","type":"yesno"},{"text":"Er det noe vi bør endre?","type":"text"}]',3),
(null,'arbeidsmiljo-manedlig','Lovpålagt','Arbeidsmiljøloven § 4-3','Arbeidsmiljø — månedlig','Hele selskapet',
 '[{"text":"Jeg får energi av arbeidet mitt om dagen","type":"scale"},{"text":"Jeg kan si det jeg mener i teamet mitt","type":"scale"},{"text":"Hvordan er arbeidsmengden din?","type":"choice","options":["For lav","Passe","Litt høy","For høy"]},{"text":"Hva opptar deg denne måneden?","type":"text"}]',4),
(null,'psykososial-kartlegging','Lovpålagt','Arbeidsmiljøloven § 4-3 (fra 1.1.2026)','Psykososial kartlegging','Alle ansatte · årlig',
 '[{"text":"Jeg vet hva som forventes av meg i jobben min","type":"likert"},{"text":"Arbeidsmengden min er til å håndtere over tid","type":"likert"},{"text":"Jeg får støtte fra lederen min når jobben blir krevende","type":"likert"},{"text":"Jeg har innflytelse over hvordan jeg utfører arbeidet","type":"likert"},{"text":"Hvor ofte opplever du følelsesmessig belastende situasjoner på jobb?","type":"choice","options":["Aldri","Sjelden","Månedlig","Ukentlig","Daglig"]},{"text":"Har du opplevd eller sett trakassering eller utilbørlig opptreden siste 12 måneder?","type":"yesno"},{"text":"Hva bør vi gjøre noe med først?","type":"text"}]',5),
(null,'trakassering-ytringsklima','Lovpålagt','Likestillingsloven ARP · aml. kap. 2A','Trakassering og ytringsklima','Alle ansatte · årlig',
 '[{"text":"Jeg kan si fra om kritikkverdige forhold uten å frykte konsekvenser","type":"likert"},{"text":"Jeg vet hvordan jeg varsler hos oss","type":"yesno"},{"text":"Har du opplevd uønsket seksuell oppmerksomhet på jobb?","type":"yesno"},{"text":"Har du opplevd forskjellsbehandling på grunn av kjønn, etnisitet, alder, funksjonsevne eller livssyn?","type":"yesno"},{"text":"Hva ville gjort det tryggere å si fra?","type":"text"}]',6),
(null,'likestilling-deltid','Lovpålagt','ARP — kartlegges annethvert år','Likestilling og ufrivillig deltid','Alle ansatte · annethvert år',
 '[{"text":"Jobber du heltid eller deltid?","type":"choice","options":["Heltid","Deltid — frivillig","Deltid — ønsker å jobbe mer"]},{"text":"Er du tilgjengelig for å jobbe mer enn du gjør i dag?","type":"yesno"},{"text":"Hva ville gjort det mulig for deg å jobbe mer?","type":"choice","multi":true,"options":["Annen arbeidstid","Tilrettelagte oppgaver","Barnehage/SFO","Tilrettelegging for helse","Ikke aktuelt"]},{"text":"Jeg har samme mulighet til utvikling og forfremmelse som andre","type":"likert"},{"text":"Jeg opplever at lønn settes rettferdig hos oss","type":"likert"},{"text":"Er det noe vi bør endre for å bli mer likestilte?","type":"text"}]',7),
(null,'leverandor-apenhetsloven','Lovpålagt','Åpenhetsloven §§ 4–5 · frist 30. juni','Aktsomhetsvurdering leverandør','Leverandører og forretningspartnere',
 '[{"text":"Har virksomheten en policy for menneskerettigheter og anstendige arbeidsforhold?","type":"yesno","role":"policy","short":"Policy"},{"text":"Gjennomfører dere egne aktsomhetsvurderinger av deres leverandørkjede?","type":"yesno","role":"key","short":"Egen vurdering"},{"text":"Hvor mange ledd bakover i kjeden har dere oversikt over?","type":"choice","options":["Ingen","Ett ledd","To ledd","Tre eller flere"]},{"text":"Har dere avdekket brudd eller risiko siste 12 måneder?","type":"yesno","role":"brudd","short":"Brudd/risiko"},{"text":"Har dere en varslingskanal som er åpen for arbeidere i kjeden?","type":"yesno","role":"key","short":"Varslingskanal"},{"text":"Beskriv tiltakene dere har iverksatt","type":"text"}]',8),
(null,'klima-miljo','Lovpålagt','Bærekraftsrapportering · ESG','Klima- og miljøkartlegging','Ansatte og leverandører',
 '[{"text":"Hvordan kommer du deg oftest på jobb?","type":"choice","options":["Til fots eller sykkel","Kollektivt","Elbil","Fossilbil","Hjemmekontor"]},{"text":"Hvor mange flyreiser i jobb hadde du siste år?","type":"choice","options":["Ingen","1–2","3–5","6 eller flere"]},{"text":"Vi har rutiner som gjør det enkelt å velge miljøvennlig","type":"likert"},{"text":"Hva hindrer deg i å ta det grønne valget på jobb?","type":"text"}]',9),
(null,'nps-kunde','Kunder',null,'Hvor sannsynlig er det at du anbefaler oss?','Kunder · løpende',
 '[{"text":"Hvor sannsynlig er det at du vil anbefale oss til en kollega eller venn?","type":"enps"},{"text":"Hva er hovedgrunnen til at du ga den scoren?","type":"text"},{"text":"Hva skal til for at vi får ett poeng høyere?","type":"text"}]',10),
(null,'csat','Kunder',null,'Hvordan var opplevelsen?','Kunder etter kjøp eller sak',
 '[{"text":"Hvor fornøyd er du med opplevelsen totalt sett?","type":"smiley"},{"text":"Vi løste det du tok kontakt om","type":"likert"},{"text":"Hvor lett var det å få hjelp?","type":"scale"},{"text":"Hva kunne gjort opplevelsen bedre?","type":"text"},{"text":"Ønsker du at vi tar kontakt om svaret ditt?","type":"yesno"}]',11),
(null,'vunnet-tapt','Kunder',null,'Hvorfor valgte du som du gjorde?','Kunder og prospekter',
 '[{"text":"Hvor godt traff tilbudet vårt behovet ditt?","type":"scale"},{"text":"Hva var viktigst i beslutningen?","type":"ranking","options":["Pris","Funksjonalitet","Personvern og sikkerhet","Support","Leveringstid"]},{"text":"Valgte du oss?","type":"choice","options":["Ja","Nei — valgte en annen","Utsatt beslutning"]},{"text":"Hva burde vi gjort annerledes?","type":"text"}]',12),
(null,'produkttilbakemelding','Kunder',null,'Hva synes du om det nye?','Brukere av produktet',
 '[{"text":"Hvor nyttig er den nye funksjonen for deg?","type":"scale"},{"text":"Hvor lett var den å ta i bruk?","type":"scale"},{"text":"Hva mangler før dette blir en del av hverdagen din?","type":"text"}]',13),
(null,'medlem-innbygger','Annet',null,'Medlemsundersøkelse','Medlemmer, innbyggere, foreldre',
 '[{"text":"Hvor fornøyd er du med tilbudet vårt?","type":"smiley"},{"text":"Hvilke tilbud bruker du?","type":"choice","multi":true,"options":["Arrangementer","Kurs","Rådgivning","Digitale tjenester","Ingen"]},{"text":"Hva bør vi prioritere neste år?","type":"ranking","options":["Flere arrangementer","Lavere pris","Bedre digitale tjenester","Mer lokal tilstedeværelse"]},{"text":"Er det noe du savner?","type":"text"}]',14),
(null,'kurs-opplaering','Annet',null,'Evaluering av kurs','Deltakere etter kurs',
 '[{"text":"Hvor godt svarte kurset til forventningene?","type":"scale"},{"text":"Jeg kan bruke det jeg lærte i jobben min","type":"likert"},{"text":"Hva var mest nyttig?","type":"text"}]',15),
(null,'sluttsamtale','Ansatte',null,'Sluttsamtale','Ansatte som slutter',
 '[{"text":"Hva var den viktigste grunnen til at du sluttet?","type":"choice","options":["Lønn og betingelser","Utviklingsmuligheter","Lederen min","Arbeidsmengde","Flyttet eller livssituasjon","Fikk et bedre tilbud"]},{"text":"Hvor lenge har du vurdert å slutte?","type":"choice","options":["Under en måned","1–3 måneder","6 måneder","Over et år"]},{"text":"Kunne vi gjort noe for å beholde deg?","type":"yesno"},{"text":"Jeg vil anbefale andre å søke jobb hos oss","type":"likert"},{"text":"Hva bør vi endre for de som blir igjen?","type":"text"}]',16),
(null,'360-tilbakemelding','Ansatte',null,'360 tilbakemelding','Leder · kolleger og medarbeidere',
 '[{"text":"Din relasjon til personen","type":"choice","options":["Medarbeider","Kollega på samme nivå","Leder","Samarbeidspartner"]},{"text":"Vurder følgende utsagn om personen","type":"matrix","statements":["Er tydelig på hva som forventes","Gir tilbakemelding jeg kan bruke","Lytter før beslutninger tas","Følger opp det som avtales","Skaper trygghet i gruppen"]},{"text":"Hva bør personen fortsette med?","type":"text"},{"text":"Hva bør personen gjøre annerledes?","type":"text"}]',17),
-- V1-5 / DECISIONS Q45 — the five new packs (NEW:2857-2881), questions verbatim.
-- All 'Annet': the category CHECK is NOT widened to hold use-case names, so the
-- customer-facing axis is `use_case` and this column stays the internal kind.
(null,'servicedesk-sak','Annet',null,'Hvordan var hjelpen du fikk?','Ansatte etter lukket sak · løpende',
 '[{"text":"Hvor fornøyd er du med hjelpen du fikk?","type":"smiley"},{"text":"Saken ble løst ved første kontakt","type":"likert"},{"text":"Hvor lang tid tok det før du fikk svar?","type":"choice","options":["Under en time","Samme dag","1–2 dager","Lenger"]},{"text":"Hva kunne gjort det enklere?","type":"text"}]',18),
(null,'it-verktoy','Annet',null,'IT og verktøy — halvårlig','Alle ansatte · halvårlig',
 '[{"text":"Verktøyene jeg bruker daglig fungerer som de skal","type":"likert"},{"text":"Hvilket verktøy skaper mest friksjon?","type":"choice","options":["E-post og kalender","Fagsystem","Videomøter","Fildeling","Mobil"]},{"text":"Jeg vet hvor jeg får hjelp når noe ikke virker","type":"likert"},{"text":"Hva bør IT prioritere neste halvår?","type":"text"}]',19),
(null,'innbyggerundersokelse','Annet',null,'Innbyggerundersøkelse','Innbyggere · årlig',
 '[{"text":"Hvor fornøyd er du med kommunens tjenester samlet sett?","type":"scale"},{"text":"Hvilke tjenester har du brukt siste år?","type":"choice","options":["Barnehage og skole","Helse og omsorg","Byggesak","Kultur og idrett","Renovasjon"],"multi":true},{"text":"Det er lett å finne fram til riktig kontor eller tjeneste","type":"likert"},{"text":"Hva bør kommunen gjøre bedre?","type":"text"}]',20),
(null,'brukerundersokelse-tjeneste','Annet',null,'Brukerundersøkelse — tjeneste','Brukere av én tjeneste · etter møte',
 '[{"text":"Hvor godt ble du møtt?","type":"smiley"},{"text":"Jeg forsto hva som skjer videre i saken min","type":"likert"},{"text":"Fikk du informasjonen på et språk du forstår?","type":"yesno"},{"text":"Hva ville gjort møtet bedre?","type":"text"}]',21),
(null,'frivillige-arrangement','Annet',null,'Takk for innsatsen — hvordan var det?','Frivillige · etter arrangement',
 '[{"text":"Hvor godt organisert opplevde du dagen?","type":"scale"},{"text":"Jeg visste hva jeg skulle gjøre","type":"likert"},{"text":"Vil du stille som frivillig igjen?","type":"yesno"},{"text":"Hva bør vi gjøre annerledes neste gang?","type":"text"}]',22);

-- V1-5 / DECISIONS Q24: map every shipped pack to a use case. The SAME function
-- migration 0049 defines and calls — migrations run before seeds, so the
-- migration's own call finds an empty table on a fresh reset and this is what
-- maps the rows above. One definition, two callers, idempotent by
-- `use_case is null`.
select app.map_pack_use_cases();

-- Standard question bank ------------------------------------------------------
insert into public.question_bank (org_id, text, type, category, config, sort_order) values
(null,'Jeg vil anbefale denne arbeidsplassen til en venn','scale','Engasjement','{}',1),
(null,'Jeg vet hva som forventes av meg på jobb','scale','Tydelighet','{}',2),
(null,'Lederen min gir meg nyttige tilbakemeldinger','scale','Ledelse','{}',3),
(null,'Jeg har verktøyene jeg trenger for å gjøre jobben','scale','Verktøy','{}',4),
(null,'Hvordan er arbeidsmengden din nå?','choice','Arbeidsmiljø','{"options":["For lav","Passe","Litt høy","For høy"]}',5),
(null,'Føler du deg trygg på å si fra?','yesno','Kultur','{}',6),
(null,'Hva bør vi begynne med?','text','Åpne','{}',7),
(null,'Hva bør vi slutte med?','text','Åpne','{}',8),
(null,'Hvilket gode betyr mest for deg?','choice','Goder','{"options":["Fleksitid","Hjemmekontor","Kompetansebudsjett","Pensjon","Ekstra fridager"]}',9),
(null,'Hvor sannsynlig er det at du er her om ett år?','scale','Turnover','{}',10),
(null,'Forberedte oppstarten deg på rollen din?','yesno','Oppstart','{}',11),
(null,'Hvordan var det siste allmøtet?','scale','Arrangement','{}',12);

-- Statutory duty registry -----------------------------------------------------
insert into public.duty_definitions (key, title, law, basis, default_interval_months, publish, pack_key, checks, signer_roles) values
('apenhet','Aktsomhetsvurdering leverandører','Åpenhetsloven §§ 4–5',
 'Redegjørelsen skal signeres av styret og publiseres offentlig.',12,true,'leverandor-apenhetsloven',
 '[{"key":"k1","label":"Kartlegging gjennomført"},{"key":"k2","label":"Funn og risiko dokumentert"},{"key":"k3","label":"Tiltak registrert med ansvarlig"},{"key":"k4","label":"Styrebehandlet og signert"}]',
 '[{"key":"styre","label":"Styreleder","role":"Signerer redegjørelsen"},{"key":"dl","label":"Daglig leder","role":"Bekrefter tiltak"}]'),
('arbeidsmiljo','Psykososial kartlegging','Arbeidsmiljøloven § 4-3 · internkontroll',
 'Skal dokumenteres skriftlig og gjennomgås med verneombud.',12,false,'psykososial-kartlegging',
 '[{"key":"k1","label":"Kartlegging gjennomført"},{"key":"k2","label":"Risikoområder vurdert"},{"key":"k3","label":"Tiltaksplan med frister"},{"key":"k4","label":"Verneombud involvert"}]',
 '[{"key":"vo","label":"Verneombud","role":"Har gjennomgått kartleggingen"},{"key":"hr","label":"HR-ansvarlig","role":"Eier tiltaksplanen"}]'),
('likestilling','Likestilling og ARP','Likestillings- og diskrimineringsloven § 26',
 'Lønnskartlegging annethvert år. Redegjøres for i årsberetningen.',24,true,'likestilling-deltid',
 '[{"key":"k1","label":"Kjønnsdelt lønnskartlegging"},{"key":"k2","label":"Ufrivillig deltid kartlagt"},{"key":"k3","label":"Årsaker analysert"},{"key":"k4","label":"Tiltak i årsberetningen"}]',
 '[{"key":"styre","label":"Styret","role":"Inn i årsberetningen"}]'),
('trakassering','Trakassering og ytringsklima','Aml. kap. 2A · ARP',
 'Varslingsrutinen skal være kjent og testet blant de ansatte.',12,false,'trakassering-ytringsklima',
 '[{"key":"k1","label":"Undersøkelse gjennomført"},{"key":"k2","label":"Varslingsrutine kjent"},{"key":"k3","label":"Funn håndtert"},{"key":"k4","label":"Ansvarlig oppnevnt"}]',
 '[{"key":"hr","label":"HR-ansvarlig","role":"Eier varslingsrutinen"}]');

-- Q35 (2026-09-06): the Åpenhetsloven pack's questions above carry `role` and
-- `short`. Migration 0040 sets the same values, and for the same reason the
-- note below gives: it runs BEFORE this seed, so on a fresh reset its UPDATE
-- hits zero rows and only serves a database whose packs predate it. The two
-- must be edited together or a reset and an upgrade disagree.

-- Q17 threshold policy on the statutory packs and duties (docs/Q17_terskel_forslag.md,
-- the law-anchored table). This is DATA and belongs with the pack rows it governs.
-- Migration 20260904000032 carries the SAME values, but it runs before this seed —
-- a migration cannot reach rows a later-running seed inserts — so its UPDATE hits
-- zero rows on a fresh reset and only serves a database whose packs predate it.
-- The pack, not the customer, decides these; the guard reads template_packs.policy.
update public.template_packs set policy = jsonb_build_object(
    'anonymity','anonymous','respondent_kind','person','k_threshold',5,'locked',true)
  where org_id is null and key = 'psykososial-kartlegging';
update public.template_packs set policy = jsonb_build_object(
    'anonymity','named','respondent_kind','organisation','k_threshold',0,'locked',true)
  where org_id is null and key = 'leverandor-apenhetsloven';
-- DECISIONS Q58: the ONE pack of the three topics the bundle names that exists
-- as a pack. 8 is a FLOOR the pack carries — app.apply_pack_policy takes
-- greatest(pack, organisation) since M:0054, so an organisation at 10 is not
-- lowered to 8. The lock is deliberate: a harassment survey a customer can
-- switch to «med navn» is the failure the lock exists to prevent.
update public.template_packs set policy = jsonb_build_object(
    'anonymity','anonymous','respondent_kind','person','k_threshold',8,'locked',true)
  where org_id is null and key = 'trakassering-ytringsklima';
update public.duty_definitions set policy = jsonb_build_object(
    'anonymity','anonymous','respondent_kind','person','k_threshold',5,'locked',true)
  where key in ('arbeidsmiljo','likestilling','trakassering');
update public.duty_definitions set policy = jsonb_build_object(
    'anonymity','named','respondent_kind','organisation','k_threshold',0,'locked',true)
  where key = 'apenhet';

-- Report section registry: NOT here. It is a registry that migration
-- 20260904000006 validates its templates against, and a migration cannot depend
-- on a seed that runs after it. The rows are inserted there.

-- Question quality rules (design heuristics) ------------------------------------
insert into public.quality_rules (key, lang, pattern, rule, message) values
('double_barreled','no','\m(og|eller)\M','{"kind":"regex_min_words","min_words":7}','Ser ut som to spørsmål i ett — del det opp'),
('leading_words','no',null,'{"kind":"leading_words","words":["fornøyd","enig i at","selvsagt","åpenbart","endelig","flott","utmerket","dårlige"]}','Ledende ordvalg — prøv en nøytral formulering'),
('too_long','no',null,'{"kind":"max_words","max":20}','Over 20 ord — kort det ned'),
('negation','no','\m(ikke|aldri)\M','{"kind":"regex"}','Negasjon gjør spørsmålet vanskelig å svare på'),
-- The policy panel's pronoun rule (DECISIONS Q36's panel, v1 bundle :3529). It
-- is a quality_rules row so that retuning the pronoun list, or adding the rule
-- for another language, stays a row rather than a code change. `qualityFlags`
-- skips kinds it does not know, so this never appears as a question-quality
-- flag; only the policy panel reads it, and only in organisation mode.
-- Its message carries one {question} placeholder — the single extension this
-- table's convention needed, because this rule has to name what it is about.
--
-- Norwegian only, like the four rules above it: `quality_rules` has a `lang`
-- column but its primary key is `key` alone, so the table cannot actually hold
-- the same rule twice. Logged rather than migrated here — widening the key is a
-- schema change and this is a panel.
('policy_pronoun','no','\m(du|deg|din|ditt|dine|jeg|meg|min|mitt|mine)\M','{"kind":"policy_pronoun"}','«{question}» handler om enkeltpersoner, men svarene attribueres til virksomheten.');

-- Benchmarks (static reference seed — DECISIONS Q8; replace with sourced values) --
insert into public.benchmarks (industry, metric_key, value, source) values
('Teknologi og IT','engagement_avg',3.9,'Seed — erstatt med kildeført referanse'),
('Teknologi og IT','enps',12,'Seed — erstatt med kildeført referanse'),
('Teknologi og IT','response_rate',0.72,'Seed — erstatt med kildeført referanse'),
('Alle bransjer','engagement_avg',3.7,'Seed — erstatt med kildeført referanse'),
('Alle bransjer','enps',8,'Seed — erstatt med kildeført referanse'),
('Alle bransjer','response_rate',0.66,'Seed — erstatt med kildeført referanse');

-- Feature flags: global defaults ------------------------------------------------
insert into public.feature_flags (key, org_id, enabled) values
('sms_channel', null, false), ('entra_sync', null, false), ('google_sync', null, false),
('hr_sync', null, false), ('ai_insights', null, false), ('ai_translate', null, false),
('pptx_export', null, false), ('stripe_billing', null, false)
-- No admin_mfa row: DECISIONS Q14 defers administrator MFA and migration
-- 20260904000009 removed both the flag and the enforcement it gated. Seeding it
-- again would re-create a switch that nothing reads.
on conflict (key, org_id) do nothing;

-- Respondent-chrome UI messages (verbatim from the design's RS object).
-- Fuller namespaces are seeded from /messages/*.json by scripts/seed-i18n.ts.
insert into public.ui_messages (namespace, key, lang, value) values
('respondent','asks','no','spør deg'),('respondent','time','no','Tar ca. 90 sekunder'),
('respondent','anon','no','Svarene er anonyme — arbeidsgiver ser bare summerte tall'),
('respondent','named','no','Svarene vises med navnet ditt'),
('respondent','choose','no','Du velger selv om du vil være anonym'),
('respondent','back','no','Tilbake'),('respondent','next','no','Neste'),
('respondent','submit','no','Send inn svar'),('respondent','of','no','av'),
('respondent','question','no','Spørsmål'),('respondent','thanks','no','Takk!'),
('respondent','thanksSub','no','Svaret ditt er registrert.'),
('respondent','required','no','Dette spørsmålet må besvares'),
('respondent','pickMany','no','Velg alle som passer'),
('respondent','write','no','Skriv så mye eller lite du vil'),
('respondent','again','no','Legg til et svar til'),('respondent','results','no','Se resultater'),
('respondent','asks','en','asks you'),('respondent','time','en','Takes about 90 seconds'),
('respondent','anon','en','Answers are anonymous — your employer only sees totals'),
('respondent','named','en','Answers are shown with your name'),
('respondent','choose','en','You choose whether to stay anonymous'),
('respondent','back','en','Back'),('respondent','next','en','Next'),
('respondent','submit','en','Submit answers'),('respondent','of','en','of'),
('respondent','question','en','Question'),('respondent','thanks','en','Thank you!'),
('respondent','thanksSub','en','Your answer is in.'),
('respondent','required','en','This question is required'),
('respondent','pickMany','en','Pick all that apply'),
('respondent','write','en','Write as much or as little as you like'),
('respondent','again','en','Add another response'),('respondent','results','en','See results'),
-- sv/da seeded but inactive (organizations.active_langs governs exposure) — from the design:
('respondent','asks','sv','frågar dig'),('respondent','time','sv','Tar cirka 90 sekunder'),
('respondent','anon','sv','Svaren är anonyma — arbetsgivaren ser bara sammanlagda tal'),
('respondent','back','sv','Tillbaka'),('respondent','next','sv','Nästa'),
('respondent','submit','sv','Skicka in svar'),('respondent','thanks','sv','Tack!'),
('respondent','required','sv','Den här frågan måste besvaras'),
('respondent','asks','da','spørger dig'),('respondent','time','da','Tager cirka 90 sekunder'),
('respondent','anon','da','Svarene er anonyme — arbejdsgiveren ser kun samlede tal'),
('respondent','back','da','Tilbage'),('respondent','next','da','Næste'),
('respondent','submit','da','Send svar'),('respondent','thanks','da','Tak!'),
('respondent','required','da','Dette spørgsmål skal besvares');
