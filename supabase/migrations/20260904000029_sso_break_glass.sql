-- HeiTuva 0040 — SSO enforcement must never lock an organisation out of its
-- own compliance data (Tor, Phase 6 acceptance, decision 2).
--
-- "Pålogging med Entra ID (SSO) — deaktiverer passordpålogging" is org-wide,
-- with one structural exception: at least one active administrator must always
-- be able to authenticate WITHOUT SSO. If the directory changes, the tenant is
-- misconfigured, or the Entra app registration lapses, that person is how the
-- organisation gets back in. Losing the ability to administer your own
-- compliance data is a worse failure than the one SSO enforcement prevents.
--
-- The rule is enforced in the database, not only in the screen: turning the
-- option on with no such administrator is refused, and the last such
-- administrator cannot be un-exempted, demoted or deactivated while the option
-- is on. The screen repeats the reason; the trigger is what makes it true.

alter table public.org_members
  add column if not exists sso_exempt boolean not null default false;

comment on column public.org_members.sso_exempt is
  'May sign in with a password or magic link even while the organisation '
  'requires Entra ID. At least one active administrator must carry this while '
  'options.sso is on; app.sso_break_glass_ok and the two triggers below hold it.';

/** True when the org has at least one active administrator exempt from SSO. */
create or replace function app.sso_break_glass_ok(p_org uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.org_members m
     where m.org_id = p_org
       and m.status = 'active'
       and m.role = 'administrator'
       and m.sso_exempt
  )
$$;
revoke all on function app.sso_break_glass_ok(uuid) from public, anon;
grant execute on function app.sso_break_glass_ok(uuid) to authenticated, service_role;

-- Turning the option on requires the exemption to exist first.
create or replace function app.guard_sso_option()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce((new.options->>'sso')::boolean, false)
     and not coalesce((old.options->>'sso')::boolean, false)
     and not app.sso_break_glass_ok(new.id) then
    raise exception 'sso_no_break_glass'
      using hint = 'Mark at least one active administrator as able to sign in without SSO first.';
  end if;
  return new;
end $$;

drop trigger if exists organizations_guard_sso on public.organizations;
create trigger organizations_guard_sso
  before update of options on public.organizations
  for each row execute function app.guard_sso_option();

-- While the option is on, the last exempt administrator is protected. Written
-- as "reject only when the row change would remove the last one", so ordinary
-- maintenance — renaming, regrouping, FK-driven nulling — passes through
-- (CLAUDE.md, immutability triggers must permit referential maintenance).
create or replace function app.guard_sso_break_glass()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_row public.org_members := coalesce(old, new);
  v_sso boolean;
  v_was_exempt_admin boolean;
  v_still_exempt_admin boolean;
begin
  select coalesce((o.options->>'sso')::boolean, false) into v_sso
    from public.organizations o where o.id = v_row.org_id;
  if not v_sso then
    return coalesce(new, old);
  end if;

  v_was_exempt_admin := old.status = 'active' and old.role = 'administrator' and old.sso_exempt;
  v_still_exempt_admin := tg_op = 'UPDATE'
    and new.status = 'active' and new.role = 'administrator' and new.sso_exempt;

  if v_was_exempt_admin and not v_still_exempt_admin then
    -- Would anyone else still qualify once this row changes?
    if not exists (
      select 1 from public.org_members m
       where m.org_id = old.org_id and m.id <> old.id
         and m.status = 'active' and m.role = 'administrator' and m.sso_exempt
    ) then
      raise exception 'sso_last_break_glass'
        using hint = 'This is the last administrator who can sign in without SSO. Exempt another administrator, or turn SSO enforcement off, first.';
    end if;
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists org_members_guard_sso on public.org_members;
create trigger org_members_guard_sso
  before update or delete on public.org_members
  for each row execute function app.guard_sso_break_glass();
