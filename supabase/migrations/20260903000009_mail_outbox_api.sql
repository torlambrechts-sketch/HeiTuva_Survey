-- HeiTuva 0009 — a PostgREST door onto the mail queue, exactly three verbs wide.
--
-- pgmq lives in its own schema and PostgREST only serves `public`, so the mail
-- worker had no way to reach the queue except a direct Postgres connection —
-- which the deploy target does not have. Supabase's own `pgmq_public` wrapper
-- is not installed on this project.
--
-- Rather than exposing the pgmq schema (which would also hand out create,
-- drop, purge and every other queue), these three functions are the whole API:
-- lease a batch, delete one, archive one. They are SECURITY DEFINER because the
-- caller has no rights in the pgmq schema, and granted ONLY to service_role —
-- the worker runs server-side with the service key, and no browser session can
-- reach them. `anon` and `authenticated` are revoked explicitly; the raw
-- invitation tokens live in these messages.

create or replace function public.mail_outbox_read(p_batch int default 10, p_visibility int default 60)
returns table (msg_id bigint, read_ct int, message jsonb)
language sql volatile security definer set search_path = public as $$
  select m.msg_id, m.read_ct, m.message
  from pgmq.read('mail_outbox', p_visibility, p_batch) m
$$;

create or replace function public.mail_outbox_delete(p_msg_id bigint)
returns boolean
language sql volatile security definer set search_path = public as $$
  select pgmq.delete('mail_outbox', p_msg_id)
$$;

/** Archive rather than delete: a message that could not be delivered is
 *  evidence, and pgmq keeps archived rows readable. */
create or replace function public.mail_outbox_archive(p_msg_id bigint)
returns boolean
language sql volatile security definer set search_path = public as $$
  select pgmq.archive('mail_outbox', p_msg_id)
$$;

revoke all on function public.mail_outbox_read(int, int) from public, anon, authenticated;
revoke all on function public.mail_outbox_delete(bigint) from public, anon, authenticated;
revoke all on function public.mail_outbox_archive(bigint) from public, anon, authenticated;
grant execute on function public.mail_outbox_read(int, int) to service_role;
grant execute on function public.mail_outbox_delete(bigint) to service_role;
grant execute on function public.mail_outbox_archive(bigint) to service_role;
