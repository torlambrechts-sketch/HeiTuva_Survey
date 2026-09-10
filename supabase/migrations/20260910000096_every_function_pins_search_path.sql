-- M:0096 — the six functions whose search_path was never pinned.
--
-- Found by `get_advisors(type: security)` on 2026-09-10, not by a gate:
-- `function_search_path_mutable`, six of them, all in `app`. They arrived across
-- V2-4 (`task_step_index`), V2-9 (`guard_live_is_anonymous`, `live_word_floor`,
-- `guard_run_mode_anonymous`) and V2-10 (`guard_quiz_policy`), plus
-- `below_threshold`. Nothing in CI enumerates proconfig, which is why five phases
-- of green gates said nothing about it — the sweep added beside this migration is
-- what closes that, and it is catalogue-derived rather than a list of these six.
--
-- WHY IT MATTERS EVEN THOUGH ALL SIX ARE SECURITY INVOKER. A mutable search_path
-- on a definer function is the loud case, and none of these is one. But three of
-- the six are TRIGGER functions, and a trigger runs on whoever writes the row,
-- with that caller's search_path. `app.guard_quiz_policy` reads
-- `public.template_packs` to refuse a quiz on a statutory pack; if an unqualified
-- name in a guard could be resolved to a caller-controlled object, the guard
-- becomes advisory. These bodies happen to qualify every reference — that is why
-- `''` is safe here — but «happens to» is the property this pins down.
--
-- `search_path = ''` rather than `public`: it is the stricter of the two
-- conventions already in this database (57 functions use `''`, 35 use `public`),
-- and it is SAFE FOR THESE SIX SPECIFICALLY, checked body by body rather than
-- assumed. Every object reference in all six is schema-qualified —
-- `public.surveys`, `public.template_packs`, `app.task_status`,
-- `app.anonymity_mode` — and everything else they use (`coalesce`,
-- `array_position`, `->>`, the casts) resolves from `pg_catalog`, which is
-- implicit and unaffected. A body that relied on an unqualified name would break
-- under `''`, loudly, at the next call; none does.
--
-- ALTER rather than CREATE OR REPLACE: the bodies are correct and retyping them
-- into a migration is the transcription risk this project has already paid for
-- twice. Nothing here changes what any of the six DOES.

alter function app.below_threshold(int, int, text, text)   set search_path = '';
alter function app.task_step_index(app.task_status)        set search_path = '';
alter function app.live_word_floor()                       set search_path = '';
alter function app.guard_live_is_anonymous()               set search_path = '';
alter function app.guard_run_mode_anonymous()              set search_path = '';
alter function app.guard_quiz_policy()                     set search_path = '';
