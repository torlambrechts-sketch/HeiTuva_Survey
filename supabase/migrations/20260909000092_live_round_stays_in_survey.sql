-- S3 item 3 — THE BLOCKER. Cross-tenant WRITE through `live_sessions.round_id`
-- (audit `A5-1`, reproduced end to end twice and rolled back).
--
-- ── WHAT WAS OPEN ─────────────────────────────────────────────────────────
--
-- An administrator or redaktør of ANY organisation could cause anonymous
-- respondents to write real responses and answers into ANOTHER organisation's
-- round:
--
--   1. org A admin inserts live_sessions(org_id=A, survey_id=A's own,
--      round_id = ORG B's round)                     -> accepted by `live_ins`
--   2. anon redeems the voucher                      -> token for ORG B's round
--   3. anon submits                                  -> a real response in ORG B
--
-- `live_sessions` has four foreign keys. Three were made composite; this one
-- was not:
--
--   live_sessions_created_by_fkey  (created_by, org_id) -> org_members  M:0084
--   live_sessions_survey_tenancy   (survey_id, org_id)  -> surveys      M:0079
--   live_sessions_round_id_fkey    (round_id)           -> survey_rounds  ← here
--
-- Nothing else constrained it. The only trigger checks the SURVEY's anonymity;
-- the CHECKs cover `code` and `status`; and `live_ins`'s WITH CHECK is
-- `has_role(org_id, …) and can_edit_survey(survey_id)` — `round_id` never
-- appears in it. Two independent paths were open: `authenticated` holds INSERT
-- on the table, and the product's own action takes `roundId` from the client
-- and validates it only as a UUID.
--
-- ── THE FIX IS THE COLUMN, NOT THE POLICY ─────────────────────────────────
--
-- CLAUDE.md: «Prefer the fix that is robust against the construct nobody has
-- thought of… Fix the column, not the predicate.» A WITH CHECK clause that
-- re-derived the round's owner would close the RLS path and leave the FK; the
-- composite key closes both, and closes the third path nobody has written yet.
--
-- The pair is `(round_id, survey_id)`, not `(round_id, org_id)`. `survey_rounds`
-- has no `org_id` — it is org-scoped TRANSITIVELY, through
-- `survey_id -> surveys.org_id` — which is exactly why the FK had nothing to
-- bind to and why `tests/db/fk-tenancy.test.ts` could not see it. Binding to
-- the survey is also the stronger statement, and the true one: a live session's
-- round must be a round OF THE SURVEY THAT SESSION IS RUNNING, which rules out
-- a foreign round in the same organisation as well as one in another.
--
-- `survey_rounds_id_survey_uniq` already exists — `M:0070` added it for
-- `tasks.(source_round_id, source_ref)`, which is the same shape solved for the
-- same reason. This migration reuses it rather than adding a second index.
--
-- ── THE CASCADE, DECIDED HERE RATHER THAN WHEN A DELETE FAILS ─────────────
--
-- `on delete cascade` is kept from the original key. CLAUDE.md's rule is that
-- an immutability or freeze rule must permit referential maintenance, and the
-- question to ask is which columns the database may change on our behalf. Here
-- the answer is neither: the cascade removes the whole row. A live session
-- whose round has been deleted is not a record worth keeping — it can no longer
-- be joined, redeemed or closed — and `round_id` is `not null`, so there is no
-- «null the reference» variant to choose. The V2-9 trap (a rule over a column a
-- cascade may withdraw) does not apply, because nothing survives the cascade to
-- be checked.

alter table public.live_sessions
  drop constraint if exists live_sessions_round_id_fkey;

alter table public.live_sessions
  add constraint live_sessions_round_id_fkey
  foreign key (round_id, survey_id) references public.survey_rounds(id, survey_id)
  on update cascade
  on delete cascade;

comment on constraint live_sessions_round_id_fkey on public.live_sessions is
  'S3/A5-1. Composite on purpose: a live session''s round must be a round of that '
  'session''s own survey. As a single-column key it was the one place in the schema '
  'where an unbound reference ROUTED A WRITE — an anonymous respondent''s response '
  'landed in whichever round the presenter named, including another '
  'organisation''s. survey_rounds has no org_id, so this binds to survey_id, which '
  'is both what is available and the stronger claim.';

-- ── THE SECOND TABLE WITH THE SAME SHAPE ──────────────────────────────────
--
-- Found by asking the catalogue rather than by reading the finding. SIX
-- single-column foreign keys point at `survey_rounds`, not one — but four of
-- them (`responses`, `share_links`, `survey_invitations`,
-- `task_effect_assessments`) carry NO tenancy columns of their own, so the
-- round IS their anchor and there is nothing for it to disagree with.
-- `share_links` is the clearest case: its policies are
-- `can_edit_survey(app.round_survey(round_id))`, which derives the survey FROM
-- the round, so a foreign round is refused by the only rule there is.
--
-- Exactly TWO tables carry both `round_id` and `survey_id` — `live_sessions`
-- and `result_snapshots` — and that pair is the shape: two columns that each
-- name a tenant, with nothing making them agree.
--
-- The audit judged `result_snapshots` not equivalent, and it was right about
-- the CONSEQUENCE: a foreign round there mislabels the writer's own row rather
-- than routing someone else's write. But that is a fact about what the column
-- is used for today, not about what the schema permits, and «not currently
-- exploitable» is the reasoning this project has already been bitten by. The
-- pair is bound here too, in the same migration, so the shape has no second
-- instance left.
--
-- `round_id` is nullable here — a snapshot can be survey-wide — and a composite
-- foreign key with the default MATCH SIMPLE is satisfied when any of its
-- columns is NULL, so the freeze that names no round is unaffected.
--
-- `on delete set null (round_id)` keeps the existing behaviour and NAMES the
-- column, which M:0065 is about: without the column list, deleting a round
-- would null `survey_id` too, and a snapshot of no survey is not a snapshot.

alter table public.result_snapshots
  drop constraint if exists result_snapshots_round_id_fkey;

alter table public.result_snapshots
  add constraint result_snapshots_round_id_fkey
  foreign key (round_id, survey_id) references public.survey_rounds(id, survey_id)
  on update cascade
  on delete set null (round_id);
