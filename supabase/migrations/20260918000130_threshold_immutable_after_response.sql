-- T1's amended invariant 1, in the database: the threshold and the respondent
-- kind are immutable once a response exists, and the survey's creator sets the
-- threshold. The floor stays 2 (Q91) and is now enforced in app.k_for as well
-- as in the CHECK that already carried it.
--
-- ── WHAT ALREADY EXISTED, MEASURED BEFORE WRITING A LINE ───────────────────
--
-- The tranche was specified as if this were greenfield. It is not. Measured on
-- a clean local database at e34c447:
--
--   surveys.k_threshold      int not null default 5      ALREADY EXISTS
--   surveys.respondent_kind  text not null default 'person'  ALREADY EXISTS
--   surveys.policy_locked    boolean not null default false  ALREADY EXISTS
--   organizations.default_k_threshold int not null default 5 ALREADY EXISTS
--   CHECK respondent_kind in ('person','organisation')       ALREADY EXISTS
--   CHECK k_threshold <= 10                                  ALREADY EXISTS
--   template_packs.legal_ref + policy->>'locked'             ALREADY EXISTS
--   app.k_for(survey) — the per-survey read, called by ALL 16 result
--     functions; app.k_threshold() is a constant with ZERO callers
--   compose_report:64 — `max(app.k_for(sid))` over every source survey, in the
--     SECURITY DEFINER RPC. Strictest-wins was already built and already there.
--
-- So this migration is the DIFFERENCE, not the feature. Four things.
--
-- ── 1. THE FLOOR IS 2, AND IT ALREADY WAS ────────────────────────────────
--
-- An earlier draft of this migration moved the floor to 3 and raised five local
-- rows to match. That was wrong and is reverted here before anything ran
-- against production: Q91 built and SHIPPED the k=2 tier — its own migration
-- (M:0055 `threshold_floor_two`), fourteen message keys across both locales,
-- five test files — and it is the LATER decision. Q17's «gulv 3» is superseded.
--
-- So this migration changes no CHECK at all. `surveys_k_threshold_floor` is
-- already `k_threshold >= 2 or respondent_kind = 'organisation'`, and
-- `organizations_default_k_threshold_range` is already `between 2 and 10`.
-- Restating either here would be noise that reads like a change.
--
-- NOTHING IS RETIRED. No data is rewritten. Production was never touched, and
-- its distribution was read back to confirm it: six person surveys at 2.
--
-- ── 2. THE FLOOR IS APPLIED IN THE FUNCTION, NOT TRUSTED FROM THE COLUMN ───
--
-- `app.k_for` returned `s.k_threshold` verbatim. A CHECK and a function that
-- trusts it are one mechanism, not two: the CHECK can be dropped by a later
-- migration meaning well, and every result read would silently follow. The
-- function now takes `greatest(k_threshold, 2)` for a person.
--
-- THE 3 IN THIS SENTENCE WAS WRONG FOR THE LIFE OF THIS FILE. It was written
-- while the floor was 3 and T1.10 corrected the SQL below to 2 without
-- correcting the prose above it, so the migration that MOVES the floor to two
-- described itself as moving it to three. Corrected rather than left, and the
-- file is safe to edit because it is not in production's ledger — measured,
-- not assumed: prod carries 20260918142503 (Phase B, renumbered on push) and
-- neither this migration nor M:0131.
--
-- ── 3. IMMUTABILITY ONCE A RESPONSE EXISTS ────────────────────────────────
--
-- The existing guard covered two narrower cases: `policy_locked` (set when a
-- survey is sent) and a person->organisation reclassification. Neither is the
-- rule. A survey with responses that was never «sent» through send_round — a
-- share link, a QR voucher, a test round — could still have its threshold
-- lowered, and that is exactly the retrieval mechanism condition 2 names:
-- wait for answers, then lower, then read the cell that was suppressed.
--
-- ── 4. WHO MAY SET IT ──────────────────────────────────────────────────────
--
-- The amended invariant: «The person who creates the survey sets the threshold
-- on it; an administrator sets the organisation default. That is all — no
-- delegation switch, no enable step, no per-role gate beyond that.»
--
-- The shipped guard had `threshold_admin_only` and read
-- `organizations.privacy->>'redaktor_may_lower'`. Both are removed here. The
-- org floor (`below_org_floor`) STAYS: it is a floor, not a permission.
--
-- ── WHO WRITES / WHAT READS, for every column this touches ────────────────
--
--   surveys.k_threshold      WRITTEN by the builder's policy panel
--                            (app/(app)/undersokelser/[id]/bygg) and by
--                            app.apply_pack_policy when a pack carries one.
--                            READ by app.k_for, hence by all 16 result
--                            functions, and by get_survey_for_token for the
--                            respondent banner.
--   surveys.respondent_kind  WRITTEN by the same panel and the wizard.
--                            READ by app.k_for (0 for an organisation) and by
--                            surveys_organisation_named.
--   organizations.default_k_threshold
--                            WRITTEN by administrasjon/personvern.
--                            READ by this guard's below_org_floor check and by
--                            the builder's default for a new survey.
--   surveys.policy_locked    WRITTEN by send_round and apply_pack_policy.
--                            READ by this guard.

-- ── 1. the floor inside the function, as well as in the CHECK
create or replace function app.k_for(p_survey uuid)
returns int language sql stable security definer set search_path = public as $$
  -- The floor is applied HERE as well as in the CHECK, deliberately. Two
  -- mechanisms, not one: if the constraint is ever dropped by a migration
  -- meaning well, every result read still refuses below 2 for a person.
  -- An organisation is outside k entirely and returns 0 — attributed results
  -- are the read path there, not aggregation.
  select case when s.respondent_kind = 'organisation' then 0
              else greatest(s.k_threshold, 2) end
  from public.surveys s where s.id = p_survey
$$;

comment on function app.k_for(uuid) is
  'The effective threshold for one survey: 0 for an organisation (outside k, '
  'attributed results are the read path), otherwise greatest(k_threshold, 2). '
  'The floor is applied here AND as a CHECK so that neither alone is the only '
  'mechanism. Every result RPC reads k through this function.';

-- ── 2. immutability once a response exists
create or replace function app.guard_threshold_immutable()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Only the two columns the rule is about. Scoped with `update of` on the
  -- trigger as well, so an unrelated UPDATE to the same row is not re-checked:
  -- CLAUDE.md's «a guard's scope is the column the rule is about», and the
  -- reason app.enqueue_reminders once aborted for every organisation.
  if new.k_threshold is not distinct from old.k_threshold
     and new.respondent_kind is not distinct from old.respondent_kind then
    return new;
  end if;

  if exists (select 1
               from public.responses r
               join public.survey_rounds sr on sr.id = r.round_id
              where sr.survey_id = old.id) then
    -- TWO messages, because the two columns are two different promises and the
    -- reader needs to know which one refused. A single generic message made
    -- `threshold-policy`'s kind test read as though the threshold rule had
    -- fired on a respondent_kind change, which is the shape this project calls
    -- «the thing measured was not the thing claimed» — one floor down, in an
    -- error string.
    if new.respondent_kind is distinct from old.respondent_kind then
      raise exception 'respondent_kind_immutable_after_response'
        using hint = 'A person has already answered this survey. Re-casting those answers as an '
                     'organisation''s would change what the respondent was promised after the fact, '
                     'and no path reclassifies a person survey as an organisation one.';
    end if;
    raise exception 'threshold_immutable_after_response'
      using hint = 'A response already exists for this survey. Lowering the threshold afterwards '
                   'would turn a setting into a retrieval mechanism: wait for answers, lower, then '
                   'read the cell that was suppressed. Raising it is refused by the same rule, so '
                   'that there is one sentence to remember rather than two.';
  end if;

  return new;
end $$;

drop trigger if exists guard_threshold_immutable on public.surveys;
create trigger guard_threshold_immutable
  before update of k_threshold, respondent_kind on public.surveys
  for each row execute function app.guard_threshold_immutable();

comment on function app.guard_threshold_immutable() is
  'Invariant 1, condition 2 and the respondent_kind half of the organisations '
  'clause. Refuses ANY change to k_threshold or respondent_kind once a response '
  'exists for the survey, in either direction. The existing guard_survey_policy '
  'covered only policy_locked (set on send) and person->organisation, so a '
  'survey answered through a share link, a QR voucher or a test round was not '
  'covered at all.';

-- ── 3. who may set it: the creator, with no role gate on the threshold
create or replace function app.guard_survey_policy()
returns trigger language plpgsql security definer set search_path = '' as $fn$
declare
  v_uid uuid := (select auth.uid());
  v_ins boolean := tg_op = 'INSERT';
  v_k_changed boolean;
  v_anon_changed boolean;
  v_kind_changed boolean;
  v_policy_change boolean;
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
    select o.default_k_threshold into v_org_floor
      from public.organizations o where o.id = new.org_id;

    -- Person surveys only — app.k_for returns 0 for organisation respondents,
    -- so a floor there would gate a path that is ungated by design. The flag is
    -- the organisation's own exception, so this binds an administrator too: a
    -- setting any single person can undercut is not a setting.
    if new.respondent_kind = 'person'
       and new.k_threshold < v_org_floor then
      raise exception 'below_org_floor'
        using hint = 'The organisation''s default threshold is a floor. An administrator '
                     'sets it under Administrasjon; a survey may go above it, never below.';
    end if;
  end if;

  -- ── Who may change a survey's POLICY, and the record that they did ──────
  -- B3c-3: this used to read `v_k_changed` alone. All three columns are policy
  -- — the lock has always said so — and anonymity is the one a respondent was
  -- promised. T1 removed the THRESHOLD's role gate entirely (see below). The
  -- gate on anonymity and respondent_kind is deliberately LEFT STANDING: the
  -- amendment names the threshold and nothing else.
  if not v_ins and v_uid is not null then
    if v_k_changed then
      -- T1: NO ROLE GATE ON THE THRESHOLD. The amended invariant 1: «the person
      -- who creates the survey sets the threshold on it; an administrator sets
      -- the organisation default. That is all — no delegation switch, no enable
      -- step, no per-role gate beyond that.» The admin-only check and the
      -- organisation flag that could waive it both existed to withhold this
      -- from the survey's own creator, so both are gone. What remains is
      -- arithmetic, not permission: the floor of 2, the organisation's floor
      -- above, and immutability once a response exists. The audit row stays.
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
