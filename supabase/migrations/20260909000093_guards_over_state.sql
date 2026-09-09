-- S3 item 4 — «a guard on one transition is not a guard on the state», the six
-- instances the audit found, written as rules about the state.
--
-- CLAUDE.md already names this shape and gives V2-9's example
-- (`guard_run_mode_anonymous` guarded «switch this survey to live» and was
-- blind to «make this live survey named»). The audit found it six more times,
-- in three places:
--
--   B1-02          guard_invitation_not_suppressed is BEFORE INSERT only
--   B7a-03/B7b-03  the org floor and the administrator-only rule are BEFORE
--                  UPDATE only, so INSERT escapes both
--   B3c-3          guard_survey_policy role-checks k_threshold ONLY, so
--                  anonymity can be changed by a redaktør, unaudited
--   A6-4           «a live session may only exist on an anonymous survey» is
--                  guarded on two transitions and on NEITHER STATE
--
-- ═══ 1. B1-02 — the suppression guard ═════════════════════════════════════
--
-- `app.is_suppressed` is the Reservasjonsliste (GDPR art. 21). The guard
-- refused an INSERT that named a suppressed address and said nothing about an
-- UPDATE, so `update survey_invitations set email = <suppressed>` reached
-- exactly the state the guard exists to prevent. The rule was never «you may
-- not insert this row»; it is «no invitation may name a suppressed address»,
-- which is a fact about the row and therefore about both statements.
--
-- The function itself does not change — it already reads `new` and nothing
-- else, so it is correct for an UPDATE as written. Only the trigger's event
-- list was wrong, which is the whole point of the shape: the rule was right and
-- the place it ran was too narrow.
drop trigger if exists guard_invitation_not_suppressed on public.survey_invitations;
create trigger guard_invitation_not_suppressed
  before insert or update on public.survey_invitations
  for each row execute function app.guard_invitation_not_suppressed();

-- ═══ 2, 3 and 4 — the survey policy guard ═════════════════════════════════
--
-- Three findings in one function, and they are the same mistake three times:
-- the guard was written for the screen (an administrator editing a survey's
-- threshold) instead of for the rule.
--
-- 2. INSERT ESCAPED EVERYTHING (B7a-03 / B7b-03). The trigger was BEFORE UPDATE,
--    so a redaktør could POST a new survey below the organisation's floor
--    through PostgREST, and two admin sentences promise that cannot happen.
--
-- 3. THE ROLE CHECK AND THE AUDIT COVERED `k_threshold` ONLY (B3c-3). All three
--    policy columns are already in `v_policy_change`, which is what the lock
--    reads — so the function knew anonymity was a policy field, and then
--    checked nobody's role for it and wrote no audit row. A redaktør could turn
--    an anonymous survey into a named one, silently, on a panel the Builder
--    presents as administrator-only. That is a LARGER decision than the
--    threshold: it changes what the respondent was promised, not how coarsely
--    the answers are shown.
--
-- 4. THE LIVE-ANONYMITY RULE HAD NO STATE FORM (A6-4). `guard_run_mode_anonymous`
--    refuses `run_mode = 'live' and anonymity <> 'anonymous'`. One UPDATE that
--    sets `run_mode = 'standard'` AND `anonymity = 'named'` together satisfies
--    it — new.run_mode is no longer 'live' — and leaves an OPEN, REDEEMABLE
--    VOUCHER on a named survey. The device that scans it was promised anonymity
--    by the screen it scanned from. The rule that was meant is about the state:
--    A SURVEY MAY NOT BE NAMED WHILE A LIVE SESSION IS OPEN ON IT, however it
--    got there.
--
-- ── WHAT INSERT DOES AND DOES NOT INHERIT, DELIBERATELY ───────────────────
--
-- The floor applies on INSERT: creating a survey below the organisation's
-- minimum is the thing B7b-03 describes.
--
-- The administrator-only rule does NOT apply on INSERT. Creating surveys is
-- what a redaktør is FOR (CLAUDE.md role semantics: «redaktor (create/send)»),
-- and a new survey has no previous policy for anyone to change. Applying it
-- there would close the hole by closing the feature. Below-floor creation is
-- already refused by the floor rule, which is the case that actually matters.
--
-- The audit row is written only on a real change, so creation does not produce
-- a `threshold.change` from nothing.
create or replace function app.guard_survey_policy()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid uuid := (select auth.uid());
  v_ins boolean := tg_op = 'INSERT';
  v_k_changed boolean;
  v_anon_changed boolean;
  v_kind_changed boolean;
  v_policy_change boolean;
  v_redaktor_ok boolean;
  v_org_floor int;
begin
  if v_ins then
    -- OLD is unassigned on INSERT; referencing a field of it raises. So the
    -- «what changed» questions are answered without it, and the rules that
    -- need a previous value are the ones skipped below.
    v_k_changed := false;
    v_anon_changed := false;
    v_kind_changed := false;
    v_policy_change := false;
  else
    v_k_changed := new.k_threshold is distinct from old.k_threshold;
    v_anon_changed := new.anonymity is distinct from old.anonymity;
    v_kind_changed := new.respondent_kind is distinct from old.respondent_kind;
    v_policy_change := v_k_changed or v_anon_changed or v_kind_changed;

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
  end if;

  -- ── A6-4: the STATE rule ────────────────────────────────────────────────
  -- Not «you may not switch anonymity» and not «you may not leave live mode» —
  -- either of those is a transition, and the defect was an UPDATE that made
  -- both moves at once so that neither transition looked like the forbidden
  -- one. The forbidden thing is the STATE: named, with a live session open.
  --
  -- Checked on INSERT too. A survey cannot have a live session at the moment it
  -- is created, so this can only fire on UPDATE today — it is written for both
  -- because «cannot happen yet» is the reasoning that produced A5-1.
  -- The predicate is `status = 'open' and expires_at > now()` — NOT `status =
  -- 'open'` alone — because that is the window in which a voucher can actually
  -- be redeemed, and it is the same condition `redeem_live_voucher` and the
  -- Live page already use. `close_live_session` expires the session AND the
  -- tokens it minted, so once it is closed nothing outstanding can submit;
  -- blocking on a stale open-but-expired row would refuse a rename for a
  -- session that can harm nobody.
  if new.anonymity is distinct from 'anonymous'
     and exists (select 1 from public.live_sessions ls
                  where ls.survey_id = new.id
                    and ls.status = 'open' and ls.expires_at > now()) then
    raise exception 'live_session_open'
      using hint = 'This survey has an open live session. A live voucher is redeemed '
                   'by a device nobody can identify, so the survey cannot be named '
                   'while one is outstanding. Close the session first.',
            errcode = 'check_violation';
  end if;

  -- ── The organisation's floor (Q90), on BOTH statements ──────────────────
  if (v_ins or v_k_changed) and v_uid is not null then
    select coalesce((o.privacy->>'redaktor_may_lower')::boolean, false), o.default_k_threshold
      into v_redaktor_ok, v_org_floor
      from public.organizations o where o.id = new.org_id;

    -- Person surveys only — app.k_for returns 0 for organisation respondents,
    -- so a floor there would gate a path that is ungated by design. The flag is
    -- the organisation's own exception, so this binds an administrator too: a
    -- setting any single person can undercut is not a setting.
    if new.respondent_kind = 'person'
       and new.k_threshold < v_org_floor
       and not v_redaktor_ok then
      raise exception 'below_org_floor'
        using hint = 'The organisation''s default threshold is a floor. Turn on '
                     '«Tillat at redaktører senker terskelen» to allow a lower value.';
    end if;
  end if;

  -- ── Who may change a survey's POLICY, and the record that they did ──────
  -- B3c-3: this used to read `v_k_changed` alone. All three columns are policy
  -- — the lock has always said so — and anonymity is the one a respondent was
  -- promised. `redaktor_may_lower` is an exception about the THRESHOLD and is
  -- not read here for the other two: an organisation that lets editors choose a
  -- coarser number has not thereby let them un-promise anonymity.
  if not v_ins and v_uid is not null then
    if v_k_changed then
      select coalesce((o.privacy->>'redaktor_may_lower')::boolean, false)
        into v_redaktor_ok
        from public.organizations o where o.id = new.org_id;
      if not app.has_role(new.org_id, array['administrator']::app.member_role[])
         and not (v_redaktor_ok and app.has_role(new.org_id, array['redaktor']::app.member_role[])) then
        raise exception 'threshold_admin_only'
          using hint = 'Only an administrator may change the display threshold.';
      end if;
      insert into public.audit_events (org_id, actor_user_id, action, target, meta)
      values (new.org_id, v_uid, 'threshold.change', new.id::text,
              jsonb_build_object('from', old.k_threshold, 'to', new.k_threshold));
    end if;

    if v_anon_changed or v_kind_changed then
      if not app.has_role(new.org_id, array['administrator']::app.member_role[]) then
        raise exception 'policy_admin_only'
          using hint = 'Only an administrator may change who answers a survey or '
                       'whether their answers are anonymous.';
      end if;
      insert into public.audit_events (org_id, actor_user_id, action, target, meta)
      values (new.org_id, v_uid, 'policy.change', new.id::text,
              jsonb_build_object(
                'anonymity_from', old.anonymity, 'anonymity_to', new.anonymity,
                'kind_from', old.respondent_kind, 'kind_to', new.respondent_kind));
    end if;
  end if;

  return new;
end
$fn$;

comment on function app.guard_survey_policy() is
  'S3/item 4. Fires on INSERT and UPDATE: the floor applied only on UPDATE, so a '
  'redaktør could POST a survey below it (B7a-03/B7b-03). Role-checks and audits '
  'ALL THREE policy columns, not k_threshold alone (B3c-3) — anonymity is the one '
  'the respondent was promised. Carries the state form of the live-anonymity rule '
  '(A6-4): named + an open live session is refused however it is reached, because '
  'one UPDATE changing run_mode and anonymity together satisfied both transition '
  'guards and left a redeemable voucher on a named survey.';

drop trigger if exists surveys_guard_policy on public.surveys;
create trigger surveys_guard_policy
  before insert or update on public.surveys
  for each row execute function app.guard_survey_policy();
