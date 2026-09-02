-- HeiTuva 0006 — compliance engine + reports

create table public.duty_definitions (      -- registry (data-not-code); org rows instantiate from these
  key       text primary key,               -- apenhet | arbeidsmiljo | likestilling | trakassering
  title     text not null,
  law       text not null,
  basis     text not null,
  default_interval_months int not null,
  publish   boolean not null default false, -- public disclosure required (Åpenhetsloven)
  pack_key  text not null,                  -- linked template pack
  checks    jsonb not null,                 -- [{key,label}]
  signer_roles jsonb not null               -- [{key,label,role}]
);

create table public.duties (
  id        uuid primary key default gen_random_uuid(),
  org_id    uuid not null references public.organizations(id) on delete cascade,
  definition_key text not null references public.duty_definitions(key),
  owner_member_id uuid references public.org_members(id) on delete set null,
  interval_months int not null,
  next_due_at date,
  created_at timestamptz not null default now(),
  unique (org_id, definition_key)
);

create table public.duty_checks (
  duty_id uuid not null references public.duties(id) on delete cascade,
  key     text not null,
  done    boolean not null default false,
  done_by uuid references public.org_members(id) on delete set null,
  done_at timestamptz,
  primary key (duty_id, key)
);

create table public.duty_signers (
  id      uuid primary key default gen_random_uuid(),
  duty_id uuid not null references public.duties(id) on delete cascade,
  role_key text not null,             -- styre | dl | vo | hr
  label    text not null,
  member_id uuid references public.org_members(id) on delete set null,
  signed_at timestamptz,
  signed_content_hash text            -- hash of the report version signed (audit-grade, DECISIONS Q4)
);

create table public.duty_survey_links (
  duty_id   uuid not null references public.duties(id) on delete cascade,
  survey_id uuid not null references public.surveys(id) on delete cascade,
  primary key (duty_id, survey_id)
);

create table public.report_section_types (  -- registry: summary, trend, heatmap, drivers, teams, themes, quotes, actions, participation, method
  key   text primary key,
  label text not null,
  description text not null,
  supports_group_filter boolean not null default false
);

create table public.reports (
  id       uuid primary key default gen_random_uuid(),
  org_id   uuid not null references public.organizations(id) on delete cascade,
  title    text not null,
  kind     app.report_kind not null default 'egen',
  status   app.report_status not null default 'utkast',
  base_template text,
  duty_id  uuid references public.duties(id) on delete set null,
  sections jsonb not null default '[]'::jsonb,  -- [{key, position, group, quotes:[answer_id]}]
  filters  jsonb not null default '{}'::jsonb,  -- {period:'q|h|y', group, survey_ids[]}
  share_scope app.share_scope not null default 'ledelse',
  schedule jsonb,
  snapshot_id uuid references public.result_snapshots(id) on delete set null, -- frozen data when published
  created_by uuid references public.org_members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create trigger reports_touch before update on public.reports
  for each row execute function app.touch_updated_at();

create table public.duty_versions (          -- the 'Arkiv'
  id        uuid primary key default gen_random_uuid(),
  duty_id   uuid not null references public.duties(id) on delete cascade,
  report_id uuid references public.reports(id) on delete set null,
  label     text not null,
  content_hash text not null,
  published_at timestamptz not null default now(),
  archived_by uuid references public.org_members(id) on delete set null
);

create table public.report_shares (
  id        uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  token_hash text not null unique,
  scope     app.share_scope not null,
  group_id  uuid references public.groups(id) on delete set null, -- for ledere_eget_team
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.report_exports (
  id        uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  format    text not null check (format in ('pdf','pptx')),
  storage_path text not null,
  created_by uuid references public.org_members(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.benchmarks (
  industry  text not null,
  metric_key text not null,
  value     numeric not null,
  source    text not null,
  primary key (industry, metric_key)
);

create table public.loop_actions (           -- 'Lukket sløyfen' / Tiltak
  id        uuid primary key default gen_random_uuid(),
  org_id    uuid not null references public.organizations(id) on delete cascade,
  survey_id uuid references public.surveys(id) on delete set null,
  text      text not null,
  owner_member_id uuid references public.org_members(id) on delete set null,
  due_at    date,
  done      boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.duty_definitions enable row level security;
alter table public.duties enable row level security;
alter table public.duty_checks enable row level security;
alter table public.duty_signers enable row level security;
alter table public.duty_survey_links enable row level security;
alter table public.report_section_types enable row level security;
alter table public.reports enable row level security;
alter table public.duty_versions enable row level security;
alter table public.report_shares enable row level security;
alter table public.report_exports enable row level security;
alter table public.benchmarks enable row level security;
alter table public.loop_actions enable row level security;
