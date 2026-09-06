-- HeiTuva 0038 — Q30: a share-link reader does not get «Svar per virksomhet».
--
-- DECISIONS Q30 (Tor, 2026-09-06). Åpenhetsloven obliges an organisation to
-- publish its redegjørelse — the account of what it found and did — not the
-- per-supplier answers behind it. Inside the organisation the attributed rows
-- are exactly the point; through a share link they are a list of named
-- suppliers handed to whoever holds the URL.
--
-- The refusal lives HERE and not in the report editor, for the same reason
-- Q47's did not live in a component: `compose_report` is what a `/r/[token]`
-- page renders from, so a screen that declined to draw the rows would still
-- have shipped them in the payload. A screen cannot be the gate.
--
-- Scope, not role: `ledelse` is the share scope an organisation chooses when
-- the reader is meant to see everything, and it keeps the section. The two
-- narrower scopes lose it. A signed-in member is unaffected — `v_share` is
-- null for them — which is what the fourth test guards, so that "refuse for
-- token readers" cannot quietly become "refuse".
--
-- The reason string is the bare token `share_scope`. It names nothing about
-- the sources, and the negative test asserts the WHOLE serialised payload
-- carries no organisation name rather than only the section body: a reason
-- that listed which sources were excluded would leak precisely what the
-- refusal hides.
--
-- Proven failing first (scratchpad/redphase-q30.txt): "expected false to be
-- true" on the alle_ansatte denial and "expected undefined to be 'share_scope'"
-- on ledere_eget_team, with both positive controls already green — the ledelse
-- token and the signed-in redaktør.

CREATE OR REPLACE FUNCTION public.compose_report(p_report uuid, p_token text DEFAULT NULL::text, p_as_scope app.share_scope DEFAULT NULL::app.share_scope)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_rep       public.reports;
  v_share     public.report_shares;
  v_k         int;
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
  v_sources   jsonb;
  v_unavailable text;
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
  v_k := (select coalesce(max(app.k_for(sid)), 5) from unnest(v_surveys) sid);
  -- Every source with its OWN threshold, so the editor can say «Undersøkelsen
  -- «X» har terskel 3, men rapporten bruker 5» (design brief §6). The document
  -- itself is gated at v_k, the strictest of them.
  select coalesce(jsonb_agg(jsonb_build_object(
           'survey_id', sv.id, 'title', sv.title, 'k', app.k_for(sv.id),
           'respondent_kind', sv.respondent_kind) order by sv.title), '[]'::jsonb)
    into v_sources
    from unnest(v_surveys) sid join public.surveys sv on sv.id = sid;
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
      'sources', v_sources,
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
    v_source := 'live'; v_snap_id := null; v_unavailable := null;

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

    elsif v_section = 'per_virksomhet' then
      -- DECISIONS Q30. A share link is the one path where "who may see this"
      -- stops being a question about org membership, and Åpenhetsloven obliges
      -- publishing the redegjørelse — not the per-supplier answers. So a token
      -- reader below `ledelse` is refused the attributed rows.
      --
      -- Tested FIRST, before the person-source rule, deliberately: this is a
      -- fact about the READER, and it must not depend on what the report
      -- happens to contain. If the sources change later the refusal must not.
      --
      -- The second arm is the pre-existing rule (design brief §6): the section
      -- exists only for organisation respondents, so a report carrying ANY
      -- person survey is refused with its own reason — shown as unavailable in
      -- the picker, never rendered gated or empty. Attributed rows are named by
      -- design; the organisation answering was promised exactly that.
      if v_share.id is not null and v_scope > 'ledelse'::app.share_scope then
        v_unavailable := 'share_scope';
      elsif exists (select 1 from unnest(v_surveys) sid
                      join public.surveys sv on sv.id = sid
                     where sv.respondent_kind <> 'organisation') then
        v_unavailable := 'person_sources';
      else
        v_extra := app.attributed_rows(v_survey,
                     case when cardinality(v_rounds) = 0 then null else v_rounds end);
      end if;

    elsif v_section = 'method' then
      -- A published report is a document that lives on: the threshold that
      -- applied must stand in it, with every source's own (design brief §6).
      v_extra := jsonb_build_object('k', v_k, 'sources', v_sources);

    elsif v_section = 'actions' then
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
      'unavailable', v_unavailable is not null, 'reason', v_unavailable,
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
    'sources', v_sources,
    'sections', coalesce(v_out, '[]'::jsonb),
    'suppressed_groups', coalesce(v_hidden, '[]'::jsonb));
end $function$

;
