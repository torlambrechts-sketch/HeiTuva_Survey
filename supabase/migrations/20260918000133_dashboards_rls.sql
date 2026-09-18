-- M:0133 — RLS for the three tables M:0132 added.
--
-- Scoped to org_id via `app.has_role`, following `ui_messages`' write policies
-- (M:0021): `org_id is not null and app.has_role(org_id, …)`, stated on the
-- WITH CHECK of an INSERT and on both halves of an UPDATE so a row can be
-- neither created outside the organisation nor moved out of it.
--
-- ── THE PART THAT IS NOT ui_messages' PATTERN ──────────────────────────────
--
-- `dashboard_versions` and `dashboard_shares` HAVE NO org_id. They reach the
-- organisation through `dashboard_id`, so every policy is an EXISTS over
-- `dashboards`. That is deliberate rather than an omission: a denormalised
-- org_id on a child is a second copy of the tenancy claim, and the two can
-- disagree — the child would then be readable by an organisation the parent
-- does not belong to. One claim, one place, joined at read time.
--
-- The cost is that the check is not visible in the row, which is exactly why
-- the cross-tenant denial is TESTED DIRECTLY rather than assumed from the
-- pattern. `ui_messages`' own org scope went untested for six phases behind a
-- green 5a3 because the test did not exist (C1). The pattern does not carry
-- itself.

alter table public.dashboards enable row level security;
alter table public.dashboard_versions enable row level security;
alter table public.dashboard_shares enable row level security;

-- ── dashboards ─────────────────────────────────────────────────────────────
-- Any member may SEE the organisation's dashboards — the picker lists them and
-- a shared one must be openable. Creating, renaming and deleting is a
-- redaktor's or an administrator's: a `leser` reads aggregates and does not
-- arrange them.
create policy dash_sel on public.dashboards for select
  using (app.is_org_member(org_id));

create policy dash_ins on public.dashboards for insert
  with check (org_id is not null
    and app.has_role(org_id, array['administrator','redaktor']::app.member_role[]));

create policy dash_upd on public.dashboards for update
  using (org_id is not null
    and app.has_role(org_id, array['administrator','redaktor']::app.member_role[]))
  with check (org_id is not null
    and app.has_role(org_id, array['administrator','redaktor']::app.member_role[]));

create policy dash_del on public.dashboards for delete
  using (org_id is not null
    and app.has_role(org_id, array['administrator','redaktor']::app.member_role[]));

-- ── dashboard_versions ─────────────────────────────────────────────────────
-- Readable by any member who can read the dashboard; written by the roles that
-- may change it. No UPDATE policy at all: a version is a record of an
-- arrangement at a moment, and editing one would make the history a claim
-- nobody can rely on. It can be created and it can be deleted with its parent.
create policy dashver_sel on public.dashboard_versions for select
  using (exists (select 1 from public.dashboards d
                  where d.id = dashboard_id and app.is_org_member(d.org_id)));

create policy dashver_ins on public.dashboard_versions for insert
  with check (exists (select 1 from public.dashboards d
                       where d.id = dashboard_id
                         and app.has_role(d.org_id, array['administrator','redaktor']::app.member_role[])));

create policy dashver_del on public.dashboard_versions for delete
  using (exists (select 1 from public.dashboards d
                  where d.id = dashboard_id
                    and app.has_role(d.org_id, array['administrator','redaktor']::app.member_role[])));

-- ── dashboard_shares ───────────────────────────────────────────────────────
-- A member may SEE how a dashboard is shared — that is what the «Delt med»
-- cell reads, and hiding it would leave a reader unable to tell whether what
-- they are looking at is visible to others. Only an ADMINISTRATOR may change
-- it: sharing decides who can see figures, which is the same class of decision
-- as the privacy panel's and belongs to the same role.
create policy dashshare_sel on public.dashboard_shares for select
  using (exists (select 1 from public.dashboards d
                  where d.id = dashboard_id and app.is_org_member(d.org_id)));

create policy dashshare_ins on public.dashboard_shares for insert
  with check (exists (select 1 from public.dashboards d
                       where d.id = dashboard_id
                         and app.has_role(d.org_id, array['administrator']::app.member_role[])));

create policy dashshare_upd on public.dashboard_shares for update
  using (exists (select 1 from public.dashboards d
                  where d.id = dashboard_id
                    and app.has_role(d.org_id, array['administrator']::app.member_role[])))
  with check (exists (select 1 from public.dashboards d
                       where d.id = dashboard_id
                         and app.has_role(d.org_id, array['administrator']::app.member_role[])));

create policy dashshare_del on public.dashboard_shares for delete
  using (exists (select 1 from public.dashboards d
                  where d.id = dashboard_id
                    and app.has_role(d.org_id, array['administrator']::app.member_role[])));

-- `anon` reaches none of these. F6's external share link will go through a
-- SECURITY DEFINER token RPC, not through a policy — the report share's shape
-- (report_for_share_token resolves a token and returns NO DATA, then
-- compose_report serves the figures k-gated).
revoke all on public.dashboards, public.dashboard_versions, public.dashboard_shares
  from public, anon;
grant select, insert, update, delete on public.dashboards to authenticated;
grant select, insert, delete on public.dashboard_versions to authenticated;
grant select, insert, update, delete on public.dashboard_shares to authenticated;
