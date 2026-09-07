-- DECISIONS Q90 (amends Q17) and Q58.
--
-- ── WHY THIS IS NOT TOR'S SAY-SO ────────────────────────────────────────────
--
-- `organizations.privacy.redaktor_may_lower` has existed since M:0034 and is
-- MEANINGLESS WITHOUT A FLOOR TO LOWER BENEATH. The global floor is a CHECK
-- (`surveys_k_threshold_floor`, >= 3), and a CHECK cannot be granted or
-- withheld by permission — so "lower" had no referent unless the
-- ORGANISATION's value binds. The floor reading was already built into the
-- schema by the flag's own existence; what was missing was the constraint the
-- flag is an exception to.
--
-- Independently: an organisation-level privacy setting that any editor can
-- undercut is not a setting.
--
-- Before this migration `default_k_threshold` only SEEDED. Enumerated, not
-- assumed: `scripts/verify/threshold-readers.ts` derived the complete set of
-- readers and writers from pg_proc/pg_constraint/pg_trigger and found ZERO
-- surfaces constraining a survey against the organisation default.
--
-- ── WHAT CHANGES ────────────────────────────────────────────────────────────
--
-- 1. `app.guard_survey_policy` refuses a person survey's k_threshold below the
--    organisation's default UNLESS `privacy.redaktor_may_lower` is true. The
--    flag now binds by ORGANISATION rather than by role: an administrator
--    undercutting the organisation's own floor silently is the same problem the
--    flag exists to prevent.
--
-- 2. `app.apply_pack_policy` takes `greatest(pack_k, org_default)` instead of
--    assigning the pack's value. Raising is the safe direction, and a statutory
--    survey landing on the stricter of the two is the correct reading of both
--    Q17 and Q58. Measured before applying: 0 existing statutory surveys would
--    be raised by this on the local database (`pack k < org default` returns
--    zero rows), and prod could not be measured from this session.
--
-- 3. Organisation surveys are untouched. `app.k_for` returns 0 for them by
--    design and the floor is meaningless there, so every rule below is
--    person-only and says so.
--
-- EXISTING ROWS ARE NOT REWRITTEN. The constraint binds at WRITE time, so a
-- survey already below its organisation's default keeps its threshold until
-- somebody tries to change it. Local count at the time of writing: 37 of 269
-- person surveys sit below their org default, 31 of them not yet
-- policy_locked — but that is a database full of test fixtures and is not the
-- number a grandfathering decision should rest on. See the V2-2 report.

comment on column public.organizations.default_k_threshold is
  'DECISIONS Q17 + Q90. A FLOOR, not merely a default, despite the name: a '
  'person survey may not be set below it unless privacy.redaktor_may_lower is '
  'true. It also seeds a new person survey (app.apply_pack_policy). Renaming '
  'the column is deliberately NOT done here — a rename mid-phase would touch '
  'every reader for no behavioural gain.';

-- 1. The guard gains the floor ------------------------------------------------
create or replace function app.guard_survey_policy()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_policy_change boolean := new.k_threshold  is distinct from old.k_threshold
                          or new.anonymity     is distinct from old.anonymity
                          or new.respondent_kind is distinct from old.respondent_kind;
  v_redaktor_ok boolean;
  v_org_floor int;
begin
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

  if (new.k_threshold is distinct from old.k_threshold) and v_uid is not null then
    select coalesce((o.privacy->>'redaktor_may_lower')::boolean, false), o.default_k_threshold
      into v_redaktor_ok, v_org_floor
      from public.organizations o where o.id = new.org_id;

    -- Q90: THE ORGANISATION'S FLOOR. Person surveys only — app.k_for returns 0
    -- for organisation respondents, so a floor there would gate a path that is
    -- ungated by design. The flag is the organisation's own exception, so this
    -- binds an administrator too: a setting any single person can undercut is
    -- not a setting.
    if new.respondent_kind = 'person'
       and new.k_threshold < v_org_floor
       and not v_redaktor_ok then
      raise exception 'below_org_floor'
        using hint = 'The organisation''s default threshold is a floor. Turn on '
                     '«Tillat at redaktører senker terskelen» to allow a lower value.';
    end if;

    if not app.has_role(new.org_id, array['administrator']::app.member_role[])
       and not (v_redaktor_ok and app.has_role(new.org_id, array['redaktor']::app.member_role[])) then
      raise exception 'threshold_admin_only'
        using hint = 'Only an administrator may change the display threshold.';
    end if;

    insert into public.audit_events (org_id, actor_user_id, action, target, meta)
    values (new.org_id, v_uid, 'threshold.change', new.id::text,
            jsonb_build_object('from', old.k_threshold, 'to', new.k_threshold));
  end if;

  return new;
end $$;

-- 2. A pack's threshold becomes a FLOOR, not an assignment --------------------
create or replace function app.apply_pack_policy()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_policy jsonb;
  v_default int;
  v_pack_k int;
begin
  if new.template_pack_key is not null then
    select tp.policy into v_policy from public.template_packs tp
      where tp.org_id is null and tp.key = new.template_pack_key
        and coalesce((tp.policy->>'locked')::boolean, false)
      limit 1;
    if v_policy is not null then
      new.anonymity      := coalesce((v_policy->>'anonymity')::app.anonymity_mode, new.anonymity);
      new.respondent_kind := coalesce(v_policy->>'respondent_kind', new.respondent_kind);
      -- Q58: the pack's number is a FLOOR the pack carries, not a ceiling it
      -- imposes. Before this, a locked pack ASSIGNED and returned early, so a
      -- pack carrying 8 would have LOWERED an organisation whose default is 10.
      -- Organisation surveys keep the pack's 0 — greatest() over a person floor
      -- would gate a path Q17 leaves ungated by design.
      v_pack_k := (v_policy->>'k_threshold')::int;
      if new.respondent_kind = 'person' then
        select o.default_k_threshold into v_default
          from public.organizations o where o.id = new.org_id;
        new.k_threshold := greatest(coalesce(v_pack_k, new.k_threshold), coalesce(v_default, 0));
      else
        new.k_threshold := coalesce(v_pack_k, new.k_threshold);
      end if;
      new.policy_locked  := true;
      return new;
    end if;
  end if;

  if new.respondent_kind = 'person' and new.k_threshold = 5 then
    select o.default_k_threshold into v_default from public.organizations o where o.id = new.org_id;
    new.k_threshold := coalesce(v_default, new.k_threshold);
  end if;
  return new;
end $$;

-- 3. Q58 — ONE pack key, listed as a key -------------------------------------
-- «trakassering, varsling og helse» in the bundle (HeiTuva.dc.html:5591) names
-- three topics; only one is a pack. `psykososial-kartlegging` already carries 5
-- and covers varsling through the same legal basis (aml. kap. 2A); «helse» has
-- no pack at all, so the bundle's sentence names topics that do not exist as
-- packs — a copy correction, not a seed (D105).
--
-- GIVING THIS PACK A POLICY LOCKS ITS ANONYMITY FOR THE FIRST TIME, AND THAT IS
-- THE DECISION RATHER THAN ITS COST: a harassment survey that a customer can
-- switch to «med navn» is the failure mode the lock exists to prevent. Existing
-- surveys created from this pack are UNTOUCHED — the trigger fires on insert.
update public.template_packs set policy = jsonb_build_object(
    'anonymity','anonymous','respondent_kind','person','k_threshold',8,'locked',true)
  where org_id is null and key = 'trakassering-ytringsklima';
