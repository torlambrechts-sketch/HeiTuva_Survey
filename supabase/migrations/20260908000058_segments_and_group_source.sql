-- V2-3a · Målgrupper. DECISIONS Q92, Q93, Q94, Q65, Q63.
--
-- ── WHY SEGMENTS GET THEIR OWN TABLE, AGAINST THE PLAN'S OWN SCHEMA LINE ────
--
-- `docs/v2/03-plan.md` says «`groups` gains `kind ('gruppe'|'segment')`». That
-- line predates Q92 and Q92's reasoning overturns it.
--
-- Q93 is promoted as «closed by Q92 — the possibility is REMOVED rather than
-- filtered at each site». Measured, that is only true if a segment is not a row
-- in `groups`:
--
--     select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--      where n.nspname in ('public','app')
--        and p.prosrc ~ 'from\s+public\.groups|join\s+public\.groups';
--     -->  compose_report, get_heatmap, results_summary
--
-- All three iterate every group row in the organisation UNFILTERED. With a
-- `kind` column, each would need a `kind = 'gruppe'` predicate, and a fourth
-- reader added later would inherit segment rows into a heatmap by forgetting
-- one — the exact shape Tor just ruled must be solved STRUCTURALLY rather than
-- by scheduling or vigilance. A separate table makes the leak UNREPRESENTABLE:
-- `responses.respondent_group_id` references `public.groups`, so a segment id
-- cannot reach the breakdown axis even by mistake.
--
-- **K DOES NOT COMPOSE (Q92), and that is what this shape protects.** Two
-- segments of five answers with an intersection of two disclose the two by
-- subtraction. A segment is therefore a FILTER — it selects the population
-- being looked at — and never a breakdown axis beside groups. Making it a
-- different kind of object is how that stays true without anyone remembering.
--
-- What `groups` does gain is only provenance: `source` and `synced_at`, for the
-- directory-sync columns the design shows. No `kind`.

-- 1. The field registry a segment rule may name ------------------------------
-- DECISIONS Q65: a structured predicate over an ALLOWLISTED field set, never
-- free text evaluated in SQL. The allowlist is DATA (CLAUDE.md, data-not-code)
-- for the same reason `brand_accents` and `use_cases` are: adding a field is a
-- row once the column behind it exists.
--
-- `available = false` rows are deliberate and are the honest half. The bundle's
-- own examples use `stillingsprosent`, `startdato` and `land` (V2:4319-4322) —
-- HR fields this product does not hold. Q65: «the rule editor must say so
-- rather than offering fields that can never match». Seeding them unavailable
-- is what lets the editor say so; omitting them would leave the editor silently
-- shorter than the design with no explanation anywhere.
create table if not exists public.segment_fields (
  key           text primary key,
  -- The `org_members` column this field reads. NULL when the product has no
  -- column for it — which is precisely what makes the field unavailable.
  source_column text,
  value_kind    text not null check (value_kind in ('enum', 'uuid', 'date', 'text')),
  available     boolean not null default true,
  sort_order    int not null default 0,
  constraint segment_fields_available_needs_column
    check (not available or source_column is not null)
);

alter table public.segment_fields enable row level security;

-- Public by design, same reason `use_cases` and `brand_accents` carry: a field
-- definition holds no org id, no survey id and no count. Checked rather than
-- asserted — `tests/db/segments.test.ts` asserts the column list.
drop policy if exists segment_fields_sel on public.segment_fields;
create policy segment_fields_sel on public.segment_fields for select using (true);
grant select on public.segment_fields to anon, authenticated;

comment on table public.segment_fields is
  'Q65: the fields a segment predicate may name. Data, not code — a field is a '
  'row once the column behind it exists. Rows with available = false are the '
  'fields the v2 bundle draws (stillingsprosent, startdato, land) that this '
  'product has no column for; they are seeded so the editor can SAY they are '
  'unavailable rather than being silently shorter than the design.';

insert into public.segment_fields (key, source_column, value_kind, available, sort_order) values
  ('role',         'role',       'enum', true,  1),
  ('status',       'status',     'enum', true,  2),
  ('group',        'group_id',   'uuid', true,  3),
  ('member_since', 'created_at', 'date', true,  4),
  -- Drawn by the design, no column in this product. See the table comment.
  ('stillingsprosent', null, 'text', false, 10),
  ('startdato',        null, 'date', false, 11),
  ('land',             null, 'text', false, 12)
on conflict (key) do update
  set source_column = excluded.source_column,
      value_kind    = excluded.value_kind,
      available     = excluded.available,
      sort_order    = excluded.sort_order;

-- 2. Segments -----------------------------------------------------------------
create table if not exists public.segments (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  name       text not null,
  -- An ARRAY of {field, op, value} clauses, AND-ed. Data the database stores
  -- and never executes: nothing in this schema interpolates it into SQL, and
  -- `tests/db/segments.test.ts` asserts that no function body does either.
  predicate  jsonb not null default '[]'::jsonb,
  source     text,
  synced_at  timestamptz,
  created_at timestamptz not null default now(),
  unique (org_id, name)
);

alter table public.segments enable row level security;

comment on table public.segments is
  'DECISIONS Q92: a segment is a RULE and a FILTER — it selects the population '
  'being looked at. It is NEVER a breakdown axis beside groups, because k does '
  'not compose: two segments of five with an intersection of two disclose the '
  'two by subtraction. Deliberately NOT a row in public.groups — '
  'responses.respondent_group_id references that table, and three RPCs iterate '
  'it unfiltered, so a shared table would put a segment into a heatmap the '
  'moment a fourth reader forgot a predicate. Membership is never stored: it is '
  'evaluated when asked, and frozen into survey_invitations at send (Q64).';

comment on column public.segments.predicate is
  'Q65: {field, op, value} clauses over public.segment_fields. STORED AS DATA '
  'AND NEVER EXECUTED. The rendered rule text is generated from this, so it '
  'translates and cannot drift from what is stored.';

-- Reads: any member of the organisation, like `groups_sel`.
drop policy if exists segments_sel on public.segments;
create policy segments_sel on public.segments for select
  using (app.is_org_member(org_id));

-- Writes: Q94's answer applied here too — creating an audience is not a privacy
-- setting, and a redaktør who may send to a list may compose one.
drop policy if exists segments_ins on public.segments;
create policy segments_ins on public.segments for insert
  with check (app.has_role(org_id, array['administrator', 'redaktor']::app.member_role[]));

drop policy if exists segments_upd on public.segments;
create policy segments_upd on public.segments for update
  using (app.has_role(org_id, array['administrator', 'redaktor']::app.member_role[]))
  with check (app.has_role(org_id, array['administrator', 'redaktor']::app.member_role[]));

-- Deletion stays administrator-only, and the asymmetry is deliberate: making an
-- audience is routine, removing one destroys a reference a past round's history
-- may explain itself by.
drop policy if exists segments_del on public.segments;
create policy segments_del on public.segments for delete
  using (app.has_role(org_id, array['administrator']::app.member_role[]));

grant select, insert, update, delete on public.segments to authenticated;

-- 3. The predicate is validated at WRITE time, against the registry ----------
-- A rule naming a field outside the allowlist is refused by the database, not
-- by the form — the form is one caller.
create or replace function app.validate_segment_predicate()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_clause jsonb;
  v_field  text;
  v_op     text;
  v_ok     boolean;
begin
  if jsonb_typeof(new.predicate) <> 'array' then
    raise exception 'segment_predicate_not_an_array'
      using hint = 'A predicate is an array of {field, op, value} clauses.';
  end if;

  for v_clause in select * from jsonb_array_elements(new.predicate) loop
    v_field := v_clause->>'field';
    v_op    := v_clause->>'op';

    -- The op set is closed and small. Anything outside it is refused rather
    -- than passed through, because an unknown operator is the shape that turns
    -- a stored predicate into an executed one later.
    if v_op is null or v_op not in ('eq', 'ne', 'in', 'lt', 'gt') then
      raise exception 'segment_op_not_allowed: %', coalesce(v_op, '(null)')
        using hint = 'Allowed operators: eq, ne, in, lt, gt.';
    end if;

    select f.available into v_ok
      from public.segment_fields f where f.key = v_field;

    if v_ok is null then
      raise exception 'segment_field_not_allowed: %', coalesce(v_field, '(null)')
        using hint = 'The field is not in public.segment_fields.';
    end if;

    -- An unavailable field is refused with a DIFFERENT message, because the two
    -- cases mean different things to whoever reads it: one is a typo, the other
    -- is a field this product does not hold yet.
    if not v_ok then
      raise exception 'segment_field_unavailable: %', v_field
        using hint = 'This product has no column for that field yet.';
    end if;
  end loop;

  return new;
end $$;

drop trigger if exists segments_validate_predicate on public.segments;
create trigger segments_validate_predicate
  before insert or update on public.segments
  for each row execute function app.validate_segment_predicate();

-- 4. Groups gain provenance only, and Q94's fix ------------------------------
alter table public.groups add column if not exists source text;
alter table public.groups add column if not exists synced_at timestamptz;

comment on column public.groups.source is
  'Where the group came from — null for hand-made, otherwise the directory that '
  'supplied it. NOT a kind discriminator: segments are public.segments (Q92).';

-- DECISIONS Q94 — a defect, not a decision. `groups_cud_ins` was administrator-
-- only (`M:0030:57`) while Send is a redaktør surface, so «Lagre som målgruppe»
-- refused for exactly the role the design shows using it.
drop policy if exists groups_cud_ins on public.groups;
create policy groups_cud_ins on public.groups for insert
  with check (app.has_role(org_id, array['administrator', 'redaktor']::app.member_role[]));

drop policy if exists groups_cud_upd on public.groups;
create policy groups_cud_upd on public.groups for update
  using (app.has_role(org_id, array['administrator', 'redaktor']::app.member_role[]))
  with check (app.has_role(org_id, array['administrator', 'redaktor']::app.member_role[]));

-- Delete unchanged: administrator only. A group is referenced by
-- survey_invitations.group_id and responses.respondent_group_id, both ON DELETE
-- SET NULL, so removing one blanks a past round's breakdown labels.
