-- V2-5 — tasks from a survey's blind spots. DECISIONS **Q72 CONFIRMED**, with
-- **Q98** and **Q99 DEFAULTED, not answered** — the Gate 6 report names them,
-- which is where Tor reviews them.
--
-- ── THE TRIGGER IS THE DECISION, NOT THE WORDING ────────────────────────────
--
-- The drafted option was a task reading «undersøkelsesplikt utløst for denne
-- undersøkelsen», naming no group. **It still leaked by elimination**: groups
-- A(12), B(9), C(4), with A and B visible and healthy, tells the reader that C
-- scored badly. The predicate was still over a gated value, merely wrapped.
--
-- So the condition is not «a finding below threshold». It is
--
--     this survey has an AUDIENCE GROUP whose SIZE is below app.k_for(survey)
--
-- — a count of PEOPLE, which Q28 expressly permits, and a property of the
-- AUDIENCE rather than of the responses. **Changing the trigger removes the
-- predicate instead of hiding it**, and that is the whole of the decision:
-- nothing downstream needs a carve-out, because nothing gated was read.
--
-- Existence discloses nothing new: `groups_sel` and `members_sel` are both
-- `app.is_org_member(org_id)` (`M:0008`), so any member — a `leser` included —
-- can already read group sizes, and v2's own Målgrupper badges them.
--
-- ── ONE DEFINITION OF «BELOW THRESHOLD», NOT A SIXTH COPY ───────────────────
--
-- `lib/questions/policy-warnings.ts` has carried the shared predicate since
-- V2-3a, with four rules in a deliberate order. Writing `count < k` here would
-- be a fifth copy that disagrees the first time one of the exemptions moves —
-- and this project already found `hasThresholdWarn` as a fourth caller by
-- measurement rather than by memory. So the rules are stated ONCE in SQL, in
-- the same order, and `tests/unit/below-threshold.test.ts` runs both over one
-- matrix and requires them to agree.
create or replace function app.below_threshold(
  p_count int, p_k int, p_kind text, p_anonymity text
) returns boolean
language sql immutable
as $fn$
  select case
    -- An organisation survey is attributed and has no threshold (Q17/Q47), and a
    -- named survey has no threshold to clear. Both exemptions are BEFORE the
    -- comparison, so k is never consulted: `app.k_for` returns 0 for an
    -- organisation, and `0 > count` would otherwise read as «never below».
    when p_kind = 'organisation' then false
    when p_anonymity = 'named' then false
    -- 0 is an unfinished draft — nobody has chosen recipients yet — not a
    -- contradiction. Every survey passes through it.
    when coalesce(p_count, 0) <= 0 then false
    else p_count < p_k
  end
$fn$;

comment on function app.below_threshold(int, int, text, text) is
  'The SQL half of the shared below-threshold predicate. The TypeScript half is '
  '`belowThreshold` in lib/questions/policy-warnings.ts and the two are bound by '
  'tests/unit/below-threshold.test.ts over a shared matrix — a rule stated twice '
  'that nothing compares is a rule stated once and copied.';

-- ── Q98 (DEFAULTED): fire at SEND, once per ROUND ───────────────────────────
-- «de-duplicated on (survey, round)» needs the round, and `tasks` carried only
-- the survey. Adding the column is what makes the default literally true rather
-- than approximately so — deduplicating at survey level would silently be a
-- different decision, and a defaulted decision is still a decision.
--
-- Composite, like every reference added since `M:0063`, and nulling ONE column
-- on delete per `M:0065`.
alter table public.survey_rounds
  add constraint survey_rounds_id_survey_uniq unique (id, survey_id);

alter table public.tasks
  add column if not exists source_round_id uuid;

alter table public.tasks
  drop constraint if exists tasks_source_round_id_fkey;

alter table public.tasks
  add constraint tasks_source_round_id_fkey
  foreign key (source_round_id, source_ref) references public.survey_rounds (id, survey_id)
  on delete set null (source_round_id);

comment on column public.tasks.source_round_id is
  'Q98: the round whose send produced this task. Composite with `source_ref` so '
  'a task cannot cite a round belonging to a different survey.';

create unique index if not exists tasks_blind_spot_once
  on public.tasks (source_ref, source_round_id)
  where source_kind = 'survey' and kind = 'undersokelsesplikt';

-- ── The generator ───────────────────────────────────────────────────────────
create or replace function app.generate_blind_spot_tasks(p_survey uuid)
returns int
language plpgsql security definer set search_path to 'public'
as $fn$
declare
  v_org uuid; v_k int; v_kind text; v_anon text;
  v_round uuid; v_law text; v_small int; v_made int := 0;
begin
  select s.org_id, s.respondent_kind, s.anonymity::text
    into v_org, v_kind, v_anon
    from public.surveys s where s.id = p_survey and s.deleted_at is null;
  if v_org is null then
    return 0;
  end if;
  v_k := app.k_for(p_survey);

  -- The most recent round. Q98 fires at send, and a send IS a round.
  select r.id into v_round from public.survey_rounds r
   where r.survey_id = p_survey order by r.round_no desc limit 1;
  if v_round is null then
    return 0;
  end if;

  -- ── THE ONLY READ, AND IT IS A COUNT OF PEOPLE ────────────────────────────
  -- `org_members`, not `responses`. Test 3 walks this function's reachable call
  -- graph out of `pg_proc` and fails if anything in it touches `responses` or
  -- `answers`, so a future path nobody thought of fails by construction rather
  -- than by review.
  select count(*) into v_small from (
    select g.id, count(m.id) as n
      from public.groups g
      left join public.org_members m on m.group_id = g.id and m.status <> 'inactive'
     where g.org_id = v_org
     group by g.id
  ) sizes
  where app.below_threshold(sizes.n::int, v_k, v_kind, v_anon);

  if v_small = 0 then
    return 0;
  end if;

  -- Q70: the law text is a `duty_definitions` row, verbatim — never a string
  -- written here, which would ship the next statutory duty untranslatable.
  -- The survey's own pack when it has one; otherwise the surveying duty itself,
  -- which is what a blind spot is about.
  select d.law into v_law from public.duty_definitions d
   where d.pack_key = (select template_pack_key from public.surveys where id = p_survey);
  if v_law is null then
    select d.law into v_law from public.duty_definitions d where d.key = 'arbeidsmiljo';
  end if;

  -- ── THE PAYLOAD CARRIES NO GROUP, NO QUESTION, NO SCORE, NO COUNT ─────────
  -- Not even the number of small groups: «2 grupper» plus a Målgrupper screen
  -- that badges sizes is an elimination channel reopened one field over. The
  -- title is the confirmed sentence and nothing else.
  insert into public.tasks (org_id, title, kind, law_ref, source_kind, source_ref, source_round_id)
  values (v_org,
          'Denne undersøkelsen har grupper som ikke får egne resultater. '
          || 'Plikten til å kartlegge og følge opp gjelder likevel.',
          'undersokelsesplikt', v_law, 'survey', p_survey, v_round)
  on conflict do nothing;

  get diagnostics v_made = row_count;
  return v_made;
end $fn$;

comment on function app.generate_blind_spot_tasks(uuid) is
  'Q72: fires on AUDIENCE GROUP SIZE below app.k_for(survey), never on a '
  'finding. Reads org_members and never responses/answers — asserted by a '
  'call-graph walk in tests/db/blind-spots.test.ts, not by a list of names.';

revoke all on function app.below_threshold(int, int, text, text) from public, anon, authenticated;
revoke all on function app.generate_blind_spot_tasks(uuid) from public, anon, authenticated;

-- ── Q98: fire at SEND ───────────────────────────────────────────────────────
-- `public.send_round` is the send. The generator is called after the round is
-- established, and its failure must never fail a send: a task that did not get
-- created is a missing prompt, while a send that did not happen is a survey
-- nobody answered.
do $do$
declare v_src text; v_new text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'send_round';

  v_new := replace(v_src,
    $old$  return jsonb_build_object($old$,
    $new$  begin
    perform app.generate_blind_spot_tasks(v_round.survey_id);
  exception when others then
    null;  -- a missing prompt must never fail a send
  end;

  return jsonb_build_object($new$);

  if v_new = v_src then
    raise exception 'send_round: the return statement did not match — patch by hand rather than silently skipping it';
  end if;
  execute v_new;
end $do$;
