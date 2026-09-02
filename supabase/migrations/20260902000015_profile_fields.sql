-- HeiTuva 0015 — profile fields the Profil screen actually needs
--
-- Two gaps found while building the screen against the design
-- (HeiTuva.dc.html:1294-1370, profileFields/profileNotify at :3335-3349):
--
-- 1. The design's "Om meg" has four fields — Navn, Jobb-e-post, Stilling,
--    Mobil. `profiles` had nowhere to put Stilling.
--
-- 2. `notify` was seeded in 0002 with keys new_responses/low_score/deadline/
--    digest, but the design's four toggles are a different set: weekly digest,
--    low RESPONSE RATE (not low score), new FREE TEXT (not new responses), and
--    "when someone shares with me" (which had no key at all, while `deadline`
--    has no toggle). Left as-is the screen would have written keys nothing
--    reads and shown toggles backed by nothing.
--
-- Jobb-e-post stays on org_members.email and is rendered read-only: changing a
-- sign-in address is an auth flow with its own confirmation step, not a
-- free-text field.

alter table public.profiles add column if not exists job_title text;

alter table public.profiles alter column notify set default jsonb_build_object(
  'digest',       true,   -- Ukentlig sammendrag
  'low_response', true,   -- Varsle ved lav svarprosent
  'new_text',     true,   -- Varsle ved nye frisvar
  'shared',       true    -- Når noen deler med meg
);

-- Re-shape rows created under the old default, preserving any value the user
-- had already set where a key maps across.
update public.profiles set notify = jsonb_build_object(
  'digest',       coalesce(notify->'digest', 'true'::jsonb),
  'low_response', coalesce(notify->'low_response', notify->'low_score', 'true'::jsonb),
  'new_text',     coalesce(notify->'new_text', notify->'new_responses', 'true'::jsonb),
  'shared',       coalesce(notify->'shared', 'true'::jsonb)
)
where not (notify ?& array['digest','low_response','new_text','shared']);
