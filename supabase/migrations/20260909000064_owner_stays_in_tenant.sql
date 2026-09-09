-- V2-4 · the class test 8 belonged to, checked once and narrowed where it bites.
--
-- ── THE CHECK TOR ASKED FOR, AND WHAT IT FOUND ──────────────────────────────
--
-- Test 8 found that `tasks.source_ref` did not carry tenancy: a foreign key
-- constrains EXISTENCE, not ORGANISATION, and RLS checks the row's own
-- `org_id` and never what its references point at. Tor: «check once whether
-- source_ref was the only place that assumption was made.»
--
-- It was not. Enumerated from the catalogue — every single-column FK where BOTH
-- sides carry `org_id` — there are **fifteen**:
--
--     select c.conrelid::regclass||'.'||a.attname||' -> '||c.confrelid::regclass
--       from pg_constraint c
--       join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1]
--      where c.contype='f' and array_length(c.conkey,1)=1 and a.attname<>'org_id'
--        and exists (select 1 from information_schema.columns s
--                     where s.table_schema='public'
--                       and s.table_name=c.conrelid::regclass::text
--                       and s.column_name='org_id')
--        and exists (select 1 from information_schema.columns t
--                     where t.table_schema='public'
--                       and t.table_name=c.confrelid::regclass::text
--                       and t.column_name='org_id');
--
-- **Not all fifteen are defects, and saying so is the point of checking rather
-- than assuming.** Most are written server-side from the viewer's own session
-- (`created_by`, `author_member_id` — the caller cannot supply a foreign id at
-- all), and one — `reports.snapshot_id` — has a live, tested defence one layer
-- up: `report-composition.test.ts:551` deliberately forges a cross-tenant
-- snapshot with `n: 999` and asserts `compose_report` ignores it and falls back
-- to live. That row exists in the test database on purpose.
--
-- **Two are user-supplied and unguarded, and this migration closes them.**
--
--   duties.owner_member_id   `saveDutySettings` (`rapporter/actions.ts:141`)
--                            takes `ownerMemberId` from the request, validates
--                            only that it is a uuid, and writes it. Measured:
--                            «ACCEPTED: duty <id> in another org now owned by
--                            member <id>». A statutory duty's owner is who a
--                            compliance record names and who its reminders
--                            address.
--
--   tasks.owner_member_id    the same shape on a table created in this phase,
--                            closed before a caller exists rather than after.
--
-- The remaining thirteen are listed in `docs/v2/reports/V2-4.md` with what
-- guards each. Converting them all would rewrite the test that proves
-- `compose_report`'s defence, which is not a mid-phase change — it is a
-- decision, and it is recorded there rather than made here.
--
-- ── THE FIX IS THE ONE TEST 8 GOT ──────────────────────────────────────────
--
-- A composite key carries the organisation into the reference itself, so the
-- row is unrepresentable rather than prevented by a predicate every writer must
-- remember. Q93's reasoning, now on its third table.

alter table public.org_members
  drop constraint if exists org_members_id_org_uniq;
alter table public.org_members
  add constraint org_members_id_org_uniq unique (id, org_id);

comment on constraint org_members_id_org_uniq on public.org_members is
  'Redundant as a uniqueness claim — id is the primary key — and required as '
  'the TARGET of tenancy-scoped composite foreign keys. See M:0063 for the '
  'same shape on public.surveys.';

-- Any row that already crosses the boundary would block this, so it is nulled
-- first and counted: a silent repair is how the 2026-09-07 prod sync lost two
-- statements. There should be none, and if there are, the count says so.
do $$
declare v_fixed int;
begin
  with bad as (
    update public.duties d set owner_member_id = null
      where owner_member_id is not null
        and not exists (select 1 from public.org_members m
                         where m.id = d.owner_member_id and m.org_id = d.org_id)
    returning 1)
  select count(*) into v_fixed from bad;
  raise notice 'duties.owner_member_id cross-tenant rows cleared: %', v_fixed;
end $$;

alter table public.duties
  drop constraint if exists duties_owner_member_id_fkey;
alter table public.duties
  add constraint duties_owner_member_id_fkey
  foreign key (owner_member_id, org_id) references public.org_members(id, org_id)
  on delete set null;

alter table public.tasks
  drop constraint if exists tasks_owner_member_id_fkey;
alter table public.tasks
  add constraint tasks_owner_member_id_fkey
  foreign key (owner_member_id, org_id) references public.org_members(id, org_id)
  on delete set null;
