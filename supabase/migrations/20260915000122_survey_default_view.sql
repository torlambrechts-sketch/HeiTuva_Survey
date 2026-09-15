-- F4 — WHERE THE SURVEY LIST'S VIEW MODE LIVES.
--
-- Tor's instruction: «the view switcher is per-person state. Q122's answer
-- applies — cookie plus column, not dashboard_layouts.» Same mechanism as
-- Q152's `worklist_view`, and this file is deliberately its sibling: the person
-- chooses in a cookie, the organisation's default is here.
--
-- v6 draws three (`viewTabs`, v6:8947): «Liste» is the six-column TABLE
-- (`rowsOn`, v6:8942), «Liste og detalj» is the list beside a detail panel
-- (`listOn`, the value `delt`), and «Kort» is the card grid (`boxOn`). The
-- value names are the bundle's own keys rather than English, because they are
-- what `svView` is compared against and a translation layer between a cookie
-- and a drawing is a second place for the two to disagree.
--
-- ── WHAT IS A COLUMN HERE AND WHAT IS NOT, STATED RATHER THAN DISCOVERED ───
--
-- This column carries the default VIEW MODE and nothing else. Two other pieces
-- of per-person state on this screen are cookies with NO column beside them,
-- and the asymmetry is a decision:
--
--   * Tuva's placement (`heituva.svtuva`: the docked side column or the
--     floating bubble, v6:9014-9018). A house default for «list or board» is a
--     real choice — some organisations run a queue and some a board — and the
--     same argument does not carry: there is no organisation-level fact about
--     where one person wants an assistant to sit, and inventing a control to
--     write it would be the larger sin than leaving the asymmetry. This is
--     `M:0112`'s own reasoning about column toggles, applied to the next case.
--   * The scope filter and the search, which already live in the URL and are
--     therefore shareable — a property a cookie would take away.
--
-- WHO WRITES THIS COLUMN: `saveCompany`, the same writer Q122's
-- `organizations.workspace` and Q152's `organizations.worklist_view` have, with
-- its control beside those two in Administrasjon → Firma. Added in this phase,
-- not deferred: invariant 8, and this project has five recorded instances of a
-- column that was read everywhere and written by nothing.
--
-- Validated in the database as well as at the Zod boundary, because an unknown
-- value would render as none of the three views; the screen resolves against
-- this same set, so an unknown cookie falls back exactly as an absent one does.

alter table public.organizations
  add column if not exists survey_view text not null default 'liste';

alter table public.organizations
  drop constraint if exists organizations_survey_view_check;
alter table public.organizations
  add constraint organizations_survey_view_check
  check (survey_view in ('liste', 'delt', 'kort'));

comment on column public.organizations.survey_view is
  'The organisation''s default Undersøkelser view — ''liste'' (the six-column '
  'table), ''delt'' (list and detail) or ''kort'' (cards). What a person sees '
  'before they choose; their own choice is the cookie `heituva.svview`. Tuva''s '
  'placement is a cookie with NO column beside it on purpose: there is no '
  'organisation-level fact about where one person wants an assistant to sit. '
  'Same mechanism as Q122''s `workspace` and Q152''s `worklist_view`. WHO '
  'WRITES IT: saveCompany (Administrasjon → Firma), added in this phase.';
