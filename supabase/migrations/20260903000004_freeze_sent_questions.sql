-- D31, enforced structurally: a survey's questions are frozen once it has been
-- sent.
--
-- This was a server-action check only. That is not enough, and the reason is
-- specific rather than defensive: aggregation keys on `question_id`. A question
-- edited after a round opened silently re-labels answers already given to the
-- old wording, and a deleted one cascades its answers away. Both corrupt
-- results rather than raising an error, so the failure is invisible in exactly
-- the place it matters most.
--
-- RLS cannot express this. `app.can_edit_survey` answers WHO may edit; this is
-- about WHEN, and the two are independent — an administrator is still the right
-- person, the survey is simply no longer editable.
--
-- The threshold is a round that is no longer merely scheduled. A round with
-- status 'scheduled' has not gone out and nothing has been answered, so a
-- schedule set up in advance must not lock the Builder. 'open' and 'closed'
-- both mean the questions have been seen.

create or replace function app.forbid_edit_after_send()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_survey uuid;
begin
  -- OLD on delete, NEW otherwise. A survey_id change is not possible here:
  -- both rows belong to the same survey or the FK would have rejected it.
  v_survey := coalesce(new.survey_id, old.survey_id);

  if exists (
    select 1 from public.survey_rounds r
    where r.survey_id = v_survey and r.status <> 'scheduled'
  ) then
    raise exception
      'survey % has an open or closed round; its questions are frozen (docs/DEVIATIONS.md D31)',
      v_survey
      using errcode = 'check_violation';
  end if;

  return coalesce(new, old);
end
$$;

create trigger sq_freeze_after_send
  before insert or update or delete on public.survey_questions
  for each row execute function app.forbid_edit_after_send();

-- Translations carry the respondent-visible wording, so editing one after
-- sending changes what a question said just as surely as editing the source.
-- It reaches the survey through its question, so it needs its own resolver.
create or replace function app.forbid_translation_edit_after_send()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_survey uuid;
begin
  select q.survey_id into v_survey
  from public.survey_questions q
  where q.id = coalesce(new.question_id, old.question_id);

  -- The parent question is already gone: this is the cascade from deleting a
  -- question, which the trigger above has already vetted. Let it through, or a
  -- legitimate draft deletion fails on its own cascade.
  if v_survey is null then
    return coalesce(new, old);
  end if;

  if exists (
    select 1 from public.survey_rounds r
    where r.survey_id = v_survey and r.status <> 'scheduled'
  ) then
    raise exception
      'survey % has an open or closed round; its question translations are frozen (docs/DEVIATIONS.md D31)',
      v_survey
      using errcode = 'check_violation';
  end if;

  return coalesce(new, old);
end
$$;

create trigger qt_freeze_after_send
  before insert or update or delete on public.question_translations
  for each row execute function app.forbid_translation_edit_after_send();

comment on function app.forbid_edit_after_send() is
  'D31: rejects question writes once the survey has a round that is not merely scheduled. '
  'Aggregation keys on question_id, so a UI-only guard corrupts results instead of erroring.';
