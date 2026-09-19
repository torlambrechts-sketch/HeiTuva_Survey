-- M:0137 — G1: a panel carries its own layout and its own scope.
--
-- F0 measured two modelling differences between v8 and what F1 built, and
-- this migration closes both. Measured again at G1 before writing, because a
-- gap recorded in one phase is a claim by the time the next one reads it:
--
--   span   the CHECK has permitted 1..6 since M:0132 — and NOTHING WRITES IT
--          AND NOTHING READS IT. `PanelEntry` is `{ key, wide }`, the screen
--          renders `xl:grid-cols-2` with `xl:col-span-2` for a wide panel, and
--          `grep -n '\bspan\b' lib/dashboard/ app/(app)/dashboard/*.ts` returns
--          one hit, in a comment. That is D208's FIRST face in our own schema,
--          introduced by me in M:0132: a column the constraint permits and no
--          code uses. G1 is where it gets its writer and its reader.
--   h, br  absent everywhere — no key, no CHECK clause, no code.
--   src,   absent. Filters are ONE object per layout and
--   per,   `dashboard_layouts_filters_shape` enforces exactly that:
--   grp    `((filters - 'period') - 'group_id') - 'survey_ids') = '{}'`.
--
-- ── WHAT v8 DRAWS, EACH VALUE FROM ITS OWN LINE ────────────────────────────
--
--   d.size  map key -> n       v8:7107 via panelSpan, clamped Math.min(cols, n)
--   d.h     map key -> lav|normal|hoy, v8:7108, minH 150px | 230px | 340px
--   d.br    map key -> boolean, v8:7109; when true the span becomes
--           "1 / span N" — a row BREAK, i.e. start at column 1
--   d.src   map key -> survey id | "alle"    v8:7124
--   d.per   map key -> runde|30|90|ar|alle   v8:7128
--   d.grp   map key -> group name | "alle"   v8:7132
--   d.cols  4 or 6, v8:8946 `repeat(N,minmax(0,1fr))`, chips at v8:8947
--
-- ── ONE DELIBERATE DEPARTURE FROM THE DRAWING'S SHAPE, AND WHY ─────────────
--
-- v8 keys SIX MAPS by panel key at the dashboard level. We put the values ON
-- THE PANEL ENTRY instead. This is not a style preference: a map keyed by panel
-- key keeps entries for panels that have been REMOVED — v8's own `patchDash`
-- never prunes `size`, `h`, `br`, `src`, `per` or `grp` when a panel goes, so
-- six orphans accumulate per removal and reappear if the panel is ever added
-- back, carrying a scope the user set months earlier. On the panel entry an
-- orphan is UNREPRESENTABLE, which is this project's stated preference: prefer
-- the shape where the wrong thing cannot be expressed over the shape where it
-- is merely not done. Panel ORDER already lives in the array, so nothing is
-- split across two places by doing this — it is joined.
--
-- ── AND ONE VOCABULARY NOT ADOPTED, STATED RATHER THAN SILENTLY DROPPED ────
--
-- v8's `per` has five values, three of which are DATE windows (`30`, `90`,
-- `ar`). Our period is three ROUND COUNTS — `q` = the latest round, `h` = the
-- latest two, `y` = all of them (page.tsx's `take`). Adopting v8's five would
-- put a second, incompatible vocabulary for «period» beside the dashboard-level
-- one the filters CHECK already names, and would need round selection the
-- product does not have. The per-panel OVERRIDE is what G1 was asked for; the
-- vocabulary is ours. `q|h|y` it is, and the divergence is logged rather than
-- hidden behind a mapping nobody can re-derive.

-- ── dashboard_layouts.cols ─────────────────────────────────────────────────
--
--   WHO WRITES IT: `setColumns` (app/(app)/dashboard/actions.ts), from the
--   two-chip control v8:8947 draws.
--   WHAT READS IT: the grid's `repeat(N,minmax(0,1fr))`, and `clampSpan`,
--   which is why a span may never exceed it.
--   4 or 6 only — v8 offers exactly those two and a span is clamped to the
--   column count, so a third value would make every stored span ambiguous.
alter table public.dashboard_layouts
  add column cols int not null default 6 check (cols in (4, 6));

comment on column public.dashboard_layouts.cols is
  'The panel grid''s column count, 4 or 6 (v8:8947). Written by setColumns; '
  'read by the grid template and by clampSpan. A panel span may not exceed it.';

-- ── the panels CHECK, restated ─────────────────────────────────────────────
--
-- The three STRUCTURAL clauses are restated unchanged so a reader can diff
-- them; only the key allowlist and the per-key value clauses move.
--
-- `span` keeps its 1..6 bound rather than being tied to `cols`: a CHECK cannot
-- read another column's value per row without a trigger, and the clamp that
-- matters at render time is `Math.min(cols, span)` — v8's own `panelSpan` does
-- exactly this, so a span stored under 6 columns and viewed under 4 narrows
-- rather than breaking. Storing the unclamped intent is what lets switching
-- 6 -> 4 -> 6 be lossless.
-- `set search_path = ''` because M:0096's catalogue sweep requires every
-- function in `app` and `public` to pin one, and it caught this on its first
-- run after the migration. The body calls only built-ins, so nothing here
-- resolves through a schema — which is exactly the reasoning that makes a
-- missing setting easy to justify and is not the rule. A CHECK's function runs
-- on WHOEVER WRITES THE ROW, so an unpinned path is resolved from a
-- caller-controlled search_path.
create or replace function app.panels_shape_ok(p jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select p is not null
    and jsonb_typeof(p) = 'array'
    and not jsonb_path_exists(p, '$[*]?(@.type() != "object")')
    and not jsonb_path_exists(p, '$[*].keyvalue()?(@."key" != "key" && @."key" != "wide" && @."key" != "span" && @."key" != "h" && @."key" != "br" && @."key" != "src" && @."key" != "per" && @."key" != "grp")')
    and not jsonb_path_exists(p, '$[*]?(!(exists (@."key")))')
    and not jsonb_path_exists(p, '$[*]?(@."key".type() != "string")')
    -- span: a whole number within the widest grid. Absent = the default width.
    and not jsonb_path_exists(p, '$[*]?(exists (@."span") && (@."span".type() != "number" || @."span" < 1 || @."span" > 6))')
    -- h: v8's three heights. Absent = "normal".
    and not jsonb_path_exists(p, '$[*]?(exists (@."h") && (@."h".type() != "string" || (@."h" != "lav" && @."h" != "normal" && @."h" != "hoy")))')
    -- br: a row break. Absent = false.
    and not jsonb_path_exists(p, '$[*]?(exists (@."br") && @."br".type() != "boolean")')
    -- src: ONE survey id, or absent meaning «inherit the dashboard's surveys».
    -- v8's sentinel "alle" is NOT stored: absent already means all, and two
    -- spellings of one state is how a value goes stale on one of them.
    and not jsonb_path_exists(p, '$[*]?(exists (@."src") && @."src".type() != "string")')
    -- per: OUR period vocabulary, not v8's. Absent = inherit.
    and not jsonb_path_exists(p, '$[*]?(exists (@."per") && (@."per".type() != "string" || (@."per" != "q" && @."per" != "h" && @."per" != "y")))')
    -- grp: a group id, or absent meaning «inherit». Same no-sentinel rule.
    and not jsonb_path_exists(p, '$[*]?(exists (@."grp") && @."grp".type() != "string")')
$$;

comment on function app.panels_shape_ok(jsonb) is
  'The panel array''s shape, in ONE place. dashboard_layouts and '
  'dashboard_versions both constrain the same structure, and M:0132 wrote it '
  'out twice — two copies of one rule, which is the defect this project has '
  'recorded repeatedly. A version must accept exactly what a layout accepts, '
  'or saving a version of a legal layout fails.';

alter table public.dashboard_layouts drop constraint dashboard_layouts_panels_shape;
alter table public.dashboard_layouts add constraint dashboard_layouts_panels_shape
  check (app.panels_shape_ok(panels));

-- AND THE VERSIONS TABLE MOVES WITH IT. M:0132 gave dashboard_versions its own
-- copy of the old allowlist. Left alone, saving a version of a layout carrying
-- `h` or `br` would be refused by a constraint nobody was looking at — the
-- failure landing far from the change that caused it, which is the shape this
-- project keeps paying for.
alter table public.dashboard_versions drop constraint dashboard_versions_panels_shape;
alter table public.dashboard_versions add constraint dashboard_versions_panels_shape
  check (app.panels_shape_ok(panels));
