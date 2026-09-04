-- HeiTuva 0019 — pin search_path on the two Phase 4 helpers.
--
-- Migration 0011 pinned `search_path = ''` on every `app.*` helper after the
-- first advisor run flagged them (D4). Phase 4 added two more and did not, so
-- the advisor reported `function_search_path_mutable` against
-- `app.numeric_answer` and `app.scale_types` — findings outside D4's accepted
-- table, which that entry defines as a regression rather than a new normal.
--
-- Neither is dangerous on its own: one does casts and a regex, the other
-- returns a literal array, and both are called only from functions that are
-- themselves pinned. That is an argument for fixing them cheaply, not for
-- carrying an exception that makes the next real finding easier to wave past.
create or replace function app.numeric_answer(v jsonb) returns numeric
language sql immutable set search_path = '' as $$
  select case
    when v is null then null
    when jsonb_typeof(v) = 'number' then (v #>> '{}')::numeric
    when jsonb_typeof(v) = 'string' and (v #>> '{}') ~ '^-?[0-9]+(\.[0-9]+)?$'
      then (v #>> '{}')::numeric
    else null end
$$;

create or replace function app.scale_types() returns text[]
language sql immutable set search_path = '' as $$ select array['scale','likert','smiley'] $$;

revoke all on function app.numeric_answer(jsonb) from public, anon;
revoke all on function app.scale_types() from public, anon;
