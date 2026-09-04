-- HeiTuva 0034 — closing a round freezes its numbers.
--
-- Phase 4 scope item 2 asked for this and it was never wired: `close_round`
-- flipped the status, killed the share links and cleared the previous token
-- hashes, and wrote no `result_snapshots` row. The consequence is the exact
-- failure the scope names — the retention job deletes answers on schedule, and
-- a trend line loses its earlier points because nothing ever wrote them down.
--
-- A snapshot is taken of the round as a whole (no group filter): the per-group
-- freeze belongs to a report, which knows which group it is about. If the
-- round has too little data to aggregate, `aggregate_results` says so and the
-- close still succeeds — a round that cannot be summarised is still a round
-- that closed, and failing the close would leave it open for ever.
create or replace function public.close_round(p_round uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_survey uuid;
  v_status text;
  v_snap   jsonb;
begin
  select survey_id, status into v_survey, v_status
    from public.survey_rounds where id = p_round;
  if v_survey is null then return jsonb_build_object('error','not_found'); end if;
  if not app.can_edit_survey(v_survey) then return jsonb_build_object('error','forbidden'); end if;

  update public.survey_rounds set status = 'closed' where id = p_round;
  update public.share_links set active = false where round_id = p_round;
  update public.survey_invitations
     set previous_token_hash = null, previous_token_expires_at = null
   where round_id = p_round;

  -- Only on the transition. Closing an already-closed round is idempotent
  -- everywhere else in this function and must not append another snapshot.
  if v_status is distinct from 'closed' then
    v_snap := public.snapshot_results(v_survey, p_round, null);
  end if;

  return jsonb_build_object('ok', true,
                            'snapshot_id', case when v_snap ? 'snapshot_id'
                                                then v_snap->'snapshot_id' end,
                            'snapshot_error', v_snap->'error');
end $function$;

comment on function public.close_round(uuid) is
  'Closes a round, deactivates its links, clears rotated token hashes, and '
  'freezes the round''s aggregates into result_snapshots so trends survive the '
  'retention deletion of the answers behind them.';
