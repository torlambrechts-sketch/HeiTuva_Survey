-- DEACTIVATION MUST STOP A RECURRING SURVEY.
--
-- A live defect, not groundwork. `setMemberStatus` has written
-- `org_members.status = 'inactive'` since Phase 1 and the screen has offered it
-- that long. `public.send_round` honours it — its group loop selects
-- `m.status = 'active'`. `app.run_due_schedules` did not.
--
-- The scheduler builds round N+1 by copying round N's invitation rows verbatim
-- and consulted only `app.is_suppressed`. So an administrator deactivated
-- someone who had left the company, the next group-targeted send correctly
-- skipped them, and the weekly survey they were already on kept arriving —
-- every round, indefinitely, from a path no screen leads to. The person who
-- left keeps being asked about a workplace they no longer work at, and the
-- administrator who did the right thing has no way to see that it did not take.
--
-- THIRD TIME THIS FUNCTION HAS BEEN THE PATH NOBODY COUNTED. V2-3b found it for
-- suppression and wrote «THIS IS THE PATH THE PLAN DID NOT COUNT» into the body
-- it was fixing; Q98 found it for blind-spot tasks; this is deactivation. The
-- shape is always the same: every OTHER writer of invitations reasons about a
-- person, and this one reasons about last round's rows.
--
-- ── WHY THE GUARD KEYS ON EMAIL AND NOT ON `member_id` ──────────────────────
--
-- `member_id` is the obvious column and it is the wrong one, for two reasons
-- that are both facts about the schema rather than opinions:
--
--   1. `survey_invitations.member_id` is `on delete set null`. Removing a
--      member would silently un-protect the very person who left — the guard
--      would stop working at the moment it matters most.
--   2. Only ONE of `send_round`'s loops sets it. Its own comment says so: «this
--      is the only loop that KNOWS the member». An invitation created from an
--      imported named address carries NULL even when that address belongs to a
--      member, so a keyed-on-member_id guard would protect people invited via a
--      group and not people invited by name.
--
-- Keying on `member_id` keys on the loop that happened to populate it. Keying on
-- `(org_id, email)` — which is UNIQUE on `org_members` — keys on the PERSON.
-- That is the same correction CLAUDE.md's table records a dozen times, and the
-- reason it is written out here is that `member_id` will look like the obvious
-- simplification to whoever reads this next.
--
-- ── WHAT IT DELIBERATELY DOES NOT DO ───────────────────────────────────────
--
-- An address with NO `org_members` row is untouched. External respondents —
-- customers, suppliers, members of the public — have no membership and must
-- keep receiving what they were invited to. Reading the rule as «anyone we
-- cannot vouch for» would silently empty every customer survey, which is the
-- opposite failure and a worse one.
--
-- Patched with an ASSERTED anchor rather than rewritten (D115): `M:0070`
-- patched `send_round` at five occurrences of an anchor nobody counted and a
-- catch-all hid every one. If the body has moved, this raises instead of
-- guessing.
do $$
declare
  v_src text;
  v_anchor text := 'continue when v_inv.email is not null' || E'\n' ||
                   '                and app.is_suppressed(v_s.org_id, lower(trim(v_inv.email)));';
  v_hits int;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'app' and p.proname = 'run_due_schedules';

  if v_src is null then
    raise exception 'app.run_due_schedules not found — the catalogue and this migration disagree';
  end if;

  v_hits := (length(v_src) - length(replace(v_src, v_anchor, ''))) / length(v_anchor);
  if v_hits <> 1 then
    raise exception 'run_due_schedules: expected exactly one suppression guard, found %', v_hits
      using hint = 'The body moved. Read it and rewrite this migration against what is there '
                   'now — do NOT loosen the anchor (D115).';
  end if;

  execute replace(v_src, v_anchor, v_anchor || E'\n\n' ||
    '      -- DEACTIVATION. Keyed on the PERSON, not on `member_id`: that column is' || E'\n' ||
    '      -- `on delete set null` and only the group loop ever sets it, so it would' || E'\n' ||
    '      -- protect some invitations and not others. `(org_id, email)` is unique.' || E'\n' ||
    '      -- An address with no membership at all is left alone — an external' || E'\n' ||
    '      -- respondent is not ours to deactivate.' || E'\n' ||
    '      continue when v_inv.email is not null and exists (' || E'\n' ||
    '        select 1 from public.org_members om' || E'\n' ||
    '         where om.org_id = v_s.org_id' || E'\n' ||
    '           and lower(om.email) = lower(trim(v_inv.email))' || E'\n' ||
    '           and om.status <> ''active'');');
end $$;

comment on function app.run_due_schedules() is
  'The recurring-round sweep. It copies the previous round''s invitations, so '
  'every rule about WHO may be invited has to be restated here or it does not '
  'apply to round two: suppression (V2-3b) and member deactivation (M:0107) '
  'both are. A fourth such rule must be added here too, and '
  'tests/db/deactivation.test.ts asserts the derivation over every insertion '
  'point so a fifth insertion point fails in the commit that adds it.';
