-- Survey-level result visibility, for the "Del med teamet" panel.
--
-- The design's share panel sets two things on a survey: who may co-edit
-- (survey_editors, already present) and "Hvem ser resultatene"
-- (HeiTuva.dc.html:723). Only the second had nowhere to live —
-- `app.share_scope` existed but was reachable only from `reports` and
-- `report_shares`, which are Phase 5 and are about a published report, not
-- about a survey's own results.
--
-- Default 'ledelse' matches the prototype's default scope ("HR og admin") and
-- is the most restrictive of the three, so a survey shared before anyone picks
-- a scope does not widen visibility by omission.
--
-- This grants nothing by itself. Reads of results still go through the
-- SECURITY DEFINER aggregate RPCs, which enforce k>=5 regardless of scope —
-- the column narrows who may ask, never what the answer contains.
alter table public.surveys
  add column results_scope app.share_scope not null default 'ledelse';

comment on column public.surveys.results_scope is
  'Who may see this survey''s aggregated results. Narrows access only; the '
  'k>=5 gate in the aggregate RPCs is independent of it.';
