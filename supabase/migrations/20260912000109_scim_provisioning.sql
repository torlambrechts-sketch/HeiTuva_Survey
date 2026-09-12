-- I1-1b — THE DATABASE HALF OF ENTRA ID / SCIM PROVISIONING.
--
-- Two functions and four columns. I1-2's inbound route is a CALLER of these,
-- never a second implementation: everything a directory may do to this database
-- is here, in `app`, which PostgREST does not expose.
--
-- ── (c) FROM I1-0, ANSWERED: `inactive` IS ALREADY THE STATE ───────────────
--
-- The instruction asked whether «this person has left» needs a sixth status
-- value or a different column. Measured, `org_members.status` holds three —
-- `invited | active | inactive` — and `inactive` already means exactly this, is
-- already written by `setMemberStatus`, and is already read by every producer of
-- mail through `app.member_blocks_invitation` (M:0108). **A SCIM deprovision
-- writes the state that already exists.** A parallel `deprovisioned` value would
-- have given the guards a second state to learn and would have been wrong in
-- every place someone forgot.
--
-- What was genuinely missing is not the STATE but its PROVENANCE, because the
-- reversal differs: an administrator can undo their own click, while a
-- SCIM-written status overridden by hand is written back on the next sync. An
-- administrator who cannot see that watches their own change disappear with no
-- explanation. Hence `status_source`.
--
-- ── THE COLUMNS, AND WHO WRITES EACH ───────────────────────────────────────
--
-- `groups.source`/`synced_at` (V2-3a) is the precedent and these mirror it
-- deliberately: null means «this product», a value names the directory.

alter table public.org_members
  add column if not exists source       text,
  add column if not exists synced_at    timestamptz,
  add column if not exists external_id  text,
  add column if not exists status_source text not null default 'local';

alter table public.org_members
  drop constraint if exists org_members_status_source_check;
alter table public.org_members
  add constraint org_members_status_source_check
  check (status_source in ('local', 'scim'));

-- The directory's own key is unique WITHIN an organisation, and null for
-- everyone the directory has never mentioned. Partial, so the thousands of
-- hand-made members do not collide on null.
create unique index if not exists org_members_org_external_uniq
  on public.org_members (org_id, external_id) where external_id is not null;

comment on column public.org_members.source is
  'Where this member came from — null for hand-made, ''scim'' for supplied by a '
  'directory. Same shape as groups.source (V2-3a). WHO WRITES IT: '
  'app.scim_upsert_member, and nothing else — the four application write sites '
  'leave it null, which is the true answer for a member someone typed in.';

comment on column public.org_members.synced_at is
  'When a directory sync last touched this row. WHO WRITES IT: '
  'app.scim_upsert_member and app.scim_deprovision_member. Null for every '
  'hand-made member, for ever.';

comment on column public.org_members.external_id is
  'The directory''s own immutable id for this person — NOT their address, which '
  'changes when someone marries or the company renames its domain. WHO WRITES '
  'IT: app.scim_upsert_member, including on the first sync of a member who was '
  'already here by address (adoption).';

comment on column public.org_members.status_source is
  'WHICH SYSTEM last wrote `status` — ''local'' for anything this product did, '
  '''scim'' for a directory sync. Not WHO, because the audit log already names '
  'the actor; the question this answers is whether a hand edit will SURVIVE. On '
  'a source=''scim'' row, status_source=''local'' means an administrator has '
  'overridden the directory and the next sync will write it back, which the '
  'Brukere screen must say out loud. WHO WRITES IT: the two SCIM functions '
  '(''scim'') and setMemberStatus (''local''); every other writer takes the '
  'default. It is a COLUMN rather than a derivation from the audit log because '
  'audit rows expire under the retention setting, and a derivation that '
  'silently becomes wrong is worse than none.';

-- ── PROVISIONING ───────────────────────────────────────────────────────────
create or replace function app.scim_upsert_member(
  p_org         uuid,
  p_external_id text,
  p_email       text,
  p_name        text,
  p_active      boolean
) returns uuid
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_id uuid;
  v_email text := lower(trim(p_email));
  v_status text := case when p_active then 'active' else 'inactive' end;
begin
  if p_org is null or p_external_id is null or v_email is null or v_email = '' then
    raise exception 'scim_invalid_payload'
      using hint = 'org, externalId and userName are all required.';
  end if;

  -- Match on the directory's key first.
  select id into v_id from public.org_members
   where org_id = p_org and external_id = p_external_id;

  -- ADOPTION. On the FIRST sync the directory's key is unseen, and the people
  -- it is about are usually already here — invited by hand months ago. Matching
  -- on external_id alone would insert a duplicate and hit
  -- `org_members_org_id_email_key`, so the customer's very first sync would look
  -- like a broken connector. Fall back to the address, stamp the existing row.
  if v_id is null then
    select id into v_id from public.org_members
     where org_id = p_org and lower(email) = v_email;
  end if;

  if v_id is null then
    insert into public.org_members (org_id, email, name, status, status_source,
                                    source, external_id, synced_at)
    values (p_org, v_email, nullif(trim(coalesce(p_name, '')), ''), v_status, 'scim',
            'scim', p_external_id, now())
    returning id into v_id;
    return v_id;
  end if;

  -- NOTE WHAT IS NOT IN THIS UPDATE, and it is deliberate (Q139):
  --   * `role` — who may administer this organisation is an AUTHORISATION
  --     decision and belongs here, not in the customer's HR system. Resetting an
  --     adopted `redaktor` to the table default on first sync would be a silent
  --     demotion, and granting `administrator` from a directory attribute would
  --     be a privilege escalation path through a system we do not control.
  --   * `group_id` — mapping a directory department onto a HeiTuva group is a
  --     mapping nobody has specified, and inventing one would put people into
  --     groups whose results are reported separately. Left for a decision.
  update public.org_members
     set email         = v_email,
         name          = coalesce(nullif(trim(coalesce(p_name, '')), ''), name),
         status        = v_status,
         status_source = 'scim',
         source        = 'scim',
         external_id   = p_external_id,
         synced_at     = now()
   where id = v_id;

  return v_id;
end $$;

comment on function app.scim_upsert_member(uuid, text, text, text, boolean) is
  'The only way a directory may create or update a member (I1-1b). Writes '
  'org_members and nothing else — asserted over the row count of every table in '
  '`public` by tests/db/scim.test.ts. Deliberately does NOT write `role` or '
  '`group_id`.';

-- ── DEPROVISIONING ─────────────────────────────────────────────────────────
create or replace function app.scim_deprovision_member(
  p_org         uuid,
  p_external_id text
) returns uuid
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_id uuid;
  v_role app.member_role;
  v_status text;
begin
  select id, role, status into v_id, v_role, v_status
    from public.org_members
   where org_id = p_org and external_id = p_external_id;

  -- A deprovision that matches nobody is a sync talking about a person this
  -- organisation does not have. Returning quietly would let a misconfigured
  -- connector look healthy while deprovisioning nobody — exactly the failure
  -- I1-2 is built to make loud, so it is loud here first.
  if v_id is null then
    raise exception 'scim_unknown_member: %', p_external_id
      using hint = 'No member of this organisation carries that externalId. The '
                   'connector is pointed at the wrong tenant, or the id changed.';
  end if;

  -- Q140. `setMemberStatus` refuses to deactivate the last active administrator
  -- in application code; a directory reaching the same row from outside meets
  -- the same rule, or an organisation loses access to its own settings because
  -- HR closed a leaver's record. The break-glass trigger
  -- (`app.guard_sso_break_glass`) protects the SSO case and not this one.
  if v_role = 'administrator' and v_status = 'active' and not exists (
    select 1 from public.org_members m
     where m.org_id = p_org and m.id <> v_id
       and m.role = 'administrator' and m.status = 'active'
  ) then
    raise exception 'scim_last_administrator: %', p_external_id
      using hint = 'This is the organisation''s last active administrator. Make '
                   'someone else an administrator first, or deactivate them in '
                   'Administrasjon, which records who made the decision.';
  end if;

  -- DEPROVISIONING IS NOT ERASURE (property 2, and the one the instruction
  -- expects to be got wrong). The answers are anonymous and unlinked; a cascade
  -- would destroy a round's results — the shape `report_shares.group_id` had.
  -- The ROW stays too (Q138): deleting it would cascade `notifications` and
  -- `survey_editors` and null twenty other referents, so an HR event would
  -- silently perform a permissions change and throw away who created a statutory
  -- survey. Erasure is a DSR, which is a request rather than an HR event.
  update public.org_members
     set status        = 'inactive',
         status_source = 'scim',
         synced_at     = now()
   where id = v_id;

  return v_id;
end $$;

comment on function app.scim_deprovision_member(uuid, text) is
  'The only way a directory may say someone has left (I1-1b). Sets status = '
  '''inactive'' — the state every mail producer already reads through '
  'app.member_blocks_invitation — and NEVER deletes: the row, the answers and '
  'the responses all stay. Refuses an unknown externalId and the last active '
  'administrator, both by name, so I1-2 can report which.';

-- Neither is reachable over the API: `app` is not in PostgREST's exposed
-- schemas. Revoked from public AND anon anyway, because a grant is a fact about
-- the catalogue and the enumeration in row 3/9 of CLAUDE.md's table has cost
-- this project twice.
revoke all on function app.scim_upsert_member(uuid, text, text, text, boolean) from public, anon;
revoke all on function app.scim_deprovision_member(uuid, text) from public, anon;
