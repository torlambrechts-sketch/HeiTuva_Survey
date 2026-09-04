-- HeiTuva 0015 — the duty signature, made worth something.
--
-- `duty_signers.signed_at` is the product's legal claim: that the styreleder
-- signed the Åpenhetsloven redegjørelse (§ 5), that the verneombud reviewed the
-- psykososiale kartlegging (aml. § 4-3). It is the row an inspector asks for.
--
-- Phase 0 shipped it writable by any administrator. One person could record the
-- board's signature without the board — the same forgery the audit trail had
-- before migration 0014, in the place where the law is the entire feature.
-- `tests/invariants/duty-signing.test.ts` demonstrates it against the old
-- schema before this migration lands.
--
-- Three rules, and the tests are named after them:
--   1. A signature is made by the person it names, through one RPC. Nobody
--      writes `signed_at` by hand, administrator included.
--   2. A signature is over the content that existed when it was made. The
--      stored hash pins it; edit the report or untick a check and the signature
--      reads as stale rather than silently covering the new text.
--   3. Publishing needs every signature to cover the CURRENT content, and what
--      it archives is append-only.

-- 1) What a signature is over ------------------------------------------------
-- The duty's own state plus the report attached to it. Ordered explicitly so
-- the hash is a function of the content and not of row order: an unordered
-- aggregate would change the hash at random and make every signature "stale".
create or replace function app.duty_content_hash(p_duty uuid) returns text
language sql stable security definer set search_path = ''
as $$
  select encode(extensions.digest(
    coalesce(
      (select jsonb_build_object(
                'duty', d.id,
                'interval_months', d.interval_months,
                'checks', coalesce((
                  select jsonb_agg(jsonb_build_object('key', c.key, 'done', c.done) order by c.key)
                  from public.duty_checks c where c.duty_id = d.id), '[]'::jsonb),
                'report', coalesce((
                  select jsonb_build_object(
                           'id', r.id, 'title', r.title,
                           'sections', r.sections, 'filters', r.filters,
                           'snapshot_id', r.snapshot_id)
                  from public.reports r
                  where r.duty_id = d.id and r.deleted_at is null
                  order by r.created_at desc limit 1), 'null'::jsonb))
       from public.duties d where d.id = p_duty),
      'null'::jsonb)::text,
    'sha256'), 'hex')
$$;

-- 2) Nobody writes a signature by hand ----------------------------------------
-- The RPC below sets a transaction-local flag; the trigger accepts the write
-- only while it is set. RLS would not do this on its own: the SECURITY DEFINER
-- function runs as the table owner and bypasses policies, and an administrator
-- legitimately needs UPDATE on the row to assign who must sign. The guard is
-- therefore about the COLUMNS, not the row.
create or replace function app.guard_signature() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_signing boolean := coalesce(current_setting('app.signing', true), '') = 'on';
begin
  if v_signing then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.signed_at is not null or new.signed_content_hash is not null then
      raise exception 'a signature is made through sign_duty, not written directly'
        using errcode = 'check_violation';
    end if;
    return new;
  end if;

  if new.signed_at is distinct from old.signed_at
     or new.signed_content_hash is distinct from old.signed_content_hash then
    raise exception 'a signature is made through sign_duty, not written directly'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists duty_signers_guard on public.duty_signers;
create trigger duty_signers_guard
  before insert or update on public.duty_signers
  for each row execute function app.guard_signature();

-- 3) The archive is append-only, like audit_events ----------------------------
-- There is no update or delete policy on `duty_versions`, so a client is
-- already refused; the trigger is what stops a future policy, a definer
-- function or a migration from quietly making the Arkiv editable. A published
-- redegjørelse that can be rewritten afterwards is not an archive.
create or replace function app.forbid_version_mutation() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE'
     and old.duty_id is not null
     and not exists (select 1 from public.duties d where d.id = old.duty_id)
  then
    return old;   -- the duty is being deleted; its archive goes with it (D50)
  end if;
  raise exception 'duty_versions is append-only';
end $$;

drop trigger if exists duty_versions_append_only on public.duty_versions;
create trigger duty_versions_append_only
  before update or delete on public.duty_versions
  for each row execute function app.forbid_version_mutation();

-- 4) Signing -------------------------------------------------------------------
create or replace function public.sign_duty(p_duty uuid, p_role_key text)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_org uuid;
  v_member uuid;
  v_signer public.duty_signers;
  v_hash text;
begin
  select d.org_id into v_org from public.duties d where d.id = p_duty;
  if v_org is null or not app.is_org_member(v_org) then
    return jsonb_build_object('error', 'forbidden');
  end if;

  v_member := app.member_id(v_org);

  select s.* into v_signer
  from public.duty_signers s
  where s.duty_id = p_duty and s.role_key = p_role_key;

  -- Authority comes from the ASSIGNMENT, not from the role. A verneombud who
  -- signs the psykososiale kartlegging may well be a `leser`; an administrator
  -- has every application privilege and still cannot sign for the board.
  if v_signer.id is null or v_signer.member_id is null or v_signer.member_id <> v_member then
    return jsonb_build_object('error', 'not_the_signer');
  end if;

  v_hash := app.duty_content_hash(p_duty);

  perform set_config('app.signing', 'on', true);   -- transaction-local
  update public.duty_signers
     set signed_at = now(), signed_content_hash = v_hash
   where id = v_signer.id;
  perform set_config('app.signing', '', true);

  insert into public.audit_events (org_id, actor_user_id, action, target, meta)
  values (v_org, (select auth.uid()), 'duty.sign', p_duty::text,
          jsonb_build_object('role_key', p_role_key, 'content_hash', v_hash));

  return jsonb_build_object('ok', true, 'content_hash', v_hash, 'signed_at', now());
end $$;

-- 5) Status: what the card renders --------------------------------------------
-- `stale` is the whole point. A signature that is `signed` but no longer over
-- the current content is reported as both, so a screen cannot show a green tick
-- over a document that changed after it was signed.
create or replace function public.duty_status(p_duty uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_org uuid;
  v_hash text;
  v_checks jsonb;
  v_signers jsonb;
  v_versions jsonb;
begin
  select d.org_id into v_org from public.duties d where d.id = p_duty;
  if v_org is null or not app.is_org_member(v_org) then
    return jsonb_build_object('error', 'forbidden');
  end if;

  v_hash := app.duty_content_hash(p_duty);

  select coalesce(jsonb_agg(jsonb_build_object('key', c.key, 'done', c.done) order by c.key), '[]'::jsonb)
    into v_checks from public.duty_checks c where c.duty_id = p_duty;

  select coalesce(jsonb_agg(jsonb_build_object(
           'role_key', s.role_key, 'label', s.label, 'member_id', s.member_id,
           'signed', s.signed_at is not null,
           'signed_at', s.signed_at,
           'stale', s.signed_at is not null and s.signed_content_hash is distinct from v_hash)
         order by s.role_key), '[]'::jsonb)
    into v_signers from public.duty_signers s where s.duty_id = p_duty;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', v.id, 'label', v.label, 'published_at', v.published_at,
           'content_hash', v.content_hash) order by v.published_at desc), '[]'::jsonb)
    into v_versions from public.duty_versions v where v.duty_id = p_duty;

  return jsonb_build_object(
    'duty_id', p_duty, 'content_hash', v_hash,
    'checks', v_checks, 'signers', v_signers, 'versions', v_versions);
end $$;

-- 6) Publishing ----------------------------------------------------------------
create or replace function public.publish_duty(p_duty uuid, p_label text default null)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_org uuid;
  v_hash text;
  v_report uuid;
  v_title text;
  v_total int; v_signed int; v_current int;
  v_version uuid;
begin
  select d.org_id into v_org from public.duties d where d.id = p_duty;
  if v_org is null or not app.is_org_member(v_org) then
    return jsonb_build_object('error', 'forbidden');
  end if;
  if not app.has_role(v_org, array['administrator','redaktor']::app.member_role[]) then
    return jsonb_build_object('error', 'forbidden');
  end if;

  v_hash := app.duty_content_hash(p_duty);

  select r.id, r.title into v_report, v_title
  from public.reports r
  where r.duty_id = p_duty and r.deleted_at is null
  order by r.created_at desc limit 1;
  if v_report is null then
    return jsonb_build_object('error', 'no_report');
  end if;

  select count(*),
         count(*) filter (where s.signed_at is not null),
         count(*) filter (where s.signed_content_hash = v_hash)
    into v_total, v_signed, v_current
  from public.duty_signers s where s.duty_id = p_duty;

  if v_total = 0 or v_signed < v_total then
    return jsonb_build_object('error', 'unsigned');
  end if;
  -- Signed, but not over what the document says now. Publishing this would put
  -- a board signature on text the board never saw.
  if v_current < v_total then
    return jsonb_build_object('error', 'stale_signature');
  end if;

  insert into public.duty_versions (duty_id, report_id, label, content_hash, archived_by)
  values (p_duty, v_report,
          coalesce(nullif(btrim(p_label), ''), v_title),
          v_hash, app.member_id(v_org))
  returning id into v_version;

  update public.reports set status = 'publisert' where id = v_report;

  insert into public.audit_events (org_id, actor_user_id, action, target, meta)
  values (v_org, (select auth.uid()), 'duty.publish', p_duty::text,
          jsonb_build_object('version_id', v_version, 'report_id', v_report, 'content_hash', v_hash));

  return jsonb_build_object('ok', true, 'version_id', v_version, 'content_hash', v_hash);
end $$;

-- Grants ----------------------------------------------------------------------
revoke all on function public.sign_duty(uuid, text) from public, anon;
grant execute on function public.sign_duty(uuid, text) to authenticated;
revoke all on function public.duty_status(uuid) from public, anon;
grant execute on function public.duty_status(uuid) to authenticated;
revoke all on function public.publish_duty(uuid, text) from public, anon;
grant execute on function public.publish_duty(uuid, text) to authenticated;
revoke all on function app.duty_content_hash(uuid) from public, anon;

comment on function public.sign_duty(uuid, text) is
  'The only path that writes duty_signers.signed_at. Authority is the signer '
  'assignment, never the member role, and the stored hash pins the signature '
  'to the content that existed when it was made.';
