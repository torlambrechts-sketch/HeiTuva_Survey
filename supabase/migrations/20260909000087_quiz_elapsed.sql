-- V2-10 — `answers.elapsed_ms` gets its writer.
--
-- **CLAUDE.md now asks «who writes this column?» in the migration that adds
-- it**, after V2-9 shipped `run_mode` read everywhere and settable only from
-- psql. `M:0085` added `elapsed_ms` and this is that answer: the ONE write path,
-- `public.submit_response`, carries it.
--
-- ── NO SIGNATURE CHANGE, DELIBERATELY ──────────────────────────────────────
--
-- `p_answers` is already a jsonb map of `question_id -> {value, comment,
-- follow_up}`. The timing goes in as a fourth key of that object rather than as
-- a sixth function argument, because **`submit_response`'s signature is load-
-- bearing**: it is named in CLAUDE.md invariant 2, allowlisted by name in 5a3,
-- probed by name in `verify:attack`, and asserted by the catalogue sweep in
-- `tests/db/test-mode.test.ts` test 7. A phase that widens it makes every one of
-- those references a thing to re-check; a phase that widens the payload makes
-- none of them.
--
-- ── AND THE PATCH IS APPLIED THE WAY V2-9 LEARNED TO ───────────────────────
--
-- `M:0070` patched `send_round` with `replace(src, anchor, …)` on an anchor that
-- occurred FIVE times, four of them error paths, and a catch-all I had written
-- myself hid every failure (D115). The lesson was not «do not use replace» — it
-- was that **a defence is only as good as the enumeration it was aimed at**. So
-- the anchor's uniqueness is ASSERTED before the replacement rather than
-- assumed, and the migration fails loudly if the body has moved under it.
do $$
declare
  v_src text;
  v_anchor text := 'insert into public.answers (response_id, question_id, value, comment, follow_up)';
  v_hits int;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'submit_response';

  v_hits := (length(v_src) - length(replace(v_src, v_anchor, ''))) / length(v_anchor);
  if v_hits <> 1 then
    raise exception 'submit_response: expected exactly one answers-insert, found %', v_hits
      using hint = 'The body moved. Read it and rewrite this migration against what is there '
                   'now — do NOT loosen the anchor (D115: M:0070 patched five sites this way).';
  end if;

  execute replace(
    v_src,
    v_anchor || E'\n    values (v_response_id, k::uuid, v->''value'', v->>''comment'', v->>''follow_up'');',
    'insert into public.answers (response_id, question_id, value, comment, follow_up, elapsed_ms)' || E'\n' ||
    '    values (v_response_id, k::uuid, v->''value'', v->>''comment'', v->>''follow_up'',' || E'\n' ||
    '            -- V2-10: the quiz time bonus. Bounded HERE and not only by the' || E'\n' ||
    '            -- CHECK, because a client-supplied number that fails a constraint' || E'\n' ||
    '            -- would fail the whole submission — losing a real answer over a' || E'\n' ||
    '            -- stopwatch. Out of range is treated as unknown, which is what it is.' || E'\n' ||
    '            case when (v->>''elapsed_ms'') ~ ''^[0-9]{1,7}$''' || E'\n' ||
    '                  and (v->>''elapsed_ms'')::int between 0 and 3600000' || E'\n' ||
    '                 then (v->>''elapsed_ms'')::int else null end);');
end $$;

comment on function public.submit_response(text, text, jsonb, boolean, boolean) is
  'The ONE write path (CLAUDE.md invariant 2). `p_answers` maps question_id to '
  '{value, comment, follow_up, elapsed_ms}; the last is V2-10''s quiz timing and '
  'is null everywhere else. The signature is unchanged by design — it is named in '
  'the invariants, the 5a3 allowlist, verify:attack and the catalogue sweep.';
