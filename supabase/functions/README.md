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

**KNOWN DIVERGENCE, recorded rather than deployed over.** The deployed v2 has

```ts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function drain(
  svc: any,
```

and this repository now has `type ServiceClient = any` with the pragma on the
alias instead. The reason for the repo change: once the signature became
multi-line, `eslint-disable-next-line` silently attached to the wrong line and
the rule fired. **Types are erased by Deno, so the emitted JavaScript is
identical** — this is a lint-pragma difference with no runtime effect, and a
third production deploy to fix a comment is a change to production for nothing.
The next deploy that carries a real code change reconciles it.

Written down because an unrecorded difference between a repository and a running
system is how the two stop being the same thing, and this project has paid for
that lesson twice: `overview_activity` hand-applied, and the two functions whose
comment blocks were abridged on their way to the MCP payload.
