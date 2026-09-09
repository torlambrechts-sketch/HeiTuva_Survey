-- S3 item 5 — the report-authorisation and retention sets, part one.
--
-- ═══ B6-03 / A2-5 — the frozen document was readable straight off the table ══
--
-- `result_snapshots` carried exactly one policy:
--
--     snaps_sel  FOR SELECT USING (app.is_org_member(org_id))
--
-- and `publish_report` stores THE WHOLE COMPOSED DOCUMENT in
-- `aggregates->'document'` — selected quotes with their group labels, and every
-- supplier's attributed answer by name. So one `GET /rest/v1/result_snapshots`
-- returned, to any member of the organisation including a `leser`, the content
-- that `get_quotes`, `attributed_results`, the CSV route and — since M:0089 —
-- `compose_report` all refuse them.
--
-- **This is what would have made M:0089 decoration.** Item 1 of this same
-- session put invariant 4 into the report, on both of its returns, and left the
-- table it composes from open. Fixing the RPC and not the table is the exact
-- shape of a guard on one road.
--
-- ── WHAT IS AND IS NOT BYPASSED, STATED PRECISELY ─────────────────────────
--
-- The k-gate is NOT bypassed by this read. A snapshot is gated when it is
-- FROZEN — `verify:roundtrip` asserts that a gated cell in a stored snapshot
-- carries no `n` — so the numbers in it were already refused. What is bypassed
-- is the ROLE rule: quotes and attributed rows, which are about who is reading
-- rather than about how many answered.
--
-- ── TWO CHANGES, BECAUSE ONE OF THEM IS ABOUT THE COLUMN ──────────────────
--
-- 1. The policy is narrowed to administrator and redaktør. A `leser` sees
--    aggregates through the RPCs and has no business reading a raw snapshot;
--    invariant 4 names exactly that role and no other.
--
-- 2. SELECT on `aggregates` is revoked from `authenticated` and `anon`
--    ALTOGETHER. RLS is row-level and cannot hide a column, so the policy alone
--    would still hand an administrator a way to read a document without going
--    through the function that redacts it — and the next role rule, whatever it
--    is, would have to remember this table exists. Revoking the column makes
--    `compose_report` the only road to the payload for every client, which is
--    CLAUDE.md invariant 1's own pattern applied one table further out.
--
--    The other columns stay readable, so listing frozen snapshots (id, survey,
--    scope, hash, created_at) still works without the RPC.
--
--    `compose_report` and `snapshot_results` are SECURITY DEFINER and run as
--    the owner, so neither is affected. Nothing in `app/` or `lib/` reads this
--    table at all — measured, not assumed; the only reader outside the RPCs is
--    `scripts/verify/roundtrip.ts`, which is changed in the same commit to use
--    the service client for that assertion.
drop policy if exists snaps_sel on public.result_snapshots;
create policy snaps_sel on public.result_snapshots
  for select
  using (app.has_role(org_id, array['administrator', 'redaktor']::app.member_role[]));

-- A COLUMN-LEVEL REVOKE DOES NOTHING WHILE A TABLE-LEVEL GRANT EXISTS. This was
-- written as `revoke select (aggregates) … from authenticated` first, and the
-- test caught that it changed nothing: in PostgreSQL, table-level SELECT covers
-- every column, and a column revoke cannot subtract from it. The privilege has
-- to be taken at the table and given back column by column. Supabase's
-- `alter default privileges` grants SELECT to `authenticated` and `anon` BY
-- NAME, which is D115's lesson in a second construct — `revoke … from public`
-- would not have touched either of them.
revoke select on public.result_snapshots from authenticated, anon;
grant select (id, org_id, survey_id, round_id, scope, content_hash, created_at)
  on public.result_snapshots to authenticated;

comment on column public.result_snapshots.aggregates is
  'The frozen payload. For a PUBLISHED report this is the whole composed '
  'document, quotes and attributed rows included, which is why SELECT on this '
  'column is revoked from every client role: compose_report applies the leser '
  'rule (M:0089) and reading the column directly walked round it (audit B6-03 / '
  'A2-5). The k-gate is not involved — a snapshot is gated when it is frozen. '
  'WHO WRITES IT: snapshot_results, publish_report and close_round, all '
  'SECURITY DEFINER.';

-- ═══ A9-2 / B7a-02 — «Slett rådata automatisk» was a switch nothing read ═══
--
-- `organizations.privacy->>'auto_delete'` is rendered as a toggle on
-- Administrasjon → Personvern, and `app.apply_retention` ignored it entirely:
-- it deleted on `retention_months > 0` alone. Production's one organisation has
-- `auto_delete = true` and the `retention-daily` cron active, so the toggle's
-- state and the system's behaviour agreed there BY COINCIDENCE — which is the
-- worst way for them to agree, because the first customer who turns it off
-- learns that it does nothing by losing data.
--
-- The toggle is the promise, so the toggle is the rule. Its default matters:
-- `coalesce(..., true)` keeps every existing organisation behaving exactly as
-- it does today, including any whose `privacy` has no `auto_delete` key at all.
-- Only an organisation that has explicitly switched it OFF changes behaviour,
-- which is the change the switch was drawn to make.
--
-- Deliberately NOT widened here: `retention_months > 0` still means «no
-- automatic deletion», so the two ways of saying it both work, and an
-- organisation with a retention period and the toggle off keeps its data.
create or replace function app.apply_retention()
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  delete from public.answers a using public.responses r,
    public.survey_rounds sr, public.surveys s, public.organizations o
  where a.response_id = r.id and r.round_id = sr.id and sr.survey_id = s.id and s.org_id = o.id
    and o.retention_months > 0
    and coalesce((o.privacy->>'auto_delete')::boolean, true)
    and r.submitted_hour < now() - make_interval(months => o.retention_months);
  delete from public.responses r using public.survey_rounds sr, public.surveys s, public.organizations o
  where r.round_id = sr.id and sr.survey_id = s.id and s.org_id = o.id
    and o.retention_months > 0
    and coalesce((o.privacy->>'auto_delete')::boolean, true)
    and r.submitted_hour < now() - make_interval(months => o.retention_months);
end
$fn$;

comment on function app.apply_retention() is
  'The retention-daily cron. Reads BOTH organizations.retention_months and '
  'privacy->>auto_delete (S3/A9-2): the toggle on Administrasjon → Personvern '
  'used to be read by nothing, so an organisation that switched it off kept '
  'losing data. Defaults to true when the key is absent, so no existing '
  'organisation changes behaviour.';
