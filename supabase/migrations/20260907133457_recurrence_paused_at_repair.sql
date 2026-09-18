-- REPAIR, 2026-09-07. Migration 0044's first two statements were dropped when
-- it was applied to prod through the MCP: the header was stripped with a
-- hard-coded line offset instead of a comment-detecting scan, cutting off
-- `paused_at` and its comment. Nothing failed at apply time, because every
-- later reference to the column lives inside a plpgsql body and PostgreSQL does
-- not resolve those at creation. It was found by a schema fingerprint against
-- local: public.schedules had 15 columns there and 14 here.
alter table public.schedules
  add column if not exists paused_at timestamptz;

comment on column public.schedules.paused_at is
  'DECISIONS Q22. Non-null = the series is paused: the scheduler skips it, and '
  'the OPEN ROUND STAYS OPEN — pausing a series is not closing the round '
  'someone is answering. Clearing it recomputes next_run_at (trigger below). '
  'Stopping is active = false, which the UI does not undo.';
