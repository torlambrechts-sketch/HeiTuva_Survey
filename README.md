# HeiTuva — Handoff Package (v0.3)

Everything needed to go from this folder to a production app. **This file is the index; it contains no prompts.** Every prompt lives in one of the three prompt files, so there is exactly one copy of each.

## Files
```
heituva-handoff/
├── README.md                    ← you are here: setup, order of operations, index
├── DECISIONS.md                 ← 16 decisions (2 confirmed, 14 defaults you can overrule)
├── CLAUDE.md                    ← the contract Claude Code reads every session
├── PART1_BOOTSTRAP_PROMPT.md    ← PROMPT: provisions repo, Supabase, Vercel
├── CLAUDE_CODE_PROMPTS.md       ← PROMPTS: one per phase (0–6) + a review prompt
├── VERIFY.md                    ← PROMPTS: harness setup + the 7-gate verification protocol
├── docs/
│   ├── HeiTuva_Implementation_Plan.md   ← full analysis, architecture, schema rationale
│   ├── RESPONSIVE.md            ← mobile/tablet spec (the layouts the prototype lacks)
│   └── DEVIATIONS.md            ← running log of design deviations (D12 = to-fix)
├── messages/
│   ├── no.json                  ← Norwegian UI copy (source language)
│   └── en.json                  ← English UI copy
└── supabase/
    ├── migrations/              ← 9 migrations: schema, RLS, security RPCs
    │   ├── ..._foundation.sql          (enums, helpers, k=5 constant, token hashing)
    │   ├── ..._tenancy.sql             (organizations, members, groups, profiles)
    │   ├── ..._surveys.sql             (surveys, 13 question types, translations, bank, packs)
    │   ├── ..._distribution.sql        (rounds, invitations, share links, imports, schedules)
    │   ├── ..._answers.sql             (the locked answers vault + structural-anonymity CHECK)
    │   ├── ..._compliance_reports.sql  (duty engine, reports, archive versions, benchmarks)
    │   ├── ..._ops_i18n.sql            (ui_messages, DSR, audit, flags, retention job)
    │   ├── ..._rls_policies.sql        (every policy; responses/answers deliberately have none)
    │   └── ..._rpcs.sql                (submit_response, aggregate_results, get_quotes)
    └── seed.sql                 ← 17 template packs, 4 statutory duties, question bank,
                                   section registry, quality rules, benchmarks, respondent i18n
```

## Order of operations

| Step | You do | Prompt to paste |
|------|--------|-----------------|
| 1 | Read `DECISIONS.md`; overrule any default you disagree with | — |
| 2 | Log in: `gh auth login`, `supabase login`, `vercel login` | — |
| 3 | Put this package + the design zip in an empty folder, run `claude` | **PART1_BOOTSTRAP_PROMPT.md** |
| 4 | Enable PITR in the Supabase dashboard (see that file's closing checklist) | — |
| 5 | Build the foundation | **CLAUDE_CODE_PROMPTS.md** → Phase 0 |
| 6 | Build the verification harness | **VERIFY.md** → one-time setup |
| 7 | Verify Phase 0 | **VERIFY.md** → the protocol |
| 8 | Repeat per phase: build → verify → you review the Vercel preview | Phases 1–6, protocol each time |

Do not skip step 7 on Phase 0. The invariant suite built there is what every later phase's security verification rests on; if it is weak, everything downstream inherits the weakness.

## Prerequisites
- Node 18+, `npm i -g supabase vercel`, `gh` (or `brew install gh supabase/tap/supabase`)
- A Supabase organization (Pro plan if you want PITR, which you should)
- The original design zip, `HeiTuva_survey_app_design-handoff.zip`

The bootstrap prompt extracts the design bundle to `/design-reference/` in the repo. **This is load-bearing**, not documentation: CLAUDE.md and every phase prompt instruct Claude Code to read the actual design HTML before building each screen. Without it, fidelity collapses to guesswork.

## Database notes (read before step 3)
- `supabase db push` applies **migrations only**. It does not run `seed.sql`. The bootstrap prompt runs the seed explicitly against the remote project after pushing.
- `supabase db reset` (local) applies migrations *and* seed — that is the local verification path.
- Migrations are the only way schema changes reach a shared environment. Never edit a migration that has been pushed; add a new one.
- The migrations are complete and internally consistent but were written without a live database to run against. Expect Claude Code to fix a small issue or two on the first local `db reset` — a cast, an index name. That is normal and safe: the bootstrap verifies locally *before* pushing remotely, which is the only window where amending a migration file is correct.

## Scope notes worth knowing up front
- **Viewports (DECISIONS Q15 — confirmed):** every surface is responsive in v1. Desktop ≥1280px stays pixel-perfect to the design; below that the prototype has no layouts, so `docs/RESPONSIVE.md` is the specification Claude Code builds and is verified against. Respondent-facing surfaces stay mobile-first pixel-perfect. D12 (header overflow at 390px) is a Phase 1 blocker under this decision.
- **Languages:** Norwegian and English at launch. Swedish and Danish respondent strings are seeded but inactive via `organizations.active_langs`; enabling them later is a config change, not a build.
- **Deferred:** Entra SSO, SMS, PPTX export, AI insights/translation, and billing are Phase 6 and behind feature flags. See DECISIONS Q5–Q10.

## Day-to-day: editing UI copy without a deploy
Edit the row in `ui_messages` (Supabase Studio → table editor, filter by namespace/key/lang). The language cache tag revalidates and the string is live in seconds. New keys go through `messages/*.json` + `scripts/seed-i18n.ts` so the generated type union keeps a missing key a compile error. `scripts/export-i18n.ts` writes DB overrides back to the JSON files when you want the repo to reflect reality again.

## Overruling a default
Every DEFAULT in `DECISIONS.md` is one line to Claude Code — "Overrule Q6: use Resend instead of SES, swap the mail adapter." Update DECISIONS.md in the same PR so the register stays true. Anything Claude Code decides that the design did not specify goes in `docs/DEVIATIONS.md`, reviewed together in Phase 6.
