-- HeiTuva 0004 — distribution
create table public.survey_rounds (
  id        uuid primary key default gen_random_uuid(),
  survey_id uuid not null references public.surveys(id) on delete cascade,
  round_no  int  not null default 1,
  question_snapshot jsonb not null,      -- frozen question set for this round (rotation-aware, immutable)
  opens_at  timestamptz not null default now(),
  closes_at timestamptz,
  status    text not null default 'open' check (status in ('scheduled','open','closed')),
  created_at timestamptz not null default now(),
  unique (survey_id, round_no)
);

create table public.survey_invitations (
  id        uuid primary key default gen_random_uuid(),
  round_id  uuid not null references public.survey_rounds(id) on delete cascade,
  email     text not null,
  name      text,
  group_id  uuid references public.groups(id) on delete set null,
  lang      text not null default 'no',
  channel   app.channel not null default 'email',
  token_hash text not null unique,       -- app.hash_token(raw); raw shown once at send time
  expires_at timestamptz,
  identity_provider text,                -- reserved (DECISIONS Q4: BankID/ID-porten later)
  sent_at    timestamptz,
  reminded_at timestamptz[],
  bounced_at timestamptz,
  responded_at timestamptz,              -- participation ONLY — never joined to responses for anonymous surveys
  created_at timestamptz not null default now()
);
create index invitations_round_idx on public.survey_invitations(round_id);
create index invitations_pending_idx on public.survey_invitations(round_id)
  where responded_at is null and bounced_at is null;

create table public.share_links (
  id        uuid primary key default gen_random_uuid(),
  round_id  uuid not null references public.survey_rounds(id) on delete cascade,
  kind      app.channel not null default 'link' check (kind in ('link','qr')),
  token_hash text not null unique,
  active    boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.import_jobs (
  id        uuid primary key default gen_random_uuid(),
  org_id    uuid not null references public.organizations(id) on delete cascade,
  survey_id uuid references public.surveys(id) on delete set null,
  source    app.import_source not null,
  status    text not null default 'pending' check (status in ('pending','done','failed')),
  total_rows int, ok_rows int, error_rows jsonb,
  created_by uuid references public.org_members(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.schedules (
  id        uuid primary key default gen_random_uuid(),
  survey_id uuid not null references public.surveys(id) on delete cascade,
  cadence   app.cadence not null default 'once',
  runs_total int not null default 1,     -- 0 = until stopped
  runs_done  int not null default 0,
  rotate_questions boolean not null default false,
  send_at_local time not null default '09:00',
  reminder_after_days int not null default 2 check (reminder_after_days in (0,2,5)),
  next_run_at timestamptz,
  active    boolean not null default true,
  created_at timestamptz not null default now()
);
create index schedules_due_idx on public.schedules(next_run_at) where active;

alter table public.survey_rounds enable row level security;
alter table public.survey_invitations enable row level security;
alter table public.share_links enable row level security;
alter table public.import_jobs enable row level security;
alter table public.schedules enable row level security;
