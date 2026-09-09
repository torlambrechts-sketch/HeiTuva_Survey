-- V2-10 — **THE LEADERBOARD IS A GATED AGGREGATE, NOT A SCOREBOARD.**
--
-- This is the phase's own security decision and it is not in any question, so
-- the reasoning is written here rather than assumed.
--
-- ══ WHY A TEAM SCORE IS GATED AT ALL ═══════════════════════════════════════
--
-- The instinct is that a quiz on a NAMED survey has nothing to protect: people
-- put their names to their answers, the leaderboard shows teams, and a team
-- name is not a person. **That instinct is wrong, and the rule that says so is
-- already written down in this repository.**
--
-- `tests/invariants/threshold-policy.test.ts` states Q28's line: *«A count of
-- PEOPLE is participation and is not gated … Anything derived from what those
-- people SAID is gated: averages, distributions, themes, quotes, per-group
-- breakdowns. The line is the subject of the number, not its size.»*
--
-- **A team score is a per-group breakdown of what people said.** It is derived
-- from which options they chose, which is the most literal possible reading of
-- «what they said». And the small-group case is not hypothetical arithmetic: a
-- team of two scoring 200 out of 200 tells the room that both of them got
-- everything right, and one scoring 0 tells it the other thing. **A leaderboard
-- is a per-group breakdown wearing a game's clothes**, and it must go through
-- the same gate as every other one.
--
-- So `app.k_for` gates it, exactly as `aggregate_results` and `get_quotes` are
-- gated, and `tests/invariants/threshold-policy.test.ts:441-462` would have
-- failed this function if it had not — the two-sided sweep V2-9 confirmed still
-- covers every new vault reader by construction.
--
-- ══ AND IT RETURNS NO INDIVIDUAL ROW, TO ANYBODY ═══════════════════════════
--
-- `03-plan.md`'s test 6 asks that the leaderboard «returns TEAM aggregates only
-- and refuses individual rows even to an administrator through that RPC». That
-- is not a permission check, it is a SHAPE: this function has no parameter that
-- could name a person and no branch that could return one. An administrator who
-- wants one person's answers has the ordinary named-survey paths for that; what
-- must not exist is a *ranking* of colleagues, which is a different artefact
-- with a different social effect.
create or replace function public.quiz_leaderboard(p_survey uuid, p_round uuid default null)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare
  v_org uuid;
  v_k   int := app.k_for(p_survey);
  v_mode text;
  v_board boolean;
begin
  select s.org_id, s.run_mode, s.quiz_team_board into v_org, v_mode, v_board
    from public.surveys s where s.id = p_survey;
  if v_org is null or not app.is_org_member(v_org) then
    return jsonb_build_object('error', 'forbidden');
  end if;
  if v_mode is distinct from 'quiz' then
    return jsonb_build_object('error', 'not_a_quiz');
  end if;
  if not v_board then
    -- The toggle is off. Said by name rather than by an empty board, which
    -- would read as «nobody scored».
    return jsonb_build_object('error', 'board_disabled');
  end if;

  return (
    select jsonb_build_object('k', v_k, 'teams',
      coalesce(jsonb_agg(jsonb_build_object('team', t.label, 'score', t.score)
                         order by t.score desc, t.label), '[]'::jsonb))
      from (
        select g.name as label,
               -- The score, DERIVED. Points for a correct option, plus the time
               -- bonus when the survey carries it: up to half the question's
               -- points, falling to zero at 20 seconds — the bundle's own timer
               -- (V2:6523, «20 sek · tidsbonus»). An unanswered or untimed
               -- answer earns the base points only, never a negative.
               sum(
                 q.points
                 + case when s.quiz_time_bonus and a.elapsed_ms is not null
                        then (q.points / 2) * greatest(0, 20000 - a.elapsed_ms) / 20000
                        else 0 end
               )::int as score,
               count(distinct r.id) as people
          from public.responses r
          join public.survey_rounds sr on sr.id = r.round_id
          join public.surveys s on s.id = sr.survey_id
          join public.answers a on a.response_id = r.id
          join public.survey_questions q on q.id = a.question_id
          join public.groups g on g.id = r.respondent_group_id
         where sr.survey_id = p_survey
           and (p_round is null or r.round_id = p_round)
           and q.answer_index is not null
           -- Correct: the chosen option's INDEX matches the key. The answer
           -- stores the option's text, so the index is resolved against the
           -- question's own option list rather than trusted from the client.
           and a.value #>> '{}' = (q.config -> 'options' ->> q.answer_index)
         group by g.id, g.name
        -- THE GATE. A team below k is not shown at all — not shown as zero, not
        -- shown as «for få svar» with a rank. It is absent from the board,
        -- because a rank IS a number about the team.
        having count(distinct r.id) >= v_k
      ) t);
end $$;

revoke all on function public.quiz_leaderboard(uuid, uuid) from public;
revoke execute on function public.quiz_leaderboard(uuid, uuid) from anon;
grant execute on function public.quiz_leaderboard(uuid, uuid) to authenticated;

comment on function public.quiz_leaderboard(uuid, uuid) is
  'V2-10, Q84. TEAM aggregates only, k-gated: a team score is a per-group '
  'breakdown of what people said (Q28), and a team of two scoring full marks '
  'discloses both of them. No parameter names a person and no branch returns '
  'one. Scores are DERIVED — there is no quiz_attempts table.';
