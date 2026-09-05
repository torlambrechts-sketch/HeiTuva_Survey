-- HeiTuva 0037 — the translation editor needs `ui_messages` to be tenant-safe.
--
-- The table shipped global (no `org_id`) with this policy:
--
--   create policy i18n_upd on public.ui_messages for update
--     using (exists (select 1 from public.org_members m where m.user_id = auth.uid()
--                    and m.role = 'administrator' and m.status = 'active'));
--
-- Read it carefully: it asks whether the caller is an administrator of ANY
-- organisation, and the row it then lets them rewrite belongs to EVERY
-- organisation. Nothing exploited it because no screen ever wrote here — the
-- seed and Studio both use the service role — but Phase 6's editor (Q12) is
-- exactly that screen, and shipping it against this policy would hand one
-- customer's administrator the UI copy of every other customer.
--
-- CLAUDE.md invariant 3 says org-scoped via app.is_org_member / app.has_role,
-- and this policy uses neither. So the fix comes before the feature.
--
-- The shape is the one `feature_flags` already uses, so this is an existing
-- pattern rather than a new one: a row with `org_id` NULL is the shipped
-- default, and a row for an org overrides it FOR THAT ORG ONLY. Global rows
-- stay the vendor's, writable by the service role alone; an administrator may
-- only ever create, change or remove rows carrying their own `org_id`.

-- A surrogate key, because (namespace, key, lang) is no longer unique once an
-- org can hold its own copy of the same message — and because Gate 5a3
-- enumerates every RLS table by `id`.
alter table public.ui_messages add column if not exists id uuid not null default gen_random_uuid();
alter table public.ui_messages add column if not exists org_id uuid
  references public.organizations(id) on delete cascade;

alter table public.ui_messages drop constraint if exists ui_messages_pkey;
alter table public.ui_messages add primary key (id);

-- Uniqueness over a NULLABLE org_id needs help: in a plain
-- `unique (namespace, key, lang, org_id)` every global row is distinct from
-- every other global row, because NULL never equals NULL — the opposite of
-- "one shipped default per key".
--
-- The obvious fix is two partial indexes, and it is the wrong one here: a
-- partial index is only inferrable as an `on conflict` target when the
-- statement repeats its WHERE clause, which PostgREST does not emit. Both
-- writers upsert (the seeder for global rows, the editor for an org's), so the
-- constraint has to be a plain one. A generated column carries the NULL case
-- into a real value and makes it so.
alter table public.ui_messages
  add column if not exists org_key uuid
  generated always as (coalesce(org_id, '00000000-0000-0000-0000-000000000000'::uuid)) stored;

create unique index if not exists ui_messages_scope_uk
  on public.ui_messages (namespace, key, lang, org_key);

drop policy if exists i18n_sel on public.ui_messages;
drop policy if exists i18n_upd on public.ui_messages;

-- Select stays open. It was `using (true)` before this migration and the
-- respondent surface depends on it: /s/[token] has no session, so a policy that
-- asked about membership would leave every respondent reading raw message keys.
-- Nothing here is tenant DATA — it is the wording of the interface — and an
-- org's own overrides are wording that org chose to show people.
create policy i18n_sel on public.ui_messages for select using (true);

-- Writes are the org's own rows and nothing else. `org_id is not null` is not
-- redundant: app.has_role(null, ...) returns false, but stating it makes the
-- rule readable as "a global row is never writable from the application".
create policy i18n_org_cud on public.ui_messages for all
  using (org_id is not null
         and app.has_role(org_id, array['administrator']::app.member_role[]))
  with check (org_id is not null
              and app.has_role(org_id, array['administrator']::app.member_role[]));

comment on column public.ui_messages.org_id is
  'NULL is the shipped default, seeded from /messages/*.json by the service '
  'role. A non-NULL row is that organisation''s override of one message, '
  'written through Administrasjon -> Sprak and readable by anyone (it is '
  'interface wording, not tenant data).';
