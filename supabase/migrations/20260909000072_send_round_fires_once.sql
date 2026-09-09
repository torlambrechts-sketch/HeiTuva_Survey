-- V2-5 fix, inside the same build: `M:0070` inserted the generator call FIVE
-- times, and my own defensive exception handler hid it.
--
-- ── WHAT HAPPENED, IN THE ORDER IT MATTERS ─────────────────────────────────
--
-- `M:0070` patched `public.send_round` with
--
--     replace(v_src, '  return jsonb_build_object(', <the call> || same)
--
-- **`replace()` replaces EVERY occurrence.** `send_round` returns
-- `jsonb_build_object` five times — four of them error paths — so the call
-- landed before each, including three places where `v_round` has not been
-- selected yet. V2-3b's anchor patches worked because their anchors were
-- unique. This one was not, and I did not check before applying.
--
-- **And the second half is worse than the first.** I wrapped the call in
-- `exception when others then null` so a missing prompt could never fail a
-- send. That is the right instinct and it made a WRONG PATCH SILENT: four
-- calls raised on an uninitialised record, the handler swallowed it, and every
-- gate stayed green. **A catch-all around a call is a mute of the kind D110
-- keeps recording — built here by the defence rather than by the evidence.**
--
-- It was found by asking why the demo seed produced no generated task, which is
-- CLAUDE.md's own warning read forwards: the seed reaches only states the
-- current code creates, so a state that never appears in it is a state no gate
-- has seen.
--
-- ── THE FIX, AND WHY IT DOES NOT PATCH BY STRING AT ALL ────────────────────
--
-- 1. The call site is the **success path only**, and it is placed by rewriting
--    the tail rather than by matching a string that occurs five times.
-- 2. The handler no longer swallows everything. It catches the two conditions a
--    generator can legitimately raise under load — a unique violation from a
--    concurrent send, and a foreign-key race — and lets a programming error
--    through, where a green gate would otherwise hide it. A send that fails
--    loudly on a bug is better than a send that quietly stops creating the
--    prompt the phase exists to create.
-- 3. `assert` on the occurrence count, so the next author who patches this
--    function by string is told rather than trusted.
do $do$
declare v_src text; v_stripped text; v_new text; v_hits int;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'send_round';

  -- Strip every block M:0070 inserted, wherever it landed.
  v_stripped := replace(v_src,
'  begin
    perform app.generate_blind_spot_tasks(v_round.survey_id);
  exception when others then
    null;  -- a missing prompt must never fail a send
  end;

', '');

  v_hits := (length(v_src) - length(v_stripped))
            / length('  begin
    perform app.generate_blind_spot_tasks(v_round.survey_id);
  exception when others then
    null;  -- a missing prompt must never fail a send
  end;

');
  if v_hits <> 5 then
    raise exception 'expected 5 inserted blocks to strip, found %', v_hits;
  end if;

  -- The success return is the only one carrying `''ok'', true` — a unique
  -- anchor, asserted rather than assumed.
  v_hits := (length(v_stripped) - length(replace(v_stripped, '  return jsonb_build_object(
    ''ok'', true,', ''))) / length('  return jsonb_build_object(
    ''ok'', true,');
  if v_hits <> 1 then
    raise exception 'the success return is not unique (% occurrences) — patch by hand', v_hits;
  end if;

  v_new := replace(v_stripped,
'  return jsonb_build_object(
    ''ok'', true,',
'  -- Q98: fire at SEND, once per round. Deduplicated on (source_ref,
  -- source_round_id) by `tasks_blind_spot_once`, so a retried send is not a
  -- second prompt.
  --
  -- The handler is NARROW ON PURPOSE. `M:0070` used `when others then null` and
  -- that turned a five-times-applied patch into a silent one. These two are the
  -- conditions a concurrent send can raise; anything else is a bug and must
  -- reach a human.
  begin
    perform app.generate_blind_spot_tasks(p_survey);
  exception
    when unique_violation or foreign_key_violation then
      null;
  end;

  return jsonb_build_object(
    ''ok'', true,');
  execute v_new;
end $do$;
