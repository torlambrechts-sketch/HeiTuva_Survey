-- Q125 — the Quiz workspace's picker option.
--
-- W3 left one line open: selecting «Quiz og arrangement» today renders a single
-- Oversikt module, because `quiz` and `nps` have no card. That is the honest
-- state rendered honestly, and it is still a sentence a buyer reads — and the
-- sentence it reads is «the product cannot do quiz», which is false:
-- `quiz_leaderboard` (M:0086) and the whole run_mode exist and are tested.
--
-- TAKEN (Tor, 2026-09-11): HIDE THE OPTION, KEEP THE ROW.
--
-- THE REVERSAL CONDITION, AND IT IS THE WHOLE OF IT: the option returns when
-- the `nps` AND `quiz` Oversikt cards exist. Not before, and not on a judgement
-- that one card is enough. Reversing is then one statement:
--   update public.workspaces set visible = true where key = 'quiz';
-- and `tests/db/quiz-visibility.test.ts` is what will fail first if it is done
-- without the cards, because it asserts the pairing rather than the flag.
--
-- WHY A COLUMN AND NOT A FILTER IN THE READER. Data-not-code: which workspaces
-- exist is already a registry, so which of them a person may CHOOSE is the same
-- kind of fact. A `key === 'quiz'` test in `current.ts` would put a product
-- decision in a component and make the reversal a deploy.
--
-- WHO WRITES THIS COLUMN? Nothing at runtime, and that is deliberate rather
-- than unnoticed — CLAUDE.md's standing question, answered in the migration
-- that adds the column. It is a SHIPPED flag on a shipped registry: this
-- migration writes it and a later migration changes it. There is no editor for
-- it because there is no customer decision behind it; the decision is ours.
alter table public.workspaces
  add column if not exists visible boolean not null default true;

comment on column public.workspaces.visible is
  'Q125: may a person CHOOSE this workspace? Hiding governs the PICKER, never '
  'the resolution — an organisation whose workspaces.workspace already names a '
  'hidden row keeps rendering it, because silently reassigning a customer''s '
  'workspace to repair a shop-window problem is a larger change than the one '
  'being made. Reverses to true for quiz when the nps AND quiz Oversikt cards '
  'exist, and not before.';

update public.workspaces set visible = false where key = 'quiz';
