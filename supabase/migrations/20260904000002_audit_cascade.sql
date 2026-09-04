-- HeiTuva 0014b — an organisation must actually be deletable.
--
-- Found while seeding Phase 4's fixtures: `dropOrg` had silently stopped
-- working. `audit_events` is append-only, enforced by a BEFORE UPDATE OR DELETE
-- trigger that raises unconditionally — and `audit_events.org_id` cascades from
-- `organizations`. So the cascade fired the trigger and the whole delete rolled
-- back. The seed swallowed the error, so every run since the demo org first
-- accumulated an audit row had been re-seeding on top of stale data instead of
-- replacing it.
--
-- That is not only a harness problem. "Sletting" is one of the four DSR types
-- the Personvern tab offers under GDPR art. 17, and an organisation that cannot
-- be deleted cannot honour it.
--
-- The fix keeps the property the trigger exists for. An audit row is the
-- evidence that a duty was signed or a privacy setting changed, so it must not
-- be editable or removable while the organisation it belongs to is live. It may
-- be removed only as part of that organisation's own deletion — which is
-- detectable without a flag or a bypass role: PostgreSQL deletes the referenced
-- row before it applies the cascade, so during the cascade the parent is
-- already gone. A direct `delete from audit_events` against a live org still
-- raises, which is what the added test asserts.
create or replace function app.forbid_mutation() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE'
     and old.org_id is not null
     and not exists (select 1 from public.organizations o where o.id = old.org_id)
  then
    return old;   -- the organisation is being deleted; its trail goes with it
  end if;
  raise exception 'audit_events is append-only';
end $$;

-- The same class of defect in D31's freeze, found the same way.
--
-- `forbid_edit_after_send` refuses to delete a question once its survey has
-- gone out — which is right when someone edits the Builder, and wrong when the
-- SURVEY itself is being deleted and the question is going with it as a
-- cascade. `forbid_translation_edit_after_send` already reasons this way about
-- its own parent (a NULL question means the question is already gone); the
-- question-level trigger simply never got the equivalent, because until now
-- nothing had ever tried to delete a sent survey.
--
-- Same discriminator as above: during the cascade the survey row is gone, so a
-- Builder edit still raises and only the cascade passes. Note that this does
-- not make a sent survey disappear by accident — `deleted_at` is how the app
-- retires one; a hard delete happens on erasure, and there the questions are
-- meant to go too.
create or replace function app.forbid_edit_after_send()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_survey uuid;
begin
  v_survey := coalesce(new.survey_id, old.survey_id);

  if tg_op = 'DELETE'
     and not exists (select 1 from public.surveys s where s.id = v_survey)
  then
    return old;   -- the survey is being deleted; its questions go with it
  end if;

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

comment on function app.forbid_mutation() is
  'audit_events is append-only while its organisation exists. Deletion is '
  'permitted only as part of that organisation''s own cascade, which is what '
  'makes GDPR art. 17 erasure possible without a bypass role.';
