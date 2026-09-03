# CLAUDE.md — HeiTuva

HeiTuva is a Norwegian-market survey SaaS with a statutory-compliance wedge (Arbeidsmiljøloven § 4-3, Åpenhetsloven §§ 4–5, Likestillingsloven § 26/ARP, aml. kap. 2A). This file is the contract for every coding session. Read `DECISIONS.md` and `docs/HeiTuva_Implementation_Plan.md` before starting any phase.

## Stack (fixed — do not substitute)
- Next.js (App Router) + TypeScript `strict` + Tailwind + shadcn/ui, deployed on Vercel
- Supabase: Postgres + Auth + RLS + Storage + Edge Functions + pg_cron + pgmq — project region **eu-central-1**
- GitHub + Vercel Git integration; Supabase branch per PR
- i18n: next-intl, messages loaded from `ui_messages` table (seeded from `/messages/*.json`), tag-based revalidation
- Email: provider adapter in `lib/mail/` — Amazon SES eu-north-1 (see DECISIONS Q6)

## Design fidelity — pixel-perfect, non-negotiable
- The design source of truth is `/design-reference/` (the Claude Design handoff bundle). Read `project/HeiTuva.dc.html` for any screen before building it. **Match the visual output exactly. Do not restyle, do not substitute components, do not "improve" spacing, colors, or copy.** Recreate the rendering in React/Tailwind; never copy the prototype's internal structure (`sc-if`/`sc-for`, inline styles).
- Theme tokens (Tailwind theme, CSS vars):
  `--bg #FCF6E9 · --sf #FFFDF6 · --sf2 rgba(25,21,16,.05) · --ink #191510 · --mut #5F5849 · --line #E8DFC9 · --ac #F5C64A · --acf #191510 · --ac2 #A8D5D2 · --ac3 #FBD5C4 · --sbg #FBEBBE · --sbg2 #F6EEDD`
  radius 16px · shadow `0 2px 10px rgba(25,21,16,.05)` · fonts: Playfair Display (display), DM Sans (body), Bricolage Grotesque (logo only) · base 14px · focus outline `3px solid #191510, offset 2px` · entry animation fade + 6px translateY, .25s ease
- Desktop app pixel-perfect at ≥1280px. Respondent-facing surfaces — `/s/[token]`, report share links, splash — mobile-first pixel-perfect at 380–420px.
- **All app screens are responsive down to 390px (DECISIONS Q15).** Below 1280px there is no design to match, so follow `docs/RESPONSIVE.md` exactly — it is a specification, not a suggestion. The do-not-invent rule is relaxed ONLY to the patterns in that file; anything it does not cover is a stop-and-ask. Tokens never change across breakpoints; no feature may be hidden on mobile.
- Every UI string comes from next-intl (`no` is the source language). **Never hard-code user-facing text.** Norwegian copy must match the design bundle verbatim.

## Security invariants — violating any of these fails the PR
1. **k-anonymity, k=5, database-enforced.** Clients never select from `responses` or `answers` (no RLS select policy exists for them — do not add one). All result reads go through the SECURITY DEFINER RPCs (`aggregate_results`, `get_quotes`, heatmap RPCs) which return `insufficient_data` for any cell with n < 5 and strip group labels below threshold.
2. **Anonymity is structural.** Anonymous submissions: `invitation_id` NULL, no user id, no IP/user-agent anywhere, `submitted_hour` truncated to the hour. The DB CHECK constraint enforcing this stays. The only write path is `rpc.submit_response` (token-validated, single transaction: mark `responded_at`, insert unlinked response).
3. RLS on every table, org-scoped via `app.is_org_member` / `app.has_role`. New table ⇒ RLS + policies in the same migration + a test.
4. Role semantics: `administrator` (settings/privacy/users), `redaktor` (create/send), `leser` (aggregates only — no quote-RPC group filters, no named free text).
5. Tokens hashed at rest (SHA-256), constant-time compare, expiry honored. Signed URLs only for Storage.
6. Zod validation at every server boundary. Service-role key server-side only.
7. No respondent free text in logs, error payloads, or analytics. Sentry scrubbing configured.
8. Schema changes only via `supabase/migrations/`. Never edit applied migrations; add new ones.

## Data-not-code
Question types, template packs, statutory duties, report sections, quality-flag rules, benchmarks, feature flags, and UI messages are **data** (seeded tables / registries). One renderer per question type keyed off the registry. Adding a pack/duty/language is a migration or a row, not a component.

## Testing gates (CI must be green to merge)
- `tsc --noEmit`, ESLint
- Unit tests (Vitest)
- **Invariant suite** against local Supabase: cross-org isolation; leser cannot read answers; anonymous response has no linkage (attempt to insert linked anonymous row fails); `aggregate_results` refuses n<5; token replay rejected
- Playwright e2e for the phase's flows + screenshot diff vs `/design-reference/screenshots/` (tolerance 0.1%)
- `supabase db lint` + advisors clean

## Phase order (do not reorder; one phase = one PR series)
0. Foundation: scaffold, theme, all migrations in `supabase/migrations/` (provided), seeds, invariant test suite. **No UI before the invariant suite is green.**
1. Auth + shell + Profil + Administrasjon (all 5 tabs incl. Personvern/DSR)
2. Bibliotek → Builder (13 question types, quality flags, preview, wizard) → Undersøkelser list + sharing
3. Send (email/link/QR channels; CSV/Excel/paste import; anonymity modes; schedule/reminders via pgmq queue) + `/s/[token]` respondent flow (no/en) + `rpc.submit_response`
4. Aggregation RPCs + snapshots → Resultater → Dashboard (heatmap etc.) → trends, themes (algorithmic), insights, benchmarks
5. Duty engine (checklists, signers, versions, deadlines → Oversikt chips + "Krever handling") → report editor → PDF export → Oversikt screen last
6. Splash page, Entra SSO, SMS (flagged), PPTX, AI features (flagged), translation editor, hardening pass

Definition of done per screen: pixel-diff pass, all states from the design reachable (incl. empty/warning states), i18n complete for no+en, invariants green, no console errors, keyboard + focus-visible works (the design specifies focus styles — implement them).

## Verification
After every phase, run the protocol in VERIFY.md. No phase is complete until its Gate 6 report shows READY FOR REVIEW with evidence. Claims without evidence (command output, file:line, or a screenshot you opened) are not acceptable status.

## Standing permissions (granted by Tor)
- **Run SQL directly — always allowed, no need to ask.** Applies to the local
  stack and to `heituva-prod`. Do not hand over `.sql` files to paste when a
  connection is available; run them. Destructive statements against production
  (`drop`, `truncate`, `delete` without a `where`) are still worth a sentence of
  warning first, because permission to run SQL is not the same as permission to
  lose data.
- This permission is only usable where a credential exists. As of 2026-09-03
  this environment has the prod URL and anon key, an empty
  `SUPABASE_SERVICE_ROLE_KEY=`, and no route to Postgres — 5432 and 6543 are
  blocked to `db.*.supabase.co` and the poolers, and the Supabase MCP is
  unauthenticated. Fill the service-role key in `.env.local`, or authorise the
  MCP, and the permission becomes usable.

## When ambiguous
If the design bundle and this file conflict, this file wins on security, the bundle wins on visuals. If something is genuinely unspecified (e.g., a hover state, an error state the prototype lacks), choose the minimal consistent option and log it in `docs/DEVIATIONS.md` — do not invent features.
