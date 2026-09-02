-- HeiTuva 0010 — ops extensions and scheduled retention
--
-- pg_cron and pgmq are enabled here so the ops setup is versioned with the
-- schema rather than clicked in the dashboard. On Supabase both extensions are
-- allow-listed and installable from SQL; if a hosted project rejects these,
-- enable pg_cron and pgmq under Database -> Extensions and re-run.

create extension if not exists pg_cron;
create extension if not exists pgmq;

-- Nightly retention sweep. app.apply_retention() is defined in 0007.
-- cron.schedule is idempotent on job name: re-running replaces the schedule.
do $$
begin
  if not exists (select 1 from cron.job where jobname = 'retention-daily') then
    perform cron.schedule('retention-daily', '0 3 * * *', 'select app.apply_retention()');
  else
    perform cron.alter_job(
      (select jobid from cron.job where jobname = 'retention-daily'),
      schedule  => '0 3 * * *',
      command   => 'select app.apply_retention()');
  end if;
end $$;
