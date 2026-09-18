# Catalogue diff — local (156 migrations, clean) vs production

**Measured 2026-09-18 at `192210d`.** Phase A1. Content, not names.

**Why this exists.** The previous pass diffed `supabase_migrations.schema_migrations` by NAME. Name
presence proves an apply was *attempted*; it does not prove the resulting schema matches the file.
Six prod-only repair migrations exist precisely because `apply_migration` has landed truncated
bodies before, and 42 names are applied twice.

## Method

Local: `supabase db reset` (all 156 migrations + `seed.sql`), then `psql`.
Production: the identical SQL through the Supabase MCP (`jmhhszsnjfqgclxzhciq`).
Both servers report `server_version` **17.6**, so JSON rendering is comparable.

Six categories, each as `json_build_object(...)` per row, keyed and compared **per row by md5**:

| category | key | fields compared |
|---|---|---|
| tables | `schema.relname` | relkind, **relrowsecurity**, **relforcerowsecurity** |
| columns | `schema.table.column` | data_type, udt, is_nullable, column_default, maxlen, ordinal_position |
| constraints | `schema.table.conname` | contype, `pg_get_constraintdef` (CHECK + FK + PK + UNIQUE) |
| indexes | `schema.indexname` | `indexdef` |
| policies | `schema.table.policyname` | permissive, roles, cmd, `qual`, `with_check` |
| functions | `schema.name(identity args)` | prosecdef, lang, owner, acl, proconfig, volatility, **length(prosrc)**, **md5(prosrc)** |

Scope: schemas `public` and `app`; every function in `app`, and every SECURITY DEFINER function in
`public`.

## Result

| category | local | prod | local-only | prod-only | **differ** |
|---|---|---|---|---|---|
| tables | 66 | 66 | 0 | 0 | **0** |
| columns | 536 | 536 | 0 | 0 | **4** |
| constraints | 266 | 266 | 0 | 0 | **0** |
| indexes | 120 | 120 | 0 | 0 | **0** |
| policies | 161 | 161 | 0 | 0 | **0** |
| functions | 125 | 125 | 0 | 0 | **31** |

Every CHECK constraint, every FK, every index, every policy (`qual` and `with_check` included) and
every RLS flag is **byte-identical**. No object exists on one side only.

---

## Finding 1 — 4 columns differ, in `ordinal_position` only

`public.schedules`: `paused_at`, `custom_every`, `custom_unit`, `custom_weekday`.
Identical `data_type`, `udt`, `is_nullable`, `column_default`. Only the position differs:

| column | local | prod |
|---|---|---|
| `paused_at` | 12 | **15** |
| `custom_every` | 13 | **12** |
| `custom_unit` | 14 | **13** |
| `custom_weekday` | 15 | **14** |

**Explanation, not a dismissal.** This is the footprint of `recurrence_paused_at_repair`
(`20260907133457`), whose own stored comment reads: *«Migration 0044's first two statements were
dropped when it was applied to prod through the MCP: the header was stripped with a hard-coded line
offset instead of a comment-detecting scan, cutting off `paused_at` and its comment.»* Locally the
column arrives in `M:0044`; in production it was added later by the repair, so it sorts last.

**Consequence.** Column order is not semantically meaningful for named access, and nothing here
changes a type, a default or a nullability. It does mean `select *` returns columns in a different
order in the two environments — a latent hazard only for positional access, of which there is none
in this repo. Recorded rather than fixed: correcting it would mean rewriting a table in production
to no functional benefit.

## Finding 2 — 31 function bodies differ, and the difference is comments only

**This is the finding A1 was written to reach, and the answer is the good one.**

Every one of the 31 is **shorter in production** — deltas from +59 to +3558 characters. That is the
signature of either truncation or comment-stripping, and those are not the same finding.

Compared again with comments and whitespace normalised away, identically on both sides:

```sql
md5(lower(regexp_replace(regexp_replace(regexp_replace(
  prosrc,'/\*.*?\*/','','gs'),'--[^\n]*','','g'),'\s+',' ','g')))
```

| | count |
|---|---|
| normalised body IDENTICAL (comments-only difference) | **31** |
| **normalised body DIFFERENT (logic differs)** | **0** |

**Production's executable logic is identical to what the 156 migrations produce, in all 125
functions.** No definer body is truncated in any way that removes code.

Confirmed by eye on `app.cadence_interval` (local 910 chars, prod 684): the sole difference is a
three-line `--` comment explaining why `'once'` returns NULL. The executable SQL is
character-identical.

The 31, with raw lengths (local → prod):

| function | local | prod | Δ |
|---|---|---|---|
| `app.cadence_interval` | 910 | 684 | +226 |
| `app.forbid_edit_after_send` | 638 | 579 | +59 |
| `app.forbid_translation_edit_after_send` | 798 | 582 | +216 |
| `app.forbid_version_mutation` | 1093 | 946 | +147 |
| `app.guard_flow_position` | 817 | 741 | +76 |
| `app.guard_sso_break_glass` | 1128 | 1066 | +62 |
| `app.map_pack_use_cases` | 1789 | 1025 | +764 |
| `app.preset_title_free` | 538 | 305 | +233 |
| `app.report_quotes` | 2571 | 2258 | +313 |
| `app.resolve_token` | 2637 | 1890 | +747 |
| `app.resume_schedule` | 1403 | 908 | +495 |
| `app.run_due_schedules` | 6585 | 4590 | +1995 |
| `app.stamp_task_completed` | 1142 | 609 | +533 |
| `app.suppress_partition` | 1672 | 1330 | +342 |
| `app.sync_survey_target` | 1480 | 865 | +615 |
| `public.claim_membership` | 582 | 421 | +161 |
| `public.dashboard_summary` | 3931 | 3658 | +273 |
| `public.get_benchmarks` | 5186 | 4339 | +847 |
| `public.get_closed_loop_for_token` | 1751 | 1248 | +503 |
| `public.get_heatmap` | 2606 | 2205 | +401 |
| `public.get_quotes` | 2310 | 2059 | +251 |
| `public.get_themes` | 2896 | 2292 | +604 |
| `public.get_trends` | 3025 | 1967 | +1058 |
| `public.quote_candidates` | 2713 | 2136 | +577 |
| `public.results_summary` | 6740 | 6240 | +500 |
| `public.send_round` | 10817 | 7259 | +3558 |
| `public.set_result_optin` | 945 | 560 | +385 |
| `public.sign_duty` | 1420 | 1165 | +255 |
| `public.snapshot_report` | 2846 | 2642 | +204 |
| `public.snapshot_results` | 1001 | 843 | +158 |
| `public.survey_response_counts` | 531 | 267 | +264 |

**The k-gated RPCs are in this set** — `get_quotes`, `get_heatmap`, `results_summary`,
`quote_candidates`, `dashboard_summary`, `get_trends`, `get_themes`, `get_benchmarks`,
`app.suppress_partition`, `app.report_quotes` — and all ten are comments-only. Invariant 1's
enforcement path in production is the committed logic.

`app.k_threshold`, `app.k_for`, `app.below_threshold` and `public.aggregate_results` are **not** in
the differing set at all: byte-identical, comments included.

**The limit of this claim, stated.** The normalisation removes `--` to end-of-line and `/* */`
blocks from both sides. A difference lying entirely inside such a region is by construction
invisible to it. Everything outside comment-like regions is proven identical.

## Finding 3 — a false positive I generated, recorded because it nearly became the headline

The first comparison hashed each category as a whole and reported **all six categories differing**.
That was wrong: I md5'd a psql *output file* (which carries a trailing newline) against
production's md5 of the *string*. The per-row comparison shows four of those six categories are
byte-identical.

«The thing measured was not the thing claimed», in the pass written to catch exactly that. An
aggregate fingerprint is only a diff if both sides are serialised the same way; the per-row
comparison does not depend on that.

## Conclusion

**Production's schema is what the 156 migrations produce**, in every executable respect: same
tables, columns (bar four positions), types, defaults, nullability, CHECKs, FKs, indexes, RLS flags,
policies and function logic. The only differences are stripped comments and four column positions,
both attributable to how `apply_migration` landed earlier migrations, and neither changes behaviour.

Phase A's exit condition — a content-level diff with zero unexplained entries — is met.
