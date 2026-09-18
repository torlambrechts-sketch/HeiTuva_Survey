-- M:0132 — PHASE F: the dashboard becomes an entity.
--
-- Until now a "dashboard" was a row in `dashboard_layouts` keyed
-- (org_id, user_id, title), and the product exposed exactly one per person —
-- the WORKING_TITLE row. T5 measured what that costs: v8's whole meta strip is
-- properties of a CURRENT dashboard chosen from several, so «Eier» could only
-- ever be the viewer, «Delt med» could only ever say «Ikke delt», and
-- «Rapporter» had no relation behind it at all.
--
-- F0 measured v8's own entity (docs/fidelity/f0-dashcur-model.md). Two of its
-- properties are deliberately NOT copied and are recorded here so the next
-- reader does not read the gap as an oversight:
--
--   * v8's filters are PER PANEL — `src`, `per` and `grp` are maps keyed by
--     panel key (v8:7122-7133). Ours stays one `filters` object per layout,
--     which is what `dashboard_layouts_filters_shape` already enforces.
--   * v8's panel carries THREE layout values — `size` (span), `h` (height) and
--     `br` (row break, v8:7110). Only `span` is added here, because that is what
--     the cols model needs to render; height and break are raised, not built.
--
-- And v8 draws NO dashboard version history: every `versions:` in that file
-- belongs to a statutory duty. `dashboard_versions` below is our design, and
-- the only precedent for what a snapshot may hold is `freezeToReport`
-- (v8:7065), which stores panel KEYS and a threshold and never a figure.

-- ── dashboards ─────────────────────────────────────────────────────────────
--
-- WHO WRITES / WHAT READS, per column (invariant 8, both faces):
--   id          written by the default; read by every child table's FK.
--   org_id      written by `createDashboard` (app/(app)/dashboard/actions.ts);
--               read by every RLS policy below. NOT NULL — a dashboard outside
--               an organisation would be unreachable and unprotectable.
--   title       written by `createDashboard` and `renameDashboard`; read by the
--               meta bar's header and by the picker.
--   owner_id    written by `createDashboard` from the session; read by the meta
--               bar's «Eier» cell and by the delete guard. NULLABLE and
--               ON DELETE SET NULL deliberately: an organisation's dashboard
--               must survive the person who made it leaving, and a dangling
--               owner is a fact ("nobody owns this now"), not a broken row.
--               v8's own `owner` has NO writer at all (F0) — it is seeded and
--               never set — so this is the column its drawing implies rather
--               than the one it has.
--   created_at  written by the default; read by the picker's ordering.
--   updated_at  written by `touch_updated_at`, the trigger every table here
--               already uses; read by nothing yet — stated rather than assumed,
--               because a column with no reader is D208's second face and the
--               honest answer today is "nothing".
create table public.dashboards (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  owner_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index dashboards_org_idx on public.dashboards (org_id);
create trigger dashboards_touch before update on public.dashboards
  for each row execute function app.touch_updated_at();

comment on table public.dashboards is
  'A named dashboard. The layout lives in dashboard_layouts.dashboard_id; '
  'versions in dashboard_versions; sharing in dashboard_shares. Holds no '
  'figures — every number on a dashboard is fetched through a k-gated RPC at '
  'render time.';

-- ── dashboard_layouts gains its parent ─────────────────────────────────────
--
--   dashboard_id  written by the backfill below and by `saveLayout`; read by
--                 the dashboard page to load the right flate. NULLABLE for now:
--                 `dashboard_presets` are registry rows and the org-level
--                 layouts predate this table, so a NOT NULL would have to
--                 invent a parent for rows that legitimately have none.
alter table public.dashboard_layouts
  add column dashboard_id uuid references public.dashboards(id) on delete cascade;

create index dashboard_layouts_dashboard_idx on public.dashboard_layouts (dashboard_id);

-- THE BACKFILL. One dashboard per existing layout row, so nobody loses a
-- layout: the dashboard takes the layout's own title and its user as owner
-- (NULL for an organisation-level row, which is correct — it belongs to the
-- organisation and not to a person).
with made as (
  insert into public.dashboards (org_id, title, owner_id)
  select l.org_id, l.title, l.user_id
  from public.dashboard_layouts l
  where l.dashboard_id is null
  returning id, org_id, title, owner_id
)
update public.dashboard_layouts l
   set dashboard_id = m.id
  from made m
 where l.org_id = m.org_id
   and l.title = m.title
   and l.user_id is not distinct from m.owner_id
   and l.dashboard_id is null;

-- ── the panels CHECK gains `span` ──────────────────────────────────────────
--
-- The constraint as it stood, verbatim, so the change is readable:
--
--   panels IS NOT NULL AND jsonb_typeof(panels) = 'array'
--   AND NOT jsonb_path_exists(panels, '$[*]?(@.type() != "object")')
--   AND NOT jsonb_path_exists(panels, '$[*].keyvalue()?(@."key" != "key" && @."key" != "wide")')
--   AND NOT jsonb_path_exists(panels, '$[*]?(!(exists (@."key")))')
--   AND NOT jsonb_path_exists(panels, '$[*]?(@."key".type() != "string")')
--
-- Only the key ALLOWLIST clause moves: `wide` stays (it is what every existing
-- row carries) and `span` joins it. The three structural clauses are restated
-- unchanged rather than rewritten, so a reader can diff them.
--
--   span  written by the panel's size chips; read by the grid to emit
--         `grid-column: span N`. An integer 1..6 — v8's cols is 4 or 6 and a
--         span may never exceed its own grid (v8:8952 clamps with
--         `Math.min(n, ...)`), so 6 is the ceiling either way.
alter table public.dashboard_layouts drop constraint dashboard_layouts_panels_shape;
alter table public.dashboard_layouts add constraint dashboard_layouts_panels_shape check (
  panels is not null
  and jsonb_typeof(panels) = 'array'
  and not jsonb_path_exists(panels, '$[*]?(@.type() != "object")')
  and not jsonb_path_exists(panels, '$[*].keyvalue()?(@."key" != "key" && @."key" != "wide" && @."key" != "span")')
  and not jsonb_path_exists(panels, '$[*]?(!(exists (@."key")))')
  and not jsonb_path_exists(panels, '$[*]?(@."key".type() != "string")')
  -- A span that is present must be a whole number within the grid. Absent is
  -- allowed and means "the default width", which is what every row today has.
  and not jsonb_path_exists(panels, '$[*]?(exists (@."span") && (@."span".type() != "number" || @."span" < 1 || @."span" > 6))')
);

-- ── dashboard_versions ─────────────────────────────────────────────────────
--
-- PANELS ONLY. NO RENDERED FIGURE IS EVER STORED IN THIS TABLE. A version is
-- the arrangement — which panels, in what order, at what span — and nothing
-- else. Restoring one writes the layout and then re-fetches every number
-- through `app.k_for` exactly as a first load does, so a version saved when a
-- survey's threshold was 2 shows that survey's CURRENT gate after a restore,
-- never the old one. Storing figures would make this table a way to read a
-- suppressed cell by restoring an old enough version, which is invariant 1
-- condition 2 — "otherwise a suppressed cell can be read by waiting" — with
-- the waiting done in advance.
--
--   dashboard_id  written by `saveVersion`; read by the history list. CASCADE:
--                 a deleted dashboard's versions are not a record of anything.
--   version       written by `saveVersion` as max+1 per dashboard; read by the
--                 history list and the restore. UNIQUE with dashboard_id.
--   panels        written by `saveVersion` from the live layout; read by the
--                 restore. Same shape and same CHECK as the layout's.
--   created_at    written by the default; read by the history list.
--   created_by    written by `saveVersion` from the session; read by the
--                 history list. ON DELETE SET NULL for the owner_id reason.
create table public.dashboard_versions (
  id uuid primary key default gen_random_uuid(),
  dashboard_id uuid not null references public.dashboards(id) on delete cascade,
  version int not null,
  panels jsonb not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  unique (dashboard_id, version),
  constraint dashboard_versions_panels_shape check (
    panels is not null
    and jsonb_typeof(panels) = 'array'
    and not jsonb_path_exists(panels, '$[*]?(@.type() != "object")')
    and not jsonb_path_exists(panels, '$[*].keyvalue()?(@."key" != "key" && @."key" != "wide" && @."key" != "span")')
    and not jsonb_path_exists(panels, '$[*]?(!(exists (@."key")))')
    and not jsonb_path_exists(panels, '$[*]?(@."key".type() != "string")')
  )
);

comment on table public.dashboard_versions is
  'Saved arrangements of a dashboard: panel keys and spans. NEVER a rendered '
  'figure — a restore re-fetches every number through the k-gated RPCs, so an '
  'old version cannot surface a cell the current threshold suppresses.';

-- ── dashboard_shares ───────────────────────────────────────────────────────
--
--   dashboard_id  written by `shareDashboard`; read by the read path. CASCADE.
--   scope         written by `shareDashboard`; read by the read path. 'role'
--                 means "everyone in the organisation holding `role`";
--                 'link' is the external token share, which F6 builds and this
--                 migration only makes representable.
--   role          written by `shareDashboard` when scope = 'role'; read by the
--                 read path. v8's three, verbatim from v8:8980-8982.
--   token_hash    NULL until F6. Hashed at rest like every other token here
--                 (invariant 5) — the raw token is shown once and never stored.
--   created_by    written from the session; read by the audit trail.
--
-- A CHECK ties scope to its own column so neither can be set without the other:
-- a 'role' share with no role, or a 'link' share with no token, is not a share.
create table public.dashboard_shares (
  id uuid primary key default gen_random_uuid(),
  dashboard_id uuid not null references public.dashboards(id) on delete cascade,
  scope text not null check (scope in ('role','link')),
  role app.member_role,
  token_hash text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint dashboard_shares_scope_matches_column check (
    (scope = 'role' and role is not null and token_hash is null)
    or (scope = 'link' and token_hash is not null and role is null)
  )
);

create index dashboard_shares_dashboard_idx on public.dashboard_shares (dashboard_id);
create unique index dashboard_shares_token_idx on public.dashboard_shares (token_hash)
  where token_hash is not null;

comment on table public.dashboard_shares is
  'Who may read a dashboard besides its owner. Sharing NEVER widens k: a '
  'reader goes through the same SECURITY DEFINER RPCs the owner does, each of '
  'which calls app.k_for. scope=link is reserved for F6 and nothing serves it '
  'yet.';
