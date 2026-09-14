-- M:0120 — METHOD RULES: v6's methodology check, as DATA rather than as code.
--
-- v6 introduces a «Metodikk» check over a survey's questions (sd.tabLint,
-- v6:1413; bLint, v6:1049). Eleven rules, and the bundle draws five of them as
-- severity «Blokkert» gating a publish (`goSendBlocked = !lint.canPublish`,
-- v6:9857).
--
-- ── Q178: LINT ADVISES, LINT DOES NOT BLOCK ────────────────────────────────
--
-- Tor: «a tool that refuses to send what it just let you build, with no
-- override, turns a methodological opinion into a technical bar.» So there is
-- no `blokkert` severity in this table and no publish gate anywhere — the CHECK
-- below admits two values and «blokkert» is not one of them, which makes the
-- decision structural rather than remembered.
--
-- Q179: the four types the bundle blocks — matrix, slider, ranking, dropdown —
-- STAY FIRST-CLASS. They remain in `app.question_type`, in the registry, and
-- sendable. A rule here can only ever advise about one.
--
-- ── Q180: A LINT THAT WARNS AGAINST A LOVPÅLAGT TEMPLATE IS A LINT THAT IS
-- WRONG ─────────────────────────────────────────────────────────────────────
--
-- The sensitive-position rule fires on a question about varsling, trakassering
-- or helse appearing first. In a statutory pack the question ORDER is part of
-- what makes it statutory, so `sensitive_position` carries
-- `exempt_policy_locked` and the evaluator skips it when `surveys.policy_locked`
-- is true. The exemption is in the ROW, not in the evaluator's head.
--
-- ── Q181/Q182: NO EMPIRICAL FIGURE SHIPS ───────────────────────────────────
--
-- The bundle's `why` strings carry «69 % høyere andel ubesvarte», «OR 1,77»,
-- «kvalitetskoeffisient 0,74–0,89 mot 0,18–0,51», «~30 px», «omtrent doblet
-- frafall» and a prediction of «10–15 prosentpoeng». Every one is a claim about
-- the world with a figure a customer could check, and nothing in this repository
-- sources any of them. Each rule below states the property WITHOUT the number:
-- «Matriser gir flere ubesvarte spørsmål på mobil» is true enough to be useful
-- and defensible enough to keep; «69 %» is neither.
--
-- ── WHO WRITES THIS TABLE? NOTHING IN THE APP DOES. ────────────────────────
--
-- Asked and answered here rather than discovered later (CLAUDE.md invariant 8).
-- These rows are SEEDED — this migration is the only writer, exactly as
-- `quality_rules`, `task_kinds` and `use_cases` are seeded. There is no editor,
-- no server action and no UI that inserts one; retuning a rule is a migration.
-- If a later phase wants an org to mute a rule, that phase adds the column AND
-- the action AND the test in the same commit.

create table public.method_rules (
  key         text primary key,
  -- «blokkert» is deliberately absent. Q178.
  severity    text not null check (severity in ('advarsel', 'forslag')),
  -- Selects the evaluator in lib/questions/method.ts. An unknown kind is
  -- SKIPPED rather than thrown, so a future migration may add one that older
  -- deploys ignore — the same contract `quality_rules` has.
  kind        text not null,
  config      jsonb not null default '{}'::jsonb,
  title       text not null,
  why         text not null,
  fix         text not null,
  sort_order  int  not null default 1000
);

alter table public.method_rules enable row level security;

-- Same visibility as `quality_rules`: a shipped registry every signed-in user
-- reads and nobody writes. Anon does not read it — a methodology rule is not
-- respondent-facing, and `/s/[token]` has no use for one.
create policy method_rules_sel on public.method_rules for select
  using ((select auth.role()) = 'authenticated');

revoke all on table public.method_rules from public, anon;
grant select on table public.method_rules to authenticated;

insert into public.method_rules (key, severity, kind, config, title, why, fix, sort_order) values
  ('matrix_mobile', 'advarsel', 'type_in', '{"types":["matrix"]}',
   'Matrise er krevende på mobil',
   'Rutenett gir flere ubesvarte spørsmål og mer rett-nedover-svaring.',
   'Del opp i ett spørsmål per skjerm', 10),

  ('slider_precision', 'advarsel', 'type_in', '{"types":["slider"]}',
   'Glidebryter måler upresist',
   'Der respondenten drar mot en startverdi blir målefeilen større, særlig på mobil.',
   'Vurder en skala med faste punkter', 20),

  ('ranking_drag', 'advarsel', 'type_in', '{"types":["ranking"]}',
   'Rangering krever dra-og-slipp',
   'Dra-og-slipp er krevende på mobil, og WCAG krever et alternativ uten dra.',
   'Tilby rangering uten dra', 30),

  ('dropdown_answer', 'advarsel', 'type_in', '{"types":["dropdown"]}',
   'Nedtrekksliste som svaralternativ',
   'En liste som må åpnes gir flere ubesvarte spørsmål enn synlige alternativer.',
   'Vurder radioknapper', 40),

  ('enps_one_row', 'forslag', 'type_in', '{"types":["enps"]}',
   'Skala 0–10 på én rad',
   'Mange punkter ved siden av hverandre gir små trykkflater på liten skjerm.',
   'Vis skalaen over to rader', 50),

  ('agree_disagree', 'advarsel', 'text_regex',
   '{"pattern":"(?<![\\p{L}\\d])(enig|uenig)(?![\\p{L}\\d])|i hvilken grad er du enig"}',
   'Enig/uenig-formulering',
   'Itemspesifikke skalaer måler mer presist enn enig/uenig.',
   'Skriv om til en skala som passer spørsmålet', 60),

  ('double_barrelled', 'advarsel', 'text_regex_min_words',
   '{"pattern":"(?<![\\p{L}\\d])(og|eller)(?![\\p{L}\\d])","min_words":7}',
   'Kan være to spørsmål i ett',
   '«og»/«eller» i spørsmålsteksten gjør svaret vanskelig å tolke.',
   'Del i to spørsmål', 70),

  ('vague_frequency', 'advarsel', 'text_regex',
   '{"pattern":"(?<![\\p{L}\\d])(ofte|nylig|vanligvis)(?![\\p{L}\\d])|av og til"}',
   'Vag mengdeangivelse',
   '«ofte» og «nylig» betyr ulike ting for ulike folk.',
   'Bytt til et konkret tidsrom', 80),

  ('sensitive_early', 'advarsel', 'sensitive_position',
   '{"max_position":2,"pattern":"varsl|trakasser|mobb|helse|lønn","exempt_policy_locked":true}',
   'Sensitivt spørsmål tidlig i rekkefølgen',
   'Sensitive spørsmål helt først kan gjøre at flere avbryter.',
   'Flytt det lenger ut i rekkefølgen', 90),

  ('scale_endpoints_only', 'forslag', 'scale_unlabelled', '{}',
   'Bare endepunktene er merket',
   'Merkede skalapunkter gir mer sammenlignbare svar mellom runder.',
   'Merk alle punktene', 100),

  ('text_no_followup', 'forslag', 'text_no_followup', '{}',
   'Frisvaret kan få oppfølging',
   'En oppfølging kan heve kvaliteten på korte frisvar, og kan alltid hoppes over.',
   'Slå på oppfølging for dette spørsmålet', 110);

comment on table public.method_rules is
  'v6 Metodikk. ADVISORY ONLY (Q178) — there is no blokkert severity and no publish gate. Seeded; this migration is the only writer.';
