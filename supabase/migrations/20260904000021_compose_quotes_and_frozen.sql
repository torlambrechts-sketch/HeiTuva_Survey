-- HeiTuva 0032 — the quotes section composes, and a published report renders
-- from the document that was frozen for it.
--
-- Two things land together because they are the same requirement seen from both
-- ends. A quote is respondent free text, so:
--
--   while the report is live, it is NEVER stored — the report holds answer ids
--   and `app.report_quotes` re-runs the k-gate on every single render, so a
--   quote whose question falls below k after a retention delete stops being
--   rendered without anyone editing the report;
--
--   once the report is PUBLISHED, the opposite is required — a statutory
--   report has to say the same thing in three years as it said on the day it
--   was signed, and the answers behind it will be gone by then. So publishing
--   freezes the composed document (0033), and this function serves that frozen
--   copy instead of recomposing.
--
-- The frozen copy is only served to a reader the freeze was gated for. Scopes
-- compare directly because `app.share_scope`'s enum order already runs from
-- most to least content — ledelse < ledere_eget_team < alle_ansatte — so
-- "frozen at least as restrictively as this reader may see" is `>=`, and a
-- document frozen for the boardroom is never handed to an all-employees link.
-- When it does not match, composition falls through to live, which re-gates.
create or replace function app.report_quotes(
  p_survey uuid, p_group uuid, p_rounds uuid[], p_picks uuid[], p_k int)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with eligible as (
    select a.id as answer_id, q.id as question_id, a.value #>> '{}' as txt
      from public.answers a
      join public.responses r on r.id = a.response_id
      join public.survey_rounds sr on sr.id = r.round_id
      join public.survey_questions q on q.id = a.question_id
     where sr.survey_id = p_survey
       and q.type::text = 'text'
       and (p_rounds is null or cardinality(p_rounds) = 0 or r.round_id = any (p_rounds))
       and (p_group is null or r.respondent_group_id = p_group)
       and a.value is not null and btrim(a.value #>> '{}') <> ''
       -- The same per-question gate the picker applied. It is applied AGAIN
       -- here, at render, because the picker's answer was true when the pick
       -- was made and may not be true now.
       and (select count(*)
              from public.answers a2
              join public.responses r2 on r2.id = a2.response_id
              join public.survey_rounds sr2 on sr2.id = r2.round_id
             where sr2.survey_id = p_survey
               and a2.question_id = q.id
               and (p_rounds is null or cardinality(p_rounds) = 0
                    or r2.round_id = any (p_rounds))
               and (p_group is null or r2.respondent_group_id = p_group)
               and a2.value is not null and btrim(a2.value #>> '{}') <> ''
           ) >= p_k
  )
  select jsonb_build_object(
    'picked', cardinality(coalesce(p_picks, '{}')) > 0,
    -- How many of the reader's picks the gate refused. The screen says so
    -- rather than quietly rendering a shorter list.
    'withheld', case when cardinality(coalesce(p_picks, '{}')) = 0 then 0
                     else cardinality(p_picks)
                          - (select count(*) from eligible e
                              where e.answer_id = any (p_picks))::int end,
    'quotes', coalesce((
      select jsonb_agg(jsonb_build_object('answer_id', s.answer_id, 'text', s.txt)
                       order by s.ord)
        from (
          select e.answer_id, e.txt, md5(e.answer_id::text) as ord
            from eligible e
           where cardinality(coalesce(p_picks, '{}')) = 0
              or e.answer_id = any (p_picks)
           order by md5(e.answer_id::text)
           -- The design's fallback: nothing picked yet shows the first three
           -- (HeiTuva.dc.html:2831). Ordered by a hash of the id, never by
           -- submission time.
           limit case when cardinality(coalesce(p_picks, '{}')) = 0
                      then 3 else cardinality(p_picks) end
        ) s), '[]'::jsonb));
$$;

comment on function app.report_quotes(uuid, uuid, uuid[], uuid[], int) is
  'Resolves a report''s picked answer ids to quote text, re-applying the '
  'per-question k-gate at every render. Reports store ids; text is never '
  'stored on a live report.';

-- The signature gains `p_as_scope`, so the publishing path can compose the
-- document it is about to freeze under a scope narrower than its own. It can
-- only ever NARROW: `greatest` against the reader's own scope, and the enum
-- runs most- to least-content, so passing `ledelse` to an all-employees token
-- moves nothing. That is what makes it safe to expose on a function `anon` can
-- reach through a share link.
drop function if exists public.compose_report(uuid, text);

create or replace function public.compose_report(
  p_report uuid,
  p_token text default null,
  p_as_scope app.share_scope default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_rep       public.reports;
  v_share     public.report_shares;
  v_k         int := app.k_threshold();
  v_role      app.member_role;
  v_scope     app.share_scope;
  v_group     uuid;
  v_surveys   uuid[];
  v_rounds    uuid[];
  v_picks     uuid[];
  v_sections  text[];
  v_section   text;
  v_out       jsonb := '[]'::jsonb;
  v_rows      jsonb;
  v_cells     jsonb;
  v_extra     jsonb;
  v_pending   boolean;
  v_snapshot  public.result_snapshots;
  v_source    text;
  v_snap_id   uuid;
  v_survey    uuid;
  v_hidden    jsonb;
  v_summary   jsonb;
begin
  select r.* into v_rep from public.reports r
   where r.id = p_report and r.deleted_at is null;
  if v_rep.id is null then
    return jsonb_build_object('error', 'forbidden');
  end if;

  if p_token is not null and length(p_token) > 0 then
    select s.* into v_share from public.report_shares s
     where s.report_id = p_report and s.token_hash = app.hash_token(p_token);
    if v_share.id is null
       or (v_share.expires_at is not null and v_share.expires_at <= now()) then
      return jsonb_build_object('error', 'forbidden');
    end if;
    v_scope := v_share.scope;
    v_group := coalesce((v_rep.filters->>'group')::uuid, v_share.group_id);
    if v_rep.filters->>'group' is not null and v_share.group_id is not null
       and v_share.group_id <> (v_rep.filters->>'group')::uuid then
      return jsonb_build_object('error', 'forbidden');
    end if;
    if v_scope = 'ledere_eget_team' and v_group is null then
      return jsonb_build_object('error', 'forbidden');
    end if;
  else
    if not app.is_org_member(v_rep.org_id) then
      return jsonb_build_object('error', 'forbidden');
    end if;
    select m.role into v_role from public.org_members m
     where m.org_id = v_rep.org_id and m.user_id = (select auth.uid()) and m.status = 'active';
    v_scope := 'ledelse';
    v_group := (v_rep.filters->>'group')::uuid;
  end if;

  v_scope := greatest(v_scope, coalesce(p_as_scope, v_scope));

  select coalesce(array_agg(x::uuid), '{}') into v_surveys
    from jsonb_array_elements_text(coalesce(v_rep.filters->'surveys', '[]'::jsonb)) x;
  select coalesce(array_agg(x::uuid), '{}') into v_rounds
    from jsonb_array_elements_text(coalesce(v_rep.filters->'rounds', '[]'::jsonb)) x;
  select coalesce(array_agg(x::uuid), '{}') into v_picks
    from jsonb_array_elements_text(coalesce(v_rep.filters->'quotes', '[]'::jsonb)) x;
  select coalesce(array_agg(x), '{}') into v_sections
    from jsonb_array_elements_text(coalesce(v_rep.sections, '[]'::jsonb)) x;

  if exists (
    select 1 from unnest(v_surveys) s(id)
     where not exists (select 1 from public.surveys sv
                        where sv.id = s.id and sv.org_id = v_rep.org_id)
  ) then
    return jsonb_build_object('error', 'forbidden');
  end if;

  v_survey := v_surveys[1];
  if v_survey is null then
    return jsonb_build_object(
      'report_id', v_rep.id, 'title', v_rep.title, 'k', v_k, 'role', v_role,
      'via', case when v_share.id is not null then 'share' else 'member' end,
      'share_scope', v_scope,
      'org_name', (select o.name from public.organizations o where o.id = v_rep.org_id),
      'scope', jsonb_build_object('surveys', to_jsonb(v_surveys), 'rounds', to_jsonb(v_rounds),
                                  'group', v_group),
      'sections', '[]'::jsonb, 'suppressed_groups', '[]'::jsonb);
  end if;

  v_snapshot := null;
  if v_rep.snapshot_id is not null then
    select sn.* into v_snapshot from public.result_snapshots sn
     where sn.id = v_rep.snapshot_id and sn.org_id = v_rep.org_id and sn.survey_id = v_survey
       and sn.scope->>'group' is not distinct from v_group::text
       and sn.scope->>'round' is not distinct from v_rounds[1]::text
       -- Frozen at least as restrictively as this reader may see. A snapshot
       -- with no recorded scope predates the freeze and counts as `ledelse`,
       -- i.e. usable only by a member.
       and coalesce((sn.scope->>'share_scope')::app.share_scope, 'ledelse') >= v_scope;
  end if;

  -- A published report renders from its frozen document, not from answers that
  -- may since have been deleted. Reader identity is restamped; the content is
  -- exactly what was gated at publish time.
  if v_snapshot.id is not null and v_snapshot.aggregates ? 'document' then
    return (v_snapshot.aggregates->'document')
           || jsonb_build_object(
                'role', v_role,
                'via', case when v_share.id is not null then 'share' else 'member' end,
                'share_scope', v_scope,
                'frozen_at', v_snapshot.created_at,
                'snapshot_id', v_snapshot.id);
  end if;

  v_summary := public.results_summary(v_survey, v_rounds[1], v_group);

  foreach v_section in array v_sections loop
    v_rows := null; v_cells := null; v_extra := null; v_pending := false;
    v_source := 'live'; v_snap_id := null;

    if v_section in ('teams', 'heatmap') then
      if v_scope = 'alle_ansatte' then
        continue;
      end if;
      select jsonb_agg(jsonb_build_object(
               'group_id', g.id, 'label', g.name, 'n', t.n, 'avg', t.avg) order by g.name)
        into v_rows
        from public.groups g
        join lateral (
          select count(distinct r.id) as n,
                 round(avg(app.numeric_answer(a.value)), 2) as avg
            from public.responses r
            join public.survey_rounds sr on sr.id = r.round_id
            join public.answers a on a.response_id = r.id
            join public.survey_questions q on q.id = a.question_id
           where sr.survey_id = v_survey
             and q.type::text = any (app.scale_types())
             and r.respondent_group_id = g.id
             and (cardinality(v_rounds) = 0 or r.round_id = any (v_rounds))
        ) t on true
       where g.org_id = v_rep.org_id and (v_group is null or g.id = v_group) and t.n > 0;
      v_rows := app.suppress_partition(coalesce(v_rows, '[]'::jsonb), v_k);

    elsif v_section = 'trend' then
      v_extra := public.get_trends(v_survey, v_group);

    elsif v_section = 'themes' then
      v_extra := public.get_themes(v_survey, case when cardinality(v_rounds) = 0
                                                  then null else v_rounds end, v_group);

    elsif v_section = 'quotes' then
      v_extra := app.report_quotes(v_survey, v_group,
                                   case when cardinality(v_rounds) = 0 then null
                                        else v_rounds end,
                                   v_picks, v_k);

    elsif v_section = 'drivers' then
      select jsonb_build_object('drivers', coalesce(jsonb_agg(d order by d->>'rank'), '[]'::jsonb))
        into v_extra
        from (
          (select jsonb_build_object('question_id', q->>'question_id', 'text', q->>'text',
                                     'avg', (q->>'avg')::numeric, 'rank', '1') as d
             from jsonb_array_elements(
                    (public.aggregate_results(v_survey, v_group, v_rounds[1]))->'questions') q
            where q->>'avg' is not null
            order by (q->>'avg')::numeric desc limit 3)
          union all
          (select jsonb_build_object('question_id', q->>'question_id', 'text', q->>'text',
                                     'avg', (q->>'avg')::numeric, 'rank', '2') as d
             from jsonb_array_elements(
                    (public.aggregate_results(v_survey, v_group, v_rounds[1]))->'questions') q
            where q->>'avg' is not null
            order by (q->>'avg')::numeric asc limit 3)
        ) ranked;

    elsif v_section = 'participation' then
      v_extra := jsonb_build_object(
        'invited', v_summary->'invited',
        'responded', v_summary->'responded',
        'completion', v_summary->'completion');

    elsif v_section in ('actions', 'method') then
      v_pending := true;

    else -- summary
      -- A snapshot without a frozen `document` is a plain aggregate freeze --
      -- what `close_round` writes so a closed round's numbers outlive the
      -- answers. It still feeds the summary cells, and the section says which
      -- of the two it is.
      if v_snapshot.id is not null then
        v_cells := v_snapshot.aggregates->'questions';
        v_source := 'snapshot';
        v_snap_id := v_snapshot.id;
      else
        v_cells := (public.aggregate_results(v_survey, v_group, v_rounds[1]))->'questions';
      end if;
      v_extra := jsonb_build_object('findings', v_summary->'insights');
    end if;

    v_out := v_out || jsonb_build_object(
      'key', v_section, 'source', v_source, 'snapshot_id', v_snap_id,
      'pending', v_pending,
      'scope', jsonb_build_object('group', v_group, 'rounds', to_jsonb(v_rounds)),
      'rows', v_rows, 'cells', v_cells, 'extra', v_extra);
  end loop;

  select jsonb_agg(distinct e->'group_id') into v_hidden
    from jsonb_array_elements(v_out) s,
         jsonb_array_elements(app.jsonb_array(s->'rows')) e
   where (e->>'suppressed')::boolean;

  if v_hidden is not null and jsonb_array_length(v_hidden) > 0 then
    declare v_visible_n bigint := 0;
    begin
      select coalesce(sum(n), 0) into v_visible_n
        from (select distinct on (e->>'group_id') (e->>'n')::bigint as n
                from jsonb_array_elements(v_out) s,
                     jsonb_array_elements(app.jsonb_array(s->'rows')) e
               where not (e->>'suppressed')::boolean) d;
      select jsonb_agg(
               case when jsonb_typeof(s->'cells') <> 'array' then s
                    else jsonb_set(s, '{cells}', (
                      select coalesce(jsonb_agg(
                               case when c->>'n' is not null
                                     and (c->>'n')::bigint - v_visible_n > 0
                                     and (c->>'n')::bigint - v_visible_n < v_k
                                    then c - 'n' - 'avg' - 'distribution'
                                         || jsonb_build_object('n', null, 'avg', null,
                                                               'insufficient_data', true)
                                    else c end), '[]'::jsonb)
                        from jsonb_array_elements(s->'cells') c)) end
               order by ord)
        into v_out
        from jsonb_array_elements(v_out) with ordinality as t(s, ord);
    end;
  end if;

  return jsonb_build_object(
    'report_id', v_rep.id, 'title', v_rep.title, 'k', v_k, 'role', v_role,
    'via', case when v_share.id is not null then 'share' else 'member' end,
    'share_scope', v_scope,
    'org_name', (select o.name from public.organizations o where o.id = v_rep.org_id),
    'scope', jsonb_build_object('surveys', to_jsonb(v_surveys), 'rounds', to_jsonb(v_rounds),
                                'group', v_group),
    'sections', coalesce(v_out, '[]'::jsonb),
    'suppressed_groups', coalesce(v_hidden, '[]'::jsonb));
end $$;

revoke all on function public.compose_report(uuid, text, app.share_scope) from public;
grant execute on function public.compose_report(uuid, text, app.share_scope) to anon, authenticated;

comment on function public.compose_report(uuid, text, app.share_scope) is
  'The only read path for a composed report. Resolves the reader (member or '
  'share token) at render time, serves a published report''s frozen document '
  'when it was gated at least as restrictively as this reader, and otherwise '
  'composes live: share scope applied (alle_ansatte drops every per-group '
  'breakdown outright), quotes re-resolved from answer ids under the k-gate, '
  'and complementary suppression so a partition never leaves exactly one group '
  'recoverable by subtraction.';
