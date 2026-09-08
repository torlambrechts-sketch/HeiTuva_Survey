-- V2-3b · Reservasjonsliste. DECISIONS Q60, and the structural constraint
-- 03-plan.md carries from V2-3's withdrawn coupling argument.
--
-- ── WHY THE GUARD IS TWO LAYERS AND NEITHER IS SUFFICIENT ALONE ─────────────
--
-- The plan says suppression must be enforced where a new recipient source
-- CANNOT BYPASS IT — «a trigger on `survey_invitations`, or a single
-- `app.resolve_recipients` both loops must go through — and not as a predicate
-- copied into each loop». Measured, both halves are needed, for a reason the
-- plan could not have known:
--
--   1. THE TRIGGER IS THE GUARD. `app.guard_invitation_not_suppressed` RAISES on
--      any insert of a suppressed address into `survey_invitations`, from any
--      caller, present or future. This is what makes a fourth insertion point
--      impossible to add silently: it fails the first time it runs, loudly,
--      instead of mailing a person who objected.
--
--   2. THE `continue` IN EACH LOOP IS NOT A SECOND GUARD — IT IS THE SKIP, and
--      its job is the MAIL QUEUE. Each loop does `insert … ; perform
--      pgmq.send('mail_outbox', …)`, and the two are independent. A trigger that
--      returned NULL would drop the row and leave the message queued, and
--      `scripts/mail-worker.ts` never reads `survey_invitations` before sending
--      — **the worker sends BEFORE it touches `survey_invitations`**, then
--      UPDATEs `sent_at`, an update that matches zero rows and says nothing.
--      **So a dropped row would mean no invitation and a delivered email — the
--      one outcome a suppression test checking that table would call a pass. A
--      test that confirms the duty was met in exactly the case where it was
--      broken.** So the loop skips before either happens, and the trigger raises
--      rather than dropping.
--
-- Raising is safe precisely BECAUSE of the skip: in normal operation the
-- trigger never fires. A test must therefore prove it would — `tests/db/
-- suppressions.test.ts` inserts directly and asserts the raise, and the
-- catalogue-derived half enumerates every `insert into survey_invitations` in
-- `pg_proc` and asserts each function consults `app.is_suppressed`.
--
-- ── THE COUNT THE PLAN CARRIED WAS WRONG, AND THE THIRD IS THE DANGEROUS ONE ─
--
--     select n.nspname||'.'||p.proname from pg_proc p
--       join pg_namespace n on n.oid = p.pronamespace
--      where n.nspname in ('public','app')
--        and p.prosrc ~* 'insert\s+into\s+(public\.)?survey_invitations';
--     -->  app.run_due_schedules
--          public.send_round
--
-- The plan said «two insertion points (`M:0052:107` and `:140`)». There are
-- THREE, in TWO functions: those two, plus `app.run_due_schedules` at
-- `M:0052:276`, which builds round N+1 by copying round N's invitations
-- verbatim — no membership check, no status filter, nothing. **A person who
-- objects after round 1 is re-invited by cron.** D110's shape: the number was
-- typed rather than measured. The plan carries the correction with the original
-- struck, per DECISIONS.md's header.
--
-- Q60: SUPPRESSION IS ORG-WIDE. GDPR art. 21 is an objection to processing, so
-- the default is the broad one; a per-population scope waits for populations.

-- 1. The list ---------------------------------------------------------------
create table if not exists public.suppressions (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  -- Stored as given for display, matched case-insensitively. The unique index
  -- below is on `lower(email)`, so «Nora@…» and «nora@…» are one objection.
  email      text not null,
  reason     text,
  source     text not null default 'manuell'
             check (source in ('manuell', 'avmelding', 'import', 'bounce')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists suppressions_org_email_uniq
  on public.suppressions (org_id, lower(email));

alter table public.suppressions enable row level security;

comment on table public.suppressions is
  'DECISIONS Q60: an objection to being surveyed, ORG-WIDE. GDPR art. 21 is an '
  'objection to processing rather than to one survey, so the default scope is '
  'the broad one; a per-population scope waits for populations (Q63). Enforced '
  'by app.guard_invitation_not_suppressed on survey_invitations, which raises '
  'rather than dropping — see this migration''s header for why dropping would '
  'be worse than not guarding at all.';

-- Everyone in the organisation may READ the list: a redaktør about to send needs
-- to know why a recipient count is lower than the group size, and hiding that
-- turns a legal obligation into an unexplained number.
drop policy if exists suppressions_sel on public.suppressions;
create policy suppressions_sel on public.suppressions for select
  using (app.is_org_member(org_id));

-- Writing is administrator-only, and this is the asymmetry Q94 did NOT widen.
-- Creating an audience is routine; recording or lifting a person's objection to
-- being processed is a privacy action, which is the administrator's tab.
drop policy if exists suppressions_ins on public.suppressions;
create policy suppressions_ins on public.suppressions for insert
  with check (app.has_role(org_id, array['administrator']::app.member_role[]));

drop policy if exists suppressions_del on public.suppressions;
create policy suppressions_del on public.suppressions for delete
  using (app.has_role(org_id, array['administrator']::app.member_role[]));

-- No UPDATE policy, deliberately: an objection is not edited. It is recorded or
-- it is lifted, and lifting is a delete that leaves an audit row behind.

grant select, insert, delete on public.suppressions to authenticated;

-- 2. The predicate, in ONE place --------------------------------------------
create or replace function app.is_suppressed(p_org uuid, p_email text)
returns boolean
language sql stable security definer set search_path = public as $fn$
  select exists (
    select 1 from public.suppressions s
     where s.org_id = p_org
       and lower(s.email) = lower(trim(p_email))
  )
$fn$;

comment on function app.is_suppressed(uuid, text) is
  'The single suppression predicate. SECURITY DEFINER because the send path '
  'runs as the caller and a redaktør''s own RLS view of suppressions must not '
  'decide whether a person is mailed.';

-- 3. The backstop ------------------------------------------------------------
-- RAISES rather than skipping. A BEFORE trigger returning NULL would leave the
-- queued mail behind and produce the one outcome nothing detects; see header.
create or replace function app.guard_invitation_not_suppressed()
returns trigger
language plpgsql security definer set search_path = public as $fn$
declare
  v_org uuid;
begin
  if new.email is null then
    return new;
  end if;

  select s.org_id into v_org
    from public.survey_rounds r
    join public.surveys s on s.id = r.survey_id
   where r.id = new.round_id;

  if v_org is not null and app.is_suppressed(v_org, new.email) then
    raise exception 'recipient_suppressed: %', new.email
      using hint = 'This address is on the organisation''s Reservasjonsliste '
                   '(GDPR art. 21). Filter it out before inserting — see '
                   'app.is_suppressed.';
  end if;

  return new;
end $fn$;

drop trigger if exists guard_invitation_not_suppressed on public.survey_invitations;
create trigger guard_invitation_not_suppressed
  before insert on public.survey_invitations
  for each row execute function app.guard_invitation_not_suppressed();

-- 4. Lifting an objection is audited -----------------------------------------
-- Plan test 6. A delete, not an update, because there is no update policy — and
-- the audit row is what makes «who let this address back in» answerable.
create or replace function app.audit_suppression_lift()
returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  -- CLAUDE.md, «Immutability triggers must permit referential maintenance» —
  -- and this is its FIFTH rediscovery, in FK form rather than trigger form.
  -- Deleting an organisation cascades to `suppressions`, this trigger fires for
  -- each row, and the audit row it writes references an organisation that is
  -- already gone: `audit_events_org_id_fkey` refuses it and the whole delete
  -- fails, far from anything about suppression. It surfaced as
  -- `dropOrg(Nordisk Studio)` failing in the demo seed.
  --
  -- The rule the note prescribes is «reject only what changes meaning, and let
  -- the database's own maintenance through». Here the meaning is plain: an
  -- audit row exists to answer «who let this address back in», and when the
  -- whole organisation is being erased there is nobody to answer it to and no
  -- organisation to hang it on. So a cascade is not a lift.
  --
  -- The parent row is deleted BEFORE its cascade reaches children, so this test
  -- is reliable rather than a race — proved rather than assumed, see
  -- `tests/db/suppressions.test.ts` — «ERASING AN ORGANISATION IS NOT A LIFT».
  if not exists (select 1 from public.organizations o where o.id = old.org_id) then
    return old;
  end if;

  insert into public.audit_events (org_id, actor_user_id, action, target, meta)
  values (old.org_id, (select auth.uid()), 'suppression.lift', old.email,
          jsonb_build_object('reason', old.reason, 'source', old.source));
  return old;
end $fn$;

drop trigger if exists audit_suppression_lift on public.suppressions;
create trigger audit_suppression_lift
  after delete on public.suppressions
  for each row execute function app.audit_suppression_lift();

-- 5. The three insertion points, each gaining its skip ------------------------
-- Copied VERBATIM from `M:0052` and patched at three anchors; nothing else in
-- either body is changed. The bodies are long, and a hand-edited excerpt is how
-- the 2026-09-07 prod sync lost two statements to a line offset — so the copy is
-- mechanical and the diff against 0052 is three `continue` blocks and their
-- comments.
CREATE OR REPLACE FUNCTION public.send_round(p_survey uuid, p_channels text[], p_recipients jsonb DEFAULT '[]'::jsonb, p_group_ids uuid[] DEFAULT '{}'::uuid[], p_anonymity text DEFAULT NULL::text, p_cadence text DEFAULT 'once'::text, p_runs integer DEFAULT 1, p_reminder_days integer DEFAULT 2, p_rotate boolean DEFAULT false, p_closes_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_test_only boolean DEFAULT false, p_custom_every integer DEFAULT NULL::integer, p_custom_unit text DEFAULT NULL::text, p_custom_weekday integer DEFAULT NULL::integer, p_send_at_local time without time zone DEFAULT NULL::time without time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_survey public.surveys;
  v_round_id uuid;
  v_round_no int;
  v_share_token text;
  v_invited int := 0;
  v_by_sms int := 0;
  v_raw text;
  v_rec jsonb;
  v_email text;
  v_phone text;
  v_channel app.channel;
  v_lang text;
  v_group uuid;
  v_snapshot jsonb;
  v_email_on boolean := 'email' = any(p_channels);
  v_sms_on boolean := 'sms' = any(p_channels);
begin
  select s.* into v_survey from public.surveys s
    where s.id = p_survey and s.deleted_at is null;
  if v_survey.id is null then
    return jsonb_build_object('error','not_found');
  end if;

  if not app.can_edit_survey(p_survey) then
    return jsonb_build_object('error','forbidden');
  end if;

  -- The flag is enforced HERE, not only in the screen that hides the card. A
  -- caller who posts 'sms' to an org without the flag gets nothing sent by SMS
  -- — silently downgraded would be wrong too, so the call is refused outright.
  if v_sms_on and not exists (
    select 1 from public.feature_flags f
     where f.key = 'sms_channel' and f.enabled
       and (f.org_id = v_survey.org_id or f.org_id is null)
     order by f.org_id nulls last limit 1
  ) then
    return jsonb_build_object('error','sms_not_enabled');
  end if;

  if p_anonymity is not null and p_anonymity <> v_survey.anonymity::text then
    update public.surveys set anonymity = p_anonymity::app.anonymity_mode
      where id = p_survey;
    v_survey.anonymity := p_anonymity::app.anonymity_mode;
  end if;

  select coalesce(jsonb_agg(to_jsonb(q) order by q.position), '[]'::jsonb)
    into v_snapshot
    from (
      select id, type, text, help, required, comment_mode, follow_up_on_low, config, position
      from public.survey_questions where survey_id = p_survey order by position
    ) q;

  if jsonb_array_length(v_snapshot) = 0 then
    return jsonb_build_object('error','no_questions');
  end if;

  select coalesce(max(round_no), 0) + 1 into v_round_no
    from public.survey_rounds where survey_id = p_survey;

  insert into public.survey_rounds (survey_id, round_no, question_snapshot, status, closes_at)
  values (p_survey, v_round_no, v_snapshot, 'open', p_closes_at)
  returning id into v_round_id;

  -- Named recipients ------------------------------------------------------
  for v_rec in select * from jsonb_array_elements(p_recipients) loop
    v_email := nullif(lower(trim(v_rec->>'email')), '');
    v_phone := app.normalize_phone(v_rec->>'phone');
    -- Email when it can be, SMS when it must be, nothing when neither applies.
    v_channel := case
      when v_email is not null and v_email_on then 'email'::app.channel
      when v_phone is not null and v_sms_on then 'sms'::app.channel
      else null end;
    continue when v_channel is null;

    -- V2-3b · GDPR art. 21. The SKIP, not the guard — see this migration's header. It is
    -- here rather than only in the trigger because the trigger cannot stop the
    -- `pgmq.send` below: a row silently dropped would still put the mail on the
    -- queue, and the worker never reads survey_invitations before sending.
    continue when v_email is not null and app.is_suppressed(v_survey.org_id, v_email);

    v_lang := coalesce(v_rec->>'lang', v_survey.langs[1], 'no');
    v_group := nullif(v_rec->>'group_id','')::uuid;
    v_raw := encode(extensions.gen_random_bytes(32), 'hex');

    insert into public.survey_invitations
      (round_id, email, phone, name, group_id, lang, channel, token_hash, expires_at)
    values (v_round_id, v_email, case when v_channel = 'sms' then v_phone else v_phone end,
            nullif(v_rec->>'name',''), v_group, v_lang, v_channel,
            app.hash_token(v_raw), p_closes_at);

    perform pgmq.send('mail_outbox', jsonb_build_object(
      'kind', case when p_test_only then 'test' else 'invitation' end,
      'channel', v_channel,
      'round_id', v_round_id, 'survey_id', p_survey, 'org_id', v_survey.org_id,
      'email', v_email, 'phone', case when v_channel = 'sms' then v_phone end,
      'name', v_rec->>'name', 'lang', v_lang,
      'token', v_raw, 'survey_title', v_survey.title));
    v_invited := v_invited + 1;
    if v_channel = 'sms' then v_by_sms := v_by_sms + 1; end if;
  end loop;

  -- Whole groups ----------------------------------------------------------
  -- Members are reached by email: an org_members row has an address and no
  -- phone, and a member of the organisation has a work inbox by definition.
  if array_length(p_group_ids, 1) is not null and v_email_on then
    for v_rec in
      select to_jsonb(m) from public.org_members m
       where m.group_id = any(p_group_ids)
         and m.org_id = v_survey.org_id
         and m.status = 'active'
    loop
      v_email := lower(trim(v_rec->>'email'));
      continue when v_email is null or v_email = '';
      -- Plan test 5: a suppressed address that is also a group member is
      -- excluded from a group-targeted send. Same reason as above.
      continue when app.is_suppressed(v_survey.org_id, v_email);
      v_lang := coalesce(v_survey.langs[1], 'no');
      v_group := nullif(v_rec->>'group_id','')::uuid;
      v_raw := encode(extensions.gen_random_bytes(32), 'hex');

      -- Q64 gap 1, whose column `M:0059` adds. This is the only loop that KNOWS the member —
      -- named recipients and imports address people who may not be members at
      -- all, which is why the column is nullable rather than required. Frozen
      -- here and never re-resolved from the email later; re-resolving is what
      -- the freeze exists to prevent.
      insert into public.survey_invitations (round_id, email, name, group_id, lang, channel, token_hash, expires_at, member_id)
      values (v_round_id, v_email, v_rec->>'name', v_group, v_lang, 'email',
              app.hash_token(v_raw), p_closes_at, (v_rec->>'id')::uuid);

      perform pgmq.send('mail_outbox', jsonb_build_object(
        'kind', case when p_test_only then 'test' else 'invitation' end,
        'channel', 'email',
        'round_id', v_round_id, 'survey_id', p_survey, 'org_id', v_survey.org_id,
        'email', v_email, 'name', v_rec->>'name', 'lang', v_lang,
        'token', v_raw, 'survey_title', v_survey.title));
      v_invited := v_invited + 1;
    end loop;
  end if;

  if p_channels && array['link','qr'] then
    v_share_token := encode(extensions.gen_random_bytes(24), 'hex');
    insert into public.share_links (round_id, kind, token_hash, active)
    values (v_round_id, 'link', app.hash_token(v_share_token), true);
  end if;

  if p_cadence <> 'once' then
    insert into public.schedules
      (survey_id, cadence, runs_total, runs_done, rotate_questions, reminder_after_days,
       custom_every, custom_unit, custom_weekday, send_at_local, next_run_at, active)
    values
      (p_survey, p_cadence::app.cadence, greatest(p_runs, 0), 1, p_rotate, p_reminder_days,
       p_custom_every, p_custom_unit, p_custom_weekday,
       coalesce(p_send_at_local, '09:00'::time),
       -- ONE definition of how long a cadence step is (M:0044). The CASE this
       -- replaces was the SECOND copy of it, and it had the same four arms and
       -- the same `else interval '7 days'` — so the first next run of an annual
       -- survey was a week away even after 0044 fixed the sweep.
       -- Q50: the first next run is the LOCAL send time on the day the
       -- cadence lands on, in the organisation's zone — not "this time of day,
       -- one interval from now". Before this, `send_at_local` was stored and
       -- never read here at all: a weekly survey sent at 14:32 kept arriving
       -- at 14:32 forever, and the column the customer set was decoration.
       app.local_send_at(
         ((now() + app.cadence_interval(p_cadence::app.cadence, p_custom_every, p_custom_unit))
            at time zone (select o.timezone from public.organizations o
                           join public.surveys s on s.org_id = o.id
                          where s.id = p_survey))::date,
         coalesce(p_send_at_local, '09:00'::time),
         (select o.timezone from public.organizations o
            join public.surveys s on s.org_id = o.id
           where s.id = p_survey)
       ),
       true);
  end if;

  update public.surveys set status = 'aktiv' where id = p_survey and status = 'utkast';
  -- Q17: a real send promises the respondents a threshold, so the policy
  -- freezes here. A test-only send promises no one, and leaves it editable.
  if not p_test_only then
    update public.surveys set policy_locked = true where id = p_survey;
  end if;

  return jsonb_build_object(
    'ok', true,
    'round_id', v_round_id,
    'round_no', v_round_no,
    'invited', v_invited,
    'by_sms', v_by_sms,
    'share_token', v_share_token,
    'queued', v_invited);
end $function$
;
CREATE OR REPLACE FUNCTION app.run_due_schedules()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_s record;
  v_prev uuid;
  v_round_id uuid;
  v_round_no int;
  v_inv record;
  v_raw text;
  v_snapshot jsonb;
  v_count int := 0;
begin
  for v_s in
    -- Q50: the organisation's zone rides along with the schedule, so the
    -- advance below computes a LOCAL send time without a second lookup.
    select sc.*, s.org_id, s.title, s.langs, o.timezone as tz
      from public.schedules sc
      join public.surveys s on s.id = sc.survey_id
      join public.organizations o on o.id = s.org_id
     where sc.active
       -- Q22. Before anything else in the loop body, so a paused series never
       -- reaches the statement that closes the open round.
       and sc.paused_at is null
       and sc.next_run_at is not null
       and sc.next_run_at <= now()
       and s.deleted_at is null
       and (sc.runs_total = 0 or sc.runs_done < sc.runs_total)
  loop
    select id into v_prev from public.survey_rounds
      where survey_id = v_s.survey_id order by round_no desc limit 1;

    update public.survey_rounds set status = 'closed'
      where survey_id = v_s.survey_id and status = 'open';
    update public.share_links set active = false
      where round_id in (select id from public.survey_rounds where survey_id = v_s.survey_id);

    select coalesce(jsonb_agg(to_jsonb(q) order by q.position), '[]'::jsonb) into v_snapshot
      from (
        select id, type, text, help, required, comment_mode, follow_up_on_low, config, position
          from public.survey_questions where survey_id = v_s.survey_id order by position
      ) q;

    if v_s.rotate_questions and jsonb_array_length(v_snapshot) > 3 then
      select jsonb_agg(value) into v_snapshot
        from (
          select value from jsonb_array_elements(v_snapshot)
          order by md5(value::text || v_s.runs_done::text) limit 3
        ) picked;
    end if;

    select coalesce(max(round_no), 0) + 1 into v_round_no
      from public.survey_rounds where survey_id = v_s.survey_id;

    insert into public.survey_rounds (survey_id, round_no, question_snapshot, status)
    values (v_s.survey_id, v_round_no, v_snapshot, 'open')
    returning id into v_round_id;

    for v_inv in
      select distinct on (coalesce(email, phone))
             email, phone, channel, name, group_id, lang, member_id
        from public.survey_invitations where round_id = v_prev
       order by coalesce(email, phone), created_at
    loop
      -- V2-3b. THIS IS THE PATH THE PLAN DID NOT COUNT, and the one that makes
      -- suppression matter: round N+1 is built by copying round N's invitation
      -- rows verbatim, so without this line a person who objects after round 1
      -- is re-invited by cron, from a path no screen leads to.
      continue when v_inv.email is not null
                and app.is_suppressed(v_s.org_id, lower(trim(v_inv.email)));

      v_raw := encode(extensions.gen_random_bytes(32), 'hex');
      insert into public.survey_invitations
        (round_id, email, phone, name, group_id, lang, channel, token_hash, member_id)
      values (v_round_id, v_inv.email, v_inv.phone, v_inv.name, v_inv.group_id, v_inv.lang,
              v_inv.channel, app.hash_token(v_raw), v_inv.member_id);

      perform pgmq.send('mail_outbox', jsonb_build_object(
        'kind', 'invitation',
        'channel', v_inv.channel,
        'round_id', v_round_id, 'survey_id', v_s.survey_id, 'org_id', v_s.org_id,
        'email', v_inv.email, 'phone', case when v_inv.channel = 'sms' then v_inv.phone end,
        'name', v_inv.name, 'lang', v_inv.lang,
        'token', v_raw, 'survey_title', v_s.title));
    end loop;

    update public.schedules
       set runs_done = runs_done + 1,
           -- Q50: same rule as the first run — the local send time on the
           -- day the cadence lands on, in the organisation's zone. `v_zone` is
           -- carried on the loop's own row, so there is no second lookup.
           next_run_at = app.local_send_at(
             ((now() + app.cadence_interval(cadence, custom_every, custom_unit))
                at time zone v_s.tz)::date,
             send_at_local,
             v_s.tz
           ),
           active = case when runs_total = 0 then true
                         else runs_done + 1 < runs_total end
     where id = v_s.id;

    v_count := v_count + 1;
  end loop;

  return v_count;
end $function$

;
