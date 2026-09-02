-- HeiTuva 0003 — survey core
create table public.template_packs (
  id        uuid primary key default gen_random_uuid(),
  org_id    uuid references public.organizations(id) on delete cascade, -- NULL = HeiTuva standard pack
  key       text not null,
  category  text not null check (category in ('Ansatte','Kunder','Lovpålagt','Annet')),
  legal_ref text,                    -- e.g. 'Arbeidsmiljøloven § 4-3'
  title     text not null,
  audience  text,
  questions jsonb not null,          -- [{text,type,options?,statements?,multi?}]
  private   boolean not null default false,
  author_member_id uuid references public.org_members(id) on delete set null,
  created_at timestamptz not null default now(),
  unique nulls not distinct (org_id, key)
);

create table public.template_pack_translations (
  pack_id uuid not null references public.template_packs(id) on delete cascade,
  lang    text not null check (lang in ('no','en','sv','da')),
  title   text,
  questions jsonb,                   -- same shape, translated
  primary key (pack_id, lang)
);

create table public.surveys (
  id        uuid primary key default gen_random_uuid(),
  org_id    uuid not null references public.organizations(id) on delete cascade,
  title     text not null,
  audience_label text,
  status    app.survey_status not null default 'utkast',
  anonymity app.anonymity_mode not null default 'anonymous',
  source_lang text not null default 'no',
  langs     text[] not null default array['no'],
  template_pack_key text,
  engage jsonb not null default jsonb_build_object(
    'audience','ansatte','incentive','ingen','prize','','charity','',
    'comments','lav','personal',true,'deadline',true,'show_progress',true,
    'reveal_results',true,'follow_up',false,'mobile_first',true,'one_question',true,
    'thank_you','Takk! Vi deler hva vi gjør med svarene innen to uker.'),
  target    int,                     -- expected respondent count (svarprosent denominator)
  created_by uuid references public.org_members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index surveys_org_idx on public.surveys(org_id) where deleted_at is null;
create trigger surveys_touch before update on public.surveys
  for each row execute function app.touch_updated_at();

create table public.survey_questions (
  id        uuid primary key default gen_random_uuid(),
  survey_id uuid not null references public.surveys(id) on delete cascade,
  position  int  not null,
  type      app.question_type not null,
  text      text not null,
  help      text,
  required  boolean not null default false,
  comment_mode app.comment_mode not null default 'arv',
  follow_up_on_low boolean not null default false,
  config jsonb not null default '{}'::jsonb,
  -- config by type: scale{points,low_label,high_label} likert{labels[5]} slider{min,max,low_label,high_label}
  -- choice/dropdown/ranking/image{options[],multi,randomize} matrix{statements[]} field{fields:[[label,input_type]]}
  created_at timestamptz not null default now(),
  unique (survey_id, position) deferrable initially deferred
);

create table public.question_translations (
  question_id uuid not null references public.survey_questions(id) on delete cascade,
  lang   text not null check (lang in ('no','en','sv','da')),
  text   text not null,
  help   text,
  config_overrides jsonb not null default '{}'::jsonb, -- translated options/statements/labels
  machine_translated boolean not null default false,   -- DECISIONS Q13 (always false in v1)
  confirmed_by uuid,
  primary key (question_id, lang)
);

create table public.question_bank (
  id       uuid primary key default gen_random_uuid(),
  org_id   uuid references public.organizations(id) on delete cascade, -- NULL = standard bank
  text     text not null,
  type     app.question_type not null,
  category text not null,
  config   jsonb not null default '{}'::jsonb,
  author_member_id uuid references public.org_members(id) on delete set null,
  used_count int not null default 0,
  created_at timestamptz not null default now()
);

create table public.logic_rules (
  id        uuid primary key default gen_random_uuid(),
  survey_id uuid not null references public.surveys(id) on delete cascade,
  kind      text not null default 'low_score_follow_up',
  config    jsonb not null default '{}'::jsonb, -- {question_id, threshold, prompt}
  created_at timestamptz not null default now()
);

create table public.survey_editors (   -- 'Del med teamet' co-editors
  survey_id uuid not null references public.surveys(id) on delete cascade,
  member_id uuid not null references public.org_members(id) on delete cascade,
  granted_by uuid references public.org_members(id),
  created_at timestamptz not null default now(),
  primary key (survey_id, member_id)
);

-- Registry: quality-flag rules (data-not-code; evaluated client- and server-side)
create table public.quality_rules (
  key     text primary key,
  lang    text not null default 'no',
  pattern text,                       -- regex, nullable for word-count rules
  rule    jsonb not null,             -- {kind: regex|max_words|leading_words, ...}
  message text not null
);

alter table public.template_packs enable row level security;
alter table public.template_pack_translations enable row level security;
alter table public.surveys enable row level security;
alter table public.survey_questions enable row level security;
alter table public.question_translations enable row level security;
alter table public.question_bank enable row level security;
alter table public.logic_rules enable row level security;
alter table public.survey_editors enable row level security;
alter table public.quality_rules enable row level security;
