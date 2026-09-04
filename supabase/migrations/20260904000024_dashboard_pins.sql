-- HeiTuva 0035 — the dashboard's "Legg i rapport" pin gets somewhere to live.
--
-- The design's pin is a two-step gesture across two screens: pin panels on the
-- dashboard, then "Åpne rapport (n)" opens a report editor containing exactly
-- those sections (HeiTuva.dc.html:831, 3046-3056). It was left unbuilt in
-- Phase 4 because the report editor did not exist and a pin would have stored
-- nothing (D46). It exists now.
--
-- A pin is one person's, not the organisation's: it is a working selection on
-- the way to a draft, and two colleagues looking at the same dashboard should
-- not fight over it. So the key is (org, user, panel).
--
-- `panel_key` is a foreign key into `report_section_types` rather than free
-- text, because that is precisely what a pin means — "this panel becomes that
-- report section". A new panel is a row in the registry, not a new enum here.
create table if not exists public.dashboard_pins (
  -- A surrogate key beside the natural one, because every other table here has
  -- an `id` and the tooling that enumerates them expects it. Uniqueness is
  -- still the triple: one row per member per panel.
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  panel_key  text not null references public.report_section_types(key) on delete cascade,
  created_at timestamptz not null default now(),
  unique (org_id, user_id, panel_key)
);

create index if not exists dashboard_pins_user_idx on public.dashboard_pins (org_id, user_id);

alter table public.dashboard_pins enable row level security;

-- Own pins only, and only inside an org you are a member of. Both halves are
-- load-bearing: membership alone would let a colleague clear your selection,
-- and the user check alone would let a former member keep writing rows.
create policy dashboard_pins_sel on public.dashboard_pins
  for select using (user_id = (select auth.uid()) and app.is_org_member(org_id));

create policy dashboard_pins_ins on public.dashboard_pins
  for insert with check (user_id = (select auth.uid()) and app.is_org_member(org_id));

create policy dashboard_pins_del on public.dashboard_pins
  for delete using (user_id = (select auth.uid()) and app.is_org_member(org_id));

comment on table public.dashboard_pins is
  'Per-member dashboard panel pins. Each row says "include this panel as a '
  'report section when I open a report from the dashboard".';
