-- HeiTuva 0042 — index the organisation-override read on ui_messages.
--
-- Phase 7: an organisation's overrides are read on every signed-in request
-- (lib/i18n/messages.ts, fetchOrgOverrides) rather than through the data
-- cache, because `unstable_cache` answers the first read after `revalidateTag`
-- with the stale entry — an administrator who pressed "Lagre" saw the old copy
-- once. The read is `where lang = ? and org_id = ?`; the unique index from
-- migration 0026 leads on (namespace, key) and does not serve it. Partial, so
-- the shipped rows (org_id null, the bulk of the table) stay out of it.
create index if not exists ui_messages_org_lang_idx
  on public.ui_messages (org_id, lang)
  where org_id is not null;
