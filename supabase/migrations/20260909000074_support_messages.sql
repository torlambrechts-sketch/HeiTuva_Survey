-- V2-6 — the contact form writes a real row.
--
-- The bundle's contact tab (V2:2111-2145) is a form plus four support channels
-- plus a service-status panel. **The form is the only part with anything behind
-- it**, so it gets a table and the rest is handled in `docs/DEVIATIONS.md` D116.
--
-- `contactSent` in the prototype is `setState` — «Sendt. Vi svarer på
-- tuva@nordiskstudio.no» and a 2.6-second timer. Shipping that as-is would be a
-- confirmation for something that never happened, which is worse than no form:
-- a user who believes they have reported a problem stops reporting it.
create table public.support_messages (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  member_id  uuid,
  subject    text not null check (length(btrim(subject)) between 1 and 200),
  body       text not null check (length(btrim(body)) between 1 and 5000),
  lang       text not null default 'no' check (lang in ('no','en')),
  created_at timestamptz not null default now(),
  -- Composite, like every reference added since M:0063: a support message
  -- cannot cite a member from another organisation.
  constraint support_messages_member_fkey
    foreign key (member_id, org_id) references public.org_members (id, org_id)
    on delete set null (member_id)
);

comment on table public.support_messages is
  'V2-6: what the help centre''s contact form writes. `body` is free text a user '
  'typed, so CLAUDE.md invariant 7 applies to it exactly as to a respondent''s: '
  'it must not reach a log, an error payload or analytics. '
  'tests/db/help.test.ts asserts no trigger or function reads it into audit_events.';

alter table public.support_messages enable row level security;

-- Any member may write one — a person who cannot report a problem is a person
-- who stops reporting problems. Only an administrator may read the
-- organisation's messages back, because the body can carry anything.
create policy support_ins on public.support_messages for insert
  with check (app.is_org_member(org_id));
create policy support_sel on public.support_messages for select
  using (app.has_role(org_id, array['administrator']::app.member_role[]));
