-- V2-10 — Quiz. **Q84 ANSWERED BY TOR 2026-09-09: quiz NARROWED.**
--
--   > no quizPass, no quizTries, no certificate, points and time bonus and the
--   > team leaderboard only.
--
-- Q83 and Q85 taken defaulted-safe on my own classification, per the same
-- instruction. `docs/v2/reports/V2-10.md` names all three.
--
-- ══ READ THE DRAWING FIRST, AND IT NARROWED THE PHASE FURTHER ══════════════
--
-- Two measurements decided most of what follows, and both are in the bundle
-- rather than in the plan:
--
-- **1. `DEFAULT_QUIZ = { timeBonus:true, team:true, instant:false,
-- certificate:false }` (V2:4339).** Tor's narrowing keeps exactly the two the
-- bundle itself defaults ON. So `instant` and `certificate` are not features
-- being cut — they are features the design ships off, and they render
-- absence-visible like `helpForum` (Q74) and V2-9's `fullscreen`.
--
-- **2. `quizzable` is `choice | yesno | dropdown` (V2:6510)** — three of the
-- thirteen question types can carry a correct answer. A scale has no right
-- answer and a free text cannot be marked. That is a real constraint and it is
-- enforced HERE rather than in the Builder, because a rule enforced only by a
-- disabled control is not enforced (Q67, Q85).
--
-- ══ THERE IS NO `quiz_attempts` TABLE, AND THAT IS THE PHASE'S MAIN DECISION ═
--
-- `03-plan.md` proposes `quiz_attempts(survey_id, member_id, attempt_no, score,
-- passed, taken_at)`. **Q84 removes `passed` and `attempt_no`, and derivation
-- removes the rest.**
--
-- A quiz runs on a NAMED survey — the design says so (`quizAnon` blocks the
-- settings, V2:6157) and Q85 makes the database say it. On a named survey the
-- responses are already attributed, and the answer key is on the question. **So
-- a score is a FUNCTION of rows this database already holds**, and storing it
-- would be storing a derived fact beside its source — the thing **Q61**
-- (CONFIRMED: «derive, do not duplicate») refused for member status, for the
-- reason that a second column disagrees with its source the first time one of
-- them is written alone.
--
-- **And it is the stronger privacy answer, which is why it is worth stating as
-- more than a normalisation preference: THERE IS NO PER-PERSON SCORE TABLE TO
-- LEAK.** The plan's own test 2 was «assert no join exists from `quiz_attempts`
-- to `responses`». The join cannot exist because the table does not.
--
-- What derivation does NOT give is elapsed time, and Tor kept the time bonus.
-- So one column, on the row that needs it, holding the only fact that is not
-- already there.

-- ── The answer key, on the question, as the drawing writes it ──────────────
alter table public.survey_questions
  add column answer_index int,
  add column points int not null default 100 check (points between 0 and 1000);

comment on column public.survey_questions.answer_index is
  'V2-10: the index of the correct option, for quiz mode. NULL means «no key», '
  'which is every question on a non-quiz survey and any unkeyed question on one. '
  'The bundle defaults it to 0 for display (V2:6507, «Riktig svar: første '
  'alternativ»); the COLUMN does not, because a default of 0 would silently '
  'mark the first option correct on every question ever written — a fabricated '
  'answer key, which is worse than an absent one.';

-- Only the three types that can carry a key may carry one (V2:6510).
alter table public.survey_questions add constraint survey_questions_answer_index_typed
  check (answer_index is null or type in ('choice','yesno','dropdown'));

-- ── The one fact derivation cannot supply ──────────────────────────────────
alter table public.answers
  add column elapsed_ms int check (elapsed_ms is null or elapsed_ms between 0 and 3600000);

comment on column public.answers.elapsed_ms is
  'V2-10, Q84: how long this answer took, for the quiz time bonus — the ONE '
  'quiz fact not derivable from rows already held. NULL everywhere else. It is '
  'never written on an anonymous survey: quiz requires named answers '
  '(app.guard_survey_policy), so this cannot become a timing channel on an '
  'anonymous response.';

-- ── Q85 — two UI-only refusals become database refusals ────────────────────
--
-- DEFAULTED-SAFE, and identical in shape to **Q67**, already confirmed: a rule
-- enforced only by a disabled control is not enforced. Measured, both are
-- client-side early returns in the bundle — `if (quizAnon) return;` (V2:6157)
-- and a `modeNote` on statutory packs (V2:6122).
create or replace function app.guard_quiz_policy()
returns trigger language plpgsql as $$
begin
  if new.run_mode <> 'quiz' then
    return new;
  end if;

  -- (1) Quiz requires named answers. «Quiz krever navngitte svar for å kunne gi
  -- poeng» (V2:6163) is the bundle's own sentence and it is TRUE: a score is a
  -- fact about a person, and attributing one to an anonymous response would
  -- either break the anonymity or attribute it to nobody.
  if new.anonymity is distinct from 'named' then
    raise exception 'quiz_requires_named'
      using hint = 'A quiz awards points to a person, so it runs only on a survey '
                   'with named answers. Change the answer mode under Levering first.',
            errcode = 'check_violation';
  end if;

  -- (2) Never on a statutory pack. A psychosocial working-environment survey
  -- with a pass mark and a leaderboard is a category error about what the
  -- survey is FOR, and aml. § 4-3 does not have right answers.
  if exists (select 1 from public.template_packs tp
              where tp.org_id is null and tp.key = new.template_pack_key
                and coalesce((tp.policy->>'locked')::boolean, false)) then
    raise exception 'quiz_not_on_statutory_pack'
      using hint = 'This survey is governed by a statutory template pack. A duty '
                   'under the law does not have correct answers.',
            errcode = 'check_violation';
  end if;

  return new;
end $$;

create trigger surveys_quiz_policy
  before insert or update of run_mode, anonymity, template_pack_key on public.surveys
  for each row execute function app.guard_quiz_policy();

-- The mode itself. `M:0083` admitted `standard` and `live` and said V2-10 would
-- widen the CHECK in the migration that builds the thing. This is it.
alter table public.surveys drop constraint surveys_run_mode_check;
alter table public.surveys add constraint surveys_run_mode_check
  check (run_mode in ('standard','live','quiz'));

-- `app.guard_run_mode_anonymous` (M:0083) refuses `live` on a non-anonymous
-- survey; `app.guard_quiz_policy` refuses `quiz` on a non-NAMED one. The two
-- rules point in opposite directions and neither is a special case of the
-- other, so they are two triggers rather than one with a branch.

-- ── Quiz settings: the two toggles Q84 kept ────────────────────────────────
alter table public.surveys
  add column quiz_time_bonus boolean not null default true,
  add column quiz_team_board boolean not null default true;

comment on column public.surveys.quiz_time_bonus is
  'V2-10, Q84. `DEFAULT_QUIZ.timeBonus` is true in the bundle (V2:4339) and the '
  'default matches it. `instant` and `certificate` are NOT columns: the bundle '
  'ships both off and Q84 does not build them, so a column would be a setting '
  'nothing reads.';
