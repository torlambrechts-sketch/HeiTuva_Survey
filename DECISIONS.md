# HeiTuva — Decision Register (v0.2)

Status legend: **CONFIRMED** = decided by Tor · **DEFAULT** = Claude-recommended default, applied so the build can start; overrule with a one-line instruction and the plan/migrations adjust.

| # | Question | Decision | Rationale / consequence |
|---|----------|----------|--------------------------|
| Q1 | Tenancy | **DEFAULT: Multi-tenant SaaS from day one.** | Splash page has pricing; retrofitting tenancy is far costlier than building it in. `organizations` is the RLS root everywhere. |
| Q2 | Anonymity vs reminders | **DEFAULT: Invitation/answer decoupling.** | `survey_invitations.responded_at` records participation; `responses` for anonymous submissions carry no invitation id, no user id, no IP/UA, and hour-truncated timestamps. Reminders work; linkage is structurally impossible. Enforced by DB constraint + the single submission RPC. |
| Q3 | k=5 disableable? | **DEFAULT: Hard-on, non-disableable.** | The Personvern toggle renders as informational ("Alltid på"). A toggleable anonymity guarantee is not a guarantee. Applies to all aggregate reads via RPC — anonymous *and* named surveys' group breakdowns. |
| Q4 | Respondent identity | **DEFAULT: Tokenized email links only in v1.** | `survey_invitations.identity_provider` column (nullable) reserved for BankID/ID-porten later; duty **signing** records member + timestamp + content hash (audit-grade, not qualified signature) in v1. |
| Q5 | Auth | **DEFAULT: Supabase Auth (email invite → password or magic link) in v1; Entra ID SSO in Phase 6.** | The admin "Pålogging med Entra ID (SSO)" toggle ships disabled with "kommer" badge until Phase 6. |
| Q6 | Email/SMS providers | **DEFAULT: Amazon SES `eu-north-1` (Stockholm) for email; SMS deferred to Phase 6 (LINK Mobility when enabled).** | Keeps the "EU/EØS only" promise honest. If you prefer Resend's DX and accept US processing for transactional mail, say so — it's a provider-adapter swap (`lib/mail/` interface). SMS channel UI ships behind a feature flag. |
| Q7 | AI features | **DEFAULT: v1 algorithmic.** | Free-text themes = keyword/stem grouping (as the prototype's `THEME_WORDS`); insights = rule-based (lowest questions, trend deltas, participation gaps). Anthropic-API theming/insights behind `feature_flags.ai_insights`, Phase 6, pending your data-processing posture on free text leaving Supabase. |
| Q8 | Benchmarks | **DEFAULT: Seeded static Norwegian reference values, panel footnoted with source.** | `benchmarks` table seeded; cross-tenant aggregation is a later product decision (needs DPA language). |
| Q9 | Import scope | **DEFAULT: CSV / Excel / paste real in v1; Entra ID, Google Workspace, HR-systems as stubs behind the same UI ("kommer").** | Same import UI as designed; sync sources gated by `feature_flags`. |
| Q10 | Exports & splash | **DEFAULT: PDF export in v1 (server-side, @react-pdf or Playwright-print); PPTX Phase 6. Splash built pixel-perfect in Phase 6 with pricing CTA = "Kontakt oss" (no Stripe in v1).** | "All parts of the design" honored; billing engine deferred until there's a paying pipeline. |
| Q11 | App languages | **CONFIRMED: Norwegian + English at launch.** | Both surfaces (admin app and respondent) ship no + en. sv/da strings from the design are seeded in `ui_messages` but the languages are inactive (`organizations.active_langs`) — enabling them later is a config change, not a build. |
| Q12 | Translation editing | **DEFAULT: Supabase Studio (direct `ui_messages` edits) initially; admin editor screen in Phase 6.** | Edits are cache-revalidated live either way. |
| Q13 | AI-assisted survey translation | **DEFAULT: Manual-only in v1.** | Statutory packs ship pre-translated as seed data (no/en). |
| Q14 | MFA for administrators | **DEFAULT: Required (TOTP via Supabase MFA).** | Admins control privacy settings and DSR handling; enforced at login for role=administrator. |

## Standing invariants (not decisions — never violated)
1. No client ever selects from `responses`/`answers`. Reads only via SECURITY DEFINER aggregate RPCs enforcing n ≥ 5 per cell.
2. Anonymous responses can never reference an invitation, user, IP, or precise timestamp. DB CHECK constraint + RPC design.
3. All schema changes via migrations; RLS enabled on every table in the same migration that creates it.
4. Tokens stored hashed; compared constant-time; expiring.
5. EU/EØS residency: Supabase `eu-central-1`, EU-region providers only (see Q6), Sentry EU, no respondent free text in logs or error payloads.
6. Pixel-perfect to the design bundle tokens; deviations only where DECISIONS.md or the plan says so.
