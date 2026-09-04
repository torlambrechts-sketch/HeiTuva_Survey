-- HeiTuva 0022 — composing a report is its own disclosure decision.
--
-- Every result RPC so far gates PER CELL: a cell with fewer than five
-- respondents comes back as `insufficient_data`, carrying no n and no avg. That
-- is correct and it is not sufficient, because a report is not a cell. It is a
-- set of cells chosen by an editor, rendered together, and read by someone who
-- may not be the editor. Three things become possible only at that moment:
--
--   1. DIFFERENCING. Show a per-group breakdown next to a total and the
--      suppressed group is arithmetic: total minus the visible parts IS the
--      hidden part. With two groups of 12 and 3, gating the 3 changes nothing —
--      15 − 12 = 3, and if both distributions render, so does theirs. Per-cell
--      gating cannot see this, because each cell is individually correct.
--
--   2. A DIFFERENT READER. A share link is read by someone who is not a member.
--      Handing them a document composed under the editor's scope would export
--      the editor's access along with the numbers.
--
--   3. A FROZEN SCOPE. `result_snapshots` stores `scope` for a reason. A
--      snapshot taken across all groups is a true statement about all groups
--      and a false one about any single group — using it for a group-filtered
--      section renders numbers that are accurate about a question nobody asked.
--
-- So composition gets one entry point that decides all three, and the editor UI
-- has no other way to read results. `tests/invariants/report-composition.test.ts`
-- was written against this contract before the function existed.

-- `x->'rows'` on a section built with a NULL rows value yields jsonb `null`,
-- not SQL NULL, so coalesce does not catch it and jsonb_array_elements raises
-- "cannot extract elements from a scalar". One guard, used everywhere a
-- possibly-absent array is walked.
create or replace function app.jsonb_array(v jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$ select case when jsonb_typeof(v) = 'array' then v else '[]'::jsonb end $$;

revoke all on function app.jsonb_array(jsonb) from public, anon;

-- ---------------------------------------------------------------------------
-- Complementary suppression
-- ---------------------------------------------------------------------------
-- The standard remedy for differencing, and the one an auditor will look for:
-- if exactly one cell of a partition is suppressed, suppress the next-smallest
-- too, so the residual covers at least two groups. Iterating (rather than
-- hiding one extra and stopping) matters when the second-smallest is itself
-- small: hiding 3 and 4 out of 12+4+3 leaves a residual of 7 spread over two
-- groups, which is fine, but hiding 3 and 4 out of 4+3 leaves 0 groups visible
-- and the loop must arrive there rather than leave one group standing alone.
create or replace function app.suppress_partition(p_rows jsonb, p_k int)
returns jsonb
language plpgsql
-- STABLE, not IMMUTABLE: jsonb_array_elements is itself only STABLE, so
-- claiming immutability here is a promise the body cannot keep and
-- `supabase db lint` says so. Nothing needs it to be immutable — it is called
-- once per section, never indexed on.
stable
set search_path = ''
as $$
declare
  v_rows jsonb := coalesce(p_rows, '[]'::jsonb);
  v_visible int;
  v_smallest int;
  v_i int;
begin
  -- Pass 1: the ordinary per-cell gate.
  select jsonb_agg(
           case when (e->>'n')::int < p_k
                then jsonb_build_object('group_id', e->'group_id', 'label', e->'label',
                                        'n', null, 'avg', null, 'suppressed', true)
                else e || jsonb_build_object('suppressed', false) end
           order by ord)
    into v_rows
    from jsonb_array_elements(v_rows) with ordinality as t(e, ord);

  v_rows := coalesce(v_rows, '[]'::jsonb);

  -- Pass 2: while exactly one row is hidden, hide the smallest visible one too.
  -- A single hidden row is not hidden at all when the rest are shown.
  loop
    select count(*) into v_visible
      from jsonb_array_elements(v_rows) e
     where not (e->>'suppressed')::boolean;

    exit when v_visible = 0;

    -- Stop as soon as at least two rows are hidden: the residual then spans
    -- more than one group and subtraction no longer isolates anybody.
    exit when (select count(*) from jsonb_array_elements(v_rows) e
                where (e->>'suppressed')::boolean) <> 1;

    select ord::int into v_smallest
      from jsonb_array_elements(v_rows) with ordinality as t(e, ord)
     where not (e->>'suppressed')::boolean
     order by (e->>'n')::int asc, ord asc
     limit 1;

    v_i := v_smallest - 1;
    v_rows := jsonb_set(
      v_rows, array[v_i::text],
      jsonb_build_object(
        'group_id', v_rows->v_i->'group_id', 'label', v_rows->v_i->'label',
        'n', null, 'avg', null, 'suppressed', true));
  end loop;

  return v_rows;
end $$;

revoke all on function app.suppress_partition(jsonb, int) from public, anon;

comment on function app.suppress_partition(jsonb, int) is
  'Per-cell k gate followed by complementary suppression: a partition never '
  'ends with exactly one hidden row, because one hidden row among visible ones '
  'is recoverable by subtraction.';

-- ---------------------------------------------------------------------------
-- compose_report
-- ---------------------------------------------------------------------------
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
  v_is_member boolean := false;
  v_role      app.member_role;
  v_group     uuid;          -- effective group filter for the whole document
  v_surveys   uuid[];
  v_rounds    uuid[];
  v_sections  text[];
  v_section   text;
  v_out       jsonb := '[]'::jsonb;
  v_rows      jsonb;
  v_cells     jsonb;
  v_snapshot  public.result_snapshots;
  v_source    text;
  v_snap_id   uuid;
  v_survey    uuid;
  v_hidden    jsonb;
begin
  select r.* into v_rep from public.reports r
   where r.id = p_report and r.deleted_at is null;

  -- A missing report and a forbidden one answer identically. Distinguishing
  -- them turns this function into an existence oracle for report ids.
  if v_rep.id is null then
    return jsonb_build_object('error', 'forbidden');
  end if;

  -- -------------------------------------------------------------------------
  -- 1. Gate at render, per token: who is reading this, right now?
  -- -------------------------------------------------------------------------
  if p_token is not null and length(p_token) > 0 then
    select s.* into v_share from public.report_shares s
     where s.report_id = p_report
       and s.token_hash = app.hash_token(p_token);

    if v_share.id is null
       or (v_share.expires_at is not null and v_share.expires_at <= now()) then
      return jsonb_build_object('error', 'forbidden');
    end if;

    -- The token's own group narrows the report. It can never widen it: a
    -- report already filtered to one group stays there however the link was
    -- cut, so a null-scoped token is "no extra narrowing", not "all groups".
    v_group := coalesce((v_rep.filters->>'group')::uuid, v_share.group_id);
    if v_rep.filters->>'group' is not null
       and v_share.group_id is not null
       and v_share.group_id <> (v_rep.filters->>'group')::uuid then
      return jsonb_build_object('error', 'forbidden');
    end if;
  else
    v_is_member := app.is_org_member(v_rep.org_id);
    if not v_is_member then
      return jsonb_build_object('error', 'forbidden');
    end if;
    select m.role into v_role from public.org_members m
     where m.org_id = v_rep.org_id and m.user_id = (select auth.uid()) and m.status = 'active';
    v_group := (v_rep.filters->>'group')::uuid;
  end if;

  select coalesce(array_agg(x::uuid), '{}')
    into v_surveys
    from jsonb_array_elements_text(coalesce(v_rep.filters->'surveys', '[]'::jsonb)) x;
  select coalesce(array_agg(x::uuid), '{}')
    into v_rounds
    from jsonb_array_elements_text(coalesce(v_rep.filters->'rounds', '[]'::jsonb)) x;
  select coalesce(array_agg(x), '{}')
    into v_sections
    from jsonb_array_elements_text(coalesce(v_rep.sections, '[]'::jsonb)) x;

  -- Every survey in the filter must belong to the report's org. A filter is
  -- editor-supplied jsonb, not a foreign key, so this is the only thing
  -- standing between a hand-edited filter and another tenant's results.
  if exists (
    select 1 from unnest(v_surveys) s(id)
     where not exists (select 1 from public.surveys sv
                        where sv.id = s.id and sv.org_id = v_rep.org_id)
  ) then
    return jsonb_build_object('error', 'forbidden');
  end if;

  v_survey := v_surveys[1];

  -- -------------------------------------------------------------------------
  -- 2. Scope-aware snapshots: a frozen number belongs to the filter that froze it
  -- -------------------------------------------------------------------------
  v_snapshot := null;
  if v_rep.snapshot_id is not null then
    select sn.* into v_snapshot from public.result_snapshots sn
     where sn.id = v_rep.snapshot_id
       and sn.org_id = v_rep.org_id                       -- never another tenant's
       and sn.survey_id = v_survey
       and sn.scope->>'group' is not distinct from v_group::text
       and sn.scope->>'round' is not distinct from v_rounds[1]::text;
  end if;

  foreach v_section in array v_sections loop
    v_rows := null;
    v_cells := null;
    v_source := 'live';
    v_snap_id := null;

    if v_section in ('teams', 'heatmap') then
      -- A per-group partition. This is the shape that differences.
      select jsonb_agg(jsonb_build_object(
               'group_id', g.id, 'label', g.name, 'n', t.n, 'avg', t.avg)
               order by g.name)
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
       where g.org_id = v_rep.org_id
         and (v_group is null or g.id = v_group)
         and t.n > 0;

      v_rows := app.suppress_partition(coalesce(v_rows, '[]'::jsonb), v_k);

    else
      -- A scalar section (summary, drivers, trend, …). These read the ordinary
      -- per-cell gate, from the snapshot when its scope matches and live
      -- otherwise — never from a snapshot taken under a different filter.
      if v_snapshot.id is not null then
        v_cells := v_snapshot.aggregates->'questions';
        v_source := 'snapshot';
        v_snap_id := v_snapshot.id;
      else
        v_cells := (public.aggregate_results(v_survey, v_group, v_rounds[1]))->'questions';
      end if;
    end if;

    v_out := v_out || jsonb_build_object(
      'key', v_section,
      'source', v_source,
      'snapshot_id', v_snap_id,
      'scope', jsonb_build_object('group', v_group, 'rounds', to_jsonb(v_rounds)),
      'rows', v_rows,
      'cells', v_cells);
  end loop;

  -- -------------------------------------------------------------------------
  -- 3. Cross-section pass: a total that isolates a hidden group is not a total
  -- -------------------------------------------------------------------------
  -- Each section is now individually safe. The document is not, if a scalar
  -- section publishes an n that the partition's visible rows nearly account
  -- for. Rather than guess which cell an attacker would subtract from, the
  -- rule is stated once: when any group is suppressed, the scalar n is
  -- withheld wherever the residual would fall below k.
  select jsonb_agg(distinct e->'group_id')
    into v_hidden
    from jsonb_array_elements(v_out) s,
         jsonb_array_elements(app.jsonb_array(s->'rows')) e
   where (e->>'suppressed')::boolean;

  if v_hidden is not null and jsonb_array_length(v_hidden) > 0 then
    declare
      v_visible_n bigint := 0;
    begin
      -- Per GROUP, not per row: a document with both a `teams` and a `heatmap`
      -- section lists the same group twice, and summing rows would double the
      -- visible total, making the residual look negative and the check pass
      -- when it should not.
      select coalesce(sum(n), 0) into v_visible_n
        from (
          select distinct on (e->>'group_id') (e->>'n')::bigint as n
            from jsonb_array_elements(v_out) s,
                 jsonb_array_elements(app.jsonb_array(s->'rows')) e
           where not (e->>'suppressed')::boolean
        ) d;

      select jsonb_agg(
               case
                 when jsonb_typeof(s->'cells') <> 'array' then s
                 else jsonb_set(s, '{cells}', (
                   select coalesce(jsonb_agg(
                            case when c->>'n' is not null
                                  and (c->>'n')::bigint - v_visible_n > 0
                                  and (c->>'n')::bigint - v_visible_n < v_k
                                 then c - 'n' - 'avg' - 'distribution'
                                      || jsonb_build_object('n', null, 'avg', null,
                                                            'insufficient_data', true)
                                 else c end), '[]'::jsonb)
                     from jsonb_array_elements(s->'cells') c))
               end
               order by ord)
        into v_out
        from jsonb_array_elements(v_out) with ordinality as t(s, ord);
    end;
  end if;

  return jsonb_build_object(
    'report_id', v_rep.id,
    'title', v_rep.title,
    'k', v_k,
    'role', v_role,
    'via', case when v_share.id is not null then 'share' else 'member' end,
    'scope', jsonb_build_object('surveys', to_jsonb(v_surveys),
                                'rounds', to_jsonb(v_rounds),
                                'group', v_group),
    'sections', coalesce(v_out, '[]'::jsonb),
    'suppressed_groups', coalesce(v_hidden, '[]'::jsonb));
end $$;

-- anon must be able to call it: a share link has no session. Authorisation is
-- inside the function (token or membership), which is the whole reason it is
-- SECURITY DEFINER rather than a view.
grant execute on function public.compose_report(uuid, text) to anon, authenticated;

comment on function public.compose_report(uuid, text) is
  'The only read path for a composed report. Resolves the reader (member or '
  'share token) at render time, refuses a snapshot whose scope does not match '
  'the section, and applies complementary suppression so a partition never '
  'leaves exactly one group recoverable by subtraction.';
