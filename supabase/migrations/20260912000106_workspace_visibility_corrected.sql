-- Q128 — the visibility condition is corrected, and it moves BOTH ways.
--
-- M:0105 hid `quiz` under a condition Tor wrote as «the option returns when the
-- nps AND quiz Oversikt cards exist». Measured while building the quiz card:
-- THE QUIZ WORKSPACE DOES NOT SHOW nps AT ALL. Its module set is
-- {quiz, activity}; `nps` belongs to `cx`, whose set is {nps, activity, action}.
-- The pair came from W3's sentence about two MODULES and was read as two
-- preconditions for ONE workspace — an enumeration mistaken for a property, in
-- a condition rather than in a specification.
--
-- TOR'S CORRECTION (2026-09-12), in his words: «The condition was mine and it
-- contained an enumeration. New condition, one workspace and one card: the quiz
-- option returns when the quiz module has a card.»
--
-- SO THE RULE IS NOW A PROPERTY, AND IT IS THE SAME SENTENCE FOR EVERY ROW:
--
--     a workspace is selectable when every module it switches on has a card.
--
-- Stated that way it decides both rows at once, which is what a property does
-- and what the old pairing could not:
--
--   quiz -> VISIBLE. Its set is {quiz, activity} and both now render (the quiz
--     card is V4:333-360, built in this same session). Condition satisfied.
--
--   cx   -> HIDDEN. Its set is {nps, activity, action} and the nps card does
--     not render. Q126 refused it on two grounds, and the second does not
--     expire: «Kritikere uten svar» needs one person's score joined to their
--     verbatim joined to a reply channel — n=1 per row, which the k-gate
--     refuses BY DESIGN; `invitation_id` is NULL on an anonymous round so there
--     is no person to reply to; and joining `survey_comments` to that
--     respondent's answer re-links answer to person, which Q113 refused.
--
-- CX IS THEREFORE HIDDEN INDEFINITELY, AND THAT IS THE ANSWER RATHER THAN AN
-- AWKWARDNESS. Tor: «a workspace promising customer experience and rendering
-- one card is the same false claim Quiz was.» Its reversal condition is the
-- same sentence as everyone else's — when the nps card exists — and the honest
-- reading is that it will not, in the form v4 draws.
--
-- WHAT IS NOT DONE HERE, DELIBERATELY: the rule is not moved into a trigger or
-- a generated column. `visible` stays a plain flag that a migration sets,
-- because the other half of the predicate — «has a card» — is a fact about the
-- RENDERER and not about the database, and a database rule that cannot see its
-- own right-hand side would be a guard in name only. The pairing is enforced
-- where both halves are visible at once: `tests/db/quiz-visibility.test.ts`
-- reads `workspace_module_links` and greps the screen, and fails if either row
-- stops matching the property.
update public.workspaces set visible = true  where key = 'quiz';
update public.workspaces set visible = false where key = 'cx';

comment on column public.workspaces.visible is
  'Q125/Q128: may a person CHOOSE this workspace? THE RULE IS A PROPERTY — a '
  'workspace is selectable when every module it switches on has an Oversikt '
  'card — and it is enforced in tests/db/quiz-visibility.test.ts, which can see '
  'both halves; the database can only see one. Hiding governs the PICKER, never '
  'the resolution: an organisation whose organizations.workspace already names '
  'a hidden row keeps rendering it, because silently reassigning a customer''s '
  'workspace to repair a shop-window problem is a larger change than the one '
  'being made.';
