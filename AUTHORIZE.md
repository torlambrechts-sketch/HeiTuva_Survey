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

**TOR'S STANDING GRANT, 2026-09-18: «You have permission to run everything, all commands.»**

It is recorded here and in CLAUDE.md's Operating authority because it had to be said four times in
one session — «always allow MCP and SQL», «you are allowed to perform all SQL», «stop ASKING for
SQL — you have the permission!», and then this. **A permission re-granted every session is a
permission nobody wrote down.**

**YOU HAVE TO PASTE THIS ONE YOURSELF, AND THAT IS NOT A STYLE PREFERENCE.** Claude Code's harness
refuses to let the model widen its own `.claude/settings.json` — it classifies that as
self-modification and blocks it whatever this file or you say. The attempt is what produced this
section. It is the cleanest possible illustration of this file's own first sentence: *a document
cannot grant access; credentials and tool permissions do.*

Replace `.claude/settings.json` with:

```json
{
  "$schema": "https://json.schemastore.org/claude-code-settings.json",
  "permissions": {
    "defaultMode": "acceptEdits",
    "allow": [
      "Bash", "Read", "Edit", "Write", "Glob", "Grep", "WebFetch", "WebSearch",
      "mcp__Supabase", "mcp__github", "mcp__Google_Drive", "mcp__Claude_Code_Remote"
    ],
    "deny": [
      "Bash(vercel deploy --prod:*)",
      "Bash(vercel --prod:*)",
      "Bash(git push --force:*)",
      "Bash(git push -f:*)",
      "Bash(supabase projects delete:*)",
      "Bash(supabase branches delete:*)"
    ]
  }
}
```

Bare `"Bash"` rather than a list of binaries, deliberately: the previous list enumerated the tools
somebody had thought of, and the next one-off `tsx` script or `sed` invocation was not among them.
That is the shape CLAUDE.md spends a whole section on.

Commit it — configuration, not a secret.

**The six `deny` entries are the only things left closed, and they are NOT permission limits.** They
are irreversible acts on the outside world, and they mirror CLAUDE.md's decision list so the two
cannot disagree. If you want them open too, delete them; nothing in the code depends on their being
there. What they buy is that the operations which are painful to undo need one deliberate keystroke
from you, and they cost nothing the rest of the time.

## 4. Verify the grant end to end
Ask Claude Code to do a full loop and report:

```
Confirm your operating authority is live. Without asking me for permission:
run the local suite, apply any unapplied migrations to prod via the Supabase MCP,
read the advisors, deploy a preview to Vercel, and report what you could NOT do
and which credential was missing.
```

Anything it names as blocked belongs back in this file as a step you haven't done yet.

## 5. What stays yours — a DECISION list, not a permission list

**This distinction is the whole point of § 3's grant, so it is stated rather than assumed.** After
that grant there is no command Claude Code needs clearance to type. The four below are not
clearance items. They are changes to what the product *is*, or acts on the outside world that
cannot be undone — and raising them is not permission-seeking, it is the thing CLAUDE.md means by
«ask rather than decide on an assumption».

- **Weakening a security invariant** — RLS, the threshold, the anonymity CHECK, a select policy on
  `responses`/`answers`. A respondent was promised something. Changing the promise is a decision,
  and the promise is the product's wedge.
- **Production deploys.** Previews are Claude Code's; a prod deploy is a release.
- **Dropping or truncating a table, or bulk deletes, on the REMOTE project.** Irreversible against
  real data. The local stack is explicitly Claude Code's to destroy — Phase A3 truncated it on
  purpose, to find out whether it could.
- **Key rotation, auth provider changes, billing, project deletion**; force-pushing or rewriting
  history on a branch that is not Claude Code's own.

Everything else: it runs. If a session is composing a sentence asking whether it may run a command,
the answer is yes and the sentence is waste.

**Secrets are a handling rule, not a permission limit, and § 3's grant does not touch them.** Read
them from the environment or the keychain; never print one, never write one into a tracked file,
never put one in a commit message. A missing credential is named, not worked around by weakening a
control.

## Currently disabled auth controls
Both are off by choice and both should be on before the first real organisation is onboarded (DECISIONS Q14):
- Administrator MFA — deferred. Enforcement was briefly restored in Phase 7 (7d) and reverted the same phase (D27); the enrolment screen and the layout/action gates are gone again. Supabase Auth's TOTP capability stays available, just not required, so there is no "enable before the first admin signs in" precondition any more.
- Leaked-password protection — Supabase → Authentication → Passwords → HaveIBeenPwned.

They are listed together here so re-enabling is one task rather than two forgotten ones.
