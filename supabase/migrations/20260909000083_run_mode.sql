-- V2-9 — `surveys.run_mode`, the switch the «Kjør live» button reads.
--
-- The bundle keeps the mode in component state (`st.runMode`, V2:6130-6131) and
-- derives `isLiveMode`, `isQuizMode` and `isStandardMode` from it. The context
-- bar's «Kjør live» button (V2:231) renders only when `isLiveMode`.
--
-- TWO VALUES, NOT THREE. `quiz` is deliberately absent from the CHECK even
-- though the bundle's `runMode` carries it, because V2-10 builds quiz and
-- nothing behind that value exists yet: `quiz_attempts` is not a table, the
-- answer key is not a column, and Q83–Q85 are unanswered. Admitting the value
-- now would let a survey be switched into a mode with nothing behind it, which
-- is a switch whose feature does not exist — the thing Q26, Q74 and
-- `mgPopulationsUnavailable` all refuse to ship.
--
-- **This deliberately differs from Q100's precedent** and the difference is
-- worth naming rather than being read as an inconsistency. Q100 kept
-- `avmelding` in `suppressions.source`'s CHECK with no writer, because that
-- value describes how a row GOT there — a fact about provenance that a later
-- endpoint would record. `run_mode = 'quiz'` is not a record of anything; it is
-- a capability claim about the survey, read by the UI to offer a button. A
-- value nothing writes is harmless; a value the UI would act on is not.
-- V2-10 widens the CHECK in the migration that builds the thing.
alter table public.surveys
  add column run_mode text not null default 'standard'
    check (run_mode in ('standard','live'));

comment on column public.surveys.run_mode is
  'V2-9. `live` makes the «Kjør live» button appear on the survey context bar. '
  'Only a survey that could run live may carry it — app.guard_run_mode_anonymous '
  'refuses `live` on a named survey, for the same reason live_sessions does: a '
  'token minted to a device of unknown identity cannot produce a named response.';

-- The same rule as `app.guard_live_is_anonymous`, one step earlier. Without it
-- a named survey could be switched to live mode, show the button, and only fail
-- when the presenter pressed it — a refusal at the last possible moment, which
-- is how a user learns a rule by being stopped rather than by being told.
create or replace function app.guard_run_mode_anonymous()
returns trigger language plpgsql as $$
begin
  if new.run_mode = 'live' and new.anonymity is distinct from 'anonymous' then
    raise exception 'live_requires_anonymous'
      using hint = 'Live runs only on an anonymous survey: the QR mints a token '
                   'for a device nobody can identify. Change the anonymity first.',
            errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger surveys_run_mode_anonymous
  before insert or update of run_mode, anonymity on public.surveys
  for each row execute function app.guard_run_mode_anonymous();
