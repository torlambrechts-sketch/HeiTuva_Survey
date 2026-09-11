-- W0 · DECISIONS Q122 (where the selection lives), Q124 (bind by id).
--
-- v4 draws an «Arbeidsflate» chip in the header that decides which modules
-- Oversikt renders, how the template library is sorted, and what the product
-- calls the person who answers (V4:160-215, :272-485, :4441-4456).
--
-- The prototype holds all of it in two JS constants — `ORG_WORKSPACE = "hr"`
-- and a four-element `WORKSPACES` array. Here it is DATA: adding a workspace is
-- a row, not a component, exactly as `use_cases` (M:0049) made the catalogue a
-- row. The shape below is `use_cases`' shape on purpose, including the FK to
-- the shipped preset registry, because it is the same kind of object.
--
-- WHAT THIS MIGRATION DELIBERATELY DOES NOT CARRY, because Q119 answered it:
-- the bundle's chip tooltip claims the workspace «setter standardvalg for nye
-- undersøkelser». It does not, and there is no column here for it. Q17 makes a
-- statutory pack's policy a LOCK and a workspace a PREFERENCE, and a preference
-- cannot override a lock — so a `default_*` column on this table would be a
-- second writer of columns the pack already owns, racing it in exactly the case
-- the HR workspace exists for.

-- 1. The module registry ----------------------------------------------------
--
-- Six modules (V4:4442, `WS_MODULES`). A registry rather than an enum or a
-- CHECK for the reason Q45 gives about `template_packs.use_case`: both would
-- make adding a module a migration instead of a row.
--
-- WHO WRITES THIS TABLE? Nobody, at runtime — it is a SHIPPED registry, seeded
-- here and changed only by a later migration. Stated rather than left implicit,
-- because the standing question applies to a table as much as to a column.
create table if not exists public.workspace_modules (
  key        text primary key,
  label      text not null,
  sort_order int not null default 0
);

alter table public.workspace_modules enable row level security;

drop policy if exists workspace_modules_sel on public.workspace_modules;
create policy workspace_modules_sel on public.workspace_modules for select using (true);

grant select on public.workspace_modules to anon, authenticated;

comment on table public.workspace_modules is
  'W0: the six Oversikt modules a workspace can switch on. Shipped registry — '
  'no org id, no survey id, no number. Adding one is a row AND a renderer; a '
  'row with no renderer is the empty card M:0049 refused to ship.';

insert into public.workspace_modules (key, label, sort_order) values
  ('action',   'Krever handling',      10),
  ('duties',   'Lovpålagte frister',   20),
  ('loop',     'Sløyfen lukket',       30),
  ('activity', 'Svaraktivitet',        40),
  ('nps',      'NPS og kritikere',     50),
  ('quiz',     'Quiz og resultattavle', 60)
on conflict (key) do update set
  label = excluded.label, sort_order = excluded.sort_order;

-- 2. The workspace registry -------------------------------------------------
--
-- `preset_key` IS Q124, AND IT IS M:0049:22'S COLUMN VERBATIM. The bundle
-- writes the preset's TITLE — «Dashboard følger oppsettet «Arbeidsmiljø»» — and
-- a title is a poor key. It binds by `key` and the sentence renders
-- `dashboard_presets.title` from the joined row, so the displayed word stays
-- correct by construction rather than by being copied.
--
-- Measured before this column was written, not after: all three titles the
-- bundle names exist in the shipped registry (M:0047:161) — `arbeidsmiljo`,
-- `kundeopplevelse`, `medlem`. NULL is the Tilpasset case, which renders
-- «Dashboard beholder ditt eget oppsett» instead.
create table if not exists public.workspaces (
  key         text primary key,
  label       text not null,
  short       text not null,
  hint        text not null,
  -- Theme tokens, as the bundle writes them (V4:4444-4456). Strings rather
  -- than hexes because the tokens are the contract; a hex here would be a
  -- second place for the palette to be wrong.
  tint        text not null,
  dot         text not null,
  -- The vocabulary. THREE COLUMNS RATHER THAN ONE, because Norwegian needs
  -- the definite form («den ansatte») and a capitalised plural heading, and
  -- deriving either from the base word in the renderer would put grammar in a
  -- component. `persons_cap` is NOT stored: it is `initcap`-ed at the read
  -- site, which is the one derivation that is purely mechanical.
  person      text not null,
  person_def  text not null,
  persons     text not null,
  preset_key  text references public.dashboard_presets(key) on delete set null,
  sort_order  int not null default 0
);

alter table public.workspaces enable row level security;

drop policy if exists workspaces_sel on public.workspaces;
create policy workspaces_sel on public.workspaces for select using (true);

grant select on public.workspaces to anon, authenticated;

comment on table public.workspaces is
  'W0/Q122: the four arbeidsflater. Shipped registry — no org id, no survey '
  'id, no number — so it carries use_cases'' 5a3 allowlist reason and is '
  'CHECKED against it in tests/db/workspaces.test.ts rather than trusted.';

-- 3. Which modules a workspace shows ----------------------------------------
--
-- A join table rather than a `text[]` on `workspaces`, so the FK does the
-- validating work instead of a trigger. M:0047 needed a trigger for
-- `dashboard_presets.panels` because a panel spec is a jsonb object; a module
-- reference is one key, and a key has a foreign key.
create table if not exists public.workspace_module_links (
  workspace_key text not null references public.workspaces(key) on delete cascade,
  module_key    text not null references public.workspace_modules(key) on delete cascade,
  sort_order    int not null default 0,
  primary key (workspace_key, module_key)
);

alter table public.workspace_module_links enable row level security;

drop policy if exists workspace_module_links_sel on public.workspace_module_links;
create policy workspace_module_links_sel on public.workspace_module_links for select using (true);

grant select on public.workspace_module_links to anon, authenticated;

comment on table public.workspace_module_links is
  'W0: which modules each workspace shows by default (V4:4444-4456 `modules`). '
  'Shipped registry. The Tilpasset workspace''s per-person override is NOT '
  'here — Q122 puts the per-device choice in a cookie, not in the database.';

insert into public.workspaces (key, label, short, hint, tint, dot, person, person_def, persons, preset_key, sort_order) values
  ('hr',     'HR og arbeidsmiljø',  'HR',
   'Lovpålagte frister, svarprosent og oppgaver med hjemmel først.',
   'var(--sbg)', 'var(--ac)',  'ansatt',     'den ansatte',  'ansatte',      'arbeidsmiljo',    10),
  ('cx',     'Kunder og service',   'Kunder',
   'NPS i dag, trend og kritikere som venter på svar.',
   'var(--ac2)', '#2F5D2A',    'kunde',      'kunden',       'kunder',       'kundeopplevelse', 20),
  ('quiz',   'Quiz og arrangement', 'Quiz',
   'Start en quiz på ett klikk og se siste resultattavle.',
   'var(--ac3)', '#8A4B22',    'deltaker',   'deltakeren',   'deltakere',    'medlem',          30),
  ('custom', 'Tilpasset',           'Tilpasset',
   'Velg modulene du vil se. Valget huskes på denne enheten.',
   'var(--sf2)', 'var(--mut)', 'respondent', 'respondenten', 'respondenter', null,              40)
on conflict (key) do update set
  label = excluded.label, short = excluded.short, hint = excluded.hint,
  tint = excluded.tint, dot = excluded.dot,
  person = excluded.person, person_def = excluded.person_def, persons = excluded.persons,
  preset_key = excluded.preset_key, sort_order = excluded.sort_order;

insert into public.workspace_module_links (workspace_key, module_key, sort_order) values
  ('hr',     'action',   10), ('hr',     'duties',   20),
  ('hr',     'loop',     30), ('hr',     'activity', 40),
  ('cx',     'nps',      10), ('cx',     'activity', 20), ('cx', 'action', 30),
  ('quiz',   'quiz',     10), ('quiz',   'activity', 20),
  ('custom', 'action',   10), ('custom', 'loop',     20), ('custom', 'activity', 30)
on conflict (workspace_key, module_key) do update set sort_order = excluded.sort_order;

-- 4. The organisation's default --------------------------------------------
--
-- WHO WRITES THIS COLUMN? `saveCompany`, in the same phase that adds it —
-- app/(app)/administrasjon/actions.ts, the Firma tab, beside `timezone`. A
-- test asserts the action exists and writes the VALIDATED value rather than a
-- literal (`writesValidatedColumn`). This question is asked here, in writing,
-- beside the column, because four columns in this project have been fully
-- built, fully read, green on every gate and writable only from psql.
--
-- THE PER-PERSON CHOICE IS NOT A COLUMN (Q122). Oversikt is a server
-- component, so a `localStorage` value cannot reach the render that needs it —
-- that is not a preference between mechanisms, it is one of them not working.
-- A cookie can, it is per-device, and it keeps «Valget huskes på denne
-- enheten» TRUE, which a column would make false. Logged in DEVIATIONS because
-- the mechanism is not in the bundle.
--
-- THE FK IS `no action deferrable initially deferred`, NOT `restrict`.
-- Nothing in the product deletes a shipped registry row, so the two behave
-- identically today — and that is exactly when the choice is free to make.
-- Which columns in this predicate can change without the code in front of me?
-- `workspaces.key` (a later migration could retire a workspace) and
-- `organizations.workspace`. RESTRICT is checked immediately and cannot be
-- deferred, so a future migration that retires a workspace and re-points the
-- organisations in the same transaction would be refused mid-flight for a
-- state that is resolved by commit. Deferred says what is meant: no
-- organisation may be left pointing at a workspace that stopped existing.
alter table public.organizations
  add column if not exists workspace text not null default 'hr';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'organizations_workspace_fkey'
  ) then
    alter table public.organizations
      add constraint organizations_workspace_fkey
      foreign key (workspace) references public.workspaces(key)
      on delete no action
      deferrable initially deferred;
  end if;
end $$;

comment on column public.organizations.workspace is
  'W0/Q122: the organisation''s default arbeidsflate — what a person sees '
  'before they choose. The per-person choice is a COOKIE, not a column: '
  'Oversikt is a server component and localStorage cannot reach it, and '
  '«huskes på denne enheten» is true of a cookie and false of a column. '
  'WRITER: saveCompany (Administrasjon → Firma), added in the same phase.';
