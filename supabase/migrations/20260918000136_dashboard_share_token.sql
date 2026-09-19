-- M:0136 — F6: the external share link, copying the report share's shape.
--
-- THIS CREATES A SECURITY SURFACE THAT DID NOT EXIST. T5.2 measured that no
-- dashboard RPC was reachable by `anon`; two below are. The inventory of what
-- they can expose is in docs/fidelity/f6-external-share-inventory.md and was
-- written before this file.
--
-- ── THE SHAPE, WHICH IS report_for_share_token's EXACTLY ───────────────────
--
--   1. `dashboard_for_share_token(p_token)` resolves a token to an id and
--      RETURNS NO DATA. It cannot leak a figure because it returns a uuid.
--   2. `shared_dashboard(p_dashboard, p_token)` re-validates the token and
--      serves the figures, every one of them through `app.k_for`.
--
-- The token is the second ARGUMENT to the serving function, not a session
-- property, exactly as `compose_report(p_report, p_token)` takes it — so the
-- function cannot be called with a dashboard id alone by anybody who has
-- guessed one.
--
-- ── WHAT IS SERVED, AND THE ONE NARROWING I AM REPORTING ───────────────────
--
-- DRIVERS ONLY: the three highest and three lowest question means, org-wide,
-- with no group label and no name. That is narrower than every role v8 draws
-- (F6.4: v8 draws NO anonymous reader at all — its `dashShareLink` is
-- `slug(title)` with no token, sitting inside the role panel).
--
-- `trend` was in the proposal and is NOT served, and the reason is structural
-- rather than a scope cut: `get_trends` carries its authority check inline
-- (`app.can_view_survey`), and it has no authority-free body in `app.` the way
-- `aggregate_results` has `app.aggregate_rows`. Serving it here would mean
-- either duplicating the gate — a second copy of the boundary, which is the
-- defect this project has recorded four times — or refactoring a working
-- security function mid-phase. Extracting `app.trend_points` so both callers
-- share one body is the right move and it is a change to a gate, so it is
-- raised rather than taken here.
--
-- EXCLUDED BY DECISION, each for its own reason:
--   heatmap         team labels are the organisation's structure
--   duties          `duties.owner` is `org_members.name` — a member of staff
--   per_virksomhet  names third-party organisations
--   themes          respondent free text, even grouped
--   participation   ungated BY A DECISION MADE FOR MEMBERS (M:0003), which is
--                   not a decision made for the public
--
-- The allowlist is stated HERE and is NOT derived from
-- `report_section_types.names_individuals`. That flag means «a name next to an
-- ANSWER» and is read by `app.redact_for_role` for redaction INSIDE the
-- organisation; `duties` is correctly false by its own definition, so deriving
-- the allowlist from it would admit a panel that prints an employee's name.

-- Revocation. A deleted row loses the record of who shared what and when, so a
-- share is revoked by stamping it: the audit trail survives and the token stops
-- resolving in the same statement.
alter table public.dashboard_shares add column revoked_at timestamptz;

comment on column public.dashboard_shares.revoked_at is
  'Set by revokeDashboardShare. Read by dashboard_for_share_token and '
  'shared_dashboard, both of which refuse a stamped row. Revoking keeps the '
  'row so who-shared-what-when survives the revocation.';

-- ── 1. THE TOKEN RPC. Resolves, and returns NO DATA. ───────────────────────
create or replace function public.dashboard_for_share_token(p_token text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.dashboard_id
  from public.dashboard_shares s
  join public.dashboards d on d.id = s.dashboard_id
  where s.scope = 'link'
    and s.token_hash = app.hash_token(p_token)
    and s.revoked_at is null
$$;

comment on function public.dashboard_for_share_token(text) is
  'Resolves a share token to a dashboard id and returns NOTHING ELSE. Mirrors '
  'report_for_share_token: a token RPC that can leak no figure because it '
  'returns a uuid.';

-- ── 2. THE SERVING RPC. Anon-reachable, and every row gated. ───────────────
create or replace function public.shared_dashboard(p_dashboard uuid, p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $fn$
declare
  v_share public.dashboard_shares;
  v_org uuid;
  v_surveys uuid[];
  v_strictest int := 0;
  v_drivers jsonb := '[]'::jsonb;
  v_s uuid;
  v_rows jsonb;
begin
  -- The token is re-validated HERE and not trusted from step 1, because step 1
  -- is a separate call and nothing binds the two together.
  select s.* into v_share
    from public.dashboard_shares s
   where s.dashboard_id = p_dashboard
     and s.scope = 'link'
     and s.token_hash = app.hash_token(p_token)
     and s.revoked_at is null;
  if v_share.id is null then
    return jsonb_build_object('error', 'forbidden');
  end if;

  select d.org_id into v_org from public.dashboards d where d.id = p_dashboard;
  if v_org is null then
    return jsonb_build_object('error', 'forbidden');
  end if;

  -- The panels' SOURCES: the surveys the dashboard's layout selects, or every
  -- person survey in the organisation when it selects none. Organisation
  -- surveys are excluded — `app.k_for` returns 0 for them by design, and a 0
  -- in the strictest calculation would read as «no threshold» for a board that
  -- also carries person surveys.
  select coalesce(
           nullif(array(select jsonb_array_elements_text(l.filters->'survey_ids')::uuid), '{}'),
           array(select s2.id from public.surveys s2
                  where s2.org_id = v_org and s2.deleted_at is null
                    and s2.respondent_kind = 'person'))
    into v_surveys
    from public.dashboard_layouts l
   where l.dashboard_id = p_dashboard
   limit 1;

  -- F6.2 — THE STRICTEST OVER THE SOURCES, not the org default and not the
  -- selection's own number. An outsider cannot see WHICH sources exist, so a
  -- per-source figure would be unreadable and the loosest would be a promise
  -- the weakest source does not keep. The strictest is the only honest one.
  select coalesce(max(app.k_for(s2.id)), 0) into v_strictest
    from public.surveys s2
   where s2.id = any(v_surveys) and s2.respondent_kind = 'person';

  -- DRIVERS, through `app.aggregate_rows` — the same authority-free body
  -- `aggregate_results` uses, so the gate is ONE implementation with two
  -- callers rather than a copy. A question below its survey's threshold is not
  -- in that payload at all, so there is nothing here to filter out.
  foreach v_s in array v_surveys loop
    v_rows := app.aggregate_rows(v_s);
    v_drivers := v_drivers || (
      select coalesce(jsonb_agg(jsonb_build_object('text', q->>'text', 'avg', (q->>'avg')::numeric)), '[]'::jsonb)
      from jsonb_array_elements(v_rows->'questions') q
      where coalesce((q->>'insufficient_data')::boolean, false) = false
        and q->>'avg' is not null
    );
  end loop;

  return jsonb_build_object(
    'dashboard_id', p_dashboard,
    'k', v_strictest,
    -- Highest and lowest three, over everything that survived the gate.
    'drivers', (select coalesce(jsonb_agg(d order by (d->>'avg')::numeric desc), '[]'::jsonb)
                  from jsonb_array_elements(v_drivers) d)
  );
end $fn$;

comment on function public.shared_dashboard(uuid, text) is
  'The externally shared dashboard. Serves DRIVERS ONLY — question means with '
  'no group label and no name — through app.aggregate_rows, so every cell is '
  'already k-gated. Reports the STRICTEST threshold over the panels sources. '
  'Returns forbidden for a missing, revoked or mismatched token.';

-- anon reaches exactly these two and nothing else new.
revoke all on function public.dashboard_for_share_token(text) from public;
revoke all on function public.shared_dashboard(uuid, text) from public;
grant execute on function public.dashboard_for_share_token(text) to anon, authenticated;
grant execute on function public.shared_dashboard(uuid, text) to anon, authenticated;
