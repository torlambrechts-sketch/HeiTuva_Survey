-- HeiTuva 0039 — D94: `surveys.target` gets a writer, and it is the ROUND's
-- recipient count.
--
-- The policy panel's first warning (v1 bundle :3528) compares the recipient
-- count with the threshold: "Gruppen har 4 mottakere. Med terskel 5 vil
-- resultatet aldri vises." The rule shipped in V1-1 implemented, tested and
-- permanently silent, because `surveys.target` was written once by the wizard
-- (`undersokelser/actions.ts:130-138`, from the chosen groups' membership) and
-- never again — and only when the wizard was the path taken. D94 is that gap.
--
-- WHICH NUMBER, decided explicitly (Tor, 2026-09-06): the LATEST round's
-- recipient count, not the first, not the largest and not the sum.
--
--   Threshold 5, round 1 sent to 40, round 2 to 4. Round 2's result will never
--   be shown. A survey-level number that stayed at 40 — whether because it was
--   the first or because it was the biggest — is silent in exactly the case the
--   rule exists for. A SUM (44) is worse: it is not a number anyone will ever
--   compare with a threshold, because the threshold is applied PER ROUND
--   (`aggregate_results(p_survey, p_group, p_round)`), so the count that has to
--   clear it is the round's.
--
-- WHY A TRIGGER rather than the Send action. Recipients reach a round by more
-- than one path — the import, the single-recipient control, the group
-- expansion, the seed and the test factories — and an action-level writer
-- covers the path it is written in and misses the others silently. That is the
-- shape of the bug being fixed here, not a different one: a number that is
-- right where it was written and stale everywhere it is read. Same argument as
-- Q36's ceiling: a rule about a column belongs to the column.
--
-- ROUNDS WITH NO RECIPIENTS DO NOT COUNT. The trigger fires on
-- `survey_invitations` only, and the recompute considers rounds that have at
-- least one invitation. So creating round 2 does not blank the number round 1
-- earned; `target` follows round 2 from its first recipient onward. A survey
-- with no invitations at all keeps whatever the wizard estimated, which is the
-- honest reading of "who this is aimed at" before anyone has been chosen.

create or replace function app.sync_survey_target()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Statement-level with transition tables: an import inserts its recipients in
  -- one statement, so this runs once per import rather than once per person.
  -- The set of affected surveys is derived from the rounds that changed.
  with touched as (
    select distinct sr.survey_id
      from public.survey_rounds sr
     where sr.id in (select round_id from changed)
  ),
  latest as (
    select t.survey_id,
           (select count(*)
              from public.survey_invitations i
             where i.round_id = (
               -- The most recent round that actually has recipients. `round_no`
               -- is unique per survey (M:0003) and is what "later round" means.
               select i2.round_id
                 from public.survey_invitations i2
                 join public.survey_rounds sr2 on sr2.id = i2.round_id
                where sr2.survey_id = t.survey_id
                order by sr2.round_no desc
                limit 1))::int as n
      from touched t
  )
  update public.surveys s
     set target = latest.n
    from latest
   where s.id = latest.survey_id
     -- A round emptied back to nothing leaves the previous number alone rather
     -- than writing 0: 0 means "nobody chosen yet" to `policyWarnings`, and a
     -- survey that has been sent is not back in that state.
     and latest.n > 0
     and s.target is distinct from latest.n;

  return null;
end $$;

comment on function app.sync_survey_target() is
  'D94: keeps surveys.target equal to the LATEST round''s recipient count, so '
  'the policy panel''s threshold warning fires on the count the threshold will '
  'actually be applied to.';

drop trigger if exists invitations_sync_target_ins on public.survey_invitations;
create trigger invitations_sync_target_ins
  after insert on public.survey_invitations
  referencing new table as changed
  for each statement execute function app.sync_survey_target();

drop trigger if exists invitations_sync_target_del on public.survey_invitations;
create trigger invitations_sync_target_del
  after delete on public.survey_invitations
  referencing old table as changed
  for each statement execute function app.sync_survey_target();

-- Backfill: every survey that already has recipients gets the number it should
-- have had all along. `surveys_guard_policy` does not object — `target` is not
-- one of the three columns it treats as a policy change (M:0034:80-82) — so no
-- trigger has to be disabled to do this, which is worth stating because the
-- last two backfills in this schema did.
update public.surveys s
   set target = c.n
  from (
    select sr.survey_id,
           (select count(*) from public.survey_invitations i where i.round_id = sr.id)::int as n
      from public.survey_rounds sr
     where sr.round_no = (
       select max(sr2.round_no)
         from public.survey_rounds sr2
         join public.survey_invitations i2 on i2.round_id = sr2.id
        where sr2.survey_id = sr.survey_id)
  ) c
 where s.id = c.survey_id and c.n > 0 and s.target is distinct from c.n;
