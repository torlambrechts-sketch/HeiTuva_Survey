-- V1-4 · DECISIONS Q25 (ownership) and Q51 (what a layout may contain).
--
-- Q51 in one sentence: A LAYOUT STORES IDENTIFIERS, NEVER VALUES.
--
-- The reason it is a table rather than component state (which is all the bundle
-- has, NEW:3115-3117) is that a saved preset must reappear «neste gang»
-- (NEW:1026). The reason it is CONSTRAINED rather than just stored is that a
-- composable dashboard is a user-chosen set of aggregate queries, and an
-- aggregate query is a k-gate surface. Three constraints below make it a
-- SELECTION AMONG GATED READERS rather than a query of its own.
--
-- WHAT STOPS A SAVED LAYOUT OUTLIVING THE THRESHOLD IT WAS COMPOSED UNDER:
-- nothing in a layout can carry a k, because k is computed inside the RPC on
-- every call —
--
--   get_heatmap        M:0032:973
--   dashboard_summary  M:0032:1043
--     v_k int := (select coalesce(max(app.k_for(s.id)), 5) from public.surveys s
--                 where s.org_id = p_org and s.deleted_at is null
--                   and (p_surveys is null or s.id = any(p_surveys)));
--
-- — and `p_surveys` there is a FILTER, never a widener: the org scope and
-- `deleted_at` come first. So raising a survey's threshold from 5 to 8 tightens
-- every saved layout that selects it, immediately, without touching a layout
-- row. `tests/db/dashboard-layouts.test.ts` proves exactly that: save at 5,
-- raise to 8, replay, assert 8.
--
-- THE DAY SOMEONE WANTS A LAYOUT TO HOLD A COMPUTED THING — a cached count, a
-- pinned number, an "as of" figure — that is not a bigger layout, it is a
-- SNAPSHOT, and `result_snapshots` exists for it and already freezes the GATED
-- payload for the reason M:0001 states: "a snapshot taken from ungated data
-- would preserve a four-person cell forever, past the deletion that was
-- supposed to protect it." Do not widen `panels_shape` or `filters_shape` to
-- make room for a number. Reach for the snapshot.

create table if not exists public.dashboard_layouts (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  -- NULL = an ORGANISATION PRESET, readable by every member (Q25). A non-null
  -- user_id is one person's saved setup, exactly like dashboard_pins
  -- (M:0024:9-11, "a pin is one person's, not the organisation's").
  user_id    uuid references auth.users(id) on delete cascade,
  title      text not null check (length(btrim(title)) between 1 and 80),
  panels     jsonb not null default '[]'::jsonb,
  filters    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One title per owner. Two org presets called "Arbeidsmiljø" is a picker with
  -- two identical chips; two of a member's own is the same problem one scope in.
  unique (org_id, user_id, title)
);

create index if not exists dashboard_layouts_owner_idx
  on public.dashboard_layouts (org_id, user_id);

-- 1. EVERY PANEL KEY IS A REGISTRY ROW ---------------------------------------
-- `dashboard_pins.panel_key` already references report_section_types(key)
-- (M:0024:9); a jsonb array cannot carry a foreign key, so the same rule is a
-- trigger-checked constraint here. The effect is the one that matters: a layout
-- can only name readers that ALREADY EXIST. It cannot introduce a query.
-- Adding a panel is a registry row — data-not-code, as CLAUDE.md requires —
-- never a layout naming something new.
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
     or not exists (select 1 from public.report_section_types r where r.key = t.k);

  if v_bad is not null then
    raise exception
      'dashboard_layouts: panel key(s) not in report_section_types: %', v_bad
      using errcode = '23514';
  end if;
  return new;
end $$;

revoke all on function app.layout_keys_registered() from public, anon;

drop trigger if exists dashboard_layouts_keys on public.dashboard_layouts;
create trigger dashboard_layouts_keys
  before insert or update of panels on public.dashboard_layouts
  for each row execute function app.layout_keys_registered();

-- 2. A KEY-SET CHECK ON BOTH PAYLOADS ----------------------------------------
-- A CHECK may not contain a subquery, so `jsonb_array_elements(...)` in a NOT
-- EXISTS is rejected outright ("cannot use subquery in check constraint"). The
-- rule is expressed with jsonpath and the `-` operator instead, both immutable
-- and both legal here. That is a better answer than hiding the subquery inside
-- a function: a function in a CHECK is not re-validated on restore, and this
-- rule must hold for every row that has ever existed.
--
-- `jsonb_path_exists` returns NULL on a NULL input, and `not NULL` is NULL,
-- which a CHECK PASSES. The `is not null` conjuncts are what stop that. Today
-- the columns are NOT NULL so it cannot arise; the conjunct is what keeps this
-- constraint correct if someone ever relaxes that. (Second time this repo has
-- written this sentence — see 0044's schedules_custom_shape.)
alter table public.dashboard_layouts drop constraint if exists dashboard_layouts_panels_shape;
alter table public.dashboard_layouts add constraint dashboard_layouts_panels_shape check (
  panels is not null
  and jsonb_typeof(panels) = 'array'
  -- every element is an object
  and not jsonb_path_exists(panels, '$[*] ? (@.type() != "object")')
  -- carrying ONLY key and wide — stated as a key set, never as a blacklist: a
  -- blacklist is a list of the values someone thought of, and the whole point
  -- is that the next cached value has not been thought of yet
  and not jsonb_path_exists(panels, '$[*].keyvalue() ? (@.key != "key" && @.key != "wide")')
  -- and key is present and is a string, because the trigger below looks it up
  and not jsonb_path_exists(panels, '$[*] ? (!exists(@.key))')
  and not jsonb_path_exists(panels, '$[*] ? (@.key.type() != "string")')
);

alter table public.dashboard_layouts drop constraint if exists dashboard_layouts_filters_shape;
alter table public.dashboard_layouts add constraint dashboard_layouts_filters_shape check (
  filters is not null
  and jsonb_typeof(filters) = 'object'
  -- strip the three admissible keys; anything left is a key that may not be
  -- there. Same key-set shape as panels, one operator instead of a jsonpath.
  and (filters - 'period' - 'group_id' - 'survey_ids') = '{}'::jsonb
);

-- 3. AN ORGANISATION PRESET MAY NOT CARRY A GROUP FILTER ---------------------
-- Q51, Tor. A preset saved by an administrator with a group selected, then
-- picked by a leser, sends p_group to get_quotes and is refused (M:0032:658:
-- "leser: aggregates only, never filtered text"). That refusal is CORRECT and
-- presents as a broken panel. The boundary is structural instead.
--
-- Tor's addition, which the constraint alone does not deliver: the app must SAY
-- SO AT THE POINT OF SAVING. An administrator who saves an org preset with a
-- group filter set is told the group will not travel — see
-- `dashboard.preset.groupDropped` in messages/no.json. The CHECK alone turns a
-- correct refusal into a silent surprise, which is the shape this project keeps
-- meeting.
--
-- A PERSONAL layout may still carry a group: it is the author's own, and they
-- are the only reader.
alter table public.dashboard_layouts drop constraint if exists dashboard_layouts_preset_no_group;
alter table public.dashboard_layouts add constraint dashboard_layouts_preset_no_group check (
  user_id is not null
  or filters->>'group_id' is null
);

-- RLS -------------------------------------------------------------------------
alter table public.dashboard_layouts enable row level security;

-- Read: your own rows, plus the organisation's presets. Every member reads a
-- preset including a leser — a preset is a saved question, and Q25 gives the
-- organisation the first-run offer of them.
create policy dashboard_layouts_sel on public.dashboard_layouts
  for select using (
    app.is_org_member(org_id)
    and (user_id is null or user_id = (select auth.uid()))
  );

-- Write: your own rows only. Both halves of the predicate are load-bearing, and
-- pins' own comment says why (M:0024): membership alone would let a colleague
-- clear your setup, and the user check alone would let a former member keep
-- writing rows.
create policy dashboard_layouts_ins on public.dashboard_layouts
  for insert with check (
    app.is_org_member(org_id)
    and (
      user_id = (select auth.uid())
      -- An organisation preset is a shared artefact, so writing one is an
      -- editor act. A leser reads presets and saves none.
      or (user_id is null and app.has_role(org_id, array['administrator', 'redaktor']::app.member_role[]))
    )
  );

create policy dashboard_layouts_upd on public.dashboard_layouts
  for update using (
    app.is_org_member(org_id)
    and (
      user_id = (select auth.uid())
      or (user_id is null and app.has_role(org_id, array['administrator', 'redaktor']::app.member_role[]))
    )
  );

create policy dashboard_layouts_del on public.dashboard_layouts
  for delete using (
    app.is_org_member(org_id)
    and (
      user_id = (select auth.uid())
      or (user_id is null and app.has_role(org_id, array['administrator', 'redaktor']::app.member_role[]))
    )
  );

grant select, insert, update, delete on public.dashboard_layouts to authenticated;
revoke all on public.dashboard_layouts from anon;

comment on table public.dashboard_layouts is
  'Q51: a layout stores IDENTIFIERS, never values. Panel keys are registry rows; '
  'filters are period/group_id/survey_ids and nothing else. k is computed by the '
  'RPC on every call, so a layout cannot outlive the threshold it was composed '
  'under. A layout that needs to hold a computed thing is a result_snapshot.';

comment on column public.dashboard_layouts.user_id is
  'NULL = organisation preset, readable by every member, writable by editors. '
  'Non-null = one person''s saved setup, like dashboard_pins.';
