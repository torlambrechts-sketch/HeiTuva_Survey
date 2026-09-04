-- HeiTuva 0023 — somewhere to put an exported report.
--
-- `report_exports.storage_path` has been NOT NULL since Phase 0 and there has
-- never been a bucket to point it at, so the row could not be written and the
-- export had nowhere to live. This adds the bucket and its policies in the same
-- migration, the same rule as a table (CLAUDE.md invariant 3): storage objects
-- are rows in `storage.objects`, and an unpoliced bucket is an unpoliced table.
--
-- PRIVATE, not public. A rendered report is the most concentrated form of
-- result data in the product — every section a viewer was allowed to see,
-- already composed — so a guessable object URL would hand out in one request
-- what `compose_report` spends three rules protecting. Reads go through signed
-- URLs with a short life (CLAUDE.md invariant 5: signed URLs only for Storage).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('report-exports', 'report-exports', false, 20971520,
        array['application/pdf',
              'application/vnd.openxmlformats-officedocument.presentationml.presentation'])
on conflict (id) do nothing;

-- Path shape: <org_id>/<report_id>/<export_id>.<ext>. The org id is the first
-- segment precisely so the policies can be org-scoped by prefix without
-- joining back to `reports` — the same tenancy root as every RLS policy in the
-- schema, checked with `app.is_org_member`.
drop policy if exists rexport_obj_sel on storage.objects;
create policy rexport_obj_sel on storage.objects for select
  using (
    bucket_id = 'report-exports'
    and app.is_org_member(((storage.foldername(name))[1])::uuid)
  );

-- Only the two writing roles may put an object there, matching
-- `report_exports.rexports_ins`. A leser can read an export that exists (they
-- may be its audience) and can never create one.
drop policy if exists rexport_obj_ins on storage.objects;
create policy rexport_obj_ins on storage.objects for insert
  with check (
    bucket_id = 'report-exports'
    and app.has_role(((storage.foldername(name))[1])::uuid,
                     array['administrator', 'redaktor']::app.member_role[])
  );

-- No update policy at all. An export is evidence of what a report said on a
-- date — a statutory archive points at one — so it is written once and
-- replaced by a new export, never edited in place.
drop policy if exists rexport_obj_del on storage.objects;
create policy rexport_obj_del on storage.objects for delete
  using (
    bucket_id = 'report-exports'
    and app.has_role(((storage.foldername(name))[1])::uuid,
                     array['administrator']::app.member_role[])
  );
