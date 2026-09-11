-- W3 · V4:4444-4456 `lifts` — which use cases a workspace sorts to the top of
-- the template library.
--
-- A JOIN TABLE TO `use_cases`, NOT A `text[]` ON `workspaces` AND NOT A TITLE.
-- Q45 already settled this shape for `template_packs.use_case`: a foreign key
-- rather than an enum or a CHECK, because adding a use case must stay a row.
-- The same reasoning applies to naming one from a workspace, and the FK buys
-- the property an array could not — a lift CANNOT name a use case that does
-- not exist, so the library cannot be asked to sort by something it has never
-- heard of.
--
-- MEASURED BEFORE WRITING, NOT AFTER: the bundle's four lift values are `hr`,
-- `kunder`, `intern` and `medlem`, and all four are `use_cases` keys already
-- (M:0049:77). Nothing here invents a category, and the totality is asserted in
-- `tests/db/workspaces.test.ts` the way V1-5 asserted the pack mapping.
--
-- WHO WRITES THIS TABLE? Nobody at runtime — a shipped registry, seeded here
-- and changed only by a later migration. Stated rather than left implicit.
create table if not exists public.workspace_use_case_lifts (
  workspace_key text not null references public.workspaces(key) on delete cascade,
  use_case_key  text not null references public.use_cases(key) on delete cascade,
  -- Rank within the workspace. The bundle's `lifts` is an ORDERED array and the
  -- order is meaningful: `quiz` lifts `medlem` above `hr`, so a column rather
  -- than relying on insertion order, which a table does not have.
  sort_order    int not null default 0,
  primary key (workspace_key, use_case_key)
);

alter table public.workspace_use_case_lifts enable row level security;

drop policy if exists workspace_use_case_lifts_sel on public.workspace_use_case_lifts;
create policy workspace_use_case_lifts_sel
  on public.workspace_use_case_lifts for select using (true);

grant select on public.workspace_use_case_lifts to anon, authenticated;

comment on table public.workspace_use_case_lifts is
  'W3: which use cases a workspace sorts first in the template library '
  '(V4:4444-4456 `lifts`). Shipped registry — two registry keys and a rank, '
  'no org id, no survey id, no count. CHECKED against that claim in '
  'tests/db/workspaces.test.ts rather than trusted.';

insert into public.workspace_use_case_lifts (workspace_key, use_case_key, sort_order) values
  ('hr',   'hr',     10),
  ('cx',   'kunder', 10),
  ('cx',   'intern', 20),
  ('quiz', 'medlem', 10),
  ('quiz', 'hr',     20)
  -- 'custom' lifts NOTHING, deliberately: V4:4456 writes `lifts:[]`, and the
  -- library keeps its own order. An absent row is the honest encoding of an
  -- empty array — a row with a null use case would be a lift that lifts
  -- nothing, which is a different and meaningless thing.
on conflict (workspace_key, use_case_key) do update set sort_order = excluded.sort_order;
