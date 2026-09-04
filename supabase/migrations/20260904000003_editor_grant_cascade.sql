-- HeiTuva 0014c — `survey_editors.granted_by` must not pin an organisation open.
--
-- The third member of the family in 20260904000002, found the same way once
-- `dropOrg` started reporting its errors instead of swallowing them:
--
--   update or delete on table "org_members" violates foreign key constraint
--   "survey_editors_granted_by_fkey" on table "survey_editors"
--
-- `granted_by` records WHO shared a survey with a co-editor. It was declared
-- with no ON DELETE action, so it defaulted to NO ACTION — and deleting an
-- organisation cascades into `org_members`, which then cannot be removed while
-- any grant still names one of them. One co-editor grant made the organisation
-- undeletable, which is the same GDPR art. 17 problem as the audit trail.
--
-- SET NULL rather than CASCADE, deliberately: the grant itself is what governs
-- access and must survive the granter leaving the company. Losing the name of
-- who granted it is a smaller loss than silently revoking a co-editor's access
-- the day their manager's account is removed. Every other "who did this" column
-- in the schema (`surveys.created_by`, `duties.owner_member_id`,
-- `dsr_requests.handled_by`) is already SET NULL for the same reason; this one
-- was the outlier.
--
-- Audited the whole schema for the same shape while here: the only other FK
-- with no delete action is `duties.definition_key -> duty_definitions`, and
-- NO ACTION is correct there — a duty definition in use must not be deletable.
alter table public.survey_editors
  drop constraint survey_editors_granted_by_fkey;

alter table public.survey_editors
  add constraint survey_editors_granted_by_fkey
  foreign key (granted_by) references public.org_members(id) on delete set null;
