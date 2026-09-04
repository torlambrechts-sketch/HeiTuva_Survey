-- HeiTuva 0028 — a section renders what its name says, or it says nothing.
--
-- `compose_report` had two shapes: a group partition for teams/heatmap, and
-- `aggregate_results` cells for EVERYTHING else. Ten section types, two
-- behaviours. So a section titled "Utvalgte sitater" rendered scale averages,
-- "Tiltak og ansvarlig" rendered scale averages, and "Deltakelse og
-- svarprosent" rendered scale averages. That is worse than an unbuilt section:
-- the numbers are real, so they read as the section's content rather than as a
-- gap, and a reader has no way to tell.
--
-- Each shape now comes from the RPC that owns it, which is also what Phase 5's
-- scope asked for ("heatmap reusing Phase 4 RPCs"):
--
--   summary, drivers      results_summary  — findings and high/low, already k-gated
--   trend                 get_trends       — per round, gated per round
--   themes                get_themes       — gated on contributors, not mentions
--   participation         results_summary  — invited/responded counts only
--   teams, heatmap        the group partition, with complementary suppression
--   quotes, actions,      NOT COMPOSED YET — returned as an explicit
--   method                `pending` marker so the screen can say so
--
-- `quotes` stays uncomposed on purpose. The design's picker stores the chosen
-- quote TEXT; storing respondent free text in `reports` would put it behind
-- every future read path on that table and would survive the retention job that
-- exists to delete it. The agreed design is answer ids re-fetched through
-- get_quotes at render, and that is Phase 6 work — so the section reports
-- itself as pending rather than rendering something else's numbers.
create or replace function public.compose_report(p_report uuid, p_token text default null)
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

  select coalesce(array_agg(x::uuid), '{}') into v_surveys
    from jsonb_array_elements_text(coalesce(v_rep.filters->'surveys', '[]'::jsonb)) x;
  select coalesce(array_agg(x::uuid), '{}') into v_rounds
    from jsonb_array_elements_text(coalesce(v_rep.filters->'rounds', '[]'::jsonb)) x;
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
       and sn.scope->>'round' is not distinct from v_rounds[1]::text;
  end if;

  -- One call, reused by the sections that read from it.
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

    elsif v_section = 'drivers' then
      -- results_summary has no `drivers` key — it returns insights/teams/avg.
      -- "Høyest og lavest" is three highest and three lowest QUESTIONS, so it
      -- is derived from aggregate_results, which has already applied the k-gate
      -- per question: a gated question has avg null and is dropped rather than
      -- ranked, which is why the ordering cannot leak one.
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

    elsif v_section in ('quotes', 'actions', 'method') then
      -- Named, not faked. See the header: these have no composer yet, and
      -- borrowing another section's numbers would be indistinguishable from
      -- content.
      v_pending := true;

    else -- summary
      if v_snapshot.id is not null then
        v_cells := v_snapshot.aggregates->'questions';
        v_source := 'snapshot';
        v_snap_id := v_snapshot.id;
      else
        v_cells := (public.aggregate_results(v_survey, v_group, v_rounds[1]))->'questions';
      end if;
      -- `insights`, not `findings`: results_summary calls them insights and
      -- there is no findings key. Each carries its own text.
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
