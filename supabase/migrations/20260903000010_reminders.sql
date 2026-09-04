-- HeiTuva 0010 — reminders, and the recurring rounds that follow them.
--
-- A NOTE ON TOKENS, because this is the one real design decision here.
--
-- Tokens are hashed at rest (CLAUDE.md invariant 5), so the original link
-- CANNOT be reconstructed to put in a reminder: we hold sha256(token) and
-- nothing else. That leaves three options — rotate the token, store the raw one
-- encrypted, or send a reminder with no link. This migration rotates.
--
-- Rotation means the first link stops working for anyone who is reminded. That
-- is bounded: reminders only go to invitations with `responded_at is null`, so
-- the link being invalidated is one nobody has used. The exception is someone
-- who opened the invitation, left it in a tab, and comes back after the
-- reminder — they see the closed screen and must use the newer mail. That is
-- the cost; the alternative is holding a decryptable copy of every live
-- respondent credential, which is a materially worse thing to be breached.
--
-- Flagged for review: docs/DEVIATIONS.md D42.

/**
 * Enqueues one reminder per un-responded invitation on rounds that are due.
 *
 * Idempotent by `reminded_at`: an invitation already reminded the configured
 * number of times is skipped, so running this twice in one day sends nothing
 * twice. That matters because pg_cron retries and because a manual run during
 * an incident must be safe.
 */
create or replace function app.enqueue_reminders()
returns int
language plpgsql volatile security definer set search_path = public as $$
declare
  v_inv record;
  v_raw text;
  v_count int := 0;
begin
  for v_inv in
    select i.id, i.email, i.name, i.lang, i.round_id,
           r.survey_id, s.org_id, s.title, sc.reminder_after_days
      from public.survey_invitations i
      join public.survey_rounds r on r.id = i.round_id
      join public.surveys s on s.id = r.survey_id
      left join public.schedules sc on sc.survey_id = r.survey_id
     where r.status = 'open'
       and i.responded_at is null
       and i.bounced_at is null
       and i.sent_at is not null
       -- Only when a reminder is configured, and only once the wait has passed.
       and coalesce(sc.reminder_after_days, 0) > 0
       and i.sent_at < now() - make_interval(days => sc.reminder_after_days)
       -- One reminder per invitation. `reminded_at` is an array so a second
       -- reminder rule can be added later without another column.
       and coalesce(array_length(i.reminded_at, 1), 0) = 0
  loop
    -- Rotate: a new secret, the old hash replaced in the same statement that
    -- records the reminder, so the two can never disagree.
    v_raw := encode(extensions.gen_random_bytes(32), 'hex');
    update public.survey_invitations
       set token_hash = app.hash_token(v_raw),
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

/**
 * Opens the next round of a recurring survey when its schedule falls due.
 *
 * The invitation list is copied from the previous round rather than
 * recalculated, so a survey keeps asking the same people until someone changes
 * the recipients — and each of them gets a fresh token, because the previous
 * round's are spent.
 */
create or replace function app.run_due_schedules()
returns int
language plpgsql volatile security definer set search_path = public as $$
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
    select sc.*, s.org_id, s.title, s.langs
      from public.schedules sc
      join public.surveys s on s.id = sc.survey_id
     where sc.active
       and sc.next_run_at is not null
       and sc.next_run_at <= now()
       and s.deleted_at is null
       -- runs_total 0 means "until I stop it".
       and (sc.runs_total = 0 or sc.runs_done < sc.runs_total)
  loop
    select id into v_prev from public.survey_rounds
      where survey_id = v_s.survey_id order by round_no desc limit 1;

    -- The previous round closes as the next opens: two open rounds on one
    -- survey would split its answers across both.
    update public.survey_rounds set status = 'closed'
      where survey_id = v_s.survey_id and status = 'open';
    update public.share_links set active = false
      where round_id in (select id from public.survey_rounds where survey_id = v_s.survey_id);

    select coalesce(jsonb_agg(to_jsonb(q) order by q.position), '[]'::jsonb) into v_snapshot
      from (
        select id, type, text, help, required, comment_mode, follow_up_on_low, config, position
          from public.survey_questions where survey_id = v_s.survey_id order by position
      ) q;

    -- Rotation (the design's "Roter spørsmålene"): each round asks a subset, so
    -- people do not get the same questions every time.
    if v_s.rotate_questions and jsonb_array_length(v_snapshot) > 3 then
      select jsonb_agg(value) into v_snapshot
        from (
          select value from jsonb_array_elements(v_snapshot)
          -- Seeded by the round number so a round's question set is stable if
          -- this function is ever re-run for it.
          order by md5(value::text || v_s.runs_done::text) limit 3
        ) picked;
    end if;

    select coalesce(max(round_no), 0) + 1 into v_round_no
      from public.survey_rounds where survey_id = v_s.survey_id;

    insert into public.survey_rounds (survey_id, round_no, question_snapshot, status)
    values (v_s.survey_id, v_round_no, v_snapshot, 'open')
    returning id into v_round_id;

    for v_inv in
      select distinct on (email) email, name, group_id, lang
        from public.survey_invitations where round_id = v_prev
    loop
      v_raw := encode(extensions.gen_random_bytes(32), 'hex');
      insert into public.survey_invitations
        (round_id, email, name, group_id, lang, channel, token_hash)
      values (v_round_id, v_inv.email, v_inv.name, v_inv.group_id, v_inv.lang, 'email',
              app.hash_token(v_raw));

      perform pgmq.send('mail_outbox', jsonb_build_object(
        'kind', 'invitation',
        'round_id', v_round_id, 'survey_id', v_s.survey_id, 'org_id', v_s.org_id,
        'email', v_inv.email, 'name', v_inv.name, 'lang', v_inv.lang,
        'token', v_raw, 'survey_title', v_s.title));
    end loop;

    update public.schedules
       set runs_done = runs_done + 1,
           next_run_at = now() + case cadence
             when 'weekly' then interval '7 days'
             when 'biweekly' then interval '14 days'
             when 'monthly' then interval '30 days'
             when 'quarterly' then interval '91 days'
             else interval '7 days' end,
           active = case when runs_total = 0 then true
                         else runs_done + 1 < runs_total end
     where id = v_s.id;

    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

-- Hourly rather than daily: a reminder configured for "after 2 days" should go
-- out near the hour it comes due, not at whatever time a nightly sweep runs.
-- Both functions are idempotent, so an extra run costs nothing.
do $$
begin
  if not exists (select 1 from cron.job where jobname = 'reminders-hourly') then
    perform cron.schedule('reminders-hourly', '7 * * * *', 'select app.enqueue_reminders()');
  else
    perform cron.alter_job((select jobid from cron.job where jobname = 'reminders-hourly'),
      schedule => '7 * * * *', command => 'select app.enqueue_reminders()');
  end if;

  if not exists (select 1 from cron.job where jobname = 'schedules-hourly') then
    perform cron.schedule('schedules-hourly', '17 * * * *', 'select app.run_due_schedules()');
  else
    perform cron.alter_job((select jobid from cron.job where jobname = 'schedules-hourly'),
      schedule => '17 * * * *', command => 'select app.run_due_schedules()');
  end if;
end $$;
