# PART 1 — Bootstrap prompt (run this BEFORE Phase 0)

## Do these three logins yourself first (browser OAuth — 2 minutes)
```bash
gh auth login          # GitHub CLI
supabase login         # Supabase CLI
vercel login           # Vercel CLI
```
Install any that are missing: `brew install gh` · `npm i -g supabase vercel` (or `brew install supabase/tap/supabase`).

Then put this handoff package and the design zip in an empty folder, `cd` into it, run `claude`, and paste the prompt below.

---

## Paste this into Claude Code

```
You are bootstrapping a new project called HeiTuva. I have already authenticated
gh, supabase, and vercel CLIs. Work step by step and STOP to ask me whenever a
choice is mine (organization, project name collision, region, password storage).
Never print secrets to the terminal in full — write them to .env.local and to my
password manager clipboard instruction instead.

STEP 1 — Repository
- git init; create .gitignore (node_modules, .env*, .next, .vercel, supabase/.temp).
- Move the handoff files into place at repo root: CLAUDE.md, DECISIONS.md,
  README.md, CLAUDE_CODE_PROMPTS.md, docs/, messages/, supabase/.
- Unzip the design bundle into /design-reference/ (it must contain
  heituva-survey-app-design/project/HeiTuva.dc.html). Verify that path exists.
- Commit, then: gh repo create heituva --private --source=. --push

STEP 2 — Supabase project
- Run `supabase orgs list` and show me the organizations; ask which one to use.
- Generate a strong DB password, write it to .env.local as SUPABASE_DB_PASSWORD,
  and tell me to save it in my password manager (do not echo it).
- Create the project:
  supabase projects create heituva-prod --org-id <chosen> --region eu-central-1 --db-password <generated>
  (Check `supabase projects create --help` first for the exact current flags.)
- Wait for it to finish provisioning, then `supabase link --project-ref <ref>`.
- Fetch keys with `supabase projects api-keys --project-ref <ref>` and write
  NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
  into .env.local (which is gitignored).

STEP 3 — Apply the database
- First verify locally: `supabase start` then `supabase db reset` (applies
  supabase/migrations/* and supabase/seed.sql). Fix any SQL errors by amending the
  migration files — they have never been applied remotely yet, so amending is safe
  at this point only. Show me a diff of anything you change and why.
- Confirm the seed landed: count rows in template_packs (expect 17),
  duty_definitions (4), question_bank (12), report_section_types (10), ui_messages (>0).
- Then push to the remote project: `supabase db push` and run the seed against it.
- Enable extensions on the remote project via a new migration:
  create extension if not exists pg_cron; create extension if not exists pgmq;
  and schedule the retention job:
  select cron.schedule('retention-daily','0 3 * * *', $$select app.apply_retention()$$);
  If Supabase requires these to be enabled from the dashboard, tell me exactly
  which toggles to flip instead of guessing.

STEP 4 — Vercel
- `vercel link` (create new project named heituva), then `vercel git connect`.
- Add env vars to all three environments with `vercel env add` for:
  NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
  Skip SES vars for now — the mail adapter uses a console transport until Phase 3.
- Do NOT deploy yet; there is no app code until Phase 0.

STEP 5 — Report back
Print a checklist of what succeeded, and a short list of anything I must do
manually in a browser (I already know about: enabling PITR on the Supabase
project, and optionally the Vercel–Supabase marketplace integration). Then stop.
Do not start Phase 0.
```

---

## After it finishes — what you do in a browser (5 minutes)
1. **Supabase → Settings → Add-ons → Point-in-Time Recovery**: enable (requires Pro plan). Without this you only have daily backups.
2. **Supabase → Authentication → Providers**: confirm Email is enabled; set Site URL and redirect URLs once Vercel gives you a domain (Phase 1 will need this).
3. **Optional — Vercel → Integrations → Supabase**: connecting it keeps env vars in sync automatically going forward. The bootstrap already set them manually, so this is convenience, not a requirement.
4. **Later, before Phase 3**: create AWS SES in `eu-north-1`, verify your sending domain, and add `SES_REGION` / `SES_ACCESS_KEY_ID` / `SES_SECRET_ACCESS_KEY` to Vercel.

Then paste the Phase 0 prompt from `CLAUDE_CODE_PROMPTS.md`.
