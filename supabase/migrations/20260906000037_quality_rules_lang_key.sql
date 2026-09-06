-- HeiTuva 0037 — Q48(a): `quality_rules` gets a key that admits its own `lang`.
--
-- The table has carried a `lang` column since Phase 2 and a primary key of
-- `key` alone. Those two cannot both be true: a second-language row is refused
-- by the PK, so the column has never been usable and every rule is Norwegian.
-- It surfaced in V1-1, when the policy-pronoun rule's `en` row was rejected
-- (`duplicate key value violates unique constraint "quality_rules_pkey"`) and
-- had to ship Norwegian-only like the four before it.
--
-- DECISIONS Q48(a) (Tor, 2026-09-06) widens the key to `(key, lang)`. Done now,
-- ahead of the rest of V1-2, on the reasoning that made it part of this batch:
-- every rule added meanwhile is another Norwegian-only row to backfill later,
-- so the cost of waiting rises with each one and never falls.
--
-- This is a key change, not a data change. All five existing rows are `no` and
-- keep their identity; nothing is inserted, updated or removed. Readers already
-- filter by language — `bygg/page.tsx:60` selects `.eq('lang', viewer.locale)`,
-- which is why an English session sees no flags rather than Norwegian ones —
-- so they need no change either, and the day an `en` row exists it simply
-- appears for English readers.
--
-- Q48(b) is NOT here. `duty_definitions` and `report_section_types` carry
-- user-visible Norwegian with no `lang` column at all, and the fix Tor
-- confirmed for them is an overlay inside `ui_messages` rather than a column
-- each — that changes what the translation editor is, so it takes its own slot
-- and its own decision line rather than riding along with a key widening.

ALTER TABLE public.quality_rules
  DROP CONSTRAINT quality_rules_pkey;

ALTER TABLE public.quality_rules
  ADD CONSTRAINT quality_rules_pkey PRIMARY KEY (key, lang);

COMMENT ON CONSTRAINT quality_rules_pkey ON public.quality_rules IS
  'DECISIONS Q48(a): (key, lang), so the lang column this table has always had '
  'can hold more than one language. Readers filter by the viewer''s locale.';
