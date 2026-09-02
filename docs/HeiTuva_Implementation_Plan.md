# HeiTuva — Implementation Plan
**From Claude Design handoff → production app on Vercel + GitHub + Supabase**
Version 0.1 (draft — contains open decision points marked ⚠️ DECIDE)

---

## 1. What the design contains (inventory)

Source: `heituva-survey-app-design/project/HeiTuva.dc.html` (app, 4,097 lines) + `HeiTuva Splash.dc.html` (marketing page).

### Screens
| # | Screen | Route (proposed) | Contents |
|---|--------|------------------|----------|
| 0 | Splash | `/` (marketing) | Landing, pricing, "Kom i gang", "Logg inn" |
| 1 | Oversikt (dash) | `/app` | Greeting, "Krever handling" action list, statutory deadline chips (Lovpålagte frister), closed-loop actions ("Legg til tiltak"), response activity chart, streak |
| 2 | Undersøkelser | `/app/undersokelser` | Survey list w/ status (Utkast/Aktiv/Lukket), filters, search, sort, per-survey menu (rediger, send/påminn, resultater, rapport, svar selv, del med teamet, kopier som ny runde, lukk, slett), share panel with co-editors and result scopes |
| 3 | Builder | `/app/undersokelser/[id]/bygg` | Title/audience, question list (13 types), per-question advanced (required, help text, comment mode arv/på/av, follow-up on low score, multi, randomize, scale labels), quality flags, anonymity-breach warning, right pane: Add tab (type groups + question bank), Settings tab (ready-checks, logic rules), Preview tab (phone frame), mode chips (simple/advanced), engagement panel (audience, incentive w/ prize & charity fields + warning, toggles, thank-you message, expected response rate) |
| 4 | Send | `/app/undersokelser/[id]/send` | Channels (E-post, Delbar lenke, QR m/ A4-plakat, SMS), recipients (manual, CSV/Excel/Entra ID/Google Workspace/HR-system/paste import), groups, cadence (once/recurring, runs count, question rotation, per-round plan), delivery (anonym / med navn / valgfritt), schedule, reminders, test send, "Klar til å sendes" summary, sent-confirmation |
| 5 | Respondent | `/s/[token]` (public) | Mobile-first, one question per step, progress, language switch (no/en/sv/da), anonymity banner + 90-sec counter, all 13 question types render, required validation, low-score follow-up prompt, per-question comment, thank-you with peer results (only if ≥5 answers) |
| 6 | Resultater | `/app/undersokelser/[id]/resultater` | Stat cards, per-question aggregation (bars / free-text quotes), insights w/ next steps, industry benchmark ("Mot bransjen"), trend vs previous round, team scores, free-text themes, "Last ned rapport" |
| 7 | Dashboard | `/app/dashboard` | Cross-survey: period/group filters, survey chips, stat cards, panels (bars, heatmap team × question, text), pinning |
| 8 | Bibliotek | `/app/bibliotek` | Template packs (~17, incl. 6 lovpålagte), categories, card/list view, company templates (private/shared, delete), question bank (search, categories, own questions) |
| 9 | Rapporter | `/app/rapporter` | Tabs: **Lovpålagte** (4 duty cards: Åpenhetsloven, Psykososial kartlegging, Likestilling/ARP, Trakassering — each w/ checklist, linked surveys, owner, cadence, signers, versioned archive, publish), **Standardmaler** (5 report templates), **Mine rapporter** (list w/ kind lov/egen, status, share, PDF, delete). Report editor: composable sections (summary, trend, heatmap, drivers, teams, themes, quotes, actions, participation, method), per-section group filter, quote picker, Innhold/Filter/Del side-tabs, share scopes ("Ledere ser bare sitt eget team"), PDF/PowerPoint export, scheduled distribution |
| 10 | Profil | `/app/profil` | About-me fields, notification toggles, language, sessions/devices |
| 11 | Administrasjon | `/app/admin` | Tabs: Firma (company info, behandlingsansvarlig/databehandler statement, DPO), Brukere (invite, roles Administrator/Redaktør/Leser, deactivate), Grupper (min-5 note, group cards w/ lead), **Personvern** (privacy toggles, retention 6/12/24/never, DSR rows: innsyn/retting/sletting/portabilitet w/ 30-day deadline, legal docs: DPA, personvernerklæring, underleverandører, DPIA, anonymity explainer), Valg (reminders, weekly digest, self-serve, **Entra ID SSO**, brand mail, default respondent language) |
| — | Wizard modal | overlay | 4 steps: purpose (or skip to blank), questions, audience groups, cadence → creates survey |

### Question types (13)
`scale` (1–3…1–10, low/high labels) · `likert` (5-pt word scale, editable labels) · `smiley` · `enps` (0–10) · `slider` (min/max/labels) · `choice` (multi, randomize) · `dropdown` · `image` (image options w/ upload) · `yesno` · `ranking` · `matrix` (statements × scale) · `text` · `field` (form fields name/email/date — triggers anonymity warning)

### Norwegian-specific logic (the product wedge)
- **Lovpålagte undersøkelser** mapped to law: Arbeidsmiljøloven § 4-3 (psykososial kartlegging, verneombud sign-off, internkontroll documentation), Åpenhetsloven §§ 4–5 (aktsomhetsvurdering leverandører, 30 June deadline, board signature, public disclosure, versioned archive), Likestillings- og diskrimineringsloven § 26 / ARP (biennial pay + involuntary part-time mapping, into årsberetning), aml. kap. 2A (varsling/trakassering)
- Duty engine: per-duty checklist, owner, cadence (6/12/24 mo), signers (styreleder, daglig leder, verneombud, HR), archive versions, linked template pack, publish flag
- Question quality heuristics in Norwegian (double-barreled, leading words, >20 words, negation)
- Respondent languages no/en/sv/da; org default language
- Import sources incl. Norwegian HR systems (Visma, Tripletex, SAP SuccessFactors)
- Incentive rules with warning text (prize draw / charity per response)
- Industry benchmarks ("Mot bransjen")

### Security/privacy rules stated in the design (must be DB-enforced)
1. **k-anonymity, k=5**: results never shown below 5 responses; group breakdowns never below 5; free text never shown with group when group < 5; peer results on thank-you page only at ≥5
2. **Absolute anonymity**: "Ingen — heller ikke administrator — kan slå opp hvem som svarte hva" for anonymous surveys
3. Anonymity-breach warning when a `field` question collects name/email in an anonymous survey
4. Role **Leser** sees only aggregates, never individual answers; co-edit sharing "Resultater deles alltid summert — aldri enkeltsvar"
5. Report share scope: leaders see only their own team; all-employees link has no breakdowns
6. Privacy toggles: hide-below-5, no IP logging, EU/EØS-only storage (design says "Oslo og Frankfurt"), auto-delete raw data after retention, consent text before answering
7. Retention: 6/12/24 months or never; raw answers deleted, aggregates kept
8. DSR: access, rectification, erasure, portability (JSON/CSV), 30-day deadline
9. Behandlingsansvarlig = customer; HeiTuva = databehandler (DPA), DPO listed, DPIA, subprocessor list within EØS

---

## 2. Pixel-perfect: recommendation

**Yes — implement pixel-perfect, with three deliberate adaptations.** The prototype is high-fidelity with a complete token system, so pixel-perfect is cheap to specify and pays off in a compliance product where trust is visual.

**Design tokens ("Varme" theme) → Tailwind theme:**
```
--bg #FCF6E9 · --sf #FFFDF6 · --sf2 rgba(25,21,16,.05) · --ink #191510 · --mut #5F5849
--line #E8DFC9 · --ac #F5C64A (accent) · --acf #191510 · --ac2 #A8D5D2 · --ac3 #FBD5C4
--sbg #FBEBBE · --sbg2 #F6EEDD · radius 16px · shadow 0 2px 10px rgba(25,21,16,.05)
Fonts: Playfair Display (display), DM Sans (body), Bricolage Grotesque (logo), base 14px
```
Focus outline: 3px solid #191510, offset 2px. Entry animation: fade+6px translate, .25s.

**Adaptations (not deviations):**
1. Inline styles → Tailwind classes + CSS variables; identical rendered output, jsdom/Playwright-verifiable.
2. The prototype's phone-frame preview and QR grid are UI elements — keep them, but QR becomes a real generated QR.
3. Responsive behavior is unspecified in the prototype (fixed 1440px preview). Desktop-first pixel-perfect at ≥1280px; the respondent flow (`/s/[token]`) is mobile-first pixel-perfect at 380–420px. Admin screens get sensible tablet fallbacks. ⚠️ DECIDE if admin mobile support is v1.

**Verification loop:** build the design prototype's static states as reference screenshots (Playwright against the .dc.html rendered once, or manual reference captures), then screenshot-diff each implemented screen per PR.

---

## 3. Architecture

**Stack (per your standard):** Next.js (App Router) + TypeScript + Tailwind + shadcn/ui on Vercel · Supabase (Postgres, Auth, RLS, Storage, Edge Functions, pg_cron) · GitHub with Vercel Git integration + Supabase branching. Supabase region **eu-central-1 (Frankfurt)** for EØS residency. ⚠️ DECIDE: confirm region and whether a DPA-friendly EU-only posture excludes any US-routed services (email/SMS provider choice depends on this).

**Two surfaces, one app:**
- **Authenticated app** (`/app/*`): Supabase Auth session, RLS on every table.
- **Public respondent surface** (`/s/[token]`): no auth; access exclusively via server-side routes / RPCs using invitation or link tokens. Anonymous responses are written through a **SECURITY DEFINER RPC** that validates the token and inserts with *no* user linkage.

**Data-not-code pattern (your standard):** question types, template packs, statutory duties, report section types, and quality-flag rules live as **seed data + registry tables**, not hard-coded components. One renderer per question type keyed off the registry; adding a pack or duty is a data migration.

### The anonymity architecture (the most important design decision)
The design promises both (a) reminders to non-responders and (b) that nobody can link answers to people. Those are compatible only with **participation/answers decoupling**:

- `survey_invitations` — per-recipient token, email, group, `responded_at` timestamp. Knows **who** was invited and **whether** they responded. Never linked to answers for anonymous surveys.
- `responses` + `answers` — the answer data. For `anonymity = 'anonymous'`: **no user id, no invitation id, no IP, no user agent**; a random submission id only; `submitted_at` rounded to the hour (prevents timing correlation in small groups).
- Marking `responded_at` and inserting the response happen in one RPC that consumes the token — the RPC is the only code path, and it structurally cannot write a linkage because the columns don't exist on the anonymous path.
- For `anonymity = 'named'`: responses carry the invitation reference (disclosed to the respondent in the banner, per design).
- For `anonymity = 'optional'`: respondent chooses per submission; anonymous choice follows the anonymous path.
- Open share-link responses: no invitation at all; a signed, single-use-per-browser token to dampen duplicates (accepting that an open link can never fully prevent them — the design accepts this too: "Én lenke per undersøkelse").

### k-anonymity enforcement (k=5)
Enforced in the database, not the client:
- Clients **never select from `answers`**. All result reads go through `aggregate_results(survey_id, group_filter, period)` RPCs / materialized views that return counts, averages, distributions — and return `insufficient_data` for any cell where n < 5.
- Free-text quotes come from a `get_quotes(...)` RPC that refuses group filters where group n < 5 and strips the group label.
- The heatmap/team views apply the same rule per cell (design: "terskel på fem svar").
- The Personvern toggle "Skjul resultater under 5 svar" — recommendation: **hard-on and not disableable for anonymous surveys** (a toggleable k-anonymity guarantee is not a guarantee). ⚠️ DECIDE.

### Roles & RLS
- `organizations` is the tenant root (multi-tenant assumed from the Splash pricing page ⚠️ DECIDE). Every table carries `org_id`; RLS: `org_id in (select org_id from org_members where user_id = auth.uid())` plus role checks.
- Roles per design: `administrator` (settings, privacy, users), `redaktor` (create/send surveys), `leser` (aggregates only — enforced because *nobody* can read `answers` directly; leser additionally cannot call quote RPCs with filters, cannot see free-text on named surveys). Survey-level co-editor grants via `survey_editors`.
- Group leads: report share links scoped to their group (design: "Ledere ser bare sitt eget team") — implemented as signed report-share tokens carrying a group scope, resolved server-side.

### Retention, deletion, DSR
- `pg_cron` job: daily, delete `answers`/`responses` (and free text) older than org retention where retention ≠ never; aggregates persist in `result_snapshots` (also what "Arkiv" report versions freeze).
- DSR: `dsr_requests` table (type, subject, status, due_date = created + 30 days, handled_by). Erasure for named data = delete invitations + named responses for the subject; for anonymous data, truthfully report that no linkage exists (this is a feature — document it in the DSR reply template).
- No IP logging: Vercel/Supabase log settings reviewed; the respondent RPC never persists request metadata.
- Audit log (`audit_events`) for admin actions, exports, DSR handling, duty sign-offs — append-only, RLS admin-read.

---

## 4. Database schema (draft v0.1)

Migrations in `supabase/migrations/`, RLS enabled on every table from migration 1. Naming: snake_case, `org_id uuid not null` everywhere below `organizations`.

**Tenancy & people**
- `organizations` — name, orgnr, address, contact, dpo, default_lang, retention_months, privacy jsonb (min_responses, ip_logging, eu_only, auto_delete, consent), options jsonb (reminders, weekly_digest, self_serve, sso, brand_mail), plan
- `org_members` — user_id (auth.users), role enum(administrator, redaktor, leser), group_id, status, invited_by
- `groups` — name, lead_member_id (design min-5 note applies at query time, not storage)
- `profiles` — display fields, phone, notify jsonb, lang

**Survey core**
- `surveys` — title, audience_label, status enum(utkast, aktiv, lukket), anonymity enum(anonymous, named, optional), engage jsonb (audience, incentive, prize, charity, comments mode, toggles, thank_you), version/round metadata, template_pack_key, created_by
- `survey_questions` — survey_id, position, type enum(13), text, help, required, comment_mode enum(arv, pa, av), config jsonb (scale points/labels, options, statements, multi, randomize, slider min/max, fields, image option refs), follow_up_on_low bool
- `question_bank` — org_id nullable (null = HeiTuva standard bank), text, type, category, config jsonb, author
- `template_packs` — key, category (Ansatte/Kunder/Lovpålagt/Annet), legal_ref, title, audience, questions jsonb, org_id nullable (null = standard; set = company template), private bool
- `logic_rules` — survey_id, kind (low_score_follow_up …), config jsonb

**Distribution**
- `survey_rounds` — survey_id, round_no, opens_at, closes_at, question_set jsonb (rotation), status
- `survey_invitations` — round_id, email, name, group_id, token (hashed), channel enum(email, sms), sent_at, reminded_at[], **responded_at** (timestamp only — see §3)
- `share_links` — round_id, token, kind enum(link, qr), active
- `import_jobs` — source enum(csv, excel, entra, google, hr, paste), status, counts, error rows jsonb
- `schedules` — survey_id, cadence enum, runs, rotate, next_run_at (pg_cron driven)

**Answers (locked down — no direct client access, service-role/RPC only)**
- `responses` — round_id, submission_key uuid, anonymity_at_submission, invitation_id **nullable and always null when anonymous**, submitted_hour timestamptz (truncated), lang
- `answers` — response_id, question_id, value jsonb, comment text, follow_up text
- `result_snapshots` — survey/round scope, aggregates jsonb, created_at (feeds trends, archives, retention survival)

**Compliance engine**
- `duties` — org_id, key (apenhet, arbeidsmiljo, likestilling, trakassering — seeded, extensible), title, law, basis, owner_member_id, interval_months, publish bool, next_due_at
- `duty_checks` — duty_id, key, label, done, done_by, done_at
- `duty_signers` — duty_id, role_label, member_id, signed_at
- `duty_versions` — duty_id, label, report_id, published_at, archived_by (the "Arkiv")
- `duty_survey_links` — duty_id, survey_id

**Reports**
- `reports` — org_id, title, kind enum(lov, egen), status enum(utkast, klar, publisert), base_template, sections jsonb (ordered, per-section group filter, selected quotes), filters jsonb (period, group, surveys), share_scope enum(ledelse, ledere_eget_team, alle_ansatte), schedule
- `report_shares` — report_id, token, scope, group_id nullable
- `report_exports` — report_id, format enum(pdf, pptx), storage_path, created_by

**Ops & privacy**
- `dsr_requests` — type enum(innsyn, retting, sletting, portabilitet), subject_email, status, due_at, handled_by, resolution
- `audit_events` — actor, action, target, meta jsonb (append-only)
- `notifications` / `loop_actions` (dashboard "tiltak" closed-loop items: text, survey_id, owner, done)
- `benchmarks` — industry, metric_key, value (seeded ⚠️ DECIDE source)

**RLS summary:** org-scoped policies everywhere; `responses`/`answers` have **no select policy for any authenticated role** — reads only via SECURITY DEFINER aggregate RPCs that implement k=5; writes only via the submission RPC validating tokens.

---

## 5. Phased plan (Claude Code execution order)

Each phase = one or more PRs on a Supabase branch + Vercel preview; screenshot-diff against reference before merge. A `CLAUDE.md` at repo root carries: stack, token theme, "match the design bundle exactly — do not restyle", locked schema reference, k=5 and anonymity rules as non-negotiable invariants, and the per-phase definition of done.

**Phase 0 — Foundation (schema first, before any UI)**
Repo scaffold (Next.js App Router, TS strict, Tailwind theme from §2 tokens, shadcn init, fonts). All migrations from §4 + seed data (standard template packs incl. the 6 lovpålagte with their question sets from the design, question bank, duties, section registry, quality-flag rules). RLS test suite (pgTAP or Vitest against local Supabase) proving: cross-org isolation, leser cannot read answers, anonymous responses carry no linkage, aggregates refuse n<5. **Nothing merges to main without these tests green.**

**Phase 1 — Auth, shell, admin**
Supabase Auth (email invite flow per design's Brukere tab), org creation, app shell pixel-perfect (header, nav, language switch, user menu), Profil, Administrasjon all five tabs (Personvern fully wired: toggles, retention, DSR table, legal docs list).

**Phase 2 — Survey lifecycle core**
Bibliotek (packs, bank, company templates) → Builder (all 13 types, quality flags, advanced options, preview phone, settings tab, engagement panel, wizard modal) → Undersøkelser list (statuses, menu, share/co-editors).

**Phase 3 — Distribution + respondent**
Send screen (email channel + delbar lenke + QR first; CSV/Excel/paste import; groups; anonymity modes; schedule; reminders; test send), the `/s/[token]` respondent flow pixel-perfect mobile (all types, i18n no/en/sv/da, validation, follow-up, comments, thank-you w/ peer results at ≥5), submission RPC, email provider integration ⚠️ DECIDE provider. Recurring rounds via pg_cron + Vercel cron for sends.

**Phase 4 — Results & dashboard**
Aggregation RPCs + snapshots, Resultater screen, Dashboard heatmap/panels/pinning, trends vs previous round, free-text themes ⚠️ DECIDE method (see Q7), insights, benchmarks ⚠️ DECIDE.

**Phase 5 — Compliance & reports (the differentiator)**
Duty engine (checklists, signers, versions, deadlines feeding Oversikt chips + "Krever handling"), report editor (sections, filters, quote picker, share scopes), PDF export (and PPTX if v1 ⚠️), scheduled distribution, Oversikt screen completed last since it aggregates everything.

**Phase 6 — Splash & hardening**
Marketing splash pixel-perfect ⚠️ DECIDE scope (pricing/billing?), Entra SSO if v1 ⚠️, SMS if v1 ⚠️, penetration pass on the anonymity path, Supabase advisors clean, audit log review, DPA/personvernerklæring content, load test respondent flow.

---

## 6. Internationalization — database-driven, editable without redeploys

Two very different translation surfaces exist in the design, and they need different treatment:

### 6a. UI copy (app chrome + respondent chrome) — DB-backed with file seeds
The respondent flow ships in **no / en / sv / da** (the design's `RS` object); the admin app is Norwegian in the design. Recommended architecture — the hybrid that gives you type safety *and* runtime editing:

- **Source of truth for defaults: JSON files in the repo** (`/messages/no.json`, `en.json`, `sv.json`, `da.json`), organized by namespace (`respondent.*`, `builder.*`, `admin.*`, `reports.*`). These are versioned, reviewable in PRs, and a script generates a TypeScript key union from `no.json` so a missing or misspelled key is a compile error.
- **Runtime store: `ui_messages` table** — `(namespace, key, lang, value, updated_at, updated_by)`, seeded from the JSON files by migration. **You edit here** — via a small admin screen (Administrasjon → Språk, admin-role only, audit-logged) or directly in Supabase Studio — and the change is live without a deploy.
- **Serving:** server-side loader fetches messages per locale with Next.js `unstable_cache`/`revalidateTag('i18n:no')`; an edit calls `revalidateTag`, so changes appear within seconds but reads cost ~zero. Library: **next-intl** with a custom `getMessages()` backed by this loader; ICU message format for plurals/interpolation ("{n} svar", "{days} dager igjen").
- **Fallback chain:** requested lang → `no` → the key itself rendered visibly (so gaps are seen, not silent).
- **Locale resolution:** respondent surface — per-invitation `lang` → link `?lang=` → org `default_lang`; app surface — user profile lang → org default. `lang` is a column, never parsed from browser headers for anything persisted.
- **Sanity guard:** values are rendered as text, never `dangerouslySetInnerHTML`; the editor validates ICU syntax and placeholder parity against the default string before saving (so an edit can't break a screen).

Why not files-only: you'd redeploy for every wording tweak in a compliance product where wording *is* the product. Why not DB-only: you'd lose type safety, PR review, and environment reproducibility. The seed-then-override model gives both; `ui_messages` rows diverging from seed are exportable back to JSON with one script when you want to consolidate.

### 6b. Survey content (questions, options, packs) — per-entity translation rows
"Undersøkelser du sender kan ha sitt eget språk per mottaker" (Profil screen) means question text itself is multilingual:

- `question_translations` — `(question_id, lang, text, help, config_overrides jsonb)` where `config_overrides` carries translated options/statements/scale labels. Same pattern for `template_pack_translations` and the question bank.
- The builder shows a language tab strip per question when the survey targets multiple languages; untranslated = falls back to the source language with a visible badge in the send-readiness checks ("Klar til utsending?" gains a translation check).
- ⚠️ DECIDE (Q13): optional AI-assisted draft translation (Anthropic API, marked "maskinoversatt — se over" until a human confirms) — or manual-only in v1. Statutory pack questions (aml. § 4-3 etc.) should ship professionally translated as seed data regardless; they are legal instruments, not UI copy.
- Aggregation is translation-agnostic: answers key on `question_id` + option index/value, never on display text, so results merge across languages automatically.

---

## 7. SaaS robustness & security — beyond the feature scope

Additions to the plan that make this a durable multi-tenant product rather than a working app. These fold into the phases (mostly 0, 3, and 6).

**Environments & change discipline (Phase 0)**
- Four rungs: local Supabase → PR preview (Supabase branch + Vercel preview, automatic) → staging project → production. Migrations are the only way schema changes reach any shared environment; no Studio edits on prod.
- GitHub Actions gate on every PR: typecheck, lint, unit tests, **the RLS/anonymity invariant suite**, Playwright e2e + screenshot diff vs design references, `supabase db lint`, Supabase security/performance advisors, Dependabot + secret scanning + CodeQL.

**Boundary hardening (Phases 0/3)**
- Zod validation on every server action, route handler, and RPC parameter — the database trusts nothing from the edge.
- Security headers + strict CSP (nonce-based), HSTS; `X-Frame-Options`/frame-ancestors deny except the respondent page if you ever want embedding (⚠️ default: deny).
- Rate limiting on `/s/[token]` submissions, auth endpoints, and export generation (Vercel WAF rules or Upstash Redis, EU region). Cloudflare Turnstile on open-link submissions only (invited-token flows don't need the friction).
- Token hygiene: invitation/share/report tokens stored **hashed** (SHA-256) with expiry; constant-time comparison; single-use semantics where the design implies it (test sends, DSR export links). Signed URLs for Storage objects (report PDFs, question images) — nothing public.
- Service-role key exists only in server-side env; anon key + RLS is the only client credential. Supabase MFA (TOTP) **required for administrator role** (⚠️ Q14 — recommend yes; they control privacy settings).

**Reliability of the send pipeline (Phase 3)**
- All email/SMS sends, reminders, scheduled rounds, and export jobs go through a **queue** (pgmq in Supabase, or Inngest if you prefer managed) — never fire-and-forget from a request. Jobs are idempotent (invitation-scoped idempotency keys), retried with backoff, and dead-lettered with alerting. A recurring survey that silently fails to send is a compliance product killing its own value proposition.
- Webhook ingestion from the email provider (bounces, complaints) updates invitation status; hard bounces suppress reminders.

**Observability & response (Phase 6, wired from Phase 1)**
- Sentry (EU data residency) for both Next.js and edge functions, with PII scrubbing — respondent free text must never reach error payloads.
- Structured logs; alerting on queue depth, send failures, RPC error rates, cron misses. Uptime monitoring on `/s/health` and the app.
- **Incident response runbook** in the repo: severity levels, who does what, and the GDPR Art. 33 path — 72-hour breach notification to Datatilsynet with the customer (behandlingsansvarlig) notified first. As databehandler you contractually owe this in every DPA you sign.

**Data lifecycle & tenant operations**
- Backups: Supabase PITR on prod; a quarterly restore drill (a backup you've never restored is a hope, not a backup).
- Org offboarding: self-serve full export (JSON/CSV per the DSR portability format) + scheduled hard delete with a grace window; audit-logged.
- Soft-delete (`deleted_at`) for surveys/reports with a purge job; hard delete only for answers (retention) and offboarding.
- Per-org quotas tied to plan (respondents, SMS volume, active surveys) enforced in RPCs, so one tenant can't degrade others.

**Product operations**
- `feature_flags` table (org-scoped overrides) for staged rollout of risky features (SMS, Entra sync, AI theming) — same data-not-code pattern.
- Immutability where the law expects it: published duty reports and archived versions are frozen snapshots (content hash stored in `duty_versions`), not live queries.
- Status page + support address on the splash; plan/billing webhooks (if Stripe, EU entity) reconciled nightly against `organizations.plan`.

---

## 8. Open questions (blocking decisions)
Q1–Q10: see conversation (tenancy, anonymity model, k=5 toggle, identity, auth, providers, AI, benchmarks, import scope, exports/splash).
Added in v0.15:
- **Q11 — App UI languages:** admin app Norwegian-only in v1 (respondent no/en/sv/da as designed), with English admin later? The i18n architecture supports it either way; this only decides translation effort now.
- **Q12 — Who edits translations:** admin-screen editor in v1, or is Supabase Studio access enough for you initially (screen in a later phase)?
- **Q13 — AI-assisted survey translation:** on (with human-confirm badge) or manual-only v1?
- **Q14 — Require MFA for administrator role:** recommend yes.

Answers get folded into v0.2 of this plan before Phase 0 starts.
