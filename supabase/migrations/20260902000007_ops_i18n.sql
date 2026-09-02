-- HeiTuva 0007 — ops, privacy, i18n

create table public.ui_messages (            -- DB-backed UI copy (DECISIONS Q11/Q12); seeded from /messages/*.json
  namespace text not null,                   -- respondent | builder | send | results | reports | admin | common | splash
  key       text not null,
  lang      text not null check (lang in ('no','en','sv','da')),
  value     text not null,
  updated_by uuid,
  updated_at timestamptz not null default now(),
  primary key (namespace, key, lang)
);

create table public.dsr_requests (
  id        uuid primary key default gen_random_uuid(),
  org_id    uuid not null references public.organizations(id) on delete cascade,
  type      app.dsr_type not null,
  subject_email text not null,
  status    app.dsr_status not null default 'mottatt',
  due_at    date not null default (current_date + 30),  -- 30-day GDPR deadline
  handled_by uuid references public.org_members(id) on delete set null,
  resolution text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger dsr_touch before update on public.dsr_requests
  for each row execute function app.touch_updated_at();

create table public.audit_events (           -- append-only
  id        bigint generated always as identity primary key,
  org_id    uuid references public.organizations(id) on delete cascade,
  actor_user_id uuid,
  action    text not null,                   -- e.g. 'privacy.toggle', 'report.export', 'duty.sign', 'dsr.resolve', 'i18n.edit'
  target    text,
  meta      jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create or replace function app.forbid_mutation() returns trigger
language plpgsql as $$ begin raise exception 'audit_events is append-only'; end $$;
create trigger audit_no_update before update or delete on public.audit_events
  for each row execute function app.forbid_mutation();

create table public.feature_flags (
  key      text not null,                    -- sms_channel | entra_sync | google_sync | hr_sync | ai_insights | ai_translate | pptx_export | stripe_billing
  org_id   uuid references public.organizations(id) on delete cascade,  -- NULL = global default
  enabled  boolean not null default false,
  -- org_id must stay nullable (NULL = global default, see flags_sel policy), so a
  -- primary key will not do: PK columns are implicitly NOT NULL. NULLS NOT DISTINCT
  -- (PG15+) still allows only one global row per key.
  constraint feature_flags_key_org_uniq unique nulls not distinct (key, org_id)
);

create table public.notifications (
  id        uuid primary key default gen_random_uuid(),
  org_id    uuid not null references public.organizations(id) on delete cascade,
  member_id uuid not null references public.org_members(id) on delete cascade,
  kind      text not null,
  payload   jsonb not null default '{}'::jsonb,
  read_at   timestamptz,
  created_at timestamptz not null default now()
);

-- Retention job (pg_cron scheduled in ops setup; function here so it is versioned)
create or replace function app.apply_retention() returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from public.answers a using public.responses r,
    public.survey_rounds sr, public.surveys s, public.organizations o
  where a.response_id = r.id and r.round_id = sr.id and sr.survey_id = s.id and s.org_id = o.id
    and o.retention_months > 0
    and r.submitted_hour < now() - make_interval(months => o.retention_months);
  delete from public.responses r using public.survey_rounds sr, public.surveys s, public.organizations o
  where r.round_id = sr.id and sr.survey_id = s.id and s.org_id = o.id
    and o.retention_months > 0
    and r.submitted_hour < now() - make_interval(months => o.retention_months);
end $$;

alter table public.ui_messages enable row level security;
alter table public.dsr_requests enable row level security;
alter table public.audit_events enable row level security;
alter table public.feature_flags enable row level security;
alter table public.notifications enable row level security;
