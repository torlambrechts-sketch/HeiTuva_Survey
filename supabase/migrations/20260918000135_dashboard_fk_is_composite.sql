-- M:0135 — the dashboard FKs become composite, so a foreign dashboard cannot
-- be referenced at all.
--
-- FOUND BY A GATE, NOT BY REVIEW. `tests/db/fk-tenancy.test.ts` enumerates
-- every single-column foreign key between two org-scoped tables and failed
-- naming both of M:0132/M:0134's:
--
--     dashboard_layouts.dashboard_id
--     reports.dashboard_id
--
-- Both source tables carry `org_id` and so does `dashboards`, and a
-- single-column FK says nothing about whether the two agree. A layout in
-- organisation A could point at organisation B's dashboard, and NEITHER
-- table's RLS would notice: `dashboard_layouts_sel` checks the LAYOUT's org,
-- which is A and correct, and never asks whose dashboard it names.
--
-- The composite key makes that unrepresentable rather than merely wrong —
-- «prefer the shape where the wrong thing cannot be expressed over the shape
-- where it is merely not done». `reports.duty_id` already does exactly this
-- (`FOREIGN KEY (duty_id, org_id) REFERENCES duties(id, org_id)`), so this is
-- the schema's existing answer and not a new idea.
--
-- `dashboard_versions.dashboard_id` and `dashboard_shares.dashboard_id` are NOT
-- changed and are correctly absent from the gate's list: those tables have no
-- `org_id` of their own, so there are no two copies of the tenancy claim to
-- disagree. They reach the organisation only through this FK, which is why
-- M:0133's policies are an EXISTS over `dashboards`.

-- The target a composite FK needs. UNIQUE rather than a second primary key:
-- `id` stays the identity and this is the pair the children point at.
alter table public.dashboards
  add constraint dashboards_id_org_key unique (id, org_id);

-- dashboard_layouts. CASCADE is unchanged — a layout without its dashboard is
-- unreachable, and deleting the dashboard is how a person deletes the board.
alter table public.dashboard_layouts
  drop constraint dashboard_layouts_dashboard_id_fkey;
alter table public.dashboard_layouts
  add constraint dashboard_layouts_dashboard_id_fkey
  foreign key (dashboard_id, org_id) references public.dashboards(id, org_id)
  on delete cascade;

-- reports. SET NULL is unchanged and is the deliberate half of M:0134: a frozen
-- report outlives the arrangement that produced it, so deleting a dashboard
-- must not destroy published documents. Postgres nulls only the column named in
-- the clause, so `org_id` — which the report owns — stays.
alter table public.reports
  drop constraint reports_dashboard_id_fkey;
alter table public.reports
  add constraint reports_dashboard_id_fkey
  foreign key (dashboard_id, org_id) references public.dashboards(id, org_id)
  on delete set null (dashboard_id);
