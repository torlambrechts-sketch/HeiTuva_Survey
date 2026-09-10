-- HeiTuva 0095 — the mail worker runs on a schedule, and `sent_at` says what it
-- actually means.
--
-- Two things, both about the same gap: nothing had ever drained `mail_outbox`,
-- because there was no consumer scheduled anywhere. S1 found that running the
-- consumer would have DESTROYED the queue and fixed the worker; this schedules
-- it, now that a provider account exists.

create extension if not exists pg_net;

-- ═══ 1. WHAT `sent_at` MEANS, WHICH IS WEAKER THAN THE NAME SUGGESTS ══════
--
-- CLAUDE.md's standing question, answered in the migration beside the column
-- rather than later: this column HAD no writer at all until the worker got one,
-- which is why «Sendt til N personer» was rendering off enqueued rows.
--
-- The important half is the second sentence. There is no delivered event to
-- write this from: the Brevo account has no Transactional -> Webhooks section,
-- so the only signal available is our own API call returning 201. That means
-- «Brevo accepted the message», not «the recipient's server took it». A message
-- can be accepted and still bounce afterwards, and nothing here will hear about
-- it. Written down rather than assumed, because the gap between those two
-- readings is exactly the kind of thing a later reader will otherwise close by
-- guessing the stronger one.
comment on column public.survey_invitations.sent_at is
  'When the provider ACCEPTED this invitation for delivery. WHO WRITES IT: the '
  'mail worker — supabase/functions/mail-worker (production, on the pg_cron job '
  'below) and scripts/mail-worker.ts (local) — on a 2xx from the provider, and '
  'nothing else. IT DOES NOT MEAN DELIVERED. The Brevo account exposes no '
  'Transactional webhooks, so there is no delivered event and no bounce event; '
  'acceptance is the strongest signal available. A message counted here can '
  'still have bounced, and `bounced_at` has no writer for the same reason (see '
  'DEVIATIONS D133). Read by app.enqueue_reminders(), which is why a survey '
  'whose worker never ran also never reminded anyone.';

-- ═══ 2. THE SCHEDULE ══════════════════════════════════════════════════════
--
-- pg_cron cannot call an Edge Function directly, so it calls this, and this
-- makes one HTTP request through pg_net.
--
-- THE URL AND THE KEY COME FROM VAULT, NOT FROM THIS FILE. A service-role key
-- in a migration is a secret in git and in every clone of it; Vault keeps it in
-- the database, encrypted, and out of the schema dump. The operator creates the
-- two secrets once (see the comment on the function), and until they exist this
-- function does nothing but say so.
--
-- «Does nothing but say so» is deliberate and is NOT a catch-all: the ONE
-- condition it handles is «the secrets have not been created yet», it is named
-- in the warning, and every other failure — a bad URL, a pg_net error, a
-- function that 500s — is left to raise or to show up in net._http_response
-- where an operator can see it. A `when others` here would make a broken worker
-- and an unconfigured one look identical, which is the shape S1 spent its whole
-- tranche removing one level up.
create or replace function app.run_mail_worker()
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_url text;
  v_key text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'mail_worker_url';
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'mail_worker_key';

  if v_url is null or v_key is null then
    raise warning 'mail worker not invoked: vault secret % is missing',
      case when v_url is null and v_key is null then 'mail_worker_url and mail_worker_key'
           when v_url is null then 'mail_worker_url'
           else 'mail_worker_key' end;
    return;
  end if;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'content-type', 'application/json',
      -- The function checks the ROLE in this token, not just that it is signed:
      -- the anon key is also a valid signed JWT and it is public.
      'authorization', 'Bearer ' || v_key),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000);
end
$fn$;

comment on function app.run_mail_worker() is
  'Invokes the mail-worker Edge Function through pg_net, once per cron tick. '
  'SETUP, once per project, and NOT in any migration because both values are '
  'secrets: '
  'select vault.create_secret(''https://<ref>.supabase.co/functions/v1/mail-worker'', ''mail_worker_url''); '
  'select vault.create_secret(''<service-role key>'', ''mail_worker_key''); '
  'Until both exist this raises a warning and returns, which is a named '
  'condition rather than a swallow: any OTHER failure is left visible.';

revoke all on function app.run_mail_worker() from public, anon, authenticated;

-- Every minute. An invitation that waits an hour to leave the building is a
-- product that looks broken to the person who pressed Send; pgmq's visibility
-- timeout (60s) is the same order, so a tick that overlaps a slow send finds
-- the message still leased rather than sending it twice.
do $$
begin
  if not exists (select 1 from cron.job where jobname = 'mail-worker-minutely') then
    perform cron.schedule('mail-worker-minutely', '* * * * *', 'select app.run_mail_worker()');
  else
    perform cron.alter_job(
      (select jobid from cron.job where jobname = 'mail-worker-minutely'),
      schedule => '* * * * *',
      command  => 'select app.run_mail_worker()');
  end if;
end $$;

-- ═══ 3. LOOKING AT THE QUEUE WITHOUT SPENDING IT ══════════════════════════
--
-- There was no read-only way to ask what is on the queue. The three existing
-- RPCs are `read` (LEASES: hides the message for the visibility timeout and
-- increments `read_ct`), `delete` and `archive` — every one of them changes
-- something.
--
-- That matters more than it sounds. `read_ct` is what the worker compares
-- against MAX_ATTEMPTS before dead-lettering, so USING `mail_outbox_read` TO
-- «JUST CHECK» WALKS A MESSAGE TOWARDS THE ARCHIVE. Five curious looks at a
-- pending invitation and the next worker run throws it away. S1's stop
-- condition was «inspect the queue before draining it», and the only instrument
-- that could do that safely was a direct database connection.
--
-- So: a function that counts and never touches. It returns depths only — no
-- payloads — because a payload carries a respondent's invitation token, and a
-- depth is all a «did the test consume my messages?» question needs.
create or replace function public.mail_outbox_depth()
returns jsonb
language sql
security definer
set search_path = ''
stable
as $fn$
  select jsonb_build_object(
    'queued',   (select count(*) from pgmq.q_mail_outbox),
    'archived', (select count(*) from pgmq.a_mail_outbox),
    -- Leased right now, i.e. a worker is mid-send. Distinguishing this from
    -- «gone» is the difference between a run in flight and a run that finished.
    'invisible',(select count(*) from pgmq.q_mail_outbox where vt > now()),
    -- The highest attempt count on the queue: how close the worst message is to
    -- being dead-lettered, which is the number an operator actually wants.
    'max_read_ct', coalesce((select max(read_ct) from pgmq.q_mail_outbox), 0));
$fn$;

comment on function public.mail_outbox_depth() is
  'Read-only queue depth. Exists because every other mail_outbox RPC mutates: '
  '`read` LEASES and increments read_ct, so using it to inspect the queue walks '
  'messages toward the dead-letter bound. Returns counts only, never payloads — '
  'a payload carries a respondent''s invitation token.';

revoke all on function public.mail_outbox_depth() from public, anon, authenticated;
grant execute on function public.mail_outbox_depth() to service_role;
