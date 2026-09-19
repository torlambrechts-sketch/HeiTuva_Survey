# verify:predeploy — the check that would have caught the 2026-09-19 outage

**Not one of VERIFY.md's seven gates. Not in `verify:all`.** It answers a different question from
every gate there: not «is the code correct» but **«is the database this code is about to run
against ready for it»**. It is the only check in the project that names a deploy TARGET.

## What it caught, after the fact

`/undersokelser` returned HTTP 500 to every signed-in user while the Vercel build at `2202dd2` was
green. T3.1's `page.tsx` called `survey_scale_means`; production had no such function, because
M:0131 was unapplied.

Nothing could see it:

| what ran | why it was green |
|---|---|
| `tsc --noEmit` | `.rpc('survey_scale_means')` is a **string literal**. Nothing type-checks it against a database. |
| `types/database.ts` | generated from whatever database the generator last pointed at — **LOCAL**. It confirms the call matches the local schema and says nothing about the deploy target. |
| A1 / F7 catalogue diffs | compare production to the **migration files**. Both sides are the repository. |
| `next build` | compiles and renders; it never calls the database. |

Every existing check compares the code to itself or the database to the files. **Nothing compared
the code to the target database.**

## How it runs

```bash
npm run verify:predeploy                    # against LOCAL_DB_URL
npx tsx scripts/verify/predeploy.ts --db=<url>          # any host with a Postgres route (CI)
npx tsx scripts/verify/predeploy.ts --emit-sql          # production: see below
npx tsx scripts/verify/predeploy.ts --catalogue=<json>  # against a saved catalogue
```

Exit 0 when every function, relation and column the code calls exists on the target; exit 1 with
the missing objects and **the file that calls each one**.

### Production, which has no Postgres route

CLAUDE.md records as settled that **TCP 5432 does not leave a Claude Code container**, by any
hostname, IPv4 pooler included. So `--emit-sql` prints a self-contained query that carries the
requirements INTO the database and returns only the rows the target lacks:

```bash
npx tsx scripts/verify/predeploy.ts --emit-sql > /tmp/predeploy.sql
# run that through the Supabase MCP (HTTPS to api.supabase.com, no socket)
# no rows = ready to deploy
```

The requirements travel to the database rather than the catalogue coming back, because the full
catalogue is ~15 KB of names that would have to be hand-carried — and hand-carrying a payload is
the failure `scripts/edge-bundle.ts` exists to prevent.

## What it sweeps, and the limits, stated

Swept off the source in `app/`, `lib/` and `components/`, with comments stripped first (a file that
documents a refusal contains the string it refuses):

- `.rpc('name')` → **function**
- `.from('table')` → **relation**
- the nearest following `.select('a, b, rel!hint(c)')` → **columns**, splitting on top-level commas
  only, recursing into embedded resources, and resolving `alias:column` to the column.

**Three things it cannot see, and they are limits rather than bugs:**

1. A select built from a **variable** or assembled across a query builder. The `.from`/`.select`
   pairing is a text heuristic and is stated as one in the script.
2. Anything reached through a **SECURITY DEFINER function's body** rather than from the client —
   that is what the A1/F7 catalogue diff covers.
3. **Type and nullability drift.** It asks whether an object EXISTS, not whether its shape still
   matches. A column that changed type is invisible here and visible to F7.

## Proven red before being trusted

Three shapes, each fired with its own message, then restored and re-proven green:

```
function  survey_scale_means      app/(app)/undersokelser/page.tsx   ← the real outage, reproduced
relation  dashboard_shares        app/(app)/dashboard/page.tsx
column    surveys.k_threshold     app/(app)/rapporter/page.tsx
```

The first was produced by actually dropping `public.survey_scale_means` from the local database —
simulating production before M:0131 — and it named the function and the exact file that took the
screen down.
