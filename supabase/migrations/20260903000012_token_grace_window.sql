-- HeiTuva 0012 — a grace window for rotated tokens, and one place that decides
-- whether a token is live at all.
--
-- D42, per Tor's decision: rotation stays, but the previous hash is kept for 72
-- hours so the mail somebody already had in a tab still works. Both values are
-- one-way, so a database breach still yields no usable link — this accepts two
-- hashes for a window, it does not store a credential.
--
-- THE CONSTRAINT THAT COMES WITH IT, and the reason most of this file exists:
-- rotation is incidental, not revocation. Closing a survey, closing a round or
-- bouncing an invitation must invalidate BOTH hashes immediately, or the grace
-- window becomes a way for a closed survey to keep taking answers.
--
-- Two real defects surfaced while making that true, neither of them caused by
-- the grace window:
--
--  1. Closing a SURVEY did not close its rounds. `closeSurvey` sets
--     `surveys.status = 'lukket'`; `submit_response` only ever looked at
--     `survey_rounds.status`. A closed survey kept accepting answers — verified
--     against the local database before this migration was written. Fixed by a
--     trigger, so every path that closes a survey closes its rounds, not just
--     the one the UI happens to call.
--  2. A BOUNCED invitation still resolved. `bounced_at` was set by the mail
--     worker and read by nothing.
--
-- Also rejected for the record, so it does not resurface: an HMAC-derived token
-- regenerated on demand from a server secret. One secret compromise mints every
-- live respondent link — the same blast radius as encrypted storage, with fewer
-- moving parts to notice it happening.

alter table public.survey_invitations
  add column previous_token_hash text,
  add column previous_token_expires_at timestamptz;

comment on column public.survey_invitations.previous_token_hash is
  'The hash this invitation had before its last rotation. One-way, like token_hash. Honoured only while previous_token_expires_at is in the future AND the invitation is otherwise live; kept past expiry so an old link can be told apart from a token that never existed (the "erstattet" screen).';

create index invitations_prev_token_idx
  on public.survey_invitations(previous_token_hash)
  where previous_token_hash is not null;

/**
 * The single answer to "what round, if any, does this token open?".
 *
 * Every respondent-facing RPC resolved tokens itself before this, which meant
 * three copies of the same eight-line join and three places to forget a rule.
 * `bounced_at` was in fact forgotten by all three. One function now, and the
 * RPCs call it.
 *
 * Returns `status`:
 *   live      — usable now (current hash, or previous hash inside its window)
 *   replaced  — matched a previous hash whose window has passed
 *   closed    — resolved to a round that is not open
 *   none      — no such token
 */
create or replace function app.resolve_token(p_token text)
returns table (round_id uuid, invitation_id uuid, status text)
language plpgsql stable security definer set search_path = public as $$
declare
  v_hash text := app.hash_token(p_token);
  v_inv public.survey_invitations;
  v_round public.survey_rounds;
  v_via_previous boolean := false;
  v_expired_previous boolean := false;
begin
  -- Current hash first: the common case, and the one that must not be slowed
  -- down by the grace window existing.
  select i.* into v_inv from public.survey_invitations i
   where i.token_hash = v_hash;

  if v_inv.id is null then
    select i.* into v_inv from public.survey_invitations i
     where i.previous_token_hash = v_hash;
    if v_inv.id is not null then
      v_via_previous := true;
      v_expired_previous :=
        v_inv.previous_token_expires_at is null
        or v_inv.previous_token_expires_at <= now();
    end if;
  end if;

  if v_inv.id is not null then
    -- These three kill BOTH hashes, which is the whole point of the
    -- constraint: a bounced or expired invitation has no live token, and a
    -- rotated one does not get a second life through the window.
    if v_inv.bounced_at is not null then
      return query select null::uuid, null::uuid, 'closed'::text;
      return;
    end if;
    if v_inv.expires_at is not null and v_inv.expires_at <= now() then
      return query select null::uuid, null::uuid, 'closed'::text;
      return;
    end if;

    select r.* into v_round from public.survey_rounds r where r.id = v_inv.round_id;
    if v_round.id is null or v_round.status <> 'open' then
      return query select null::uuid, null::uuid, 'closed'::text;
      return;
    end if;

    -- Only now does the window matter. Checking it last means a replaced link
    -- to a CLOSED round reports 'closed', not 'erstattet' — the survey being
    -- over is the more useful thing to say, and it keeps the replaced screen
    -- from implying a newer link exists when it does not.
    if v_via_previous and v_expired_previous then
      return query select null::uuid, null::uuid, 'replaced'::text;
      return;
    end if;

    return query select v_round.id, v_inv.id, 'live'::text;
    return;
  end if;

  -- A share link. No rotation, no grace window: it is not sent to anybody, so
  -- there is no old copy of it in an inbox.
  select r.* into v_round
    from public.survey_rounds r
    join public.share_links l on l.round_id = r.id
   where l.token_hash = v_hash and l.active;
  if v_round.id is not null then
    if v_round.status <> 'open' then
      return query select null::uuid, null::uuid, 'closed'::text;
      return;
    end if;
    return query select v_round.id, null::uuid, 'live'::text;
    return;
  end if;

  return query select null::uuid, null::uuid, 'none'::text;
end $$;

-- Closing a survey closes its rounds ----------------------------------------
-- A trigger rather than a fix in the server action, because the action is one
-- of several paths (an RPC, a cron sweep, a support query in SQL) and the
-- invariant is "a closed survey takes no answers", not "the close button also
-- closes rounds".
create or replace function app.close_rounds_with_survey()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'lukket' and coalesce(old.status::text, '') <> 'lukket' then
    update public.survey_rounds set status = 'closed'
      where survey_id = new.id and status = 'open';
    update public.share_links set active = false
      where round_id in (select id from public.survey_rounds where survey_id = new.id);
    -- Belt and braces: the resolver already refuses a closed round, but the
    -- grace window must not be able to outlive the survey through some future
    -- path that forgets to check.
    update public.survey_invitations
       set previous_token_hash = null, previous_token_expires_at = null
     where round_id in (select id from public.survey_rounds where survey_id = new.id);
  end if;
  return new;
end $$;

drop trigger if exists surveys_close_rounds on public.surveys;
create trigger surveys_close_rounds
  after update of status on public.surveys
  for each row execute function app.close_rounds_with_survey();

-- Rotation now leaves a trail ------------------------------------------------
create or replace function app.enqueue_reminders()
returns int
language plpgsql volatile security definer set search_path = public as $$
declare
  v_inv record;
  v_raw text;
  v_count int := 0;
  -- D42: 72 hours, Tor's call.
  v_grace interval := interval '72 hours';
begin
  for v_inv in
    select i.id, i.email, i.name, i.lang, i.round_id, i.token_hash,
           r.survey_id, s.org_id, s.title, sc.reminder_after_days
      from public.survey_invitations i
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
      'round_id', v_inv.round_id, 'survey_id', v_inv.survey_id, 'org_id', v_inv.org_id,
      'email', v_inv.email, 'name', v_inv.name, 'lang', v_inv.lang,
      'token', v_raw, 'survey_title', v_inv.title));
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

-- The three respondent RPCs, now sharing one resolver ------------------------

create or replace function public.get_survey_for_token(p_token text, p_lang text default 'no')
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_res record;
  v_round public.survey_rounds;
  v_survey public.surveys;
  v_inv public.survey_invitations;
  v_org public.organizations;
begin
  select * into v_res from app.resolve_token(p_token);
  if v_res.status = 'replaced' then
    return jsonb_build_object('error','replaced');
  end if;
  if v_res.status <> 'live' then
    return jsonb_build_object('error','not_found_or_closed');
  end if;

  select r.* into v_round from public.survey_rounds r where r.id = v_res.round_id;
  select s.* into v_survey from public.surveys s where s.id = v_round.survey_id;
  select o.* into v_org from public.organizations o where o.id = v_survey.org_id;
  if v_res.invitation_id is not null then
    select i.* into v_inv from public.survey_invitations i where i.id = v_res.invitation_id;
  end if;

  return jsonb_build_object(
    'survey_id', v_survey.id, 'round_id', v_round.id,
    'title', v_survey.title, 'org_id', v_survey.org_id,
    'org_name', v_org.name,
    'org_default_lang', v_org.default_lang,
    'invitation_lang', v_inv.lang,
    'anonymity', v_survey.anonymity, 'engage', v_survey.engage,
    'lang', p_lang, 'langs', v_survey.langs,
    'already_responded', (v_inv.id is not null and v_inv.responded_at is not null),
    'questions', v_round.question_snapshot);
end $$;

create or replace function public.submit_response(
  p_token text, p_lang text, p_answers jsonb,
  p_anon_choice boolean default null
) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_res record;
  v_inv public.survey_invitations;
  v_round public.survey_rounds;
  v_survey public.surveys;
  v_mode app.anonymity_mode;
  v_response_id uuid;
  v_group uuid;
  v_link_invitation uuid;
  k text; v jsonb;
begin
  select * into v_res from app.resolve_token(p_token);
  -- A replaced token cannot submit. The grace window is for reading the survey
  -- from an old mail, and a submission through it would be indistinguishable
  -- from one through the current link — which is fine — but only inside the
  -- window, which `resolve_token` has already decided.
  if v_res.status <> 'live' then
    return jsonb_build_object('error','not_found_or_closed');
  end if;

  select r.* into v_round from public.survey_rounds r where r.id = v_res.round_id for update;
  if v_res.invitation_id is not null then
    select i.* into v_inv from public.survey_invitations i
     where i.id = v_res.invitation_id for update;
  end if;

  if v_inv.id is not null and v_inv.responded_at is not null then
    return jsonb_build_object('error','already_responded');
  end if;

  select s.* into v_survey from public.surveys s where s.id = v_round.survey_id;

  v_mode := case
    when v_survey.anonymity = 'optional' then
      case when coalesce(p_anon_choice, true) then 'anonymous'::app.anonymity_mode
           else 'named'::app.anonymity_mode end
    else v_survey.anonymity end;

  -- group survives, identity does not
  v_group := v_inv.group_id;
  v_link_invitation := case when v_mode = 'anonymous' then null else v_inv.id end;

  insert into public.responses
    (round_id, anonymity_at_submission, invitation_id, respondent_group_id, lang, submitted_hour)
  values
    (v_round.id, v_mode, v_link_invitation, v_group, p_lang, date_trunc('hour', now()))
  returning id into v_response_id;

  for k, v in select * from jsonb_each(p_answers) loop
    insert into public.answers (response_id, question_id, value, comment, follow_up)
    values (v_response_id, k::uuid, v->'value', v->>'comment', v->>'follow_up');
  end loop;

  if v_inv.id is not null then
    -- Answering spends the grace window too: the old link must not stay usable
    -- after the invitation has been used.
    update public.survey_invitations
       set responded_at = now(),
           previous_token_hash = null,
           previous_token_expires_at = null
     where id = v_inv.id;
  end if;
  if v_survey.status = 'utkast' then
    update public.surveys set status = 'aktiv' where id = v_survey.id;
  end if;

  return jsonb_build_object('ok', true);
end $$;

create or replace function public.get_peer_results(p_token text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_res record;
  v_round public.survey_rounds;
  v_survey public.surveys;
  v_question record;
  v_k int := app.k_threshold();
  v_n int;
  v_buckets jsonb;
begin
  select * into v_res from app.resolve_token(p_token);
  if v_res.status <> 'live' then
    return jsonb_build_object('error', 'not_found');
  end if;

  select r.* into v_round from public.survey_rounds r where r.id = v_res.round_id;
  select s.* into v_survey from public.surveys s where s.id = v_round.survey_id;

  if coalesce((v_survey.engage ->> 'reveal_results')::boolean, false) is not true then
    return jsonb_build_object('hidden', true);
  end if;

  select (q ->> 'id')::uuid as id, q ->> 'text' as text, q ->> 'type' as type
    into v_question
    from jsonb_array_elements(v_round.question_snapshot) with ordinality as t(q, ord)
   where q ->> 'type' in ('scale', 'likert', 'smiley', 'enps', 'slider')
   order by ord
   limit 1;

  if v_question.id is null then
    return jsonb_build_object('hidden', true);
  end if;

  select count(*) into v_n
    from public.answers a
    join public.responses r on r.id = a.response_id
   where r.round_id = v_round.id
     and a.question_id = v_question.id
     and jsonb_typeof(a.value) = 'number';

  if v_n < v_k then
    return jsonb_build_object('insufficient_data', true, 'k', v_k, 'question', v_question.text);
  end if;

  select jsonb_agg(jsonb_build_object('value', value, 'count', c) order by value)
    into v_buckets
    from (
      select (a.value #>> '{}')::numeric as value, count(*) as c
        from public.answers a
        join public.responses r on r.id = a.response_id
       where r.round_id = v_round.id
         and a.question_id = v_question.id
         and jsonb_typeof(a.value) = 'number'
       group by 1
    ) b;

  return jsonb_build_object(
    'question', v_question.text, 'type', v_question.type,
    'n', v_n, 'buckets', coalesce(v_buckets, '[]'::jsonb));
end $$;

-- Closing a round clears the window too --------------------------------------
create or replace function public.close_round(p_round uuid)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v_survey uuid;
begin
  select survey_id into v_survey from public.survey_rounds where id = p_round;
  if v_survey is null then return jsonb_build_object('error','not_found'); end if;
  if not app.can_edit_survey(v_survey) then return jsonb_build_object('error','forbidden'); end if;

  update public.survey_rounds set status = 'closed' where id = p_round;
  update public.share_links set active = false where round_id = p_round;
  update public.survey_invitations
     set previous_token_hash = null, previous_token_expires_at = null
   where round_id = p_round;
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.close_round(uuid) from public, anon;
grant execute on function public.close_round(uuid) to authenticated;
