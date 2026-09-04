-- HeiTuva 0018 — the archive trigger must not block the FK's own bookkeeping.
--
-- Fourth in the family of D50/D51, and this one is mine: the append-only
-- trigger I added in 20260904000004 refused every UPDATE on `duty_versions`,
-- including the ones PostgreSQL performs itself.
--
-- `duty_versions.report_id` and `.archived_by` are ON DELETE SET NULL. Deleting
-- an organisation cascades into `reports` and `org_members`, and each of those
-- deletions issues an UPDATE against duty_versions to null the reference — so
-- the trigger raised "duty_versions is append-only" and rolled the whole delete
-- back. The demo seed failed on its own cleanup, which is how this was found.
--
-- The distinction the trigger was missing: the ARCHIVE'S CONTENT is immutable,
-- but a foreign key going null because its target no longer exists is not an
-- edit of that content. So `duty_id`, `label`, `content_hash` and `published_at`
-- can never change — those are what a signature and an inspection rest on — and
-- the two references may be nulled only when the row they point at is actually
-- gone. A user nulling `report_id` by hand while the report still exists is
-- still refused.
create or replace function app.forbid_version_mutation() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    -- The duty is being deleted; its archive goes with it (D50).
    if old.duty_id is not null
       and not exists (select 1 from public.duties d where d.id = old.duty_id)
    then
      return old;
    end if;
    raise exception 'duty_versions is append-only';
  end if;

  -- UPDATE: the content is frozen, the references may be released by a cascade.
  if new.duty_id is not distinct from old.duty_id
     and new.label is not distinct from old.label
     and new.content_hash is not distinct from old.content_hash
     and new.published_at is not distinct from old.published_at
     and (new.report_id is not distinct from old.report_id
          or (new.report_id is null
              and not exists (select 1 from public.reports r where r.id = old.report_id)))
     and (new.archived_by is not distinct from old.archived_by
          or (new.archived_by is null
              and not exists (select 1 from public.org_members m where m.id = old.archived_by)))
  then
    return new;
  end if;

  raise exception 'duty_versions is append-only';
end $$;

comment on function app.forbid_version_mutation() is
  'The Arkiv is immutable in its content — duty_id, label, content_hash and '
  'published_at never change. The report_id and archived_by references may be '
  'nulled by ON DELETE SET NULL when their target is gone, which is the '
  'database maintaining its own keys rather than anybody editing the record.';
