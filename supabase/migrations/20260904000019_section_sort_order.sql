-- HeiTuva 0030 — the section registry gets the design's order, explicitly.
--
-- The Innhold list had no ORDER BY at all, so Postgres returned rows in
-- whatever order it liked. Adding `order('key')` made that deterministic and
-- wrong: it produces Tiltak, Høyest, Heatmap, Metode, Deltakelse, Utvalgte,
-- Sammendrag… where the design reads Sammendrag, Utvikling over tid, Heatmap,
-- Høyest og lavest, Resultat per team, Temaer, Utvalgte sitater, Tiltak,
-- Deltakelse, Metode (HeiTuva.dc.html:2459, the SECTION_LABEL literal — its
-- key order IS the presentation order).
--
-- Presentation order is data, like the labels beside it, so it becomes a column
-- rather than an array in a component — the same shape report_templates already
-- uses. Adding an eleventh section stays a row.
alter table public.report_section_types
  add column if not exists sort_order int not null default 0;

update public.report_section_types set sort_order = v.ord
from (values
  ('summary', 1), ('trend', 2), ('heatmap', 3), ('drivers', 4), ('teams', 5),
  ('themes', 6), ('quotes', 7), ('actions', 8), ('participation', 9), ('method', 10)
) as v(key, ord)
where report_section_types.key = v.key;

comment on column public.report_section_types.sort_order is
  'Presentation order in the report editor''s Innhold list and in the document. '
  'Matches the design''s SECTION_LABEL order; not alphabetical.';
