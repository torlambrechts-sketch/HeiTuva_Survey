-- HeiTuva 0040 — Q35: the key-question designation is DATA on the pack.
--
-- The v1 bundle classifies the attributed table's columns by regex on the
-- question text (:3536-3538): `/brudd/i` finds the breach question, `/policy/i`
-- the policy question, `shortQ` picks the column heading from four more
-- patterns, and the columns themselves are "the first four yes/no questions".
--
-- Every one of those silently reclassifies the moment someone rephrases a
-- question — and rephrasing is exactly what a customer does with a pack they
-- have adopted. A survey whose breach question is reworded to «Har dere
-- registrert avvik siste 12 måneder?» loses its «Har avdekket brudd» filter
-- with no error and no sign that anything changed.
--
-- DECISIONS Q35 (Tor, 2026-09-06) puts the designation on the pack instead: a
-- `role` on the pack's question entries, carried into `survey_questions.config`
-- when the pack is used. The library's policy line already follows this rule —
-- it reads the pack's real `policy` JSON rather than the bundle's regex on the
-- audience string — so this is the same principle applied to the same table.
--
-- Three roles, and they are a closed set:
--   `brudd`  — the breach question. «Ja» is the negative answer, and the
--              «Har avdekket brudd» filter selects on it.
--   `policy` — the policy question. «Nei» is the negative answer, and the
--              «Mangler policy» filter selects on it.
--   `key`    — shown as a column, with no filter of its own.
--
-- `short` is data for the same reason: `shortQ` is four more regexes, and a
-- column heading that changes because someone edited a question is the same
-- bug in a smaller place.
--
-- This is a pack edit, not a schema change: `template_packs.questions` is
-- jsonb, and `survey_questions.config` already exists. Surveys already created
-- from this pack are NOT rewritten — a survey is a record of what was asked,
-- and reaching back into one to add a classification would change a document
-- someone may already have exported. They keep no roles and render no columns,
-- which is the honest state.

update public.template_packs
   set questions = jsonb_build_array(
     jsonb_build_object(
       'text', 'Har virksomheten en policy for menneskerettigheter og anstendige arbeidsforhold?',
       'type', 'yesno', 'role', 'policy', 'short', 'Policy'),
     jsonb_build_object(
       'text', 'Gjennomfører dere egne aktsomhetsvurderinger av deres leverandørkjede?',
       'type', 'yesno', 'role', 'key', 'short', 'Egen vurdering'),
     jsonb_build_object(
       'text', 'Hvor mange ledd bakover i kjeden har dere oversikt over?',
       'type', 'choice',
       'options', jsonb_build_array('Ingen', 'Ett ledd', 'To ledd', 'Tre eller flere')),
     jsonb_build_object(
       'text', 'Har dere avdekket brudd eller risiko siste 12 måneder?',
       'type', 'yesno', 'role', 'brudd', 'short', 'Brudd/risiko'),
     jsonb_build_object(
       'text', 'Har dere en varslingskanal som er åpen for arbeidere i kjeden?',
       'type', 'yesno', 'role', 'key', 'short', 'Varslingskanal'),
     jsonb_build_object(
       'text', 'Beskriv tiltakene dere har iverksatt', 'type', 'text')
   )
 where org_id is null and key = 'leverandor-apenhetsloven';

-- Two of the six carry no role, deliberately. The «ledd bakover» choice and the
-- free-text «Beskriv tiltakene» are read in the expanded detail grid, not in
-- the row — four columns is what the design draws and what fits, and a role on
-- everything would make the designation meaningless.
