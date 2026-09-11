-- DROP `live_sessions.step` — Tor's decision, 2026-09-10, after D136.
--
-- The column was the sixth «who writes this column» instance, and the answer
-- turned out to be that no honest writer could exist. `step` rendered as the
-- label above the live stage and the demo seed filled it with «Spørsmål 2 av 2»
-- — but the stage shows `firstScale?.text`, the FIRST scale question, chosen on
-- the server, and no control anywhere moves between questions. A live session
-- cannot be on question 2 of 2.
--
-- **THIS IS WORSE THAN THE CASE Q61 REFUSES.** Q61 says do not duplicate what
-- can be derived; `step` stored something that DOES NOT EXIST. A derived value
-- kept in two places can at least disagree about something real.
--
-- Presenter navigation is a feature to be decided on its own terms, not a thing
-- a waiting column argues for. **If it is ever built, the column comes back
-- with it** — and it comes back with a writer in the same migration, which is
-- what the standing question asks for and what this column never had.
--
-- Safe to drop rather than deprecate, VERIFIED AGAINST THE CATALOGUE BEFORE
-- THIS RAN rather than asserted: 0 policies, 0 constraints, 0 views and 0 rows
-- with a non-null value. `select` on it lived in exactly one page and one
-- component, both changed in this commit.
--
-- The sweep returned ONE function match — `public.close_live_session` — and it
-- is the phrase «one step down» in a comment, not a reference. Recorded because
-- the count alone said «one dependency» and reading it said «none»: a match is
-- not a finding until the line is read, the same way a negative from a probe
-- written from memory is not evidence of absence.

alter table public.live_sessions drop column if exists step;

comment on table public.live_sessions is
  'A live presentation of one round. `step` was dropped 2026-09-10 (DEVIATIONS '
  'D136): it labelled a position between questions that the product has no way '
  'to be in, since the stage always shows the first scale question and no '
  'presenter navigation exists. If navigation is built, step returns WITH its '
  'writer in the same migration.';
