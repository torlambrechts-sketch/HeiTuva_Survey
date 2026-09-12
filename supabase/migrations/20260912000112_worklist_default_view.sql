-- V5-2 — WHERE THE ARBEIDSLISTE'S VIEW MODE AND COLUMN CHOICES LIVE.
--
-- Tor's decision: «cookie plus column, as Q122, NOT dashboard_layouts. Q51
-- stores identifiers for a DASHBOARD: panels and their order. Column choices
-- and a view mode on the Arbeidsliste are a different thing, and pushing them
-- into that table would widen what a layout means in order to avoid a column.
-- Same mechanism, own storage.»
--
-- ── WHAT IS A COOKIE AND WHAT IS A COLUMN, AND WHY THE SPLIT IS NOT EVEN ───
--
-- Q122's shape is: the PERSON's choice is a cookie, the ORGANISATION's default
-- is a column. Both halves are here, and the halves do NOT cover the same
-- ground — which is the part worth writing down rather than discovering later:
--
--   * `heituva.worklist` (cookie) carries the whole per-person state: the view
--     mode AND the five column toggles. «Huskes på denne enheten» is true of a
--     cookie and false of a column, which is Q122's own reason, and the
--     Arbeidsliste is a server component so localStorage cannot reach it.
--   * THIS COLUMN carries only the organisation's default VIEW MODE, and no
--     default column set. **There is no organisation-level fact about which
--     columns a person wants to see.** A house default for «list or board» is
--     a real choice — some organisations run this as a board and some as a
--     queue — while a house default for «show the score column» would be a
--     setting nobody asked for, and inventing the control to write it would be
--     the larger sin than leaving the asymmetry.
--
-- WHO WRITES THIS COLUMN: `saveCompany`, the same writer Q122's
-- `organizations.workspace` has, with its control beside that one in
-- Administrasjon → Firma. Named here because a column with no writer is a
-- feature reachable only from psql, and this project has four recorded
-- instances of exactly that.
--
-- Validated in the database rather than only at the boundary: an unknown value
-- would render as neither view, and the screen resolves against this same set
-- so an unknown cookie falls back exactly as an absent one does.

alter table public.organizations
  add column if not exists worklist_view text not null default 'list';

alter table public.organizations
  drop constraint if exists organizations_worklist_view_check;
alter table public.organizations
  add constraint organizations_worklist_view_check
  check (worklist_view in ('list', 'board'));

comment on column public.organizations.worklist_view is
  'The organisation''s default Arbeidsliste view — ''list'' or ''board''. What a '
  'person sees before they choose; their own choice is the cookie '
  '`heituva.worklist`, which also carries the column toggles this column '
  'deliberately does NOT cover (there is no organisation-level fact about which '
  'columns one person wants). Same mechanism as Q122''s `workspace`. WHO WRITES '
  'IT: saveCompany (Administrasjon → Firma), added in this phase.';
