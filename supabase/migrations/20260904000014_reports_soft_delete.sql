-- HeiTuva 0025 — a soft-deleted report was still visible to the roles that
-- could write it.
--
-- `reports` carried two permissive policies:
--
--   reports_sel  SELECT  is_org_member(org_id) AND deleted_at IS NULL
--   reports_cud  ALL     has_role(org_id, {administrator, redaktor})
--
-- Permissive policies are OR'd, and a FOR ALL policy's USING clause applies to
-- SELECT as well as to the write commands. So `reports_cud` granted SELECT
-- without the `deleted_at IS NULL` filter and defeated the narrower policy
-- beside it. Measured before this migration:
--
--   soft-deleted report visible to administrator: YES
--   soft-deleted report visible to redaktor     : YES
--   soft-deleted report visible to leser        : no
--
-- which is the half-state that matters: "deleted" really meant "hidden from
-- leser". A row in that state is the one that later turns up in an export, a
-- DSR response, or a count on a compliance screen, because every one of those
-- runs as somebody who could still see it.
--
-- The fix splits the write policy by command so no USING clause reaches SELECT
-- unfiltered. INSERT has no USING at all (there is no existing row to test), and
-- UPDATE/DELETE keep the role check AND gain the same `deleted_at IS NULL`
-- filter: a deleted report is not editable either, or "restore" would happen by
-- accident through the ordinary edit path.
--
-- Restoration is deliberately NOT possible through these policies. It is an
-- explicit administrative action on a path that does not exist yet; when it is
-- built it will be a SECURITY DEFINER RPC that says what it is doing, not an
-- UPDATE that happens to clear a column.
--
-- `surveys` was checked for the same shape and does NOT have it: it has no FOR
-- ALL policy, so its SELECT is governed solely by `surveys_sel`, which already
-- filters `deleted_at`. Verified, not assumed — see
-- tests/invariants/report-rls.test.ts, which pins both tables.

drop policy if exists reports_cud on public.reports;

create policy reports_ins on public.reports for insert
  with check (app.has_role(org_id, array['administrator', 'redaktor']::app.member_role[]));

create policy reports_upd on public.reports for update
  using (
    app.has_role(org_id, array['administrator', 'redaktor']::app.member_role[])
    and deleted_at is null
  )
  with check (app.has_role(org_id, array['administrator', 'redaktor']::app.member_role[]));

create policy reports_del on public.reports for delete
  using (
    app.has_role(org_id, array['administrator', 'redaktor']::app.member_role[])
    and deleted_at is null
  );

comment on table public.reports is
  'Soft-deleted rows (deleted_at not null) are invisible and immutable through '
  'every policy here, for every role. Restoration is an explicit administrative '
  'action, never an ordinary update.';
