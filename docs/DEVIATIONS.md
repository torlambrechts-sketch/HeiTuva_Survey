# Deviations

Choices made where the handoff bundle, the design bundle, or CLAUDE.md left
something unspecified or self-contradictory. One entry per deviation.

## Bootstrap (pre-Phase 0)

### D1 — Membership helpers moved from migration 0001 to 0002
`app.is_org_member`, `app.has_role` and `app.member_id` were defined in
`0001_foundation.sql` but select from `public.org_members`, which
`0002_tenancy.sql` creates. SQL-language function bodies are validated at
creation time, so `supabase db reset` failed with `42P01 relation
"public.org_members" does not exist`.

Moved the three helpers to the end of `0002_tenancy.sql`, after the table.
Semantics are unchanged. The alternative — `set check_function_bodies = off`
in 0001 — was rejected because it defers a real dependency error to runtime.

### D2 — `feature_flags` primary key replaced with a nullable unique constraint
`0007_ops_i18n.sql` declared `org_id uuid references organizations(id)` with
the comment `NULL = global default`, and the `flags_sel` policy in 0008 reads
`org_id is null or app.is_org_member(org_id)`. But `primary key (key, org_id)`
makes `org_id` implicitly `NOT NULL`, so seeding the eight global flag rows
failed with `23502`.

Replaced the PK with `constraint feature_flags_key_org_uniq unique nulls not
distinct (key, org_id)` (PG 15+). This keeps one row per key per scope,
including exactly one global row per key, while allowing `org_id` to be NULL
as the schema comment and the RLS policy both intend. No foreign key
references `feature_flags`, so dropping the PK breaks nothing.

### D3 — Ops extensions versioned as migration 0010
`pg_cron`, `pgmq` and the `retention-daily` cron job were specified as ops
setup rather than schema. They are in `0010_ops_extensions.sql` so the setup
is reproducible on a fresh branch database instead of depending on someone
clicking dashboard toggles. `cron.schedule` is guarded by a `cron.job`
lookup so re-running alters the existing job rather than duplicating it.

### D4 — Security-advisor baseline for `heituva-prod`
The first remote apply raised findings. Two were real and are fixed forward in
`0011_advisor_hardening.sql` (0001/0009 were already applied, so they are not
edited — CLAUDE.md rule 8):

1. **`anon` could execute `aggregate_results` and `get_quotes`.** 0009 revokes
   from `PUBLIC` and grants to `authenticated`, but Supabase's default
   privileges grant EXECUTE to the `anon` role at CREATE time, and revoking the
   `PUBLIC` pseudo-role does not drop a grant held explicitly by `anon`. Both
   RPCs already refused anon at runtime (`app.is_org_member()` is false when
   `auth.uid()` is null), so this was defence in depth rather than an open door.
   Now revoked explicitly.
2. **Mutable `search_path` on four `app.*` helpers.** Pinned to `''`.
   `app.hash_token` mattered most: it resolves `digest()` from pgcrypto, which
   Supabase installs into `extensions`, so it previously inherited the caller's
   session `search_path`. Now schema-qualified as `extensions.digest`. Output is
   byte-identical — verified against the known SHA-256 of `hello` on both the
   local and remote databases — so stored token hashes stay valid.

The remaining advisor output is **accepted by design**. Treat this as the
allowlist when the CI gate requires advisors to be clean:

| Finding | Objects | Why accepted |
|---|---|---|
| `rls_enabled_no_policy` (INFO) | `responses`, `answers` | This *is* security invariant #1. RLS on with no policy = default deny for every client role. Adding a policy here would be the bug. |
| `anon_security_definer_function_executable` (WARN) | `get_survey_for_token`, `submit_response` | The respondent flow at `/s/[token]` is unauthenticated by design. Both are token-validated. |
| `authenticated_security_definer_function_executable` (WARN) | all four RPCs | SECURITY DEFINER RPCs are the *only* read path to `responses`/`answers`; that is the k-anonymity architecture, not an accident. |

Anything outside this table appearing in a future advisor run is a regression.

## Phase 0

### D5 — `app` schema: USAGE granted, function EXECUTE locked down (`0012`)
Inserting into `public.org_members` failed with `permission denied for schema
app`: PostgREST resolves a column's type before writing it, and `role` is
`app.member_role`. Phase 1's user administration would have hit this on its
first insert.

Granting `USAGE` alone was not safe. Every function in `app` still carried
PostgreSQL's default `PUBLIC EXECUTE`, and the only thing keeping them
unreachable was the missing schema `USAGE` — accidental protection, not policy.
`app.apply_retention()` is `SECURITY DEFINER` and deletes from `responses` and
`answers`, so exposing it would have been a data-loss vector open to any
signed-in user.

`0012` therefore revokes `EXECUTE` on every `app` function, grants `USAGE`, then
re-grants `EXECUTE` only on the eight helpers that RLS policies evaluate
(`is_org_member`, `has_role`, `member_id`, `can_view_survey`, `can_edit_survey`,
`round_survey`, `duty_org`, `report_org`). Policy expressions run with the
querying role's privileges, so `authenticated` genuinely needs those — an
earlier draft revoked them all and every policy-gated select failed with
`permission denied for function is_org_member`. Default privileges are revoked
so functions added later cannot silently regain `PUBLIC EXECUTE`.

Deliberately still unreachable: `apply_retention` (cron runs it as `postgres`),
`hash_token` and `k_threshold` (called only inside the `SECURITY DEFINER` RPCs,
which run as owner). Verified on both databases.

### D6 — `get_quotes` marked VOLATILE (`0013`)
`supabase db lint` flagged `public.get_quotes` as `STABLE` while its body orders
by `random()`. That ordering is a privacy control, not a cosmetic choice: 0009
notes it must never be chronological, because a stable order would let a reader
align quotes with submission times and re-identify respondents. A `STABLE`
marking permits the planner to evaluate once and reuse, which both misdeclares
the function and risks undermining the shuffle. Corrected with `alter function
... volatile`, leaving the body, arguments and grants untouched.

### D7 — `types/database.ts` is still a placeholder
`supabase gen types typescript --local` fails against the local container with
`password authentication failed for user "postgres"`. The Supabase clients are
therefore generically typed, so a wrong column name is a runtime error rather
than a compile error. Regenerate against the linked project before building
Phase 1 screens.

## Phase 1 (verification pass)

### D8 — `/logg-inn` is invented; the design has no login screen
The design bundle contains no authentication screen. Its only logged-out
affordance is a "Logg inn" button in the header (`HeiTuva.dc.html:155`), whose
`onLogin` handler simply flips `loggedOut` back to false
(`HeiTuva.dc.html:3476`). The login page was therefore designed by me from the
bundle's own primitives — card on `--sf` with `--line` border, 18px radius,
Playfair heading, uppercase 11px/.09em field labels, `--ac` primary button.
It needs a design decision from the product owner; it is not verifiable
against any reference.

### D9 — logged-out header state not implemented
The design shows a dark "Logg inn" button in the header when `loggedOut` is
true. The app redirects unauthenticated visitors to `/logg-inn` instead, so
that header state never renders. Deliberate, but it is a design element that
does not exist in the app.

### D10 — root font-size moved off 14px
CLAUDE.md fixes "base 14px". That had been applied as `html { font-size: 14px }`,
which silently scaled Tailwind's rem-based spacing scale to 87.5% — the header
rendered 14px padding where the design specifies 16px, and the user-menu
dropdown 7px where the design specifies 8px. 14px is now set on `body` as the
text size, leaving the root at the browser default so spacing utilities match
the design. Verified with getComputedStyle: header padding 16px, dropdown
padding 8px.

### D11 — focus ring is `!important` and unlayered
CLAUDE.md requires a 3px `#191510` focus outline. The design's inputs carry
`outline:none` at rest, expressed here as Tailwind's `outline-none` utility.
Utilities are emitted after `@layer base` and have equal specificity, so a
layered rule lost the cascade and the browser default (1px auto) rendered
instead. The rule is now unlayered with `!important`, which is the narrowest
mechanism that reliably wins. Verified: `outlineWidth 3px, style solid,
color rgb(25,21,16), offset 2px`.

### D12 — app shell is not usable at 390px
At a 390px viewport the header's content is 867px wide, so the browser expands
the layout viewport to ~886px and the page renders zoomed out. CLAUDE.md scopes
the app surface to pixel-perfect at >=1280px and only the respondent flow at
`/s/[token]` to mobile-first, so this is in line with the stated scope — but
the app shell has no mobile treatment at all, and nothing in the design bundle
specifies one. Needs a decision before any phase ships a mobile app surface.

### D13 — Profil "Pålogging og enheter" shows one session, not three
The design lists three devices with last-active times (HeiTuva.dc.html:3347).
Supabase exposes no per-user device or session list to a client — `auth.getUser`
describes only the current session, and the admin API's session listing is not
reachable from the browser and would need the service role. The card therefore
shows the current session and says so ("Vi viser den økten du er innlogget med
nå. Full enhetsoversikt kommer."), with "Logg ut overalt" wired to a global
sign-out, which does work. A real device list needs a server-side session
inventory; it is not something the design's data can be faked into.

### D14 — Om meg "Jobb-e-post" is read-only
The design renders it as an editable input. Changing a sign-in address is an
authentication flow with its own confirmation email, not a profile text field —
writing it here would either desynchronise `org_members.email` from
`auth.users.email` or silently do nothing. Rendered disabled with an
explanation.

### D15 — `profiles.notify` keys re-shaped
0002 seeded `notify` with new_responses / low_score / deadline / digest. The
design's four toggles are a different set: weekly digest, low RESPONSE RATE,
new FREE TEXT, and "when someone shares with me" — while `deadline` has no
toggle at all. 0015 re-shapes the default and migrates existing rows, mapping
low_score -> low_response and new_responses -> new_text where a value already
existed. Without this the screen would have written keys nothing reads.
