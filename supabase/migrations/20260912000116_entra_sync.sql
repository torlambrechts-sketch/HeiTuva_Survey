-- ═══════════════════════════════════════════════════════════════════════════
-- M:0116 — THE ENTRA PULL SYNC, in the database.
--
-- The HTTP half — OAuth, paging, retries — lives in the Edge Function. Every
-- DECISION lives here, because a decision in SQL is a decision that can be
-- tested without a network, and because this is the third time this project has
-- found that the path nobody tests is `app.run_due_schedules` (suppression,
-- blind-spot tasks, deactivation — V2-3b, Q98, M:0107).
--
-- ── THE MODEL DECISION, AND IT IS NOT ONLY k-ANONYMITY ────────────────────
--
-- Tor's decision (I2): **department breaks down, Entra groups target.**
--
--   * An Entra GROUP is who to REACH: overlapping by design, ad hoc, usually
--     created for something other than surveys.
--   * A DEPARTMENT is where a person BELONGS: one each, stable.
--
-- Mirroring groups into `public.groups` would let one person count in two
-- breakdown cells, and two groups of five with an intersection of two disclose
-- the two by subtraction. That is Q93, and it is why segments got their own
-- table rather than becoming rows in `groups`: **k does not compose.**
--
-- But the stronger reason is not the k-gate. **A breakdown exists so someone can
-- act on it.** «How did Ledelse answer», where Ledelse is three people from
-- three departments, tells you nothing about any of them and has no leader who
-- owns the cell. A department has one.
--
-- So `department` -> `org_members.group_id`, one per person, and the shape of
-- `groups` is untouched. Entra groups are an AUDIENCE and are not built here.
--
-- ── AND A PERSON WITH NO DEPARTMENT LANDS IN NO GROUP ─────────────────────
--
-- Never an invented one — no «Ukjent», no «Uten avdeling». A default group is a
-- breakdown cell nobody owns, which is the same defect one level down, and it
-- would be indistinguishable in a report from a real department. The coverage
-- is MEASURED instead and said on screen: «84 av 92 fikk avdeling. Åtte
-- mangler» is honest and actionable; a default group is neither.
--
-- ── WHO WRITES WHAT ───────────────────────────────────────────────────────
--
--   org_members.{name, email, status, source, synced_at, external_id,
--                status_source, group_id}  -> app.entra_apply_page
--   groups.{name, source, synced_at}       -> app.entra_apply_page
--   org_members.status (deprovision)       -> app.entra_finish_sync
--   entra_connections.*                    -> app.entra_record_sync (M:0115)
--
-- Nothing else writes any of them from the directory side.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── One page of users ─────────────────────────────────────────────────────
--
-- Returns what it did, so the worker can accumulate the coverage numbers across
-- pages and hand them to `entra_record_sync` at the end.
create or replace function app.entra_apply_page(p_org uuid, p_users jsonb)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  v_user jsonb;
  v_ext text; v_name text; v_mail text; v_dept text; v_active boolean;
  v_group uuid; v_member uuid;
  v_seen int := 0; v_with_dept int := 0;
begin
  if jsonb_typeof(p_users) <> 'array' then
    raise exception 'entra_page_not_an_array'
      using hint = 'A page is a JSON array of Graph user objects.';
  end if;

  for v_user in select * from jsonb_array_elements(p_users) loop
    v_ext    := nullif(btrim(coalesce(v_user->>'externalId', '')), '');
    v_mail   := lower(nullif(btrim(coalesce(v_user->>'mail', '')), ''));
    v_name   := nullif(btrim(coalesce(v_user->>'displayName', '')), '');
    v_dept   := nullif(btrim(coalesce(v_user->>'department', '')), '');
    -- accountEnabled is a Graph BOOLEAN and requires $select to retrieve. A
    -- missing value is NOT treated as false: absent means «we did not ask for
    -- it», and deactivating somebody on a field we failed to request is the
    -- worst reading of an absence available.
    v_active := coalesce((v_user->>'accountEnabled')::boolean, true);

    if v_ext is null or v_mail is null then
      raise exception 'entra_user_missing_key'
        using hint = 'Every Graph user must carry externalId and mail.';
    end if;

    v_seen := v_seen + 1;

    -- The department becomes the member's ONE group. Matched by name within the
    -- organisation, created if absent and marked as the directory's — so a
    -- hand-made group of the same name is adopted rather than duplicated, which
    -- is what a customer who already built «Utvikling» by hand expects.
    v_group := null;
    if v_dept is not null then
      v_with_dept := v_with_dept + 1;
      select id into v_group from public.groups
       where org_id = p_org and lower(name) = lower(v_dept) limit 1;
      if v_group is null then
        insert into public.groups (org_id, name, source, synced_at)
        values (p_org, v_dept, 'entra', now()) returning id into v_group;
      else
        update public.groups set source = 'entra', synced_at = now() where id = v_group;
      end if;
    end if;

    -- Adoption by address, as M:0109 did it: a person already invited by hand
    -- must not become a second row when the directory first claims them.
    -- `(org_id, lower(trim(email)))` is UNIQUE, which is why this is safe to key
    -- on — the same two schema facts M:0107 relied on.
    select id into v_member from public.org_members
     where org_id = p_org and external_id = v_ext limit 1;
    if v_member is null then
      select id into v_member from public.org_members
       where org_id = p_org and lower(btrim(email)) = v_mail limit 1;
    end if;

    if v_member is null then
      insert into public.org_members (org_id, email, name, role, status, group_id,
                                      source, synced_at, external_id, status_source)
      values (p_org, v_mail, v_name, 'leser',
              case when v_active then 'active' else 'inactive' end,
              v_group, 'entra', now(), v_ext, 'directory');
    else
      update public.org_members set
        email = v_mail,
        name = coalesce(v_name, name),
        -- ROLE IS NOT WRITTEN. Q139: authority is decided here and never by a
        -- directory attribute. An existing member keeps the role they were
        -- given; a new one starts at `leser`, which is the least of them.
        status = case when v_active then 'active' else 'inactive' end,
        status_source = 'directory',
        group_id = v_group,
        source = 'entra',
        synced_at = now(),
        external_id = v_ext
      where id = v_member;
    end if;
  end loop;

  return jsonb_build_object('seen', v_seen, 'withDepartment', v_with_dept);
end $$;

comment on function app.entra_apply_page(uuid, jsonb) is
  'One page of Graph users, applied. Department becomes the member''s single group (I2); a '
  'person with no department gets NO group, never an invented one. Role is never written '
  'from the directory (Q139). Returns {seen, withDepartment} so the worker can accumulate '
  'coverage across pages.';

-- ── The end of a COMPLETE sync ────────────────────────────────────────────
--
-- ── WHY DEPROVISIONING IS A SEPARATE CALL, AND THIS IS THE ANSWER TO «WHAT
--    HAPPENS WHEN A SYNC IS INTERRUPTED BETWEEN PAGES» ────────────────────
--
-- Deprovisioning is the one operation that cannot be done from a partial view.
-- A member missing from page 3 of 7 is missing because page 4 never arrived —
-- **absence from a partial enumeration is not departure**, which is the same
-- sentence CLAUDE.md opens with about a working tree.
--
-- So the worker calls this ONLY after the last page returns, with every
-- external id it saw across all of them. An interrupted run calls
-- `entra_record_sync` with the error and never reaches here: the members
-- already applied keep their updates, nobody is deactivated, the error is
-- counted, and the next run starts from the beginning.
--
-- AND IT ADDS NO SECOND DEPROVISIONING MECHANISM. It sets `status` and stops.
-- `M:0107`'s guard already refuses to invite a member who is not active, on
-- every producer, and `M:0108` made that a property derived from the catalogue
-- rather than a list. A second mechanism here would be a second place the rule
-- can be wrong.
create or replace function app.entra_finish_sync(p_org uuid, p_seen text[])
returns int language plpgsql security definer
set search_path = ''
as $$
declare v_deprovisioned int;
begin
  update public.org_members set
    status = 'inactive',
    status_source = 'directory',
    synced_at = now()
  where org_id = p_org
    -- ONLY ROWS THIS SYNC OWNS. Without it one run would deactivate every
    -- hand-invited colleague in the organisation, which is the control the
    -- test asserts separately.
    and source = 'entra'
    and external_id is not null
    and not (external_id = any (p_seen))
    and status <> 'inactive';
  get diagnostics v_deprovisioned = row_count;
  return v_deprovisioned;
end $$;

comment on function app.entra_finish_sync(uuid, text[]) is
  'Called ONLY after the last page. Deactivates directory-sourced members the directory no '
  'longer lists — status only, never a delete, because deprovisioning is not erasure and the '
  'answers are anonymous and unlinked. An interrupted sync never reaches here: absence from '
  'a partial enumeration is not departure.';

revoke all on function app.entra_apply_page(uuid, jsonb) from public, anon, authenticated;
revoke all on function app.entra_finish_sync(uuid, text[]) from public, anon, authenticated;
grant execute on function app.entra_apply_page(uuid, jsonb) to service_role;
grant execute on function app.entra_finish_sync(uuid, text[]) to service_role;
