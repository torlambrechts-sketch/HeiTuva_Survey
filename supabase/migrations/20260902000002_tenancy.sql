-- HeiTuva 0002 — tenancy
create table public.organizations (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  orgnr         text,
  address       text,
  contact_name  text,
  contact_email text,
  dpo           text,
  default_lang  text not null default 'no' check (default_lang in ('no','en','sv','da')),
  active_langs  text[] not null default array['no','en'],   -- DECISIONS Q11
  retention_months int not null default 12 check (retention_months in (0,6,12,24)), -- 0 = never
  privacy jsonb not null default jsonb_build_object(
    'min_responses', true,      -- informational; k=5 is hard-enforced (DECISIONS Q3)
    'ip_logging', false,        -- false = do not log (design default: no IP)
    'eu_only', true,
    'auto_delete', true,
    'consent', false),
  options jsonb not null default jsonb_build_object(
    'reminders', true, 'weekly_digest', true, 'allow_self_serve', false,
    'sso', false, 'brand_mail', true),
  plan          text not null default 'team',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create trigger organizations_touch before update on public.organizations
  for each row execute function app.touch_updated_at();

create table public.groups (
  id       uuid primary key default gen_random_uuid(),
  org_id   uuid not null references public.organizations(id) on delete cascade,
  name     text not null,
  lead_member_id uuid,   -- fk added after org_members exists
  created_at timestamptz not null default now(),
  unique (org_id, name)
);

create table public.org_members (
  id        uuid primary key default gen_random_uuid(),
  org_id    uuid not null references public.organizations(id) on delete cascade,
  user_id   uuid references auth.users(id) on delete set null,
  email     text not null,
  name      text,
  role      app.member_role not null default 'leser',
  group_id  uuid references public.groups(id) on delete set null,
  status    text not null default 'invited' check (status in ('invited','active','inactive')),
  invited_by uuid,
  created_at timestamptz not null default now(),
  unique (org_id, email)
);
create index org_members_user_idx on public.org_members(user_id);
alter table public.groups
  add constraint groups_lead_fk foreign key (lead_member_id)
  references public.org_members(id) on delete set null;

create table public.profiles (
  user_id   uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  phone     text,
  lang      text not null default 'no' check (lang in ('no','en','sv','da')),
  notify    jsonb not null default jsonb_build_object(
    'new_responses', true, 'low_score', true, 'deadline', true, 'digest', false),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_touch before update on public.profiles
  for each row execute function app.touch_updated_at();

alter table public.organizations enable row level security;
alter table public.groups        enable row level security;
alter table public.org_members   enable row level security;
alter table public.profiles      enable row level security;

-- Membership helpers live here (not 0001): SQL-language function bodies are
-- validated at creation time, so they must follow public.org_members.
create or replace function app.is_org_member(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.org_members m
    where m.org_id = p_org and m.user_id = auth.uid() and m.status = 'active')
$$;

create or replace function app.has_role(p_org uuid, p_roles app.member_role[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.org_members m
    where m.org_id = p_org and m.user_id = auth.uid()
      and m.status = 'active' and m.role = any(p_roles))
$$;

create or replace function app.member_id(p_org uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select m.id from public.org_members m
  where m.org_id = p_org and m.user_id = auth.uid() and m.status = 'active' limit 1
$$;
