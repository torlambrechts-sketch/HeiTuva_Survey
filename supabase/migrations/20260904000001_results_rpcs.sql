-- HeiTuva 0013 — Phase 4: the results layer.
--
-- Every function here is a new reading surface over `responses`/`answers`, and
-- CLAUDE.md invariant 1 says clients never select from those tables: these RPCs
-- are the only way the numbers reach a browser. So the k gate is not a
-- presentation concern that the Resultater screen implements — it is here, and
-- a UI written against these payloads cannot render a sub-threshold cell
-- because the number is not in the payload.
--
-- The rule Tor set for this phase, and the reason the shapes below look the way
-- they do: the gate is applied PER CELL, never per query. A survey with
-- thirteen responses passes every query-level threshold loudly while containing
-- a four-person team, a four-answer question and a four-response round. Each of
-- those is gated individually, and a gated cell carries no `n` and no `avg` —
-- only the flag. "Four people answered" is itself a fact about a small team
-- (the same reasoning as D40's peer results), so the count is withheld too.

-- Shared arithmetic ----------------------------------------------------------
-- Defined once because Phase 3 taught the lesson the expensive way: resolution
-- logic copy-pasted into three RPCs is logic that drifts in two of them.

-- likert and smiley are stored as the 1-based index of the chosen label
-- (app/s/[token]/QuestionInput.tsx), so every comparable scale is already a
-- number in `answers.value`. The string branch is for older or hand-written
-- rows; anything non-numeric yields NULL rather than raising, because one bad
-- row must not take down a whole organisation's dashboard.
create or replace function app.numeric_answer(v jsonb) returns numeric
language sql immutable as $$
  select case
    when v is null then null
    when jsonb_typeof(v) = 'number' then (v #>> '{}')::numeric
    when jsonb_typeof(v) = 'string' and (v #>> '{}') ~ '^-?[0-9]+(\.[0-9]+)?$'
      then (v #>> '{}')::numeric
    else null end
$$;

-- Which question types may share one axis. The design's heatmap, trend and
-- driver panels all average `scale | likert | smiley` together because they are
-- the 1-5 family; enps is 0-10 and gets its own benchmark metric rather than
-- being folded into a mean it would distort.
create or replace function app.scale_types() returns text[]
language sql immutable as $$ select array['scale','likert','smiley'] $$;

-- The heatmap's columns, as a set so both the column list and the cell grid can
-- be built from one definition instead of two copies of the same predicate.
create or replace function app.scale_questions(p_org uuid, p_surveys uuid[])
returns table (question_id uuid, survey_id uuid, ord int, text text, type text)
language sql stable security definer set search_path = ''
as $$
  select q.id, q.survey_id, q.position, q.text, q.type::text
  from public.survey_questions q
  join public.surveys s on s.id = q.survey_id
  where s.org_id = p_org
    and s.deleted_at is null
    and (p_surveys is null or q.survey_id = any(p_surveys))
    and q.type::text = any(app.scale_types())
$$;

-- 1) Heatmap: team x question, gated cell by cell -----------------------------
-- `p_rounds` narrows to a set of rounds so the Dashboard's period selector
-- ("Siste runde" / "Siste to runder" / "Alle runder") is a real filter rather
-- than a relabelling of the survey list. Narrowing moves cells BELOW the
-- threshold, never above it, so the per-cell gate carries the period filter for
-- free — which is why it is a filter here and not a post-processing step.
drop function if exists public.get_heatmap(uuid, uuid[], uuid, uuid);
create or replace function public.get_heatmap(
  p_org uuid,
  p_surveys uuid[] default null,
  p_group uuid default null,
  p_rounds uuid[] default null
) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_k int := app.k_threshold();
  v_cols jsonb := '[]'::jsonb;
  v_rows jsonb := '[]'::jsonb;
begin
  if p_org is null or not app.is_org_member(p_org) then
    return jsonb_build_object('error', 'forbidden');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'question_id', c.question_id, 'survey_id', c.survey_id,
           'text', c.text, 'type', c.type)
         order by c.survey_id, c.ord), '[]'::jsonb)
    into v_cols
  from app.scale_questions(p_org, p_surveys) c;

  -- One grouped pass over the answers, then a full grid: every group in scope
  -- crossed with every column, so a team that answered nothing still appears as
  -- a gated row rather than vanishing. A missing row and a gated row look the
  -- same to a reader, but only one of them is honest about the team existing.
  with cols as (
    select * from app.scale_questions(p_org, p_surveys)
  ),
  stats as (
    select r.respondent_group_id as gid,
           a.question_id as qid,
           count(distinct r.id)::int as n,
           round(avg(app.numeric_answer(a.value)), 2) as avg
    from public.responses r
    join public.survey_rounds sr on sr.id = r.round_id
    join public.answers a on a.response_id = r.id
    join cols c on c.question_id = a.question_id and c.survey_id = sr.survey_id
    where app.numeric_answer(a.value) is not null
      and (p_rounds is null or r.round_id = any(p_rounds))
    group by 1, 2
  ),
  grid as (
    select g.id as gid, g.name as label, c.question_id, c.survey_id, c.ord,
           st.n, st.avg
    from public.groups g
    cross join cols c
    left join stats st on st.gid = g.id and st.qid = c.question_id
    where g.org_id = p_org
      and (p_group is null or g.id = p_group)
  )
  select coalesce(jsonb_agg(x.row order by x.label), '[]'::jsonb)
    into v_rows
  from (
    select gid, label, jsonb_build_object(
             'group_id', gid, 'label', label,
             'cells', jsonb_agg(
               case when coalesce(n, 0) >= v_k
                 then jsonb_build_object('question_id', question_id, 'n', n, 'avg', avg)
                 -- No n, no avg: the flag is the entire payload for a gated cell.
                 else jsonb_build_object('question_id', question_id, 'insufficient_data', true)
               end order by survey_id, ord)) as row
    from grid
    group by gid, label
  ) x;

  return jsonb_build_object('k', v_k, 'org_id', p_org, 'cols', v_cols, 'rows', v_rows);
end $$;

-- 2) Trends: one point per round, gated round by round ------------------------
create or replace function public.get_trends(
  p_survey uuid,
  p_group uuid default null
) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_k int := app.k_threshold();
  v_points jsonb := '[]'::jsonb;
begin
  if p_survey is null or not app.can_view_survey(p_survey) then
    return jsonb_build_object('error', 'forbidden');
  end if;

  -- Rounds drive the axis, not responses: a round nobody answered is a real
  -- point on a trend line, and dropping it would silently redraw history.
  with rounds as (
    select ro.id, ro.round_no, ro.opens_at, ro.closes_at, ro.status
    from public.survey_rounds ro
    where ro.survey_id = p_survey
  ),
  stats as (
    select r.round_id as rid,
           count(distinct r.id)::int as n,
           round(avg(app.numeric_answer(a.value)), 2) as avg
    from public.responses r
    join rounds ro on ro.id = r.round_id
    join public.answers a on a.response_id = r.id
    join public.survey_questions q on q.id = a.question_id
    where q.type::text = any(app.scale_types())
      and app.numeric_answer(a.value) is not null
      and (p_group is null or r.respondent_group_id = p_group)
    group by 1
  )
  select coalesce(jsonb_agg(
           case when coalesce(st.n, 0) >= v_k
             then jsonb_build_object('round_id', ro.id, 'round_no', ro.round_no,
                    'opens_at', ro.opens_at, 'closes_at', ro.closes_at,
                    'status', ro.status, 'n', st.n, 'avg', st.avg)
             else jsonb_build_object('round_id', ro.id, 'round_no', ro.round_no,
                    'opens_at', ro.opens_at, 'closes_at', ro.closes_at,
                    'status', ro.status, 'insufficient_data', true)
           end order by ro.round_no), '[]'::jsonb)
    into v_points
  from rounds ro
  left join stats st on st.rid = ro.id;

  return jsonb_build_object('k', v_k, 'survey_id', p_survey, 'points', v_points);
end $$;

-- 3) Free-text themes: gated on CONTRIBUTORS, not on mentions -----------------
-- Tor's rule for this phase: "a theme with three contributors in a five-person
-- team is not anonymous". Mention count is the wrong denominator — one person
-- who writes "møter" eight times would carry a theme past a mention gate on
-- their own. So a theme is shown only when at least k distinct RESPONSES
-- contributed to it, and the whole panel is withheld when fewer than k people
-- wrote anything at all.
create table if not exists public.theme_rules (
  key     text not null,
  lang    text not null check (lang in ('no','en','sv','da')),
  label   text not null,
  pattern text not null,            -- POSIX regex, matched against lowercased free text
  ord     int  not null default 0,
  primary key (key, lang)
);
alter table public.theme_rules enable row level security;
-- A registry, like benchmarks and report_section_types: readable by any signed-in
-- user, writable only by a migration.
drop policy if exists theme_rules_sel on public.theme_rules;
create policy theme_rules_sel on public.theme_rules for select
  using ((select auth.role()) = 'authenticated');

-- Verbatim from the design's THEME_WORDS (HeiTuva.dc.html:2527). Data, not code:
-- a new theme is a row.
insert into public.theme_rules (key, lang, label, pattern, ord) values
  ('moter',        'no', 'møter',        'møte',              1),
  ('prioritering', 'no', 'prioritering', 'prioriter',         2),
  ('prosess',      'no', 'prosess',      'prosess|leveranse', 3),
  ('verktoy',      'no', 'verktøy',      'verktøy',           4),
  ('tid',          'no', 'tid',          'tid|fokus|kalender',5),
  ('samarbeid',    'no', 'samarbeid',    'samarbeid|team|design', 6)
on conflict (key, lang) do nothing;

drop function if exists public.get_themes(uuid, uuid, uuid, text);
create or replace function public.get_themes(
  p_survey uuid,
  p_rounds uuid[] default null,
  p_group uuid default null,
  p_lang text default 'no'
) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_k int := app.k_threshold();
  v_org uuid;
  v_role app.member_role;
  v_total int;
  v_themes jsonb := '[]'::jsonb;
begin
  select s.org_id into v_org from public.surveys s where s.id = p_survey;
  if v_org is null or not app.is_org_member(v_org) then
    return jsonb_build_object('error', 'forbidden');
  end if;

  -- Same rule as get_quotes: a leser reads aggregates, never free text narrowed
  -- to one team. Themes are counts rather than quotes, but a team-filtered
  -- theme list is still a description of what one small group wrote.
  select m.role into v_role from public.org_members m
   where m.org_id = v_org and m.user_id = (select auth.uid()) and m.status = 'active';
  if v_role = 'leser' and p_group is not null then
    return jsonb_build_object('error', 'forbidden');
  end if;

  -- Everything the respondent typed: the free-text answers themselves, plus the
  -- per-question comments and the low-score follow-ups, which are the same kind
  -- of writing and are subject to the same gate.
  with body as (
    select r.id as response_id,
           lower(concat_ws(' ',
             case when q.type::text = 'text' then a.value #>> '{}' end,
             a.comment, a.follow_up)) as txt
    from public.responses r
    join public.survey_rounds sr on sr.id = r.round_id
    join public.answers a on a.response_id = r.id
    join public.survey_questions q on q.id = a.question_id
    where sr.survey_id = p_survey
      and (p_rounds is null or r.round_id = any(p_rounds))
      and (p_group is null or r.respondent_group_id = p_group)
  ),
  written as (
    select * from body where coalesce(btrim(txt), '') <> ''
  ),
  hits as (
    select tr.key, tr.label, tr.ord, w.response_id,
           (select count(*) from regexp_matches(w.txt, tr.pattern, 'g')) as m
    from written w
    join public.theme_rules tr on tr.lang = p_lang
    where w.txt ~ tr.pattern
  ),
  rolled as (
    select key, label, ord,
           sum(m)::int as mentions,
           count(distinct response_id)::int as contributors
    from hits group by key, label, ord
  )
  select
    (select count(distinct response_id)::int from written),
    coalesce(jsonb_agg(jsonb_build_object(
      'key', key, 'label', label, 'mentions', mentions, 'contributors', contributors)
      order by mentions desc, ord), '[]'::jsonb)
  into v_total, v_themes
  from rolled
  where contributors >= v_k;   -- the per-theme gate

  -- And the panel-level gate: below k contributors overall there is nothing
  -- safe to say about the free text, including that it exists.
  if coalesce(v_total, 0) < v_k then
    return jsonb_build_object('k', v_k, 'survey_id', p_survey,
                              'insufficient_data', true, 'themes', '[]'::jsonb);
  end if;

  return jsonb_build_object('k', v_k, 'survey_id', p_survey,
                            'contributors', v_total, 'themes', v_themes);
end $$;

-- 4) Benchmarks: our figure vs the industry, gated per metric -----------------
-- The industry value is a public reference number and is always returned; what
-- the gate withholds is OUR side of the comparison. A row therefore keeps its
-- benchmark and loses `mine` and `n`, which is what lets the panel render the
-- industry bar honestly next to an explicit "for få svar".
create or replace function public.get_benchmarks(
  p_survey uuid,
  p_industry text default 'Alle bransjer',
  p_round uuid default null,
  p_group uuid default null
) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_k int := app.k_threshold();
  v_org uuid;
  v_ind text := coalesce(nullif(btrim(p_industry), ''), 'Alle bransjer');
  v_rows jsonb := '[]'::jsonb;
  v_scale_n int; v_scale_avg numeric;
  v_enps_n int; v_enps numeric;
  v_invited int; v_responded int;
  v_has_scale boolean; v_has_enps boolean;
  b record;
begin
  select s.org_id into v_org from public.surveys s where s.id = p_survey;
  if v_org is null or not app.is_org_member(v_org) then
    return jsonb_build_object('error', 'forbidden');
  end if;

  -- Whether the survey ASKS the question a metric is derived from. A survey with
  -- no eNPS question has not got too few answers to that question — it has not
  -- asked it, and "for få svar" beside an industry figure would tell the reader
  -- to go and collect more responses that would never produce the number.
  select bool_or(q.type::text = any(app.scale_types())),
         bool_or(q.type::text = 'enps')
    into v_has_scale, v_has_enps
  from public.survey_questions q where q.survey_id = p_survey;

  select count(distinct r.id)::int, round(avg(app.numeric_answer(a.value)), 2)
    into v_scale_n, v_scale_avg
  from public.responses r
  join public.survey_rounds sr on sr.id = r.round_id
  join public.answers a on a.response_id = r.id
  join public.survey_questions q on q.id = a.question_id
  where sr.survey_id = p_survey
    and q.type::text = any(app.scale_types())
    and app.numeric_answer(a.value) is not null
    and (p_round is null or r.round_id = p_round)
    and (p_group is null or r.respondent_group_id = p_group);

  -- eNPS proper: promoters (9-10) minus detractors (0-6), as a percentage.
  -- Not an average of the 0-10 answers, which is a different number entirely.
  select count(distinct r.id)::int,
         round(100.0 * (
           count(*) filter (where app.numeric_answer(a.value) >= 9)
           - count(*) filter (where app.numeric_answer(a.value) <= 6)
         ) / nullif(count(*), 0), 0)
    into v_enps_n, v_enps
  from public.responses r
  join public.survey_rounds sr on sr.id = r.round_id
  join public.answers a on a.response_id = r.id
  join public.survey_questions q on q.id = a.question_id
  where sr.survey_id = p_survey
    and q.type::text = 'enps'
    and app.numeric_answer(a.value) is not null
    and (p_round is null or r.round_id = p_round)
    and (p_group is null or r.respondent_group_id = p_group);

  select count(*)::int, count(*) filter (where i.responded_at is not null)::int
    into v_invited, v_responded
  from public.survey_invitations i
  join public.survey_rounds sr on sr.id = i.round_id
  where sr.survey_id = p_survey
    and (p_round is null or i.round_id = p_round)
    and (p_group is null or i.group_id = p_group);

  for b in
    select bm.metric_key, bm.value, bm.source
    from public.benchmarks bm
    where bm.industry = v_ind
    order by case bm.metric_key
      when 'engagement_avg' then 1 when 'response_rate' then 2 when 'enps' then 3 else 9 end
  loop
    -- Skip a metric this survey cannot produce at all, and skip the response
    -- rate when nobody was invited (an open share link has no denominator).
    if (b.metric_key = 'engagement_avg' and not coalesce(v_has_scale, false))
       or (b.metric_key = 'enps' and not coalesce(v_has_enps, false))
       or (b.metric_key = 'response_rate' and coalesce(v_invited, 0) = 0)
    then
      continue;
    end if;

    v_rows := v_rows || case b.metric_key
      when 'engagement_avg' then
        case when coalesce(v_scale_n, 0) >= v_k
          then jsonb_build_object('metric_key', b.metric_key, 'scale', 'score_5',
                 'bench', b.value, 'source', b.source, 'mine', v_scale_avg, 'n', v_scale_n)
          else jsonb_build_object('metric_key', b.metric_key, 'scale', 'score_5',
                 'bench', b.value, 'source', b.source, 'insufficient_data', true)
        end
      when 'enps' then
        case when coalesce(v_enps_n, 0) >= v_k
          then jsonb_build_object('metric_key', b.metric_key, 'scale', 'enps',
                 'bench', b.value, 'source', b.source, 'mine', v_enps, 'n', v_enps_n)
          else jsonb_build_object('metric_key', b.metric_key, 'scale', 'enps',
                 'bench', b.value, 'source', b.source, 'insufficient_data', true)
        end
      when 'response_rate' then
        -- Participation, not a result. The same number the Undersøkelser list
        -- already shows (migration 0003), so gating it here would be theatre —
        -- and it says nothing about what anybody answered.
        jsonb_build_object('metric_key', b.metric_key, 'scale', 'rate',
          'bench', b.value, 'source', b.source, 'invited', v_invited,
          'responded', v_responded,
          'mine', case when v_invited > 0
                    then round(v_responded::numeric / v_invited, 4) else null end)
      else jsonb_build_object('metric_key', b.metric_key, 'scale', 'raw',
             'bench', b.value, 'source', b.source, 'insufficient_data', true)
    end;
  end loop;

  return jsonb_build_object('k', v_k, 'survey_id', p_survey,
                            'industry', v_ind, 'rows', v_rows);
end $$;

-- 5) Resultater: the stat cards, the team rows and the insight facts ----------
-- `insights` carries ids and numbers, never sentences: CLAUDE.md forbids
-- user-facing text outside next-intl, and it is also what keeps a gated group
-- from being named in prose that no cell assertion would catch.
create or replace function public.results_summary(
  p_survey uuid,
  p_round uuid default null,
  p_group uuid default null
) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_k int := app.k_threshold();
  v_org uuid;
  v_n int; v_avg numeric;
  v_invited int; v_responded int;
  v_teams jsonb := '[]'::jsonb;
  v_insights jsonb := '[]'::jsonb;
  v_prev jsonb := null;
  v_prev_avg numeric;
  v_round_no int;
  q record;
begin
  select s.org_id into v_org from public.surveys s where s.id = p_survey;
  if v_org is null or not app.is_org_member(v_org) then
    return jsonb_build_object('error', 'forbidden');
  end if;

  select count(distinct r.id)::int into v_n
  from public.responses r
  join public.survey_rounds sr on sr.id = r.round_id
  where sr.survey_id = p_survey
    and (p_round is null or r.round_id = p_round)
    and (p_group is null or r.respondent_group_id = p_group);

  select round(avg(app.numeric_answer(a.value)), 2) into v_avg
  from public.responses r
  join public.survey_rounds sr on sr.id = r.round_id
  join public.answers a on a.response_id = r.id
  join public.survey_questions q2 on q2.id = a.question_id
  where sr.survey_id = p_survey
    and q2.type::text = any(app.scale_types())
    and app.numeric_answer(a.value) is not null
    and (p_round is null or r.round_id = p_round)
    and (p_group is null or r.respondent_group_id = p_group);

  select count(*)::int, count(*) filter (where i.responded_at is not null)::int
    into v_invited, v_responded
  from public.survey_invitations i
  join public.survey_rounds sr on sr.id = i.round_id
  where sr.survey_id = p_survey
    and (p_round is null or i.round_id = p_round)
    and (p_group is null or i.group_id = p_group);

  -- The whole slice is below the threshold: no average, no teams, no insights.
  if v_n < v_k then
    v_avg := null;
  end if;

  -- Team rows, gated one team at a time.
  with stats as (
    select r.respondent_group_id as gid,
           count(distinct r.id)::int as n,
           round(avg(app.numeric_answer(a.value)), 2) as avg
    from public.responses r
    join public.survey_rounds sr on sr.id = r.round_id
    join public.answers a on a.response_id = r.id
    join public.survey_questions q2 on q2.id = a.question_id
    where sr.survey_id = p_survey
      and q2.type::text = any(app.scale_types())
      and app.numeric_answer(a.value) is not null
      and (p_round is null or r.round_id = p_round)
    group by 1
  )
  select coalesce(jsonb_agg(
           case when coalesce(st.n, 0) >= v_k
             then jsonb_build_object('group_id', g.id, 'label', g.name, 'n', st.n, 'avg', st.avg)
             else jsonb_build_object('group_id', g.id, 'label', g.name, 'insufficient_data', true)
           end order by g.name), '[]'::jsonb)
    into v_teams
  from public.groups g
  left join stats st on st.gid = g.id
  where g.org_id = v_org
    and (p_group is null or g.id = p_group);

  -- Previous round, for the "Mot forrige runde" panel. Gated like any other.
  if p_round is not null then
    select ro.round_no into v_round_no from public.survey_rounds ro where ro.id = p_round;
    select jsonb_build_object('round_id', prev.id, 'round_no', prev.round_no) ||
           case when coalesce(prev.n, 0) >= v_k
             then jsonb_build_object('n', prev.n, 'avg', prev.avg)
             else jsonb_build_object('insufficient_data', true) end
      into v_prev
    from (
      select ro.id, ro.round_no,
             count(distinct r.id)::int as n,
             round(avg(app.numeric_answer(a.value)), 2) as avg
      from public.survey_rounds ro
      left join public.responses r on r.round_id = ro.id
        and (p_group is null or r.respondent_group_id = p_group)
      left join public.answers a on a.response_id = r.id
      left join public.survey_questions q2 on q2.id = a.question_id
        and q2.type::text = any(app.scale_types())
      where ro.survey_id = p_survey and ro.round_no < coalesce(v_round_no, 0)
      group by ro.id, ro.round_no
      order by ro.round_no desc
      limit 1
    ) prev;
    if v_prev is not null and (v_prev ? 'avg') then
      v_prev_avg := (v_prev ->> 'avg')::numeric;
    end if;
  end if;

  -- Insight facts. Every one of them reads a number that survived the gate:
  -- the per-question loop skips anything below k, so a four-answer question can
  -- never become "the lowest scoring area", and no team id is referenced at all.
  if v_n >= v_k then
    for q in
      select a2.question_id as qid,
             count(distinct r.id)::int as n,
             avg(app.numeric_answer(a2.value)) as avg,
             count(*) filter (where app.numeric_answer(a2.value) <= 2)::numeric
               / nullif(count(*), 0) as low_share
      from public.responses r
      join public.survey_rounds sr on sr.id = r.round_id
      join public.answers a2 on a2.response_id = r.id
      join public.survey_questions q2 on q2.id = a2.question_id
      where sr.survey_id = p_survey
        and q2.type::text = any(app.scale_types())
        and app.numeric_answer(a2.value) is not null
        and (p_round is null or r.round_id = p_round)
        and (p_group is null or r.respondent_group_id = p_group)
      group by 1
      order by 3 asc
    loop
      if q.n < v_k then
        continue;   -- the per-cell gate, inside the insight generator itself
      end if;
      if q.avg < 3.6 then
        v_insights := v_insights || jsonb_build_object('key', 'low_question',
          'tone', 'warn', 'question_id', q.qid, 'value', round(q.avg, 1));
      elsif q.low_share >= 0.2 then
        v_insights := v_insights || jsonb_build_object('key', 'split_question',
          'tone', 'warn', 'question_id', q.qid, 'value', round(q.low_share * 100, 0));
      elsif q.avg >= 4.3 then
        v_insights := v_insights || jsonb_build_object('key', 'strong_question',
          'tone', 'good', 'question_id', q.qid, 'value', round(q.avg, 1));
      end if;
    end loop;

    if v_invited > 0 and (v_responded::numeric / v_invited) < 0.7 then
      v_insights := v_insights || jsonb_build_object('key', 'low_response_rate',
        'tone', 'note', 'value', round(100.0 * v_responded / v_invited, 0));
    end if;
    v_insights := (select coalesce(jsonb_agg(e), '[]'::jsonb)
                   from (select e from jsonb_array_elements(v_insights) e limit 4) t);
  end if;

  return jsonb_build_object(
    'k', v_k, 'survey_id', p_survey, 'round_id', p_round, 'group_id', p_group,
    'n', v_n, 'invited', v_invited, 'responded', v_responded,
    'completion', case when v_invited > 0
                    then round(v_responded::numeric / v_invited, 4) else null end,
    'avg', v_avg, 'teams', v_teams, 'prev', v_prev,
    'delta', case when v_avg is not null and v_prev_avg is not null
               then round(v_avg - v_prev_avg, 2) else null end,
    'insights', v_insights);
end $$;

-- 6) Dashboard: cross-survey stat cards and drivers ---------------------------
drop function if exists public.dashboard_summary(uuid, uuid[], uuid);
create or replace function public.dashboard_summary(
  p_org uuid,
  p_surveys uuid[] default null,
  p_group uuid default null,
  p_rounds uuid[] default null
) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_k int := app.k_threshold();
  v_surveys jsonb := '[]'::jsonb;
  v_drivers jsonb := '[]'::jsonb;
  v_n int; v_avg numeric; v_invited int; v_responded int;
begin
  if p_org is null or not app.is_org_member(p_org) then
    return jsonb_build_object('error', 'forbidden');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', s.id, 'title', s.title, 'status', s.status) order by s.created_at desc), '[]'::jsonb)
    into v_surveys
  from public.surveys s
  where s.org_id = p_org and s.deleted_at is null
    and (p_surveys is null or s.id = any(p_surveys));

  select count(distinct r.id)::int into v_n
  from public.responses r
  join public.survey_rounds sr on sr.id = r.round_id
  join public.surveys s on s.id = sr.survey_id
  where s.org_id = p_org and s.deleted_at is null
    and (p_surveys is null or s.id = any(p_surveys))
    and (p_rounds is null or r.round_id = any(p_rounds))
    and (p_group is null or r.respondent_group_id = p_group);

  select count(*)::int, count(*) filter (where i.responded_at is not null)::int
    into v_invited, v_responded
  from public.survey_invitations i
  join public.survey_rounds sr on sr.id = i.round_id
  join public.surveys s on s.id = sr.survey_id
  where s.org_id = p_org and s.deleted_at is null
    and (p_surveys is null or s.id = any(p_surveys))
    and (p_rounds is null or i.round_id = any(p_rounds))
    and (p_group is null or i.group_id = p_group);

  -- Drivers are a RANKING, so a gated question is dropped rather than carried
  -- with a null: a question with no number cannot be "lowest scoring", and
  -- rendering it as 0 would put a four-answer question at the bottom of the
  -- list as though that were a finding.
  with stats as (
    select a.question_id as qid, q.survey_id, q.text, q.type::text as type,
           count(distinct r.id)::int as n,
           round(avg(app.numeric_answer(a.value)), 2) as avg
    from public.responses r
    join public.survey_rounds sr on sr.id = r.round_id
    join public.surveys s on s.id = sr.survey_id
    join public.answers a on a.response_id = r.id
    join public.survey_questions q on q.id = a.question_id
    where s.org_id = p_org and s.deleted_at is null
      and (p_surveys is null or s.id = any(p_surveys))
      and q.type::text = any(app.scale_types())
      and app.numeric_answer(a.value) is not null
      and (p_rounds is null or r.round_id = any(p_rounds))
      and (p_group is null or r.respondent_group_id = p_group)
    group by 1, 2, 3, 4
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'question_id', qid, 'survey_id', survey_id, 'text', text,
           'type', type, 'n', n, 'avg', avg) order by avg desc), '[]'::jsonb)
    into v_drivers
  from stats where n >= v_k;

  if v_n < v_k then
    v_avg := null;
  else
    select round(avg(app.numeric_answer(a.value)), 2) into v_avg
    from public.responses r
    join public.survey_rounds sr on sr.id = r.round_id
    join public.surveys s on s.id = sr.survey_id
    join public.answers a on a.response_id = r.id
    join public.survey_questions q on q.id = a.question_id
    where s.org_id = p_org and s.deleted_at is null
      and (p_surveys is null or s.id = any(p_surveys))
      and q.type::text = any(app.scale_types())
      and app.numeric_answer(a.value) is not null
      and (p_rounds is null or r.round_id = any(p_rounds))
    and (p_group is null or r.respondent_group_id = p_group);
  end if;

  return jsonb_build_object('k', v_k, 'org_id', p_org, 'surveys', v_surveys,
    'n', v_n, 'invited', v_invited, 'responded', v_responded,
    'completion', case when v_invited > 0
                    then round(v_responded::numeric / v_invited, 4) else null end,
    'avg', v_avg, 'drivers', v_drivers);
end $$;

-- 7) Snapshots ----------------------------------------------------------------
-- A snapshot outlives the raw answers: retention deletes responses/answers and
-- the aggregates persist (plan §3, migration 0005). That is exactly why it must
-- freeze the GATED payload — a snapshot taken from ungated data would preserve a
-- four-person cell forever, past the deletion that was supposed to protect it.
create or replace function public.snapshot_results(
  p_survey uuid,
  p_round uuid default null,
  p_group uuid default null
) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_org uuid;
  v_agg jsonb;
  v_hash text;
  v_id uuid;
begin
  select s.org_id into v_org from public.surveys s where s.id = p_survey;
  -- Freezing a result is an editorial act (it is what a report archives), so it
  -- takes the same authority as editing the survey — not merely membership.
  if v_org is null or not app.can_edit_survey(p_survey) then
    return jsonb_build_object('error', 'forbidden');
  end if;

  v_agg := public.aggregate_results(p_survey, p_group, p_round);
  if v_agg ? 'error' then
    return v_agg;
  end if;

  v_hash := encode(extensions.digest(v_agg::text, 'sha256'), 'hex');

  insert into public.result_snapshots (org_id, survey_id, round_id, scope, aggregates, content_hash)
  values (v_org, p_survey, p_round,
          jsonb_build_object('group', p_group, 'round', p_round),
          v_agg, v_hash)
  returning id into v_id;

  return jsonb_build_object('snapshot_id', v_id, 'content_hash', v_hash,
                            'created_at', now());
end $$;

-- Grants ----------------------------------------------------------------------
-- Every one of these reads answer data. `anon` holds a respondent token, never a
-- session, and has no business on any of them; Supabase grants EXECUTE to PUBLIC
-- at CREATE time, so each must be revoked before it is granted.
revoke all on function public.get_heatmap(uuid, uuid[], uuid, uuid[]) from public, anon;
grant execute on function public.get_heatmap(uuid, uuid[], uuid, uuid[]) to authenticated;
revoke all on function public.get_trends(uuid, uuid) from public, anon;
grant execute on function public.get_trends(uuid, uuid) to authenticated;
revoke all on function public.get_themes(uuid, uuid[], uuid, text) from public, anon;
grant execute on function public.get_themes(uuid, uuid[], uuid, text) to authenticated;
revoke all on function public.get_benchmarks(uuid, text, uuid, uuid) from public, anon;
grant execute on function public.get_benchmarks(uuid, text, uuid, uuid) to authenticated;
revoke all on function public.results_summary(uuid, uuid, uuid) from public, anon;
grant execute on function public.results_summary(uuid, uuid, uuid) to authenticated;
revoke all on function public.dashboard_summary(uuid, uuid[], uuid, uuid[]) from public, anon;
grant execute on function public.dashboard_summary(uuid, uuid[], uuid, uuid[]) to authenticated;
revoke all on function public.snapshot_results(uuid, uuid, uuid) from public, anon;
grant execute on function public.snapshot_results(uuid, uuid, uuid) to authenticated;

revoke all on function app.numeric_answer(jsonb) from public, anon;
revoke all on function app.scale_types() from public, anon;
revoke all on function app.scale_questions(uuid, uuid[]) from public, anon;

grant select on public.theme_rules to authenticated;

-- Indexes the grouped scans above lean on.
create index if not exists responses_group_idx on public.responses(respondent_group_id);
create index if not exists answers_response_idx on public.answers(response_id);

-- 8) Quotes, filtered by theme ------------------------------------------------
-- The design's themes panel says "Klikk et tema for å filtrere sitatene"
-- (HeiTuva.dc.html:2282), and a theme-filtered quote list is a NARROWER slice
-- than the unfiltered one: the k gate therefore has to count the filtered rows,
-- not the question's total. Same function rather than a new one, so there is
-- one place where free text becomes readable.
--
-- The old four-argument signature is dropped rather than left beside this one:
-- two overloads that both accept four arguments are ambiguous to the planner.
drop function if exists public.get_quotes(uuid, uuid, uuid, int);

-- VOLATILE, not STABLE, for the reason migration 0013 established: the body
-- orders by random() so quotes can never be read back in submission order, and
-- a STABLE marking would let the planner evaluate the call once per scan and
-- reuse the result — misdeclaring the function and undermining the shuffle.
-- The signature change above drops 0013's `alter`, so the marking is restated
-- here rather than left to be re-derived.
create or replace function public.get_quotes(
  p_survey uuid,
  p_question uuid,
  p_group uuid default null,
  p_limit int default 20,
  p_theme text default null,
  p_lang text default 'no'
) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_org uuid;
  v_n int;
  v_role app.member_role;
  v_k int := app.k_threshold();
  v_pattern text;
begin
  select s.org_id into v_org from public.surveys s where s.id = p_survey;
  if v_org is null or not app.is_org_member(v_org) then
    return jsonb_build_object('error', 'forbidden');
  end if;

  select m.role into v_role from public.org_members m
   where m.org_id = v_org and m.user_id = (select auth.uid()) and m.status = 'active';
  if v_role = 'leser' and p_group is not null then
    return jsonb_build_object('error', 'forbidden'); -- leser: aggregates only, never filtered text
  end if;

  if p_theme is not null then
    select tr.pattern into v_pattern
      from public.theme_rules tr where tr.key = p_theme and tr.lang = p_lang;
    -- An unknown theme key must not silently widen back to "all quotes".
    if v_pattern is null then
      return jsonb_build_object('insufficient_data', true, 'n', null, 'k', v_k);
    end if;
  end if;

  select count(*) into v_n
  from public.responses r
  join public.answers a on a.response_id = r.id and a.question_id = p_question
  join public.survey_rounds sr on sr.id = r.round_id
  where sr.survey_id = p_survey
    and (p_group is null or r.respondent_group_id = p_group)
    and a.value is not null and a.value #>> '{}' <> ''
    and (v_pattern is null or lower(a.value #>> '{}') ~ v_pattern);

  if v_n < v_k then
    return jsonb_build_object('insufficient_data', true, 'n', null, 'k', v_k);
  end if;

  return (
    select jsonb_build_object('n', v_n, 'theme', p_theme, 'quotes',
      coalesce(jsonb_agg(jsonb_build_object('text', t.txt)), '[]'::jsonb))
    from (
      select a.value #>> '{}' as txt
      from public.responses r
      join public.answers a on a.response_id = r.id and a.question_id = p_question
      join public.survey_rounds sr on sr.id = r.round_id
      where sr.survey_id = p_survey
        and (p_group is null or r.respondent_group_id = p_group)
        and a.value is not null and a.value #>> '{}' <> ''
        and (v_pattern is null or lower(a.value #>> '{}') ~ v_pattern)
      order by random()  -- never chronological: prevents timing correlation
      limit greatest(1, least(coalesce(p_limit, 20), 100))
    ) t);
  -- Still no author, no group label and no timestamp in the payload — ever.
end $$;

revoke all on function public.get_quotes(uuid, uuid, uuid, int, text, text) from public, anon;
grant execute on function public.get_quotes(uuid, uuid, uuid, int, text, text) to authenticated;
