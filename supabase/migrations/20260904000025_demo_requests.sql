-- HeiTuva 0036 — the splash's "ta en prat med oss" needs somewhere to land.
--
-- Every paid plan on the splash is a conversation rather than a checkout
-- (DECISIONS Q10, no billing engine in v1), so the two paid CTAs and the
-- "Få en gjennomgang på 20 minutter" button all produce the same thing: a
-- request for someone to get in touch.
--
-- The table has NO insert policy for `anon`, deliberately. A public INSERT
-- policy on a table in the tenant database is a spam sink with an RLS blessing:
-- it can be written to directly through PostgREST, at any rate, with any shape
-- the CHECK allows. The only write path is `request_demo`, which is SECURITY
-- DEFINER, validates, and is the single place a rate limit can be attached
-- when one is added (DECISIONS Q5, amended — that is a launch blocker).
--
-- Reading is narrower still: this is inbound sales data about people who are
-- not customers yet, so it belongs to nobody's organisation and no application
-- role can select it. It is read in Studio by whoever answers the mail.
create table if not exists public.demo_requests (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  company    text not null,
  email      text not null,
  /** Which CTA produced it — 'team', 'bedrift', or null for the generic one. */
  plan       text,
  status     text not null default 'ny',
  created_at timestamptz not null default now(),
  constraint demo_requests_status_check check (status in ('ny', 'kontaktet', 'lukket'))
);

create index if not exists demo_requests_created_idx on public.demo_requests (created_at desc);

alter table public.demo_requests enable row level security;
-- No policies. RLS with no policy denies everything to every non-superuser
-- role, which is exactly the intent: the SECURITY DEFINER writer bypasses RLS,
-- and nothing else may touch the table. Same shape as `responses`/`answers`.

comment on table public.demo_requests is
  'Inbound requests from the public splash. No RLS policy exists by design: '
  'the only write path is request_demo (SECURITY DEFINER), and no application '
  'role may read it — these are people who are not customers yet, so the rows '
  'belong to no organisation.';

create or replace function public.request_demo(
  p_name text, p_company text, p_email text, p_plan text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(p_email));
begin
  -- Validated here as well as in the server action, because this function is
  -- the boundary: the action is one caller, and a SECURITY DEFINER function
  -- reachable by `anon` must not trust any of them.
  if btrim(coalesce(p_name, '')) = ''
     or btrim(coalesce(p_company, '')) = ''
     or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
     or length(v_email) > 254
     or length(p_name) > 120
     or length(p_company) > 200 then
    return jsonb_build_object('error', 'invalid');
  end if;

  insert into public.demo_requests (name, company, email, plan)
  values (btrim(p_name), btrim(p_company), v_email,
          nullif(btrim(coalesce(p_plan, '')), ''));

  -- Nothing about the row comes back. The caller is anonymous, and an id would
  -- be a handle to a record they have no right to.
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.request_demo(text, text, text, text) from public;
grant execute on function public.request_demo(text, text, text, text) to anon, authenticated;

comment on function public.request_demo(text, text, text, text) is
  'The only write path to demo_requests. Reachable by anon because the splash '
  'is public; validates its own inputs, and returns no row handle.';
