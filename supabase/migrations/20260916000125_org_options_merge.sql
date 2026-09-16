-- G2, fix pass — A PARTIAL WRITE TO `options` IS AN UPDATE OF THE KEYS IT NAMES.
--
-- ══ WHAT FAILED, AND WHY IT IS THE FAMILY THIS FILE KEEPS REDISCOVERING ════
--
-- `M:0124` added `app.guard_mode_still_in_use`, a rule over `organizations.options`
-- scoped `of options`. `verify:roundtrip` then failed on **the SSO case** —
-- `options.sso (break-glass honoured)` — which has nothing to do with run modes.
--
-- The gate writes the whole column: `update organizations set options = '{"sso":true}'`.
-- That is a legitimate SQL statement and it DROPS the other eight keys. The
-- reader treats an absent key as OFF, so from the guard's point of view the
-- write disallowed `live` and `quiz` — and the organisation had surveys in both,
-- so the guard refused a write about SSO.
--
-- **The guard was right and the shape was wrong.** This is the referential-
-- maintenance family with the roles swapped: not a rule over a column something
-- else changes, but a rule over a column that can be written WHOLE when every
-- caller means to write a PART. The same statement is how `tests/invariants`
-- had been quietly resetting the column for phases — harmless while `options`
-- had one meaningful key, and a way to turn four features off the moment
-- `M:0124` gave four of them meaning.
--
-- ══ FIXING THE COLUMN, NOT THE CALLERS ════════════════════════════════════
--
-- The alternative was to make every caller spread. That is an enumeration —
-- correct about the callers that exist and silent about the next one — and
-- CLAUDE.md is explicit: prefer the shape where the wrong thing cannot be
-- EXPRESSED over the shape where it is merely not done.
--
-- So the column merges. `old.options || new.options` keeps every key the write
-- did not mention and lets the write win for every key it did, which is what
-- `setOption` already does in TypeScript and what every caller means. A key can
-- no longer be lost by a statement that was not about it.
--
-- ══ THE NAME IS LOAD-BEARING ══════════════════════════════════════════════
--
-- Postgres fires BEFORE triggers in NAME ORDER, and both existing guards read
-- `new.options`: `organizations_guard_sso` reads `->>'sso'` and
-- `organizations_mode_in_use` reads `->>'live'` and `->>'quiz'`. Either would
-- see the un-merged object if it ran first — the SSO guard would read a dropped
-- key as «turning it off», which is always allowed, so a partial write could
-- have bypassed the break-glass rule entirely.
--
-- `organizations_aa_merge_options` sorts before both. The `aa` is not decoration
-- and it is not a preference; it is the execution order, and it is written here
-- because a rename would silently reorder two security guards.

create or replace function app.merge_org_options()
returns trigger
language plpgsql set search_path = public as $fn$
begin
  if new.options is null then
    new.options := old.options;
  else
    new.options := coalesce(old.options, '{}'::jsonb) || new.options;
  end if;
  return new;
end $fn$;

comment on function app.merge_org_options() is
  'G2 fix pass. `organizations.options` is written a KEY at a time by every caller and a '
  'WHOLE OBJECT by some of them; this makes the two the same thing. Must run before '
  'app.guard_sso_break_glass and app.guard_mode_still_in_use, both of which read '
  'new.options — hence the `aa` in the trigger name, which is execution order rather than '
  'style.';

drop trigger if exists organizations_aa_merge_options on public.organizations;
create trigger organizations_aa_merge_options
  before update of options on public.organizations
  for each row execute function app.merge_org_options();
