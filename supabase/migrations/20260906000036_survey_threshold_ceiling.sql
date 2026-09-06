-- HeiTuva 0036 — Q36: the survey threshold gets a ceiling, in the database.
--
-- Three numbers disagreed. The policy panel offers 3/4/5/8/10 (the v1 bundle,
-- HeiTuva.dc.html:4855). `organizations.default_k_threshold` has carried a
-- CHECK of 3-10 since 0034. And `setSurveyPolicy` accepted 3-50 — a leftover
-- from before Q17 gave the floor a rule, not a considered ceiling. So a survey
-- could hold a threshold its own organisation's default could not.
--
-- DECISIONS Q36 (Tor, 2026-09-06) settles it at 3-10 and puts the ceiling HERE
-- rather than only in the action. Q17 put the FLOOR in a CHECK precisely so a
-- writer that is not the UI could not go under it; a ceiling that lives in one
-- server action is a rule about one caller, while a CHECK is a rule about the
-- column. The panel is the only writer today, and this is what keeps that true
-- when it is not.
--
-- The bound is a PRODUCT bound, not a security one, and the reasoning is worth
-- keeping: a threshold above the largest group in a typical Norwegian SMB gates
-- every cell to silence, and silence reads as a broken product rather than a
-- strict one. If a real customer ever needs 15, that is a decision to revisit
-- with a number attached — not a wall to breach. The FLOOR is the opposite:
-- three is Q17's promise to respondents and is not negotiable.
--
-- Separate constraint rather than a rewrite of `surveys_k_threshold_floor`
-- (0034), so the floor keeps its name, its own exemption, and its own reason.
-- The floor exempts organisation surveys because `app.k_for` returns 0 for them
-- and the column means nothing there; the ceiling does not, because a column
-- that means nothing should still hold a value the product can produce.
--
-- No existing row moves: the highest threshold in any survey today is 8.
--
-- Proven failing first (scratchpad/redphase-q36.txt): "refuses 11 — one past
-- the ceiling: expected null not to be null", with the three positive controls
-- already green — 10 accepted, 2 refused by Q17's floor, and the organisation
-- default already refusing 11.

ALTER TABLE public.surveys
  ADD CONSTRAINT surveys_k_threshold_ceiling CHECK (k_threshold <= 10);

COMMENT ON CONSTRAINT surveys_k_threshold_ceiling ON public.surveys IS
  'DECISIONS Q36: 3-10, mirroring organizations.default_k_threshold. A product '
  'bound (a threshold above a typical SMB group gates everything to silence), '
  'not a security one — unlike the floor, which is Q17''s promise.';
