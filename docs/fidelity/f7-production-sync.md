# F7 — production sync, verified by content diff

**Applied 2026-09-19 to `jmhhszsnjfqgclxzhciq` (heituva-prod, eu-central-1).**
Method: A1's, reused verbatim — content, not the ledger.

## What was applied, and why it was urgent

Production was serving **HTTP 500 on `/undersokelser`**. The deploy at `2202dd2` was green;
the database behind it was not. T3.1's `page.tsx` calls `survey_scale_means` and does
`if (meanError) throw new Error(...)`, and production had no such function — a code/schema
skew created by my own T3.1 work shipping ahead of its migration.

| migration | state before | applied |
|---|---|---|
| M:0130 `threshold_immutable_after_response` | absent | ✅ |
| M:0131 `survey_scale_means` | absent | ✅ **this is the one that restored the screen** |
| M:0132 `dashboards_entity` | absent | ✅ |
| M:0133 `dashboards_rls` | absent | ✅ |
| M:0134 `reports_know_their_dashboard` | absent | ✅ |
| M:0135 `dashboard_fk_is_composite` | absent | ✅ |
| M:0136 `dashboard_share_token` | absent | ✅ |

One correction before applying: `M:0130`'s `guard_survey_policy` comment still read
«the floor of 3». An applied migration is never edited afterwards, so the stale numeral was
fixed in the file *before* the apply rather than left to be carried into production.

## How BOTH sides were serialised

The previous pass's Finding 3 was a false positive caused by comparing psql's *file* md5
against production's md5 of a *string*. It nearly recurred here: MCP pretty-prints JSON
(`"k" : "v"`) where psql does not, so any hash taken over the transported text would differ
for formatting alone. **It did recur, in the `posrollup` row, and was caught and redone.**

The comparison therefore never hashes transported text:

- each server runs the **same** `json_build_object(...)` and md5s **each row itself**, over
  its own render — identical code path, both servers on PostgreSQL 17.6;
- only `(key, md5)` pairs cross the wire;
- the category rollup is `md5(string_agg(key||E'\t'||md5(row), E'\n' order by key))`, again
  computed server-side on both.

Scope: schemas `public` and `app`; every function in `app`, every SECURITY DEFINER function
in `public`.

## Result

| category | local | prod | local-only | prod-only | **differ** |
|---|---|---|---|---|---|
| tables | 69 | 69 | 0 | 0 | **0** |
| columns | 558 | 558 | 0 | 0 | 4 (position only — see below) |
| constraints | 282 | 282 | 0 | 0 | **0** |
| indexes | 130 | 130 | 0 | 0 | **0** |
| policies | 172 | 172 | 0 | 0 | **0** |
| functions | 129 | 129 | 0 | 0 | **0 in logic** |

Rollup hashes, identical on both sides:

```
tables       3c2057faf0a0c7741ec7469382c1afb2
constraints  41992a0add2760aec84679a751e92567
indexes      8d47fbe17008030502224c4fbce808b4
policies     93e0a43823d17e97d966f0af41a5021a
```

Every CHECK, every FK (including M:0135's two composite ones), every index, every policy —
`qual` and `with_check` both — and every RLS flag is byte-identical.

### Functions — 0 differ in logic

Raw bodies differ (`fd901873…` local vs `e689da7c…` prod): `apply_migration` strips comments,
as it has every time. Re-hashed with comments and whitespace normalised away, **identically on
both sides**:

```sql
md5(lower(regexp_replace(regexp_replace(regexp_replace(
  prosrc,'/\*.*?\*/','','gs'),'--[^\n]*','','g'),'\s+',' ','g')))
```

```
funcs_normalised   local 5b94c1540fb898aeb182ff2008b71af5
                   prod  5b94c1540fb898aeb182ff2008b71af5   IDENTICAL
```

That hash also carries `prosecdef`, `proacl`, `proconfig` and volatility, so **security
attributes and per-function grants are identical too**, not merely the logic.

**Limit of the claim, stated:** the normalisation removes `--` and `/* */` regions from both
sides, so a difference lying entirely inside a comment is by construction invisible to it.
Everything outside comment-like regions is proven identical.

### Columns — 4 differ, in `ordinal_position` only

```
columns          local b9850f74…  prod a7fe81bc…   differ
columns_no_pos   local bb195c49e24c4596d2e677441b072af4
                 prod  bb195c49e24c4596d2e677441b072af4   IDENTICAL
```

Dropping `pos` alone makes them identical, so nothing about a type, default, nullability or
length differs. Narrowed per table, **exactly one table's position vector differs**:

```
< public.schedules fd7c029f37f757d9bd0e982fa10e055b   (local)
> public.schedules e2aa95bd9f22cf8c5ff57af2c618b4c5   (prod)
```

That is A1's pre-existing Finding 1 — the footprint of `recurrence_paused_at_repair` — and it
is **unchanged**. The seven new migrations introduced no new position drift.

### Grant fingerprint, all seven verbs

`SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER`, via `aclexplode` over every
table, view and matview in `public` and `app`:

```
grantfp   local 601b3e3a271ff0c84f680999d692bbde
          prod  601b3e3a271ff0c84f680999d692bbde   IDENTICAL
```

Per verb and role, local (prod's fingerprint being identical, these hold there too):

| verb | anon | authenticated | service_role |
|---|---|---|---|
| SELECT | 60 | 67 | 69 |
| INSERT / UPDATE / DELETE / TRIGGER | 61 | 68 | 69 |
| TRUNCATE | — | — | 69 |
| REFERENCES | — | — | 69 |

`TRUNCATE` and `REFERENCES` remain held by `service_role` alone — M:0129's revocation is
intact in production, which is the property Phase B established.

### `app.k_for` carries the clamp

Read back from production:

```sql
select case when s.respondent_kind = 'organisation' then 0
            else greatest(s.k_threshold, 2) end
from public.surveys s where s.id = p_survey
```

`greatest(s.k_threshold, 2)` is present. The floor of 2 is now enforced in production by two
mechanisms — the CHECK and this function — which is what M:0130 was for. The explanatory
comments survived this apply intact.

### The two new anon-reachable surfaces

`M:0136` adds the first dashboard RPCs `anon` can execute. Read back from production's
catalogue:

```
dashboard_for_share_token(text)   anon execute = true   (returns uuid, no data)
shared_dashboard(uuid, text)      anon execute = true   (drivers only, via app.aggregate_rows)
survey_scale_means(uuid)          anon execute = FALSE, authenticated = true
```

`survey_scale_means` being `anon = false` was read back from the catalogue rather than trusted
from the `revoke ... from public, anon` line — the enumeration this project has now written
down four times.

## Conclusion

**Production's schema is what the 163 migrations produce**, in every executable respect: same
tables, columns (bar four positions predating this sync), types, defaults, nullability,
CHECKs, FKs, indexes, RLS flags, policies, function logic, function grants and table grants
across all seven verbs. Zero unexplained entries.
