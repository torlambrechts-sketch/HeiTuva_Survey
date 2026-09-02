# HeiTuva — Claude Code Prompts (copy-paste, one per phase)

Run `claude` from the repo root. Paste each prompt when the previous phase's CI is green and you've reviewed the Vercel preview. Do not skip ahead.

---

## PHASE 0 — Foundation (no UI)

```
Read CLAUDE.md, DECISIONS.md, and docs/HeiTuva_Implementation_Plan.md in full before doing anything.
The design source of truth is /design-reference/heituva-survey-app-design/ — read its README.md now so you understand the bundle; you will read project/HeiTuva.dc.html per screen in later phases.

Execute Phase 0. No UI in this phase.

1. Scaffold Next.js (App Router, TypeScript strict) in this repo. Configure Tailwind with the exact theme tokens from CLAUDE.md as CSS variables + Tailwind theme extension (colors bg/sf/sf2/ink/mut/line/ac/acf/ac2/ac3/sbg/sbg2, radius 16px, the shadow, fonts Playfair Display / DM Sans / Bricolage Grotesque via next/font). Initialize shadcn/ui.
2. Wire next-intl: messages loaded server-side from the ui_messages table (namespaces per messages/no.json), cached with unstable_cache and tag 'i18n:<lang>', revalidated on edit. Fallback chain: requested lang → no → render the key visibly. Locale resolution: user profile lang → org default_lang; respondent surface will pass lang explicitly.
3. Supabase client pattern: browser client (anon key), server client (cookies), and a server-only service-role client that can only be imported from server actions / route handlers (enforce with a lint rule or import guard).
4. Write scripts/seed-i18n.ts (upserts messages/*.json into ui_messages) and scripts/gen-i18n-types.ts (generates a TS key union from messages/no.json so a missing key is a compile error). Run both.
5. Verify the database: run `supabase db reset` locally (migrations in supabase/migrations + supabase/seed.sql). Fix any SQL errors by ADDING new migrations or amending only-not-yet-pushed ones — never edit an applied migration on the linked project.
6. Build the invariant test suite (Vitest against local Supabase) proving:
   a. cross-org isolation: user in org A cannot select org B's surveys or members
   b. role 'leser' cannot select from responses or answers (no policy exists — prove default deny)
   c. inserting a response with anonymity 'anonymous' AND an invitation_id violates the CHECK constraint
   d. aggregate_results returns insufficient_data for a question with 4 responses and real data at 5
   e. submit_response with an already-used invitation token returns already_responded
   f. get_quotes with a group filter returns forbidden for role 'leser'
7. GitHub Actions on PR: tsc --noEmit, eslint, the invariant suite against local Supabase, supabase db lint.

Stop when CI is green. Show me the invariant test output. Do not build any UI.
```

---

## PHASE 1 — Auth, shell, Profil, Administrasjon

```
Read CLAUDE.md again. Execute Phase 1.

Before each screen: open /design-reference/heituva-survey-app-design/project/HeiTuva.dc.html, find the screen's markup (header is near the top; isProfile ~line 1294; admin sections adminFirma/adminBrukere/adminGrupper/adminPersonvern/adminValg ~lines 1386–1553), and list every state you found (conditionals, empty states, warning chips) before implementing. Build pixel-perfect per CLAUDE.md; every string via next-intl with Norwegian verbatim from the design.

Scope:
1. Auth: Supabase email invite flow (admin invites → email → set password or magic link), login page, session handling, TOTP MFA required for role administrator (DECISIONS Q14). Org creation via a server action (service role) for new signups.
2. App shell: header with logo SVG (copy the exact SVG from the design), nav (Oversikt, Undersøkelser, Dashboard, Bibliotek, Rapporter) with active-state opacity/weight per design, language globe with lang-code badge, 'Ny undersøkelse' button, user menu dropdown.
3. Profil: Om meg fields, Varsler toggles, Språk chips (no/en active; sv/da rendered disabled with 'kommer'), Pålogging og enheter (Supabase sessions).
4. Administrasjon, all five tabs: Firma (company fields + behandlingsansvarlig/DPO panel), Brukere (invite input, role select Administrator/Redaktør/Leser, activate/deactivate), Grupper (create, cards with lead + progress bar, min-5 note), Personvern (privacy toggles — render 'Skjul resultater under 5 svar' as always-on informational per DECISIONS Q3; retention select wired to organizations.retention_months; DSR table with the four request types and 30-day due dates; Dokumentasjon list; 'Slik beskyttes anonymiteten' panel), Valg (option toggles — SSO toggle disabled with 'kommer' badge per DECISIONS Q5; default respondent language select).
5. Audit-log writes for: privacy toggle changes, role changes, retention changes, DSR status changes.

DoD per screen: pixel match vs design (add Playwright screenshot tests to /tests/visual), all states reachable, no+en complete, keyboard focus-visible per the design's 3px outline, CI green. Open one PR per screen group and stop for my review after Administrasjon.
```

---

## PHASE 2 — Bibliotek, Builder, Undersøkelser

```
Read CLAUDE.md again. Execute Phase 2.

Design references in project/HeiTuva.dc.html: Bibliotek (isLibrary ~1557–1682 incl. showBank), Builder (isBuild ~323–685: question cards, type select optgroups, per-type editors, advanced row, quality flags, anonymity warning, right pane tabAdd/tabSettings/tabPreview, engasjement panel ~560–650, mode chips), wizard modal (wizOpen ~30–135), Undersøkelser (isSurveys ~687–806 incl. shareOpen panel and the per-survey ··· menu). The seeded template packs, question bank, and quality_rules tables carry the content — render from data, don't hard-code.

Scope:
1. Bibliotek: template pack cards + list view, category chips, lovpålagt badges (legal_ref), 'Bruk mal' → creates survey from pack via server action, Firmaets maler (create from 'Lagre som mal', private toggle, delete), Spørsmålsbanken tab (search, categories, add-to-survey, own questions with delete).
2. Builder: all 13 question types with their editors exactly as designed (scale points/labels, likert 5 editable labels, matrix statements, choice/dropdown/ranking/image options, slider, field rows, yesno, text, smiley, enps). Reorder/duplicate/delete/save-to-bank. Advanced row: required switch, help text, comment mode (arv/på/av), follow-up-on-low toggle (numeric types → writes logic_rules), multi + randomize for choice. Quality flags evaluated live from the quality_rules table. Anonymity-breach warning when a field question collects name/email while survey.anonymity='anonymous'. Length note + too-long warning. Settings tab: ready-checks, logic rules list. Preview tab: the phone frame rendering the live draft. Wizard modal: 4 steps → creates survey.
3. Undersøkelser: list with status chips, progress bars, filters (Alle/Aktiv/Utkast), search, sort; the full ··· menu; 'Del med teamet' co-editor panel writing survey_editors with result-scope copy from the design; 'Kopier som ny runde'.

Persistence: autosave drafts (debounced server actions), optimistic UI. Everything RLS-scoped — no service-role in this phase except org creation.
Same DoD. PR per screen group; stop after Undersøkelser for review.
```

---

## PHASE 3 — Send + respondent flow + delivery pipeline

```
Read CLAUDE.md again. Execute Phase 3. This phase touches the security-critical path — re-read the invariants section first.

Design references: Send (isSend ~1684–1919: channel cards, mottakere + import panel with 6 sources, groups grid, delbar lenke, QR card, SMS card, hyppighet, levering/anonMode, schedule, reminder, 'Klar til å sendes' summary, justSent confirmation), respondent (isRespond ~1923–2133: all question type renderers, progress, anon banner + seconds counter, follow-up box, comment box, required chip, thank-you with peer bars gated at 5).

Scope:
1. Send screen: channels email/link/QR active; SMS card rendered but disabled behind feature_flags.sms_channel ('kommer'). Import: CSV/Excel (parse client-side with SheetJS, validate rows, show chips + error rows) and paste; Entra/Google/HR sources rendered as stubs per DECISIONS Q9. Recipients → survey_invitations with per-recipient lang and hashed tokens (raw token only ever in the outgoing email). Groups selection. Cadence → schedules row; anonymity mode; schedule + reminders.
2. Delivery pipeline: pgmq queue + a Vercel cron route (every 5 min) draining it. Jobs: send_invitation, send_reminder, open_round. Mail adapter in lib/mail/ with SES eu-north-1 transport and a console transport for dev (DECISIONS Q6). Idempotency key = invitation id + job kind. Bounce webhook route updating survey_invitations.bounced_at. Test send ('Send en test til deg selv').
3. QR: real QR generation for the share link, PNG download, A4 poster (print CSS).
4. Respondent surface /s/[token]: server component calling get_survey_for_token; mobile-first pixel-perfect; language switch no/en; renders all 13 types; required validation; low-score follow-up via logic_rules; per-question comment per comment_mode; consent text when org privacy.consent; submit via submit_response RPC with anonymity choice UI when mode='optional'; thank-you screen with peer bars from aggregate_results (respects insufficient_data); already-responded state. Rate-limit the submit route; Turnstile on share-link (not invitation) submissions. Zod-validate the answers payload shape server-side before calling the RPC.
5. Extend the invariant suite: reminder job never selects answers; submitted anonymous response for an emailed invitation has invitation_id NULL but respondent_group_id copied; open-link response has both NULL.

Same DoD + an end-to-end Playwright test: create survey → send to a test inbox (mail captured via dev transport) → open token link → answer → verify responded_at set and answers unlinked. Stop for review before merging the pipeline PR.
```

---

## PHASE 4 — Results, Dashboard, aggregation

```
Read CLAUDE.md again. Execute Phase 4.

Design references: Resultater (isResults ~2136–2291: stat cards, per-question blocks bars/quotes, 'Hva svarene forteller' insights, 'Mot bransjen', 'Mot forrige runde', team scores, 'Temaer i frisvarene'), Dashboard (isDashboard ~808–901: filters, survey chips, stat cards, panels incl. the heatmap grid with per-cell n>=5 titles, pinning).

Scope:
1. Extend the SQL layer with new migrations: aggregate_matrix/ranking/field handling inside aggregate_results; a heatmap RPC (group × question cells, each cell independently k-gated, returning insufficient markers exactly like the design's '—' cells); trend RPC across rounds; participation RPC (invited vs responded — counts only, from invitations). Every new RPC: SECURITY DEFINER, org-membership check, k>=5 per cell, granted to authenticated only. Add invariant tests for each.
2. result_snapshots written when a round closes (queue job) — feeds trends after retention deletion.
3. Resultater screen: all blocks from the design; quotes via get_quotes (random order, no attribution); insights rule-based per DECISIONS Q7 (lowest-scoring questions, biggest negative trend delta, participation below expectation → 'Neste steg' lines); benchmark panel reading the benchmarks table with the seed-source footnote; free-text themes via keyword/stem grouping (port the design's THEME_WORDS approach into a data-driven theme_rules seed).
4. Dashboard: filters, multi-survey chips, stat cards, bar panels, the heatmap, text panel, pin/unpin (persist per member).
5. Leser role: verify in tests that every element on both screens renders for leser without any path to raw answers or filtered quotes.

Same DoD; stop for review after the heatmap PR.
```

---

## PHASE 5 — Compliance engine, reports, PDF, Oversikt

```
Read CLAUDE.md again. Execute Phase 5. This is the product's differentiator — fidelity to the design here matters most.

Design references: Rapporter (isReports ~904–1292: repLov duty cards with checklists/linked surveys/settings/signering/arkiv, repStandard template cards with thumbnails, repMine rows, repEditing document + side tabs Innhold/Filter/Del incl. quote picker and scheduled distribution), Oversikt (isDash ~214–319).

Scope:
1. Duty engine: org onboarding instantiates duties from duty_definitions; duty cards exactly per design (status pill logic, progress bar from checks, checklist toggles writing duty_checks with audit events, linked surveys from duty_survey_links with 'Bruk mal'/open CTAs, settings: owner/rytme/publish, signering rows writing duty_signers.signed_at + signed_content_hash, arkiv from duty_versions). next_due_at drives the Oversikt deadline chips and 'Krever handling' items.
2. Report editor: sections from report_section_types rendered per design (text, bars, heatmap reusing Phase 4 RPCs, quotes via picker), per-section group select where supports_group_filter, reorder/remove, filters side-tab (period/group/surveys, with the under-5 note), Del side-tab (scopes ledelse/ledere_eget_team/alle_ansatte, share token link, scheduled distribution select), 'Lagre rapport'.
3. Publishing a lov report: freeze a result_snapshot, write duty_versions with content hash, set status Publisert; published reports render from the snapshot, never live data.
4. Report share links: public route resolving report_shares tokens server-side; ledere_eget_team scope filters to the token's group (k-gate still applies); alle_ansatte scope renders totals with no breakdowns — exactly the design's copy.
5. PDF export: server-side render of the report document (Playwright print or @react-pdf), stored in Supabase Storage, signed URL, report_exports row. PPTX button rendered but disabled behind feature_flags.pptx_export.
6. Oversikt: build last — action items derived from real state (unsent drafts, duties due, low-score follow-ups), compliance chips from duties, loop_actions list + 'Legg til tiltak', activity chart from participation RPC, onboarding checklist card.

Same DoD; stop for review after duty engine, again after report editor.
```

---

## PHASE 6 — Splash, hardening, deferred features

```
Read CLAUDE.md again. Execute Phase 6.

1. Splash page from /design-reference/.../project/'HeiTuva Splash.dc.html' — pixel-perfect, pricing section with 'Kontakt oss' CTA (no billing per DECISIONS Q10), login/Kom i gang wired to auth.
2. i18n admin editor (Administrasjon → Språk): namespaced list, edit with ICU + placeholder validation against the no source, audit-logged, tag revalidation on save (DECISIONS Q12).
3. Hardening pass: strict CSP with nonces + security headers; rate limits reviewed on all public routes; Sentry (EU) with PII scrubbing verified by a test that a thrown error containing answer text is scrubbed; dependency audit; supabase advisors clean; pen-test checklist from the plan §7 executed and results written to docs/SECURITY_REVIEW.md.
4. Ops: retention cron verified end-to-end (seed old data locally, run app.apply_retention, confirm aggregates survive via snapshots); org offboarding export (JSON/CSV) + delete flow; DSR portability export wired to the same exporter.
5. Deferred features — implement only if I've flipped the flag, otherwise leave stubbed: Entra ID SSO + directory sync, SMS via LINK Mobility, PPTX export, AI insights/translation.
6. docs/DEVIATIONS.md review with me: walk every logged deviation from the design and we decide accept/fix.

Exit criteria: full Playwright regression + visual suite green, invariant suite green, advisors clean, staging deploy verified, then production.
```

---

## Recurring review prompt (use any time a screen looks off)

```
Open /design-reference/heituva-survey-app-design/project/HeiTuva.dc.html and re-read the markup for <screen/section>. Diff your implementation against it property by property (colors, font family/size/weight, spacing, radii, borders, exact Norwegian copy). List every mismatch, then fix all of them. Do not restyle anything else.
```
