-- V1-4 · DECISIONS Q26 (stream deferred), Q27 (presets without it), Q51 (the
-- registry is what a layout may name).
--
-- WHY THIS EXISTS AT ALL. Q51 makes a layout's panel keys registry rows, and
-- `dashboard_pins.panel_key` already points at `report_section_types`
-- (M:0024:9). But that registry is the REPORT's section list, and the two sets
-- are not the same set:
--
--   * the dashboard has «Lovpålagte frister» (duties), which is not a report
--     section — a report ABOUT the duties is the duty report, not a section;
--   * the report has `summary`, `method`, `participation`, `quotes` and
--     `actions`, which are prose and have no dashboard rendering. A layout
--     naming one of them would draw an empty panel, which under
--     "never fabricate data in the UI" is worse than refusing it.
--
-- So the registry gains two booleans rather than the project gaining a second
-- registry. One list, each surface asking for its own subset — data-not-code,
-- and the same shape `supports_group_filter` already has.

alter table public.report_section_types
  add column if not exists on_dashboard boolean not null default false;
alter table public.report_section_types
  add column if not exists in_report boolean not null default true;

comment on column public.report_section_types.on_dashboard is
  'Q51: a dashboard layout may name this key. The dashboard subset of the '
  'registry — not every report section is a panel, and not every panel is a '
  'report section.';
comment on column public.report_section_types.in_report is
  'The report-editor subset. False for a panel that has no prose form.';

-- The five report sections that are also dashboard panels, by the bundle's own
-- PANEL_LIB (NEW:2955-2963). `register` there is this registry's
-- `per_virksomhet` — the registry key wins, because it is what a layout stores.
update public.report_section_types set on_dashboard = true
 where key in ('trend', 'heatmap', 'drivers', 'themes', 'per_virksomhet');

-- The one panel that is not a report section.
insert into public.report_section_types (key, label, description, supports_group_filter, sort_order, on_dashboard, in_report)
values ('duties', 'Lovpålagte frister', 'Neste frist per plikt og hvem som er ansvarlig.', false, 90, true, false)
on conflict (key) do update
  set on_dashboard = excluded.on_dashboard, in_report = excluded.in_report;

-- Q26: THERE IS DELIBERATELY NO `stream` ROW.
--
-- The deferral and Q51's constraint turn out to be the same mechanism, which is
-- the tidiest thing in this phase: a layout may only name a registry row, so a
-- panel with no row cannot be composed into one — not by the picker, not by a
-- seeded preset, and not by a hand-written PostgREST call. The feature flag
-- below is what the PICKER reads to draw the bundle's own unavailable state
-- with its `req` chip (NEW:2962, 3666-3670); the missing row is what the
-- DATABASE enforces. They agree, and neither is load-bearing alone.
--
-- What lifting Q26 costs, so nobody thinks it is a flag flip: a new SECURITY
-- DEFINER reader over the answers vault with a rolling window, which
-- `threshold-policy.test.ts` #8b fails by construction until it calls
-- `app.k_for`, plus a differencing rule the suite has never had a shape for.
insert into public.feature_flags (key, org_id, enabled)
values ('event_stream_panel', null, false)
on conflict (key, org_id) do nothing;

-- Now that the dashboard subset exists, a layout is constrained to it rather
-- than to the whole registry (replaces the check installed by 0046).
create or replace function app.layout_keys_registered()
returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_bad text;
begin
  select string_agg(k, ', ') into v_bad
  from (
    select e->>'key' as k
    from jsonb_array_elements(new.panels) e
  ) t
  where t.k is null
     or not exists (
          select 1 from public.report_section_types r
           where r.key = t.k and r.on_dashboard
        );

  if v_bad is not null then
    raise exception
      'dashboard_layouts: panel key(s) not offered on the dashboard: %', v_bad
      using errcode = '23514';
  end if;
  return new;
end $$;

revoke all on function app.layout_keys_registered() from public, anon;

-- Q27: the shipped presets --------------------------------------------------
-- A registry, like benchmarks and report_section_types: readable by any
-- signed-in user, seeded once, not duplicated per organisation. An
-- organisation's OWN presets are `dashboard_layouts` rows with `user_id null`
-- (Q25); these are the six the product ships with.
create table if not exists public.dashboard_presets (
  key         text primary key,
  title       text not null,
  description text not null,
  panels      jsonb not null,
  tint        text,
  sort_order  int not null default 0
);

alter table public.dashboard_presets enable row level security;

create policy dashboard_presets_sel on public.dashboard_presets
  for select using (auth.role() = 'authenticated');

grant select on public.dashboard_presets to authenticated;
revoke all on public.dashboard_presets from anon;

-- The same rule as a saved layout, for the same reason: a seeded preset naming
-- a key the dashboard does not offer would be refused the moment a member
-- picked it, and a shipped default that cannot be applied is worse than a
-- missing one. Q27 is therefore enforced rather than remembered.
create or replace function app.preset_keys_registered()
returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_bad text;
begin
  select string_agg(k, ', ') into v_bad
  from (select jsonb_array_elements_text(new.panels) as k) t
  where not exists (
    select 1 from public.report_section_types r where r.key = t.k and r.on_dashboard
  );
  if v_bad is not null then
    raise exception 'dashboard_presets: panel key(s) not offered on the dashboard: %', v_bad
      using errcode = '23514';
  end if;
  return new;
end $$;

revoke all on function app.preset_keys_registered() from public, anon;

drop trigger if exists dashboard_presets_keys on public.dashboard_presets;
create trigger dashboard_presets_keys
  before insert or update of panels on public.dashboard_presets
  for each row execute function app.preset_keys_registered();

-- Q27, the two adjusted presets. «Kundeopplevelse» is drawn as
-- ["stream","themes","drivers"] and «Intern tjenestekvalitet» as
-- ["stream","drivers","themes"] (NEW:2976-2978); both lead with the deferred
-- panel. They are seeded WITHOUT it and their descriptions no longer promise
-- it — a description mentioning «løpende» beside a preset that cannot show it
-- is the fabricated-data rule one level up. Logged as D100.
insert into public.dashboard_presets (key, title, description, panels, tint, sort_order) values
  ('arbeidsmiljo', 'Arbeidsmiljø',
   'Utvikling, heatmap per team, drivere og temaer — pluss lovpålagte frister.',
   '["trend","heatmap","drivers","themes","duties"]'::jsonb, '#FBEBBE', 10),
  ('kundeopplevelse', 'Kundeopplevelse',
   'Tilfredshet over tid, hva som trekker opp og ned, og temaer i kommentarene.',
   '["trend","drivers","themes"]'::jsonb, '#CFE7E4', 20),
  ('intern_tjeneste', 'Intern tjenestekvalitet',
   'Servicedesk og støttefunksjoner: utvikling, høyest og lavest, frisvar.',
   '["trend","drivers","themes"]'::jsonb, '#FFFDF6', 30),
  ('leverandor', 'Leverandøroppfølging',
   'Hvem har svart, hvem mangler, hvor er avvikene — og fristene.',
   '["per_virksomhet","duties"]'::jsonb, '#FBD5C4', 40),
  ('offentlig', 'Offentlig sektor',
   'Innbyggertilfredshet over tid, per tjeneste, med temaer fra frisvarene.',
   '["trend","drivers","themes"]'::jsonb, '#F3E7DB', 50),
  ('medlem', 'Medlem og frivillig',
   'Medlemsundersøkelse per år og frivillige etter hvert arrangement.',
   '["trend","themes","heatmap"]'::jsonb, '#FBEBBE', 60)
on conflict (key) do update
  set title = excluded.title, description = excluded.description,
      panels = excluded.panels, tint = excluded.tint, sort_order = excluded.sort_order;
