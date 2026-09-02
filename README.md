# HeiTuva — Handoff Package (v0.2)

Everything needed to go from this folder to Claude Code building the app. Read in this order: `DECISIONS.md` → this file → `CLAUDE.md`.

## What's in this package
```
heituva-handoff/
├── README.md                  ← you are here (setup + kickoff instructions)
├── CLAUDE.md                  ← the contract Claude Code reads every session
├── DECISIONS.md               ← all 14 decisions (1 confirmed, 13 defaults you can overrule)
├── messages/
│   ├── no.json                ← Norwegian UI copy (source language)
│   └── en.json                ← English UI copy
└── supabase/
    ├── migrations/            ← 9 migrations: schema, RLS, security RPCs
    │   ├── ..._foundation.sql       (enums, helpers, k=5 constant, token hashing)
    │   ├── ..._tenancy.sql          (organizations, members, groups, profiles)
    │   ├── ..._surveys.sql          (surveys, 13 question types, translations, bank, packs)
    │   ├── ..._distribution.sql     (rounds, invitations, share links, imports, schedules)
    │   ├── ..._answers.sql          (the locked answers vault + structural-anonymity CHECK)
    │   ├── ..._compliance_reports.sql (duty engine, reports, archive versions, benchmarks)
    │   ├── ..._ops_i18n.sql         (ui_messages, DSR, audit, flags, retention job)
    │   ├── ..._rls_policies.sql     (every policy; responses/answers deliberately have none)
    │   └── ..._rpcs.sql             (submit_response, aggregate_results, get_quotes)
    └── seed.sql               ← 17 template packs, 4 statutory duties, question bank,
                                 section registry, quality rules, benchmarks, respondent i18n
```

## Part 1 — One-time setup (you, ~30 minutes)

### 1. Supabase
1. Create a new Supabase project — **region `eu-central-1` (Frankfurt)**. Name: `heituva-prod`. Create a second project `heituva-staging` (same region) if you want the staging rung immediately; otherwise add it before first customer.
2. In project settings: enable **Point-in-Time Recovery**; under Auth, enable Email provider (magic link + password), set Site URL to your Vercel domain later.
3. Note the project ref, anon key, service-role key.

### 2. GitHub repo
```bash
mkdir heituva && cd heituva && git init
# copy this entire handoff package into the repo root:
#   CLAUDE.md, DECISIONS.md, messages/, supabase/
# copy the ORIGINAL design bundle into the repo as the visual source of truth:
mkdir design-reference
unzip HeiTuva_survey_app_design-handoff.zip -d design-reference/
git add -A && git commit -m "chore: handoff package + design reference"
gh repo create heituva --private --source=. --push
```
The `design-reference/` folder is load-bearing: CLAUDE.md instructs Claude Code to read the actual design HTML for every screen it builds. Don't skip it.

### 3. Link Supabase and apply Phase 0
```bash
npm i -g supabase
supabase init          # accept defaults; keeps our migrations folder
supabase login
supabase link --project-ref <your-project-ref>
supabase db push       # applies the 9 migrations
supabase db reset --linked=false   # optional: verify locally first (starts local stack, applies migrations + seed)
psql "$SUPABASE_DB_URL" -f supabase/seed.sql   # or: supabase db push includes seed on local reset
```
If `db push` reports drift later, never edit applied migrations — add new ones.

### 4. Vercel
1. Import the GitHub repo in Vercel (framework auto-detects once Next.js is scaffolded in Phase 0 — you can also wait and let Claude Code's first PR trigger the import).
2. Install the **Supabase integration for Vercel** and connect the project — this injects `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` (+ service role as server env) into all environments, which matches your "connected through Vercel" setup.
3. Add env vars: `SES_REGION=eu-north-1`, `SES_ACCESS_KEY_ID`, `SES_SECRET_ACCESS_KEY` (or leave email unset until Phase 3 — the mail adapter has a console/dev transport).

### 5. Cron & retention (can wait until Phase 3, listed here so it isn't forgotten)
- Supabase → Database → Extensions: enable `pg_cron` and `pgmq`.
- Schedule: `select cron.schedule('retention-daily','0 3 * * *', $$select app.apply_retention()$$);`

## Part 2 — Kick off Claude Code

From the repo root, run `claude` and paste this kickoff prompt:

```
Read CLAUDE.md, DECISIONS.md, and docs/HeiTuva_Implementation_Plan.md in full.
The design source of truth is /design-reference/heituva-survey-app-design/ —
read its README.md and project/HeiTuva.dc.html before building any screen.

Execute Phase 0 now:
1. Scaffold Next.js (App Router, TypeScript strict) with Tailwind configured
   from the exact theme tokens in CLAUDE.md, shadcn/ui initialized, next-intl
   wired to load messages from the ui_messages table (seeded from /messages)
   with tag-based revalidation and fallback chain lang → no → visible key.
2. Set up the Supabase client pattern: browser client (anon), server client,
   and a server-only service-role client used exclusively in server actions.
3. Write scripts/seed-i18n.ts that upserts /messages/*.json into ui_messages,
   and a script that generates a TypeScript key union from messages/no.json.
4. Build the invariant test suite (Vitest against local Supabase) proving:
   (a) cross-org isolation on surveys and members,
   (b) role 'leser' cannot select from responses or answers,
   (c) inserting an anonymous response with an invitation_id fails (CHECK),
   (d) aggregate_results returns insufficient_data when n < 5 and data at n >= 5,
   (e) submit_response rejects a reused invitation token,
   (f) get_quotes refuses a group filter for role 'leser'.
5. Set up GitHub Actions running: tsc, eslint, the invariant suite on a local
   Supabase, and supabase db lint.
Do not build any UI in this phase. Stop when CI is green and show me the test output.
```

(Also `mkdir docs && cp` the implementation plan markdown into `docs/HeiTuva_Implementation_Plan.md` so the prompt's reference resolves — or adjust the path.)

Then proceed phase by phase (the order is in CLAUDE.md §Phase order). For each subsequent phase, the prompt pattern is:

```
Read CLAUDE.md again. Execute Phase <N>: <phase name>.
Before implementing each screen, read the corresponding section of
/design-reference/.../project/HeiTuva.dc.html and list the states you found
(conditionals, warnings, empty states). Build pixel-perfect per CLAUDE.md.
All user-facing strings via next-intl, Norwegian verbatim from the design.
Open a PR per screen group; run the full CI gate before asking me to review.
```

Review rhythm that keeps quality high: merge nothing you haven't looked at in the Vercel preview against the design; when something's off, comment on the PR ("the status chip background is --ac2 in the design, you used --ac") rather than re-prompting from scratch.

## Part 3 — How the i18n editing works day-to-day
- **Change wording without a deploy:** edit the row in `ui_messages` (Supabase Studio → table editor, filter by namespace/key/lang). The app revalidates the language cache tag; the new string is live in seconds. Edits are audit-logged once Phase 1's admin surface exists.
- **Add/rename keys:** edit `messages/no.json` (+ `en.json`), run `scripts/seed-i18n.ts` (also runs in CI on merge). The generated type union makes a missing key a compile error.
- **Consolidate:** `scripts/export-i18n.ts` (Claude Code builds it in Phase 0) writes DB overrides back into the JSON files when you want the repo to reflect reality again.
- **Enable Swedish/Danish later:** their respondent strings are already seeded; add the language to `organizations.active_langs` and translate the remaining namespaces — no code change.

## Part 4 — Overruling a default
Every DEFAULT in `DECISIONS.md` is a one-line instruction to Claude Code, e.g. "Overrule Q6: use Resend instead of SES — swap the mail adapter" or "Overrule Q3: make k-threshold org-configurable with minimum 5". Update DECISIONS.md in the same PR so the register stays true.

## Support boundaries of this package
The migrations are complete and internally consistent but written blind of runtime — expect Claude Code to fix small issues on first `db reset` (a cast, an index name); that's normal and safe since nothing is deployed yet. The RPC `aggregate_results` is a correct v1 (per-value distributions, averages, k-gate); matrix/ranking/field aggregation and the heatmap RPC are Phase 4 work items specified in the plan.
