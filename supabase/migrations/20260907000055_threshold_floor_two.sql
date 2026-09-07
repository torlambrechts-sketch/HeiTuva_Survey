-- DECISIONS Q91 — the floor moves from 3 to 2. SUPERSEDES Q17's floor.
--
-- Q17's text is NOT edited. The register's header allows correcting a decision
-- that MISDESCRIBES THE WORLD, and this is not that: Q17 described the product
-- accurately and a product bound is now being changed deliberately. So Q17
-- stands with a pointer forward, and this is a new line.
--
-- ── WHAT 2 ACTUALLY MEANS, BECAUSE THE COPY MUST SAY IT ─────────────────────
--
-- At k=2 a respondent can derive the other respondent's answer EXACTLY: they
-- know their own, they see the aggregate, they subtract. THAT IS DISCLOSURE BY
-- ARITHMETIC, not weakened anonymity, and the difference is the whole reason
-- the warning copy is prescribed rather than left to a writer. At 3 they learn
-- the sum of two others without learning which said which — a real difference
-- in kind, not in degree.
--
-- The honest alternative belongs in the same breath: if seeing individual
-- answers is the point, «Med navn» is the mode that does that WITHOUT a promise
-- it cannot keep.
--
-- ── WHAT DOES NOT CHANGE ────────────────────────────────────────────────────
--
-- * The ceiling stays 10 (Q36).
-- * STATUTORY LOCKS ARE UNTOUCHED. `app.guard_survey_policy` refuses any policy
--   change on a `policy_locked` survey, so 2 is unreachable on psykososial, ARP
--   and trakassering surveys — proven by test rather than asserted here.
-- * The organisation floor (Q90) still binds: 2 is reachable per survey only
--   where the organisation's own default permits it, and `redaktor_may_lower`
--   governs who may go under that default.
-- * Organisation respondents are unaffected — `app.k_for` returns 0 for them.

-- The survey floor -----------------------------------------------------------
alter table public.surveys drop constraint if exists surveys_k_threshold_floor;
alter table public.surveys
  add constraint surveys_k_threshold_floor
  check (k_threshold >= 2 or respondent_kind = 'organisation');

comment on constraint surveys_k_threshold_floor on public.surveys is
  'DECISIONS Q91 (supersedes Q17''s floor of 3): 2 is the lowest threshold for '
  'natural persons. At 2 a respondent can derive the other answer exactly by '
  'subtraction, so the builder states that in those words and offers «Med navn» '
  'as the honest alternative. 1 is not a threshold — it is publication.';

-- The organisation default follows, or 2 would be unreachable ----------------
-- Q90 made the organisation default a floor. If it could not itself be set to
-- 2, then 2 on a survey would ALWAYS require `redaktor_may_lower`, and an
-- organisation that has deliberately chosen 2 would have to keep an exception
-- flag on permanently to use its own setting.
alter table public.organizations drop constraint if exists organizations_default_k_threshold_range;
alter table public.organizations
  add constraint organizations_default_k_threshold_range
  check (default_k_threshold between 2 and 10);

comment on column public.organizations.default_k_threshold is
  'DECISIONS Q17 + Q90 + Q91. A FLOOR, not merely a default, despite the name: '
  'a person survey may not be set below it unless privacy.redaktor_may_lower is '
  'true. Range 2-10 since Q91. It also seeds a new person survey '
  '(app.apply_pack_policy). Renaming the column is deliberately NOT done — a '
  'rename would touch every reader for no behavioural gain.';
