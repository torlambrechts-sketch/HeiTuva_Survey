-- HeiTuva 0045 — Phase 9: the attributed path, the organisation-level threshold
-- policy, and the composition rules for reports that mix thresholds
-- (docs/Designbrief_terskel_Q17.md §5, §6, §8; DECISIONS Q17).
--
-- Fourteen negative tests in tests/invariants/attributed-results.test.ts were
-- written and proven failing against the Phase 8 kernel before this file
-- existed. Nothing here touches structural anonymity: the attributed path reads
-- ONLY responses that carry an invitation_id, which by the responses CHECK is
-- never an anonymous one.

-- 1. The organisation's default threshold for NEW person surveys -------------
--    3–10, default 5 (design brief §8). A starting point, not a live link: a
--    survey keeps the threshold it was created with when the default moves.
alter table public.organizations
  add column if not exists default_k_threshold int not null default 5;
alter table public.organizations
  drop constraint if exists organizations_default_k_threshold_range;
alter table public.organizations
  add constraint organizations_default_k_threshold_range
  check (default_k_threshold between 3 and 10);
comment on column public.organizations.default_k_threshold is
  'Display threshold a NEW person survey starts with (Q17, brief §8). 3–10. '
  'Statutory packs carry their own; existing surveys are not re-pointed.';

-- 1b. An organisation survey is always named. Attribution is the whole point
--     of organisation respondents (brief §1: anonymity "låses til «Med navn»"),
--     and an anonymous organisation answer would carry no invitation to
--     attribute. A CHECK, so insert and update alike are refused.
--     Any organisation survey that predates this rule is re-pointed to named
--     first — with the policy guard held off, because a locked survey would
--     otherwise refuse its own repair (the referential-maintenance lesson,
--     CLAUDE.md) — so the CHECK validates every row it is added over.
alter table public.surveys disable trigger surveys_guard_policy;
update public.surveys set anonymity = 'named'
  where respondent_kind = 'organisation' and anonymity <> 'named';
alter table public.surveys enable trigger surveys_guard_policy;
alter table public.surveys drop constraint if exists surveys_organisation_named;
alter table public.surveys add constraint surveys_organisation_named
  check (respondent_kind <> 'organisation' or anonymity = 'named');

-- 2. apply_pack_policy: the pack wins; otherwise a person survey starts at the
--    organisation''s default. The column default (5) is what an insert carries
--    when nobody chose — the builder never sets k at creation, and an explicit
--    value survives.
create or replace function app.apply_pack_policy()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_policy jsonb;
  v_default int;
begin
  if new.template_pack_key is not null then
    select tp.policy into v_policy from public.template_packs tp
      where tp.org_id is null and tp.key = new.template_pack_key
        and coalesce((tp.policy->>'locked')::boolean, false)
      limit 1;
    if v_policy is not null then
      new.anonymity      := coalesce((v_policy->>'anonymity')::app.anonymity_mode, new.anonymity);
      new.respondent_kind := coalesce(v_policy->>'respondent_kind', new.respondent_kind);
      new.k_threshold    := coalesce((v_policy->>'k_threshold')::int, new.k_threshold);
      new.policy_locked  := true;
      return new;
    end if;
  end if;

  if new.respondent_kind = 'person' and new.k_threshold = 5 then
    select o.default_k_threshold into v_default from public.organizations o where o.id = new.org_id;
    new.k_threshold := coalesce(v_default, new.k_threshold);
  end if;
  return new;
end $$;

-- 3. The guard: a redaktør may change a threshold only when the organisation
--    has said so (privacy.redaktor_may_lower, off by default — brief §8).
--    Audited either way; the floor is the CHECK and no flag opens it.
create or replace function app.guard_survey_policy()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_policy_change boolean := new.k_threshold  is distinct from old.k_threshold
                          or new.anonymity     is distinct from old.anonymity
                          or new.respondent_kind is distinct from old.respondent_kind;
  v_redaktor_ok boolean;
begin
  if old.policy_locked and v_policy_change then
    raise exception 'policy_locked'
      using hint = 'The threshold and anonymity are frozen once the survey is sent or is set by a statutory pack.';
  end if;

  if v_policy_change and exists (
       select 1 from public.template_packs tp
        where tp.org_id is null and tp.key = new.template_pack_key
          and coalesce((tp.policy->>'locked')::boolean, false)) then
    raise exception 'policy_locked'
      using hint = 'This survey is governed by a statutory template pack; the law sets its policy.';
  end if;

  if new.respondent_kind = 'organisation'
     and old.respondent_kind is distinct from 'organisation'
     and exists (select 1 from public.responses r
                  join public.survey_rounds sr on sr.id = r.round_id
                 where sr.survey_id = old.id) then
    raise exception 'respondent_kind cannot change to organisation once a person has answered';
  end if;

  if (new.k_threshold is distinct from old.k_threshold) and v_uid is not null then
    select coalesce((o.privacy->>'redaktor_may_lower')::boolean, false)
      into v_redaktor_ok from public.organizations o where o.id = new.org_id;
    if not app.has_role(new.org_id, array['administrator']::app.member_role[])
       and not (v_redaktor_ok and app.has_role(new.org_id, array['redaktor']::app.member_role[])) then
      raise exception 'threshold_admin_only'
        using hint = 'Only an administrator may change the display threshold.';
    end if;
    insert into public.audit_events (org_id, actor_user_id, action, target, meta)
    values (new.org_id, v_uid, 'threshold.change', new.id::text,
            jsonb_build_object('from', old.k_threshold, 'to', new.k_threshold));
  end if;

  return new;
end $$;

-- 4. The attributed rows — ONE implementation, used by attributed_results and
--    by the «Svar per virksomhet» report section. Refuses anything but an
--    organisation survey itself, so no caller can turn it on a person survey:
--    app.k_for = 0 is the gate this path branches on, explicitly.
create or replace function app.attributed_rows(p_survey uuid, p_rounds uuid[] default null)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when app.k_for(p_survey) <> 0 then null else jsonb_build_object(
    'questions', coalesce((
      select sr.question_snapshot from public.survey_rounds sr
       where sr.survey_id = p_survey and (p_rounds is null or sr.id = any (p_rounds))
       order by sr.round_no desc limit 1), '[]'::jsonb),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
               'invitation_id', i.id,
               'name', i.name,
               'email', i.email,
               'round_id', i.round_id,
               'status', case when i.responded_at is not null then 'svart'
                              when coalesce(cardinality(i.reminded_at), 0) > 0 then 'paaminnet'
                              else 'ikke_svart' end,
               'responded_at', i.responded_at,
               'answers', (
                 select jsonb_agg(jsonb_build_object(
                          'question_id', a.question_id, 'value', a.value, 'comment', a.comment)
                        order by a.question_id)
                   from public.responses r
                   join public.answers a on a.response_id = r.id
                  where r.invitation_id = i.id and r.round_id = i.round_id))
             order by i.name, i.created_at)
        from public.survey_invitations i
        join public.survey_rounds sr on sr.id = i.round_id
       where sr.survey_id = p_survey and (p_rounds is null or sr.id = any (p_rounds))), '[]'::jsonb),
    'unattributed', (
      select count(*) from public.responses r
        join public.survey_rounds sr on sr.id = r.round_id
       where sr.survey_id = p_survey and r.invitation_id is null
         and (p_rounds is null or sr.id = any (p_rounds))))
  end
$$;
revoke all on function app.attributed_rows(uuid, uuid[]) from public, anon, authenticated;

-- 5. attributed_results — the ungated path, for organisation respondents only.
--    Administrator and redaktør; a leser reads aggregates only and attributed
--    rows are named data (CLAUDE.md role 4). Any other survey: not_attributed.
create or replace function public.attributed_results(p_survey uuid, p_round uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_survey public.surveys;
  v_body jsonb;
begin
  select s.* into v_survey from public.surveys s where s.id = p_survey and s.deleted_at is null;
  if v_survey.id is null or not app.is_org_member(v_survey.org_id)
     or not app.has_role(v_survey.org_id, array['administrator','redaktor']::app.member_role[]) then
    return jsonb_build_object('error', 'forbidden');
  end if;
  if app.k_for(p_survey) <> 0 then
    return jsonb_build_object('error', 'not_attributed');
  end if;
  v_body := app.attributed_rows(p_survey, case when p_round is null then null else array[p_round] end);
  return jsonb_build_object(
    'survey_id', v_survey.id, 'title', v_survey.title,
    'respondent_kind', v_survey.respondent_kind, 'k', 0,
    'invited', jsonb_array_length(v_body->'rows'),
    'responded', (select count(*) from jsonb_array_elements(v_body->'rows') r where r->>'status' = 'svart'),
    'unattributed', v_body->'unattributed',
    'questions', v_body->'questions',
    'rows', v_body->'rows');
end $$;
revoke all on function public.attributed_results(uuid, uuid) from public, anon;
grant execute on function public.attributed_results(uuid, uuid) to authenticated, service_role;

-- 6. «Svar per virksomhet» as a section type — a row, not a component.
insert into public.report_section_types (key, label, description, supports_group_filter, sort_order) values
('per_virksomhet', 'Svar per virksomhet',
 'Én rad per virksomhet — bare når alle kildene er organisasjonsundersøkelser', false, 11)
on conflict (key) do nothing;

-- 7. compose_report: sources with their own k, a composed method section, and
--    the per_virksomhet constraint.
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
      -- «Svar per virksomhet» exists only for organisation respondents. In a
      -- report that carries ANY person survey it is refused with a reason —
      -- shown as unavailable in the picker, never rendered gated or empty
      -- (design brief §6). Attributed rows are named by design: the
      -- organisation answering was promised exactly that on /s/[token].
      if exists (select 1 from unnest(v_surveys) sid
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
end $function$;

-- Type of default_k_threshold: types/database.ts is updated by hand in the same commit.
