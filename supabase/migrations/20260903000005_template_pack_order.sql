-- HeiTuva 0005 — template packs carry the design's own order.
--
-- The Bibliotek grid tints only the first five cards
-- (HeiTuva.dc.html:3737 indexes a five-colour array with no modulo), so the
-- ORDER decides which packs are tinted and which are not. Sorting by
-- (category, title) put "Evaluering av kurs" first and coloured a different
-- five than the design does. The design's order is the PACKS object's own
-- insertion order, which is neither alphabetical nor grouped by any column —
-- it is editorial. So it has to be stored.
--
-- Data-not-code: adding a pack is still a row; it just carries its place.

alter table public.template_packs
  add column sort_order integer not null default 1000;

comment on column public.template_packs.sort_order is
  'Editorial order for the Bibliotek grid; lower first. Standard packs follow the design bundle (HeiTuva.dc.html PACKS). Org templates leave it at the default and sort by created_at.';

-- Backfill the seeded standard packs. Rows inserted before this migration got
-- the default; a pack that is not in this list keeps it and falls to the end.
update public.template_packs p
set sort_order = v.n
from (values
  ('ukentlig-puls',1), ('oppstartssjekk',2), ('arrangement',3),
  ('arbeidsmiljo-manedlig',4), ('psykososial-kartlegging',5),
  ('trakassering-ytringsklima',6), ('likestilling-deltid',7),
  ('leverandor-apenhetsloven',8), ('klima-miljo',9),
  ('nps-kunde',10), ('csat',11), ('vunnet-tapt',12), ('produkttilbakemelding',13),
  ('medlem-innbygger',14), ('kurs-opplaering',15),
  ('sluttsamtale',16), ('360-tilbakemelding',17)
) as v(key, n)
where p.org_id is null and p.key = v.key;

-- The design's title, restored verbatim (HeiTuva.dc.html:2322). The headcount
-- suffixes on four audiences stay off — see docs/DEVIATIONS.md D33.
update public.template_packs
set title = 'Samling i Bergen'
where org_id is null and key = 'arrangement' and title = 'Samling';
