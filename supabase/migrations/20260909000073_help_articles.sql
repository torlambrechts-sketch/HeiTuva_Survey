-- V2-6 — help articles. DECISIONS **Q74** and **Q75**, both **DEFAULTED, not
-- answered**; the Gate 6 report names them, which is where Tor reviews them.
--
-- Q75 DEFAULT TAKEN: **a `help_articles` registry with a jsonb body plus
-- translations**, rather than `ui_messages`. The reason the default is the right
-- one and not merely the safe one: an article is a DOCUMENT — a lead, ordered
-- steps, a mock, a caption, related links — and `ui_messages` is a flat
-- key/value store whose whole shape is «one string per key». Twelve articles in
-- it would be roughly two hundred keys with the structure encoded in their
-- names, which is a schema written in a naming convention.
--
-- Q74 DEFAULT TAKEN: **the forum is not built.** `helpForum` (V2:2077) and its
-- `forumStats` render nothing here. The tab is not drawn as «coming later»
-- either — Q26's stream panel is the precedent: the absence is left visible
-- rather than answered with something else.
--
-- ── DATA-NOT-CODE, AND WHAT THAT COSTS HERE ────────────────────────────────
--
-- CLAUDE.md: «Adding a pack/duty/language is a migration or a row, not a
-- component.» So the body is a `jsonb` document with a declared shape, the
-- category is a key that resolves through i18n, and **no Norwegian is stored on
-- the row itself** — the same rule `tasks.law_ref` enforced in V2-5, where the
-- FK refused my prose.
--
-- The translation table carries the language-specific document. A thirteenth
-- article is a row; a third language is a row per article.

create table public.help_articles (
  slug           text primary key,
  category_key   text not null,
  read_minutes   int  not null check (read_minutes between 1 and 60),
  tint           text not null check (tint ~ '^#[0-9A-Fa-f]{6}$'),
  sort_order     int  not null,
  related_slugs  text[] not null default '{}'
);

comment on table public.help_articles is
  'Q75: the help-article registry. Carries NO prose — the language-specific '
  'document lives in help_article_translations. A row has no org id, no survey '
  'id and no count, which is the claim 5a3''s allowlist makes and '
  'tests/db/help.test.ts checks rather than repeats.';

create table public.help_article_translations (
  slug  text not null references public.help_articles(slug) on delete cascade,
  lang  text not null check (lang in ('no','en')),
  title text not null,
  lead  text not null,
  -- { steps: [{head, body}], mock: {title, screen, rows: [{label, meta, tint}], caption} }
  body  jsonb not null,
  primary key (slug, lang)
);

comment on table public.help_article_translations is
  'The document, per language. `body` holds the ordered steps and the illustrative '
  'mock exactly as the bundle draws them (V2:1960-2019); the shape is declared in '
  'the column comment above rather than in a component.';

alter table public.help_articles enable row level security;
alter table public.help_article_translations enable row level security;

-- Public by design, like `use_cases`, `brand_accents`, `segment_fields` and
-- `task_kinds`: the help centre is read before a session exists on the splash's
-- support links, and an article carries nothing about anyone. **Read only.**
-- There is deliberately no INSERT, UPDATE or DELETE policy: a client that could
-- write help text could write anything into a surface users trust.
create policy help_sel on public.help_articles for select using (true);
create policy help_tr_sel on public.help_article_translations for select using (true);

-- ── The twelve, seeded from the bundle rather than transcribed ─────────────
-- `scripts/seed-help.ts` reads `HELP_ARTICLES` out of
-- `design-reference-v2/.../HeiTuva.dc.html` and writes these rows, so the copy
-- cannot drift from the drawing by a typo. **Two sentences are corrected on
-- their way through** — see D114 and the script's own note.

-- ── AN ARTICLE MAY DESCRIBE A FEATURE BEHIND A DISABLED FLAG ───────────────
--
-- Three of the twelve subjects are `feature_flags` rows that are OFF:
-- `entra_sync`, `google_sync`, `hr_sync`. A help article explaining how to use
-- a feature that does not exist **claims a capability the product does not
-- have** — D73's rule, and CLAUDE.md's «never fabricate data in the UI» applied
-- to prose rather than to a number.
--
-- Deleting the article would be worse: the reader then cannot tell «not
-- documented» from «not built», and the bundle drew it. So the article ships
-- and SAYS SO, which is `admin.mgPopulationsUnavailable`'s precedent inside
-- this codebase — «Populasjoner … er ikke bygget ennå» — and Q26's, where the
-- absence is left visible rather than answered with something else.
-- A plain column, not a foreign key: `feature_flags` is unique on
-- `(key, org_id)` with a NULL org for the global row, so `references
-- feature_flags(key)` has nothing to point at. `tests/db/help.test.ts` asserts
-- every non-null value resolves to a global flag — the same «checked rather
-- than trusted» treatment `task_kinds` got, and for the same reason: a value
-- naming a flag that does not exist would render as «built» for ever.
alter table public.help_articles add column requires_flag text;

comment on column public.help_articles.requires_flag is
  'When set and the flag is disabled, the article renders with an explicit '
  '«not built yet» line rather than being hidden. A reader must be able to tell '
  'undocumented from unbuilt.';
