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
