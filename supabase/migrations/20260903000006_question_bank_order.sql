-- HeiTuva 0006 — the question bank carries the design's order too.
--
-- Same finding as the template packs (migration 0005), on the other Bibliotek
-- tab. The design renders `BANK` in array order and derives the category chips
-- from the order the categories first appear in it
-- (HeiTuva.dc.html:3832-3834). Sorting by (category, text) instead produced an
-- alphabetical chip rail — Åpne, Arbeidsmiljø, Arrangement… — where the design
-- reads Engasjement, Tydelighet, Ledelse, Verktøy…, which is the order the
-- questions are meant to be considered in, not the order the alphabet puts
-- their labels in.

alter table public.question_bank
  add column sort_order integer not null default 1000;

comment on column public.question_bank.sort_order is
  'Editorial order for the Spørsmålsbank; lower first. Standard questions follow the design bundle (HeiTuva.dc.html BANK). Org questions leave it at the default and sort by created_at, newest first, above the standard ones.';

update public.question_bank q
set sort_order = v.n
from (values
  ('Jeg vil anbefale denne arbeidsplassen til en venn',1),
  ('Jeg vet hva som forventes av meg på jobb',2),
  ('Lederen min gir meg nyttige tilbakemeldinger',3),
  ('Jeg har verktøyene jeg trenger for å gjøre jobben',4),
  ('Hvordan er arbeidsmengden din nå?',5),
  ('Føler du deg trygg på å si fra?',6),
  ('Hva bør vi begynne med?',7),
  ('Hva bør vi slutte med?',8),
  ('Hvilket gode betyr mest for deg?',9),
  ('Hvor sannsynlig er det at du er her om ett år?',10),
  ('Forberedte oppstarten deg på rollen din?',11),
  ('Hvordan var det siste allmøtet?',12)
) as v(text, n)
where q.org_id is null and q.text = v.text;
