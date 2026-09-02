-- HeiTuva 0005 — the answers vault
-- INVARIANT: no client-facing select policy will ever exist on responses/answers.
-- Reads happen only through SECURITY DEFINER RPCs (migration 0008) enforcing k>=5.

create table public.responses (
  id             uuid primary key default gen_random_uuid(),
  round_id       uuid not null references public.survey_rounds(id) on delete cascade,
  submission_key uuid not null default gen_random_uuid(),
  anonymity_at_submission app.anonymity_mode not null,
  invitation_id  uuid references public.survey_invitations(id) on delete set null,
  respondent_group_id uuid references public.groups(id) on delete set null,
    -- for anonymous email sends the RPC copies group_id here WITHOUT the invitation link,
    -- so team breakdowns work while identity does not. NULL for open-link responses.
  lang           text not null default 'no',
  submitted_hour timestamptz not null default date_trunc('hour', now()),
  -- STRUCTURAL ANONYMITY (DECISIONS Q2): an anonymous response can never reference an invitation.
  constraint responses_anonymous_unlinked
    check (anonymity_at_submission <> 'anonymous' or invitation_id is null)
);
create index responses_round_idx on public.responses(round_id);

create table public.answers (
  id          uuid primary key default gen_random_uuid(),
  response_id uuid not null references public.responses(id) on delete cascade,
  question_id uuid not null references public.survey_questions(id) on delete cascade,
  value       jsonb not null,   -- scalar, array (multi/ranking), or object (matrix/field)
  comment     text,
  follow_up   text,
  unique (response_id, question_id)
);
create index answers_question_idx on public.answers(question_id);

-- Aggregates that survive retention deletion and freeze report archives
create table public.result_snapshots (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  survey_id  uuid not null references public.surveys(id) on delete cascade,
  round_id   uuid references public.survey_rounds(id) on delete set null,
  scope      jsonb not null default '{}'::jsonb,   -- {group, period}
  aggregates jsonb not null,                       -- output of app.aggregate_results at snapshot time
  content_hash text not null,
  created_at timestamptz not null default now()
);

alter table public.responses enable row level security;
alter table public.answers enable row level security;
alter table public.result_snapshots enable row level security;
-- Deliberately NO policies on responses/answers here or anywhere: default-deny for all client roles.
