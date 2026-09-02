-- HeiTuva 0016 — let an invited user claim their own membership row
--
-- An administrator invites by email, which creates an org_members row with
-- user_id null and status 'invited'. Nothing linked that row to the auth user
-- who later signed in: getViewer looks membership up by user_id, so an invited
-- colleague signed in successfully and then looked like they belonged to no
-- organization at all — onboarding would have offered to create them a second
-- one.
--
-- The link cannot be made by the user directly (members_upd is administrator
-- only) and must not need the service role on a hot path, so it is a narrow
-- SECURITY DEFINER function: it can only ever attach the caller to a row that
-- already names the caller's own verified email address, and only while that
-- row is unclaimed.

create or replace function public.claim_membership()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_id    uuid;
begin
  if auth.uid() is null then
    return null;
  end if;

  -- auth.email() reads the JWT's email claim, which the auth server issues only
  -- after the address is confirmed. A caller cannot put another address there.
  v_email := lower(coalesce(auth.email(), ''));
  if v_email = '' then
    return null;
  end if;

  update public.org_members
     set user_id = auth.uid(),
         status  = 'active'
   where lower(email) = v_email
     and user_id is null
     and status = 'invited'
  returning id into v_id;

  return v_id;
end
$$;

revoke all on function public.claim_membership() from public, anon;
grant execute on function public.claim_membership() to authenticated;

comment on function public.claim_membership() is
  'Attaches the calling user to an org_members row invited under their own verified email. Returns the member id, or null when there is nothing to claim.';
