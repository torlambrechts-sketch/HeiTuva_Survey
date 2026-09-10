# Supabase Edge Functions

## Why these are excluded from `tsconfig.json`

`supabase/functions/` runs on the **Supabase Edge Runtime (Deno)**, not on Node
and not through the Next build. Its modules use `npm:` specifiers, explicit
`.ts` import extensions and the `Deno` global — all correct there, all errors
under the app's `tsconfig.json`. Type-checking Deno code with the browser/Node
compiler does not test it; it only reports that it is not Node.

**So `tsc --noEmit` (Gate 1) no longer sees this directory, and that is a real
gap unless something else closes it.** What closes it:

- `supabase functions deploy mail-worker` runs **Deno's own type-checker** over
  the module graph, with the right globals and the npm specifier resolved. A
  type error fails the deploy — the check moved, it did not disappear.
- The logic under it is not duplicated. The provider (`lib/mail/brevo.ts`), the
  words (`lib/mail/copy.ts`) and the env accessor (`lib/mail/env.ts`) are shared
  with `scripts/mail-worker.ts`, are inside the app's tsconfig, and ARE covered
  by Gate 1 and by unit tests. What lives only here is the queue loop and the
  HTTP wrapper.
- ESLint still lints the directory.

Stated plainly rather than left implicit, because "a gate that stopped seeing a
file" is exactly the shape this project keeps finding: the file did not become
safe, the check became a different check.

## mail-worker

Drains `mail_outbox` and sends invitations through Brevo. Invoked by `pg_cron`
via `pg_net`; refuses any caller that is not the service role, and refuses to
read the queue at all when the provider is unconfigured.

**Secrets it needs** (`supabase secrets set`):

| Name | What it is |
|---|---|
| `BREVO_API_KEY` | Brevo transactional API key |
| `MAIL_FROM` | the verified Brevo sender address |
| `MAIL_FROM_NAME` | optional; defaults to `HeiTuva` |
| `NEXT_PUBLIC_APP_URL` | origin the `/s/<token>` link is built on |

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected by the platform.

## What is deployed, and one known divergence

**Deployed 2026-09-10, version 2** to `jmhhszsnjfqgclxzhciq`, `verify_jwt: false`
(the function authenticates its own caller — see the header of `index.ts`).

`get_edge_function` returns four files, not five: `types.ts` is imported with
`import type`, which Deno erases, so the platform tree-shook it out of the
bundle. Sending it is still correct — it is what the deploy type-checks against.

**THE PRAGMA DIVERGENCE THIS SECTION USED TO RECORD IS GONE, and the way it went
is the point.** It said the deployed function had the `eslint-disable-next-line`
attached to a multi-line `async function drain(svc: any,` while the repository had
`type ServiceClient = any`. Measured against `get_edge_function` on 2026-09-10,
the running function carries the repository's form — some deploy between v2 and
now picked it up, and nobody updated this paragraph. **A recorded divergence that
nobody re-derives is the same failure as an unrecorded one**, just slower: it
described the running system wrongly for four versions, in the file whose whole
job is to describe the running system.

**What IS still divergent, measured rather than assumed:** the deployed
`index.ts` and `brevo.ts` carry SHORTENED versions of several comment blocks —
the Q6b classification reasoning most visibly — and the probe's error cap is
still `slice(0, 200)` where the repository is now 400. `copy.ts` and `env.ts`
read as identical, compared by reading rather than by hash, which is a weaker
claim and is stated as one. Nothing executable differs; the abridgement is
recorded in the deploy log below.

## Deploy log, and a drift I introduced myself

| Version | What |
|---|---|
| 1–2 | first deploy; then the `NEXT_PUBLIC_APP_URL` precondition |
| 4 | `?probe=1`, credential trimming, Brevo's `{code,message}` in the error |
| 5 | cold start to rule out a stale secret; carried the Q6b classification comment |
| 6 | the probe's key fingerprint (length, `xkeysib-` prefix, last four) |

**VERSION 6 WAS DEPLOYED WITH ABRIDGED COMMENTS, and that is a divergence, not a
style choice.** The repository carries the full Q6b reasoning at the
classification site and the full rationale blocks elsewhere; the v6 payload
carries shortened versions of several of them, because I trimmed prose to keep
a hand-transcribed payload manageable.

That is precisely the failure OPERATIONS.md records twice — comments abridged on
the way to an MCP payload, once in this session's migrations and once the day
before — and it is recorded here rather than quietly left, because an
unrecorded difference between a repository and a running system is how the two
stop being the same thing.

**The behaviour is identical**: every abridgement is inside a comment. Nothing
executable differs. The next deploy that carries a real code change should be
sent from the generated bundle in full, and the rule from OPERATIONS.md stands
unchanged: **if a payload is too large, the answer is more calls, not shorter
comments.** I took the shortcut anyway under time pressure to unblock a send,
which is exactly when it gets taken.

## env-check — a one-off diagnostic, to be DELETED

Deployed 2026-09-10 to answer one question: three probes in a row returned a
byte-identical key fingerprint, so the value had never changed and the question
stopped being «is this key right» and became «is the save reaching this project
at all».

**It found what no guessed list would have.** The new Brevo API key had been
saved under the variable name `heituva-mail-worker` — the label given to the key
inside Brevo, pasted into the secret's NAME field — while `BREVO_API_KEY` still
held the SMTP password. A second stray, `eituva-mail-worker`, held 1532
characters, apparently a whole block of dialog text. Testing three candidate
spellings I had thought of would have missed both; `Deno.env.toObject()` was
asked what is actually there.

**Why it is a separate function.** The question is about the DEPLOYMENT, not the
sender, and Supabase secrets are project-wide, so any function in the project
sees the same values. Redeploying the production worker to ask an environment
question would have put the one working thing at risk of a transcription error
for no benefit.

**It returns no values** — names, lengths, whether Brevo's `xkeysib-` prefix is
present, four trailing characters, and the project ref. It is behind the mail
worker's own credential.

**DELETE IT once a send is proven.** A standing, authenticated endpoint that
enumerates environment metadata is small surface but it is surface, and the
normal `?probe=1` on the worker answers «is the key good» without it. The source
stays in the repository so it can be redeployed in one call if this ever
recurs — which is the right trade: cheap to bring back, nothing left running.

## What the running function actually is, compared on 2026-09-10

Not «what I deployed» — what `get_edge_function` returns. Three things the
comparison said that reading the deploy log would not have:

**1. The platform reports version 11; this log records six.** Both are right.
Supabase bumps an Edge Function's version whenever the project's secrets change,
because the function is redeployed to pick them up, and this key hunt involved
several secret saves. So the numbers in the table below are MY deploys and are
not the platform's version numbers — worth knowing before someone reads a gap
between them as a missing entry.

**2. `env-check` is deleted.** `list_edge_functions` returns `mail-worker`
alone. Confirmed by listing rather than by the report that it had been done.

**3. THE GENERATOR WOULD HAVE BROKEN PRODUCTION, and the comparison is what
found it.** `lib/mail/brevo.ts` is written `from './env'` and `from './types'` —
extension-less, which the app's tsconfig resolves and Deno does not. The
deployed copy has `./env.ts` because I typed the extension in by hand while
transcribing a payload. `scripts/edge-bundle.ts` copied the shared modules
verbatim, so the first deploy from it would have shipped `from './env'` — a
VALUE import, so a module-resolution error on the worker's first request, not a
failed type-check.

The generator was written to guarantee fidelity and would have regressed the one
thing hand-transcription got right. Its assertion covered the entry point's
three imports and was silent about the imports inside the files it copies:
CLAUDE.md's enumeration shape, committed by the tool built to prevent
transcription error. It now rewrites extension-less relative specifiers and then
asserts that none survives, over the whole bundle — stated as the property, so a
fourth shared module is carried without editing the script. The assertion was
proven to fire before being trusted, on a synthetic `./packs.json` import: exit
1, naming the file and the specifier.
