# Operations notes

Things that must be true of a deployed environment for the app to work, and the
local commands that reproduce them.

## Supabase project settings not covered by migrations

Migrations cover schema, RLS, functions and cron. These are auth-service
settings and have to be set on the project itself.

### TOTP MFA must be enabled (required — Phase 1)

DECISIONS Q14 makes MFA mandatory for `role = administrator`. The app enforces
it in two places: `app/(app)/layout.tsx` redirects an aal1 administrator to
`/sikkerhet`, and `requireAdmin()` in `app/(app)/administrasjon/actions.ts`
refuses every write until the session reaches aal2.

If TOTP is disabled on the project, an administrator can still sign in but can
never reach the app: enrolment answers 422 and `/sikkerhet` shows
"Tofaktor er ikke slått på for dette prosjektet."

- **Local**: `[auth.mfa.totp] enroll_enabled = true` / `verify_enabled = true`
  in `supabase/config.toml`. Changing it needs `supabase stop && supabase start`
  — `docker restart` keeps the old container environment.
- **Hosted (`heituva-prod`)**: Dashboard → Authentication → Multi-Factor
  Authentication → enable TOTP (App Authenticator). There is no migration that
  can do this.

## Local development loop

```
npx supabase start          # Postgres + Auth + REST on 127.0.0.1:54321
npm run seed:demo           # personas, orgs, surveys above and below k=5
npm run seed:mfa            # TOTP factors for the administrator personas
npm run seed:i18n -- --local
npm run verify:db           # invariants + access + administration suites
npm run verify:browser      # captures every route/state in the manifest
```

`seed:mfa` writes `.mfa-secrets.json` (gitignored). Without it the browser
harness cannot get past `/sikkerhet` and every administrator route fails.

Expect `verify:browser` to take about twenty minutes. Supabase refuses a TOTP
code it has already accepted, and each capture signs in for itself, so every
administrator state waits out a 30-second code window. Reusing one signed-in
session per persona was tried and reverted — see the note in
`scripts/verify/capture.ts`.

Run `seed:demo` before a run you intend to compare screenshots from: the
captures drive the real UI, so states like the privacy toggles and the DSR list
leave the demo data changed for the next run.

## Two traps the harness now guards against

Both of these produced *green* verification runs that were not verifying the
code under review, so the guards matter more than they look.

1. **`NEXT_PUBLIC_*` is inlined at build time**, in server code as well as
   client bundles. Setting the variables on `next start` does nothing: the
   built output already contains whichever project `.env.local` named. The
   harness reads `.next/server/middleware.js` back and rebuilds if the URL in
   it is not the local stack.
2. **A stale build passes as the new one.** The harness compares the newest
   mtime under `app/`, `components/`, `lib/`, `messages/`, `types/` against
   `.next/BUILD_ID` and rebuilds when sources are newer. It also refuses to
   reuse a server someone else started if either check fails.

A third guard covers the same class of problem in the browser: after
navigating, the harness asserts the browser actually stayed on the requested
path. An unexpected redirect used to be captured as a clean screenshot of a
completely different screen.
