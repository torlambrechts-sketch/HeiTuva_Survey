-- V1-5 · DECISIONS Q24 (the catalogue as a registry), Q45 (packs carry a use
-- case; the category CHECK is not widened).
--
-- The bundle commits a six-category catalogue as a tab, a chip rail, a wizard
-- step and pack eyebrows (NEW:1873-1897, 4469, 4484, 4195-4197). Q24 commits it
-- as DATA: a registry row with a label, a description, a tint and a preset —
-- so adding a use case is a row, not a component (CLAUDE.md, data-not-code).
--
-- The brief's 36 use cases stay OUTSIDE the product until a pack exists for
-- one. A catalogue entry with nothing behind it is a promise the library cannot
-- keep, and the empty card is worse than the missing one.

create table if not exists public.use_cases (
  key         text primary key,
  label       text not null,
  short       text not null,
  description text not null,
  tint        text,
  -- The «Dashboard» button on a use-case card loads this preset. A foreign key
  -- to V1-4's shipped registry, which is the ONLY dependency V1-5 has on V1-4 —
  -- a dangling one would give the card a button that loads nothing.
  preset_key  text references public.dashboard_presets(key) on delete set null,
  sort_order  int not null default 0
);

alter table public.use_cases enable row level security;

-- Public by design, like `benchmarks` and `report_section_types`: a use case
-- carries no org id, no survey id and no number. The wizard and the library
-- both read it, and the splash may yet. The 5a3 allowlist carries the same
-- reason, and `tests/db/use-cases.test.ts` checks the claim rather than
-- trusting it — it asserts the table has no column matching org/survey/count.
drop policy if exists use_cases_sel on public.use_cases;
create policy use_cases_sel on public.use_cases for select using (true);

grant select on public.use_cases to anon, authenticated;

comment on table public.use_cases is
  'Q24: the customer-facing catalogue. Six rows. Adding one is a row, not a '
  'component; the brief''s 36 stay out until a pack exists for one.';

-- Q45 --------------------------------------------------------------------
-- `template_packs.use_case` is a FOREIGN KEY, deliberately not an enum and not
-- a CHECK: both would make adding a use case a migration instead of a row.
alter table public.template_packs
  add column if not exists use_case text references public.use_cases(key) on delete set null;

create index if not exists template_packs_use_case_idx
  on public.template_packs (use_case);

-- THE CATEGORY COLUMN'S COMMENT (Tor, required by the decision). Three things,
-- and the third is the one that does the work.
--
-- After Q45 the customer sees USE CASES and never sees `category`. A column
-- nobody displays is exactly what a future reader tidies away, so the comment
-- has to survive the person who finds it unused.
comment on column public.template_packs.category is
  '(1) WHAT IT CLASSIFIES: the pack''s internal kind — Ansatte, Kunder, '
  'Lovpålagt, Annet. `Lovpålagt` is load-bearing: it is what marks a statutory '
  'pack, and `app.apply_pack_policy` and the duty engine read it. '
  '(2) IT IS NOT THE CUSTOMER-FACING AXIS. `use_case` is (DECISIONS Q24/Q45). '
  'The CHECK was deliberately NOT widened to hold use-case names, because one '
  'column carrying two meanings drifts silently and the moment they diverge '
  'one of them is quietly wrong. '
  '(3) DROPPING THIS COLUMN IS A DECISION WITH A MIGRATION BEHIND IT, NOT A '
  'TIDY-UP. It looks unused because no screen renders it; it is read by the '
  'statutory-pack path. If it should go, that is decided on its own terms and '
  'the readers are found first.';

comment on column public.template_packs.use_case is
  'Q24/Q45: the customer-facing catalogue axis, a FK to `use_cases`. Nullable '
  'only so an organisation''s own pack need not choose one; every SHIPPED pack '
  'has one, asserted as a total function over the set in '
  'tests/db/use-cases.test.ts.';

-- Seed: the six use cases (NEW:2866-2873) ---------------------------------
insert into public.use_cases (key, label, short, description, tint, preset_key, sort_order) values
  ('hr', 'HR og arbeidsmiljø', 'HR',
   'Puls, medarbeiderundersøkelse, onboarding, exit — og de lovpålagte kartleggingene.',
   '#FBEBBE', 'arbeidsmiljo', 10),
  ('kunder', 'Kunder', 'Kunder',
   'NPS, tilfredshet etter sak eller kjøp, vunnet og tapt, produkttilbakemelding.',
   '#CFE7E4', 'kundeopplevelse', 20),
  ('intern', 'Intern tjeneste', 'Intern',
   'Servicedesk, IT, kurs og støttefunksjoner målt løpende.',
   '#FFFDF6', 'intern_tjeneste', 30),
  ('leverandor', 'Leverandørkjede', 'Leverandører',
   'Aktsomhetsvurderinger etter åpenhetsloven — attribuert per virksomhet.',
   '#FBD5C4', 'leverandor', 40),
  ('offentlig', 'Offentlig sektor', 'Offentlig',
   'Innbygger- og brukerundersøkelser, med terskel og klarspråk.',
   '#F3E7DB', 'offentlig', 50),
  ('medlem', 'Medlem og frivillig', 'Medlem',
   'Medlemsundersøkelser, frivillige etter arrangement, foreldre og deltakere.',
   '#FBEBBE', 'medlem', 60)
on conflict (key) do update
  set label = excluded.label, short = excluded.short, description = excluded.description,
      tint = excluded.tint, preset_key = excluded.preset_key, sort_order = excluded.sort_order;

-- The mapping, as ONE DEFINITION with TWO CALLERS ------------------------
--
-- It has to run twice, in two different situations, and the first attempt got
-- this wrong: the migration backfilled at migration time, `supabase/seed.sql`
-- inserted the packs AFTERWARDS, and every shipped pack came back with a null
-- use case. Migrations run before seeds.
--
--   on PROD          the packs already exist, so the migration must map them
--   on a fresh RESET the seed creates them, so the seed must map them
--
-- Two copies of the mapping is the drift this project keeps removing (V1-3's
-- interval CASE, V1-4's panel labels), so it is a function the migration
-- defines and both callers invoke. Idempotent by `use_case is null`, so
-- running it twice is a no-op and running it after a new pack is added maps
-- exactly that pack.
create or replace function app.map_pack_use_cases()
returns void
language sql security definer set search_path = '' as $$
  -- A statutory pack maps by what it is ABOUT, not by its category — the
  -- bundle tests /arbeidsmiljø|psykososial|trakassering|likestilling|klima/i
  -- for HR and /leverandør/i for the supply chain (NEW:2964-2973). Written as
  -- explicit keys rather than a regex: a regex over keys is exactly the drift
  -- Q35 removed one surface over.
  update public.template_packs set use_case = 'leverandor'
   where org_id is null and use_case is null and key = 'leverandor-apenhetsloven';

  update public.template_packs set use_case = 'intern'
   where org_id is null and use_case is null
     and key in ('kurs-opplaering', 'servicedesk-sak', 'it-verktoy');

  update public.template_packs set use_case = 'offentlig'
   where org_id is null and use_case is null
     and key in ('innbyggerundersokelse', 'brukerundersokelse-tjeneste');

  update public.template_packs set use_case = 'medlem'
   where org_id is null and use_case is null
     and key in ('medlem-innbygger', 'frivillige-arrangement');

  update public.template_packs set use_case = 'kunder'
   where org_id is null and use_case is null and category = 'Kunder';

  update public.template_packs set use_case = 'hr'
   where org_id is null and use_case is null
     and category in ('Ansatte', 'Lovpålagt');

  -- Anything the mapping missed falls to a use case rather than to NULL,
  -- because a shipped pack with no eyebrow is a card that looks broken. `hr`
  -- is the widest. `tests/db/use-cases.test.ts` asserts the mapping is TOTAL,
  -- which is what makes this branch visible if it ever fires for something it
  -- should not — the fallback keeps the UI honest; the test keeps the fallback
  -- from hiding a real gap.
  update public.template_packs set use_case = 'hr'
   where org_id is null and use_case is null;
$$;

revoke all on function app.map_pack_use_cases() from public, anon;

comment on function app.map_pack_use_cases() is
  'ONE DEFINITION, TWO CALLERS: this migration and supabase/seed.sql. It has to '
  'run twice in two different situations — on PROD the packs already exist so '
  'the migration maps them; on a fresh reset the seed creates them AFTERWARDS '
  '(migrations run before seeds) so the seed maps them. The first attempt ran '
  'it only here and every shipped pack came back with a null use case. '
  'DO NOT INLINE IT INTO EITHER CALLER: two copies of a rule that must agree is '
  'the drift this project has now removed three times — V1-3''s interval CASE '
  '(three copies, one disagreeing with the enum), V1-4''s panel labels '
  '(registry and next-intl holding the same six strings by coincidence), and '
  'this. Idempotent on `use_case is null`, so calling it twice is a no-op and '
  'calling it after a new pack is added maps exactly that pack.';

select app.map_pack_use_cases();
