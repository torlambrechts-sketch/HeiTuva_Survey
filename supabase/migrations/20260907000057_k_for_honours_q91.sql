-- V2-3 prerequisite · DECISIONS Q91, WHICH V2-2 DECIDED AND DID NOT IMPLEMENT.
--
-- ── WHAT WAS WRONG ──────────────────────────────────────────────────────────
--
-- `M:0055` moved the person floor 3 → 2 in `surveys_k_threshold_floor`. It did
-- not touch `app.k_for`, which has carried `greatest(s.k_threshold, 3)` since
-- `M:0032` — and `app.k_for` IS the gate: every aggregate path routes through
-- it (CLAUDE.md invariant 1). Measured on the local database before this
-- migration:
--
--     select min(app.k_for(s.id)) from public.surveys s
--      where s.respondent_kind = 'person';                      -->  3
--     select count(*) from public.surveys s where app.k_for(s.id) = 2;  -->  0
--
-- So a threshold of 2 was writable, audited, and warned about in copy the
-- decision prescribed word for word — and the database ignored it. **The
-- direction is safe: the gate was STRICTER than the setting, so nothing was
-- disclosed.** What was broken is the promise. The respondent was told «den
-- andre som svarer kan regne seg fram til hva du svarte» about a disclosure the
-- database was preventing, and two shipped screens disagreed about the same
-- number: Bygg rendered «2» from the chosen column, Send rendered «3» from a
-- TypeScript mirror of this clamp.
--
-- V2-2's entire subject was copy that matches behaviour. It shipped copy that
-- does not.
--
-- ── WHY THE FLOOR LEAVES THIS FUNCTION ENTIRELY ─────────────────────────────
--
-- Not `greatest(s.k_threshold, 2)`. That is the same defect with a fresher
-- number, and it is what would go stale the next time a floor moves.
--
-- `surveys_k_threshold_floor` already guarantees `k_threshold >= 2` for every
-- person survey, and a CHECK binds every writer including the service role. A
-- clamp here is therefore a SECOND COPY of a bound the database already holds —
-- exactly what `lib/questions/threshold-tier.ts` was created to end on the
-- application side, applied now to the gate. One floor, in the CHECK, and the
-- sweep asserts this function carries none (`threshold-readers.ts § 2c`).
--
-- The organisation branch is untouched. Its 0 is not a floor: it is the
-- existence value that says NO THRESHOLD APPLIES (Q17/Q47), decided by
-- `respondent_kind` rather than by a number.
--
-- ── HOW IT WENT UNSEEN, WHICH IS THE PART WORTH KEEPING ─────────────────────
--
-- `verify:thresholds` was written one day earlier to police this exact
-- constant, and reported «one boundary, asked by every surface, and it agrees
-- with the database» with all five stale sites in the tree. Its § 2 matched a
-- comparison (`k < 5`) and `Math.max(k, 3)` has no comparison operator. A
-- property expressed as one syntax is a syntax list, not a property — clamping
-- and comparing are the same act written two ways. § 2 now matches both shapes
-- and § 2c reads this function's body out of `pg_proc`.

create or replace function app.k_for(p_survey uuid) returns int
language sql stable security definer set search_path = public as $$
  select case when s.respondent_kind = 'organisation' then 0
              else s.k_threshold end
  from public.surveys s where s.id = p_survey
$$;

comment on function app.k_for(uuid) is
  'DECISIONS Q17 + Q47 + Q91. The gate every aggregate path routes through. '
  'Returns 0 for an organisation survey — no threshold applies, because an '
  'organisation is not a natural person — and otherwise the survey''s own '
  'k_threshold, WITH NO FLOOR OF ITS OWN. The floor lives in '
  'surveys_k_threshold_floor and nowhere else: this function carried Q17''s 3 '
  'for a full phase after Q91 moved it to 2, so a customer could set 2, be '
  'warned about 2 in prescribed copy, and be gated at 3. '
  'scripts/verify/threshold-readers.ts § 2c fails the build if a floor returns '
  'here.';
