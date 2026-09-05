# AUTHORIZE.md — granting Claude Code the access CLAUDE.md assumes

CLAUDE.md's **Operating authority** section states what Claude Code may do. This file is how it actually gets the ability. A document cannot grant access; credentials and tool permissions do.

Do these once. After that, sessions stop stalling on "the MCP is unauthenticated" or "you'll need to apply this yourself."

## 1. Supabase MCP
```bash
claude mcp add --scope user --transport http supabase https://mcp.supabase.com/mcp
```
Then, in a Claude Code session, run `/mcp` and complete the OAuth flow in the browser. Verify it took:

```
List my Supabase projects and show the migration versions applied to heituva-prod.
```

If that returns the project and its `schema_migrations` tail, the MCP is live and migration drift stops being your problem.

## 2. CLI credentials
```bash
supabase login                    # already done
vercel login                      # already done
gh auth login                     # already done
supabase link --project-ref <ref> # in the repo
vercel link                       # in the repo
```
For non-interactive use in longer runs, generate tokens and export them in your shell profile so Claude Code inherits them:
- `SUPABASE_ACCESS_TOKEN` — Supabase dashboard → Account → Access Tokens
- `VERCEL_TOKEN` — Vercel → Settings → Tokens
- `GITHUB_TOKEN` — or rely on `gh`'s stored credential

Keep these in your shell profile or keychain, never in the repo. `.env*` is gitignored; verify that stays true.

## 3. Permission allow-list
Claude Code asks before running commands it hasn't been permitted. To stop the per-command prompts, add an allow-list at `.claude/settings.json` in the repo:

```json
{
  "permissions": {
    "allow": [
      "Bash(npm:*)", "Bash(npx:*)", "Bash(pnpm:*)",
      "Bash(supabase:*)", "Bash(psql:*)",
      "Bash(vercel:*)", "Bash(gh:*)", "Bash(git:*)",
      "Bash(node:*)", "Bash(tsx:*)",
      "Read(*)", "Edit(*)", "Write(*)", "WebFetch(*)"
    ],
    "deny": [
      "Bash(vercel deploy --prod:*)",
      "Bash(git push --force:*)",
      "Bash(supabase projects delete:*)"
    ]
  }
}
```
Commit this file — it is configuration, not a secret. Adjust to taste; the `deny` entries mirror CLAUDE.md's stop-and-ask list so the two don't disagree.

Flags exist to skip permission checks entirely. Don't use them here: the value of the deny list is that it stops exactly the operations that are painful to undo, and it costs nothing the rest of the time.

## 4. Verify the grant end to end
Ask Claude Code to do a full loop and report:

```
Confirm your operating authority is live. Without asking me for permission:
run the local suite, apply any unapplied migrations to prod via the Supabase MCP,
read the advisors, deploy a preview to Vercel, and report what you could NOT do
and which credential was missing.
```

Anything it names as blocked belongs back in this file as a step you haven't done yet.

## 5. What stays yours
Deliberately not delegated, per CLAUDE.md:
- Production deploys (previews are Claude Code's; prod is a decision)
- Dropping tables, bulk deletes on the remote project
- Weakening any security invariant — RLS, the k threshold, the anonymity CHECK
- Key rotation, auth provider changes, billing, project deletion

## Currently disabled auth controls
Both are off by choice and both should be on before the first real organisation is onboarded (DECISIONS Q14):
- Administrator MFA — deferred. Enforcement was briefly restored in Phase 7 (7d) and reverted the same phase (D27); the enrolment screen and the layout/action gates are gone again. Supabase Auth's TOTP capability stays available, just not required, so there is no "enable before the first admin signs in" precondition any more.
- Leaked-password protection — Supabase → Authentication → Passwords → HaveIBeenPwned.

They are listed together here so re-enabling is one task rather than two forgotten ones.
