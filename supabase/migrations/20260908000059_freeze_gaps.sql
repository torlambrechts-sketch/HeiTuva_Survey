-- V2-3b · DECISIONS Q64's two named gaps, closed. Carried from V2-3a's report
-- §6, where they were listed as open and as the reason its DECISION CONFORMANCE
-- section earned its keep: both were green under every gate, because an absence
-- is what a gate cannot see.
--
-- Q64: «the two narrow gaps are: a nullable `member_id` on
-- `survey_invitations`, and a deliberate decision on the `ON DELETE SET NULL`
-- behaviour of the four columns referencing `groups`.»
--
-- ── GAP 2 FIRST, BECAUSE MEASURING IT FOUND A LIVE PRIVACY DEFECT ───────────
--
-- All four were `on delete set null` — the behaviour EXISTED and had never been
-- CHOSEN. Reading what each nulling actually does:
--
--   org_members.group_id          SET NULL is right and stays. A person
--                                 outlives a group; that is what a group is.
--
--   report_shares.group_id        **SET NULL WIDENS ACCESS.** See below. Now
--                                 CASCADE.
--
--   survey_invitations.group_id   The frozen snapshot Q64 is about. Nulling it
--                                 rewrites what a past round said. Now NO ACTION
--                                 DEFERRABLE INITIALLY DEFERRED — see below.
--
--   responses.respondent_group_id The breakdown unit the k-gate counts over,
--                                 frozen at submission (Q92). Nulling it moves
--                                 aggregates people have already read, silently
--                                 and after the fact. Same treatment.
--
-- **THE REPORT-SHARE DEFECT, because it is a real one and predates this phase.**
-- `compose_report` gates a share link like this (`M:0042`, and unchanged since
-- `M:0006` created the column):
--
--     v_group := coalesce((v_rep.filters->>'group')::uuid, v_share.group_id);
--     if v_rep.filters->>'group' is not null and v_share.group_id is not null
--        and v_share.group_id <> (v_rep.filters->>'group')::uuid then
--       return jsonb_build_object('error', 'forbidden');
--     end if;
--     if v_scope = 'ledere_eget_team' and v_group is null then … forbidden
--
-- The mismatch check requires `v_share.group_id is not null`. So: a
-- `ledere_eget_team` link scoped to group A, on a report filtered to group B, is
-- refused today. Delete group A — a routine administrative action, on an
-- unrelated screen — and `set null` disables the check that was refusing it;
-- `v_group` falls back to B, the scope test passes because B is not null, and
-- **the link now serves group B's data to group A's leader.** Nobody edited the
-- share, the report or the policy.
--
-- CASCADE rather than RESTRICT here: a share scoped to a group that no longer
-- exists has no meaning, and the safe resolution of «the thing this link was
-- for is gone» is that the link is gone — never that it comes to mean something
-- else. RESTRICT would instead refuse a group deletion because of a link
-- somebody forgot, which is the surprise-at-a-distance CLAUDE.md's
-- immutability-trigger note warns about.
--
-- The other two are the opposite trade and deliberately so: those rows ARE the
-- record. A group referenced by a sent round or by an answer is part of what the
-- product has already told people, and refusing the delete is the honest answer.
-- The refusal is surfaced by name in `administrasjon/actions.ts` — a delete that
-- fails with an unexplained error would be worse than either behaviour.
--
-- ── AND `RESTRICT` WAS THE WRONG WAY TO SAY IT. THIS IS CLAUDE.md's RULE ON
--    ITS FIFTH REDISCOVERY, IN FK FORM RATHER THAN TRIGGER FORM ──────────────
--
-- «An append-only or freeze trigger written as *reject any UPDATE or DELETE*
-- will collide with PostgreSQL's own FK maintenance … and the symptom is a
-- parent row that cannot be deleted, discovered far from the trigger.» Written
-- for triggers; it is the same rule for constraints, and RESTRICT walked
-- straight into it.
--
-- `RESTRICT` is checked IMMEDIATELY and cannot be deferred. So deleting an
-- ORGANISATION — which cascades to `groups`, `surveys`, `survey_rounds` and
-- `survey_invitations` alike — fails: at the instant the cascade reaches the
-- group, invitation rows still reference it, and Postgres refuses. It surfaced
-- as `dropOrg(Nordisk Studio)` failing in the demo seed, which is exactly the
-- «far from the trigger» the note warns about. **A rule meant to protect a past
-- round's record had made the organisation undeletable — which is not a
-- stronger freeze, it is a broken erasure path**, and erasure is a GDPR
-- obligation this product is sold on.
--
-- `NO ACTION DEFERRABLE INITIALLY DEFERRED` says the thing that was actually
-- meant. The check runs at COMMIT rather than at statement time, so:
--
--   delete one group that a round was sent to   → still refused, at commit
--   delete the organisation                     → allowed; by commit time the
--                                                 invitations are gone too
--
-- That is the distinction the freeze needs and RESTRICT could not express: it
-- is not that the group row is sacred, it is that no record may be left
-- pointing at a group that stopped existing under it.

-- Gap 2 ---------------------------------------------------------------------
alter table public.report_shares
  drop constraint if exists report_shares_group_id_fkey;
alter table public.report_shares
  add constraint report_shares_group_id_fkey
  foreign key (group_id) references public.groups(id) on delete cascade;

alter table public.survey_invitations
  drop constraint if exists survey_invitations_group_id_fkey;
alter table public.survey_invitations
  add constraint survey_invitations_group_id_fkey
  foreign key (group_id) references public.groups(id)
  on delete no action deferrable initially deferred;

alter table public.responses
  drop constraint if exists responses_respondent_group_id_fkey;
alter table public.responses
  add constraint responses_respondent_group_id_fkey
  foreign key (respondent_group_id) references public.groups(id)
  on delete no action deferrable initially deferred;

-- org_members.group_id is left as SET NULL. Named here so the next reader can
-- tell a decision from an omission — all four were reviewed, three changed.

-- Gap 1 ---------------------------------------------------------------------
-- Q64: «a nullable `member_id` on `survey_invitations`».
--
-- The snapshot holds an email, a name and a group. It does not hold WHO — so
-- once an address changes, «who was invited to round 3» is unanswerable, and
-- the round's own record cannot say whether two rows are one person twice or
-- two people. NULLABLE by necessity, not by convenience: named recipients and
-- CSV imports address people who are not members at all, and Q64's freeze means
-- the reference must not be re-resolved later.
--
-- `on delete set null` is right for THIS column, and it is the one place that
-- behaviour is correct without argument: deleting a member must not delete or
-- block a past round's record of having invited them. The row keeps the email
-- it was sent to, which is the frozen fact; the link to a live person is the
-- part that may go.
alter table public.survey_invitations
  add column if not exists member_id uuid
  references public.org_members(id) on delete set null;

comment on column public.survey_invitations.member_id is
  'Q64: WHO this invitation went to, frozen at send. NULL for named recipients '
  'and imports, who are not members. Never re-resolved from the email later — '
  'that would defeat the freeze this column exists to make legible.';

create index if not exists survey_invitations_member_idx
  on public.survey_invitations (member_id) where member_id is not null;
