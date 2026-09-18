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
