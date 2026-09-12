-- EVERY PRODUCER OF MAIL ANSWERS FOR BOTH SUPPRESSION AND MEMBERSHIP.
--
-- Found at the start of I1-1, while checking whether the instruction's property 1
-- («a deprovisioned member cannot receive a new invitation») already stood.
-- It did not, in three separate ways, and the third is the sharpest.
--
-- ── 1. THE DERIVATION WAS ITSELF AN ENUMERATION, TWICE ─────────────────────
--
-- `M:0107` shipped a catalogue sweep over `insert into public.survey_invitations`
-- so that «a fifth insertion point fails in the commit that adds it». Measured:
--
--   app.run_due_schedules   inserts=1
--   public.mint_test_token  inserts=1
--   public.redeem_live_voucher inserts=1
--   public.send_round       inserts=2   <-- FOUR functions, FIVE insertion points
--
-- The sweep read each FUNCTION BODY for a reference to member status, so
-- `send_round` passed on the strength of its group loop (`m.status = 'active'`)
-- while its NAMED-RECIPIENTS loop consulted only suppression. An administrator
-- pasting a leaver's address — or importing a six-month-old CSV from HR — sent
-- to them.
--
-- And insertion points are still not the property. The thing that reaches a
-- person is not a ROW, it is a `pgmq.send`, and `app.enqueue_reminders` produces
-- one without inserting anything at all. It filters `is_test`, `responded_at`,
-- `bounced_at` and `sent_at` — and neither membership status NOR suppression.
-- So a member who left kept receiving reminders, and so did a person who had
-- exercised their GDPR art. 21 objection.
--
-- ── 2. AND THE OBJECTION GUARD INVERTED ITSELF ─────────────────────────────
--
-- `guard_invitation_not_suppressed` was written `BEFORE INSERT OR UPDATE`. The
-- rule it means is «no invitation may be CREATED for, or RE-POINTED at, an
-- address that has objected». Written over every UPDATE, it also refuses the
-- updates the system makes on its own behalf:
--
--   * `app.enqueue_reminders` rotates the token — so ONE objecting address
--     aborted the entire reminder sweep, for every organisation, on a pg_cron
--     job whose failure is silent;
--   * the mail worker writes `sent_at` AFTER Brevo has accepted the message
--     (`supabase/functions/mail-worker/index.ts:209`) — so an objection lodged
--     between queueing and sending makes that write throw, the worker cannot
--     mark the message spent, and the queue redelivers it. **Objecting caused
--     REPEATED mail to the person who objected.** Measured in a transaction and
--     rolled back, not reasoned about.
--
-- This is the rule this repository has now rediscovered seven times, in its
-- seventh construct: a guard written as «reject any UPDATE» collides with the
-- maintenance the database and its workers do on your behalf. The fix is the
-- column, not the predicate — `UPDATE OF email` says what was meant and lets
-- token rotation and `sent_at` through.
--
-- ── 3. THE PREDICATE GETS A HOME, BECAUSE ITS SPELLING WAS THE ENUMERATION ──
--
-- `M:0107` wrote `om.status <> 'active'` and Q136c defended it: «status gains a
-- value the day SCIM deprovisioning lands». The reasoning was right and the
-- spelling was chosen against an enumeration of two values when there are three.
-- `invited` is a member who has not signed in YET — not someone who has left —
-- and `<> 'active'` silently refused them.
--
-- Neither spelling is the property. `app.member_blocks_invitation` is: one CASE,
-- one place, and **an unrecognised status RAISES instead of picking a side**, so
-- a fourth value cannot default its way into either answer. That is the form of
-- the rule that does not depend on remembering.
--
-- NOTE THE DELIBERATE ASYMMETRY, because it reads as an inconsistency:
--   * `send_round`'s GROUP loop keeps `m.status = 'active'`. That is an
--     INCLUSION rule — who belongs in a bulk audience — and it is conservative
--     on purpose. It predates this work and is untouched.
--   * this function is a PROHIBITION — who may never be reached. A member mid
--     onboarding may be surveyed if someone names them; a member the
--     organisation has deactivated may not, by any path.
-- Different questions, different answers, both correct.

-- ── the predicate ──────────────────────────────────────────────────────────
create or replace function app.member_blocks_invitation(p_status text)
returns boolean
language plpgsql
immutable
-- Pinned per M:0096: a function with no search_path setting resolves names from
-- the CALLER's path. This one resolves no object at all, and it is pinned anyway
-- — the sweep is catalogue-derived and an exemption that has to be argued is
-- worth less than a line of DDL.
set search_path = ''
as $$
begin
  -- Enumerated deliberately and exhaustively. A new value of
  -- org_members.status MUST be added here, and until it is, every caller fails
  -- loudly rather than quietly deciding that the new state is fine to mail.
  case p_status
    when 'active'   then return false;  -- the ordinary case
    when 'invited'  then return false;  -- has not signed in YET; has not left
    when 'inactive' then return true;   -- the organisation has said: no more
    else
      raise exception 'unknown member status %', p_status
        using hint = 'org_members.status gained a value and app.member_blocks_invitation '
                     'was not taught what it means. Decide whether that state may be '
                     'mailed and add a branch — do not widen the else.';
  end case;
end $$;

comment on function app.member_blocks_invitation(text) is
  'Does this membership status forbid reaching the person? The single home of '
  'that rule, so the four producers agree and a new status value raises instead '
  'of defaulting (M:0108). NOT the same question as send_round''s group loop, '
  'which asks who BELONGS in a bulk audience and answers `active` only.';

-- ── 2a. the objection guard, rescoped to what it means ─────────────────────
drop trigger if exists guard_invitation_not_suppressed on public.survey_invitations;
create trigger guard_invitation_not_suppressed
  before insert or update of email on public.survey_invitations
  for each row execute function app.guard_invitation_not_suppressed();

-- ── 2b. the membership guard: the structural backstop ──────────────────────
-- Tests 1, 2, 7 and 9 guard the four producers that exist. This guards the
-- producer nobody has written yet, the psql session, and the server action a
-- later phase adds. No `pg_proc` sweep can see an insert made from application
-- code; a trigger can.
create or replace function app.guard_invitation_member_active()
returns trigger
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_org uuid;
  v_status text;
begin
  -- A live participant is anonymous in the room and carries no address, and a
  -- test token is a dry run addressed to the editor themselves. Neither can
  -- correspond to a member being mailed. Same two exemptions the M:0107 sweep
  -- allowlists, and for the same checked reasons.
  if new.email is null or coalesce(new.is_test, false) then
    return new;
  end if;

  select s.org_id into v_org
    from public.survey_rounds r
    join public.surveys s on s.id = r.survey_id
   where r.id = new.round_id;
  if v_org is null then
    return new;
  end if;

  -- Keyed on (org_id, email), which is UNIQUE — the person — and not on
  -- member_id, which is `on delete set null` and which only one loop sets.
  -- M:0107's header has the full argument.
  select m.status into v_status
    from public.org_members m
   where m.org_id = v_org and lower(m.email) = lower(trim(new.email));

  -- An address with NO membership is left alone: external respondents —
  -- customers, suppliers, the public — are not ours to deactivate, and reading
  -- this as «anyone we cannot vouch for» would silently empty every customer
  -- survey.
  if v_status is not null and app.member_blocks_invitation(v_status) then
    raise exception 'recipient_inactive: %', new.email
      using hint = 'This address belongs to a member the organisation has '
                   'deactivated. Filter it out before inserting, or reactivate '
                   'them — see app.member_blocks_invitation.';
  end if;

  return new;
end $$;

comment on function app.guard_invitation_member_active() is
  'Refuses an invitation addressed to a deactivated member, from ANY insertion '
  'point including ones outside the database (M:0108). Scoped to insert and to '
  '`update of email` — re-pointing an invitation is a new invitation; writing '
  '`sent_at` or rotating a token is not.';

drop trigger if exists guard_invitation_member_active on public.survey_invitations;
create trigger guard_invitation_member_active
  before insert or update of email on public.survey_invitations
  for each row execute function app.guard_invitation_member_active();

-- ── 3a. send_round's named-recipients loop ─────────────────────────────────
-- Asserted anchor (D115): M:0070 patched this function at five occurrences of an
-- anchor nobody counted and a catch-all hid every one. The anchor below is the
-- named loop's suppression skip, whose comment makes it unique in the body.
do $$
declare
  v_src text;
  v_anchor text := 'continue when v_email is not null and app.is_suppressed(v_survey.org_id, v_email);';
  v_hits int;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'send_round';
  if v_src is null then
    raise exception 'public.send_round not found — the catalogue and this migration disagree';
  end if;

  v_hits := (length(v_src) - length(replace(v_src, v_anchor, ''))) / length(v_anchor);
  if v_hits <> 1 then
    raise exception 'send_round: expected exactly one named-loop suppression skip, found %', v_hits
      using hint = 'The body moved. Read it and rewrite this migration against what is '
                   'there now — do NOT loosen the anchor (D115).';
  end if;

  execute replace(v_src, v_anchor, v_anchor || E'\n' ||
    '    -- M:0108. The named loop is the second of this function''s TWO insertion' || E'\n' ||
    '    -- points, and M:0107''s sweep read the body as one — so the group loop''s' || E'\n' ||
    '    -- `m.status = ''active''` was standing in for a check this loop never made.' || E'\n' ||
    '    -- Skipped rather than refused: the trigger would abort the whole send, and' || E'\n' ||
    '    -- one leaver in a pasted list should not cost the other forty their round.' || E'\n' ||
    '    continue when v_email is not null and exists (' || E'\n' ||
    '      select 1 from public.org_members om' || E'\n' ||
    '       where om.org_id = v_survey.org_id' || E'\n' ||
    '         and lower(om.email) = lower(trim(v_email))' || E'\n' ||
    '         and app.member_blocks_invitation(om.status));');
end $$;

-- ── 3b. the reminder sweep ─────────────────────────────────────────────────
-- Rewritten rather than patched: the change is two predicates inside one SELECT,
-- and an anchored replace over a WHERE clause is less legible than the clause.
create or replace function app.enqueue_reminders()
returns integer
language plpgsql
security definer
set search_path = public, app, pgmq, extensions, pg_temp
as $$
declare
  v_inv record;
  v_raw text;
  v_count int := 0;
  v_grace interval := interval '72 hours';
begin
  for v_inv in
    select i.id, i.email, i.phone, i.channel, i.name, i.lang, i.round_id, i.token_hash,
           r.survey_id, s.org_id, s.title, sc.reminder_after_days
      from (select * from public.survey_invitations where not is_test) i
      join public.survey_rounds r on r.id = i.round_id
      join public.surveys s on s.id = r.survey_id
      left join public.schedules sc on sc.survey_id = r.survey_id
     where r.status = 'open'
       and s.status <> 'lukket'
       and i.responded_at is null
       and i.bounced_at is null
       and i.sent_at is not null
       and coalesce(sc.reminder_after_days, 0) > 0
       and i.sent_at < now() - make_interval(days => sc.reminder_after_days)
       and coalesce(array_length(i.reminded_at, 1), 0) = 0
       -- M:0108. THE TWO CLAUSES THIS SWEEP NEVER HAD. A reminder is a second
       -- piece of mail to the same person, so every rule about who may be
       -- reached applies to it exactly as it applies to the first — and this
       -- function inserts no row, so neither trigger on survey_invitations
       -- could ever have seen it. GDPR art. 21 first:
       and not (i.email is not null and app.is_suppressed(s.org_id, i.email))
       -- and the member who has left:
       and not exists (
         select 1 from public.org_members om
          where i.email is not null
            and om.org_id = s.org_id
            and lower(om.email) = lower(trim(i.email))
            and app.member_blocks_invitation(om.status))
  loop
    v_raw := encode(extensions.gen_random_bytes(32), 'hex');
    update public.survey_invitations
       set previous_token_hash = v_inv.token_hash,
           previous_token_expires_at = now() + v_grace,
           token_hash = app.hash_token(v_raw),
           reminded_at = coalesce(reminded_at, '{}') || now()
     where id = v_inv.id;

    perform pgmq.send('mail_outbox', jsonb_build_object(
      'kind', 'reminder',
      'channel', v_inv.channel,
      'round_id', v_inv.round_id, 'survey_id', v_inv.survey_id, 'org_id', v_inv.org_id,
      'email', v_inv.email, 'phone', case when v_inv.channel = 'sms' then v_inv.phone end,
      'name', v_inv.name, 'lang', v_inv.lang,
      'token', v_raw, 'survey_title', v_inv.title));
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

comment on function app.enqueue_reminders() is
  'The reminder sweep. It INSERTS NOTHING — it updates a token and calls '
  'pgmq.send — so no trigger on survey_invitations can guard it and every rule '
  'about who may be reached has to be restated in its WHERE clause or it does '
  'not apply to reminders: suppression (GDPR art. 21) and member deactivation '
  'both are, since M:0108. tests/db/deactivation.test.ts derives over '
  'pgmq.send producers so a fourth one fails in the commit that adds it.';

-- ── 3c. and run_due_schedules, so the three producers agree ────────────────
-- M:0107 wrote `om.status <> 'active'` here. Q136c's reasoning was right — the
-- rule must survive a new status value — and its SPELLING was the enumeration:
-- with three values, `<> 'active'` also refuses `invited`, a member who has not
-- signed in yet and has not left. Moved to the predicate's home so all four
-- call sites answer the same question and a fourth value raises.
do $$
declare
  v_src text;
  v_anchor text := 'and om.status <> ''active'');';
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
    raise exception 'run_due_schedules: expected exactly one M:0107 status clause, found %', v_hits
      using hint = 'The body moved. Read it and rewrite this migration against what is '
                   'there now — do NOT loosen the anchor (D115).';
  end if;

  execute replace(v_src, v_anchor, 'and app.member_blocks_invitation(om.status));');
end $$;
