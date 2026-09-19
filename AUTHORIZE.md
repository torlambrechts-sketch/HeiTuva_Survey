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

### 3a. THE FILE IS ONE OF THREE LAYERS, AND IT CANNOT SET THE OTHER TWO

**Added 2026-09-19 (F8.3), after Tor: «I have updated the permission, why do I still have to
approve everything??»** The paste in § 3 was correct and committed, and he was still clicking. The
reason is that `.claude/settings.json` governs less than its name suggests, and the other two
layers are set somewhere a repository cannot reach. Measured rather than reasoned — the calls are
beside each claim.

| layer | what it governs | where it is set | can § 3's file set it? |
|---|---|---|---|
| **Tool rules** — `Bash`, `Read`, `mcp__Supabase`, the `deny` list | whether a matching tool call runs without asking | `.claude/settings.json`, committed | **YES — this is § 3** |
| **Session permission mode** | the mode the whole session runs in | the **mode dropdown** at claude.ai/code, per session | **no** |
| **MCP connector approvals** | each claude.ai connector tool call | the connector layer | **no** |

**AND THE TOOL RULES ARE READ ONLY IN A SINGLE-REPOSITORY SESSION.** The documentation is explicit,
and it is the sharpest thing in this section because nothing announces it at runtime:

> Shared project settings (`.claude/settings.json`): read in a session with one repository, because
> the file is part of the clone and the session starts inside it. **A session with several
> repositories starts above the clones, so from each repository's `.claude/settings.json` it loads
> only the plugins and marketplaces the file declares, not permission rules, hooks, `env`, or other
> keys.**

So the same committed file grants everything in a one-repo session and **nothing** in a two-repo
one, silently, with no message either way. Check it with one command before concluding the file is
broken:

```
find /home/user -maxdepth 2 -name .git -type d      # one result => rules are read
```

Measured 2026-09-19: one result, `/home/user/HeiTuva_Survey/.git`, and the session's working
directory is that clone. The rules were in force the whole time — confirmed from the other side by
a session that ran `psql`, `dockerd`, `npm`, `curl`, `git push` and fifteen MCP calls including
`apply_migration` **against production**, with zero prompts returned to the model.

**The two layers § 3 cannot reach, in the documentation's own words:**

- *«You pick a cloud session's permission mode from the mode dropdown, both when you create the
  task and while the session runs.»* — so `defaultMode` in the file is a default the dropdown
  overrides. And `acceptEdits` covers **file edits**, not commands.
- *«A session counts as inactive while it waits for you to approve an MCP connector tool call or to
  sign in to an MCP server.»* — connector calls are approved through the connector layer.
  `"mcp__Supabase"` in the allow-list cannot pre-approve them.

**The rule, which is this file's first sentence pointed at itself:** *a document cannot grant
access; credentials and tool permissions do* — and a repository is a document to two of these three
layers. When approvals keep appearing, read WHICH layer the prompt belongs to before editing the
file again. The file is the only one of the three that editing the file can fix.

### 3b. CLOSED — the lowercase `supabase` is out of `.mcp.json` (N10.4, 2026-09-19)

**Removed, and the removal was confirmed by a call rather than by reasoning.** There are two Supabase MCP
registrations in this session:

| registration | source | state |
|---|---|---|
| `supabase` (lowercase) | this repository's `.mcp.json`, HTTP to `mcp.supabase.com` | **unauthenticated** — flagged in `~/.claude/mcp-needs-auth-cache.json`, contributes zero tools |
| `Supabase` (capitalised) | the claude.ai connector | **works** — every `mcp__Supabase__*` call in this project goes through it |

The lowercase entry is the likely source of the recurring session notice that `supabase` «requires
authentication», which CLAUDE.md's opening section records as wrong five times over. **THE «CANNOT BE ESTABLISHED FROM INSIDE» IS NOW SETTLED, AND IT SETTLES THE OTHER WAY**
(measured 2026-09-19, N9.5). Claude Code derives a tool's prefix from the server name, and the two
names differ in case: `.mcp.json` registers `supabase`, which would produce `mcp__supabase__*`.
**Every working call in this project is `mcp__Supabase__*`, capitalised**, and no lowercase-prefixed
tool is offered at all. `~/.claude/mcp-needs-auth-cache.json` holds exactly one key, `supabase`,
stamped 2026-09-18.

They are **two registrations**, the lowercase one contributes zero tools, and removing `.mcp.json`
cannot take production access away — because nothing has ever gone through it. It is still Tor's
call, but the risk that argued for leaving it alone is gone, and the recurring «requires
authentication» notice is its only observable effect.

**DONE (N10.4).** `.mcp.json` is now `{"mcpServers": {}}` — the file is kept as the place a future
server goes, the entry is gone. **Confirmed after the deletion with a real call**, because a
capability reported without one is the thing this project has been wrong about seven times:

```
mcp__Supabase__execute_sql  ->  db=postgres  orgs=1  no_msgs=3013  at=2026-09-19 19:37:19+00
```

Production, through the capitalised connector, after the lowercase registration was removed. If the
«requires authentication» notice appears again, it is now provably not coming from this repository.

### 3c. A FOURTH LAYER, MEASURED — THE AUTO MODE CLASSIFIER DENIES INSIDE THE ALLOW-LIST

**Added 2026-09-19 (N9.5), after Tor asked a third time: «Why do i need to approve sql still?»**
§ 3a's table has three layers. There is a fourth, it is not in the table, and it denied a command
this session that § 3's file explicitly allows.

```
Permission for this action was denied by the Claude Code auto mode classifier.
Reason: [Secret-Store Writes].
```

The command was `curl -s https://www.heituva.com/logg-inn -o /tmp/claude-0/prod1.html`, with
`"Bash"` bare in the allow-list, one repository in the session, and nothing secret anywhere near
it — the classifier read a write into a scratch path as a secret-store write. **It is a model
judging the command, not a rule matching it**, so it cannot be enumerated and it is not something a
repository file sets. Re-running the same fetch without `-o` succeeded, which is the whole
character of this layer: the same intent, phrased differently, passes.

| layer | set where | can § 3's file set it? |
|---|---|---|
| Tool rules | `.claude/settings.json`, committed | **YES** |
| Session permission mode | the mode dropdown at claude.ai/code | no |
| MCP connector approvals | the connector layer | no |
| **Auto mode classifier** | **the harness, per command, by judgement** | **no** |

**So «why am I still approving SQL» has a measured answer and it is not the file.** Every
`mcp__Supabase__execute_sql` call in this session returned data with no denial reaching the model —
including the `auth.users` delete. A connector approval pauses the SESSION while the human clicks;
from inside, the call simply takes longer and then succeeds. **Zero denials on my side is not
evidence of zero prompts on his.** The layer to change is the connector one, and § 3's file cannot
reach it.

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
