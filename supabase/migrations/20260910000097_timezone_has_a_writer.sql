-- Q50 — `organizations.timezone` NOW HAS A WRITER, so the column says so.
--
-- The column has existed since `M:0051`: `not null`, defaulting to Europe/Oslo,
-- validated against `pg_timezone_names` by the `organizations_timezone`
-- trigger, and read by all three scheduling sites. `M:0091` appended the
-- standing question's answer — NOTHING — because at that point nothing set it.
--
-- **THIS IS THE FIFTH INSTANCE OF THE STANDING QUESTION, AND THE FOURTH WHERE
-- THE COLUMN EXISTED AND WAS READ.** That is the whole reason CLAUDE.md asks
-- «who WRITES it» rather than «is it there»: a column read by three functions,
-- constrained by a trigger and defaulted sensibly looks finished from every
-- angle except a customer's. A Finnish or Icelandic organisation could not say
-- what clock its sends run on, and its «09:00» pulse left at 09:00 Oslo — the
-- exact seasonal, intermittent-looking defect `M:0051` was written to remove,
-- surviving inside the fix for it.
--
-- The writer is `saveCompany` in `app/(app)/administrasjon/actions.ts`: the
-- action that already owns Firmaopplysninger, gated by `requireAdmin()`. A
-- SEPARATE action was deliberately not added — a second write path to one
-- column is a second place for the authorisation to be wrong.
--
-- Comment only. No schema change: the column, its default and its trigger were
-- right all along; only the sentence about who fills it was true and is now not.

comment on column public.organizations.timezone is
  'Q50: the clock a scheduled send runs on. An IANA zone name, never an offset — '
  'an offset is right for half the year, which is the intermittent behaviour this '
  'column exists to remove. Defaults to Europe/Oslo: Oslo, Stockholm and '
  'Copenhagen share an offset all year, so one column is exact for most Nordic '
  'customers and at most an hour out for a Finnish office, against the two-hour '
  'seasonally-varying error it replaces. '
  'WHO WRITES IT: saveCompany(), the Firmaopplysninger action in '
  'app/(app)/administrasjon/actions.ts, administrator-only via requireAdmin(). '
  'The form offers a select of common Nordic zones that ALWAYS includes the '
  'row''s current value, so a zone set by any other route is never silently '
  'narrowed away by opening the form.';
