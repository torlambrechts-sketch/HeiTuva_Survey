-- HeiTuva 0008 — RLS policies
-- Conventions: sel = select, ins = insert, upd = update, del = delete.
-- responses/answers get NO policies (default deny) — reads via RPCs only.

-- organizations ------------------------------------------------------
create policy org_sel on public.organizations for select
  using (app.is_org_member(id));
create policy org_upd on public.organizations for update
  using (app.has_role(id, array['administrator']::app.member_role[]));
-- org creation happens via service-role during signup flow.

-- org_members --------------------------------------------------------
create policy members_sel on public.org_members for select
  using (app.is_org_member(org_id));
create policy members_ins on public.org_members for insert
  with check (app.has_role(org_id, array['administrator']::app.member_role[]));
create policy members_upd on public.org_members for update
  using (app.has_role(org_id, array['administrator']::app.member_role[]));
create policy members_del on public.org_members for delete
  using (app.has_role(org_id, array['administrator']::app.member_role[]));

-- groups -------------------------------------------------------------
create policy groups_sel on public.groups for select using (app.is_org_member(org_id));
create policy groups_cud on public.groups for all
  using (app.has_role(org_id, array['administrator']::app.member_role[]))
  with check (app.has_role(org_id, array['administrator']::app.member_role[]));

-- profiles -----------------------------------------------------------
create policy profiles_own on public.profiles for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- template packs: standard packs readable by all authed users; org packs org-scoped
create policy packs_sel on public.template_packs for select
  using (org_id is null or app.is_org_member(org_id));
create policy packs_cud on public.template_packs for all
  using (org_id is not null and app.has_role(org_id, array['administrator','redaktor']::app.member_role[]))
  with check (org_id is not null and app.has_role(org_id, array['administrator','redaktor']::app.member_role[]));
create policy packs_tr_sel on public.template_pack_translations for select
  using (exists (select 1 from public.template_packs p where p.id = pack_id
                 and (p.org_id is null or app.is_org_member(p.org_id))));

-- surveys ------------------------------------------------------------
create policy surveys_sel on public.surveys for select
  using (app.is_org_member(org_id) and deleted_at is null);
create policy surveys_ins on public.surveys for insert
  with check (app.has_role(org_id, array['administrator','redaktor']::app.member_role[]));
create policy surveys_upd on public.surveys for update
  using (app.has_role(org_id, array['administrator','redaktor']::app.member_role[])
     and (created_by = app.member_id(org_id)
          or exists (select 1 from public.survey_editors e
                     where e.survey_id = id and e.member_id = app.member_id(org_id))
          or app.has_role(org_id, array['administrator']::app.member_role[])));
create policy surveys_del on public.surveys for delete
  using (app.has_role(org_id, array['administrator']::app.member_role[]));

-- survey children inherit via survey lookup --------------------------
create or replace function app.can_edit_survey(p_survey uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.surveys s where s.id = p_survey
    and app.has_role(s.org_id, array['administrator','redaktor']::app.member_role[])
    and (s.created_by = app.member_id(s.org_id)
         or exists (select 1 from public.survey_editors e where e.survey_id = s.id and e.member_id = app.member_id(s.org_id))
         or app.has_role(s.org_id, array['administrator']::app.member_role[])))
$$;
create or replace function app.can_view_survey(p_survey uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.surveys s where s.id = p_survey and app.is_org_member(s.org_id))
$$;

create policy sq_sel on public.survey_questions for select using (app.can_view_survey(survey_id));
create policy sq_cud on public.survey_questions for all
  using (app.can_edit_survey(survey_id)) with check (app.can_edit_survey(survey_id));
create policy qt_sel on public.question_translations for select
  using (exists (select 1 from public.survey_questions q where q.id = question_id and app.can_view_survey(q.survey_id)));
create policy qt_cud on public.question_translations for all
  using (exists (select 1 from public.survey_questions q where q.id = question_id and app.can_edit_survey(q.survey_id)))
  with check (exists (select 1 from public.survey_questions q where q.id = question_id and app.can_edit_survey(q.survey_id)));

create policy bank_sel on public.question_bank for select
  using (org_id is null or app.is_org_member(org_id));
create policy bank_cud on public.question_bank for all
  using (org_id is not null and app.has_role(org_id, array['administrator','redaktor']::app.member_role[]))
  with check (org_id is not null and app.has_role(org_id, array['administrator','redaktor']::app.member_role[]));

create policy logic_all on public.logic_rules for all
  using (app.can_edit_survey(survey_id)) with check (app.can_edit_survey(survey_id));
create policy editors_sel on public.survey_editors for select using (app.can_view_survey(survey_id));
create policy editors_cud on public.survey_editors for all
  using (app.can_edit_survey(survey_id)) with check (app.can_edit_survey(survey_id));

create policy quality_sel on public.quality_rules for select using (auth.role() = 'authenticated');

-- distribution -------------------------------------------------------
create or replace function app.round_survey(p_round uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select survey_id from public.survey_rounds where id = p_round
$$;

create policy rounds_sel on public.survey_rounds for select using (app.can_view_survey(survey_id));
create policy rounds_cud on public.survey_rounds for all
  using (app.can_edit_survey(survey_id)) with check (app.can_edit_survey(survey_id));

-- Invitations: editors manage; leser cannot see recipient lists (names/emails are PII)
create policy inv_sel on public.survey_invitations for select
  using (app.can_edit_survey(app.round_survey(round_id)));
create policy inv_cud on public.survey_invitations for all
  using (app.can_edit_survey(app.round_survey(round_id)))
  with check (app.can_edit_survey(app.round_survey(round_id)));

create policy links_sel on public.share_links for select
  using (app.can_view_survey(app.round_survey(round_id)));
create policy links_cud on public.share_links for all
  using (app.can_edit_survey(app.round_survey(round_id)))
  with check (app.can_edit_survey(app.round_survey(round_id)));

create policy imports_all on public.import_jobs for all
  using (app.has_role(org_id, array['administrator','redaktor']::app.member_role[]))
  with check (app.has_role(org_id, array['administrator','redaktor']::app.member_role[]));

create policy schedules_all on public.schedules for all
  using (app.can_edit_survey(survey_id)) with check (app.can_edit_survey(survey_id));

-- result_snapshots: org members may read (aggregates only, k-safe by construction)
create policy snaps_sel on public.result_snapshots for select using (app.is_org_member(org_id));

-- compliance ---------------------------------------------------------
create policy dutydef_sel on public.duty_definitions for select using (auth.role() = 'authenticated');
create policy duties_sel on public.duties for select using (app.is_org_member(org_id));
create policy duties_cud on public.duties for all
  using (app.has_role(org_id, array['administrator','redaktor']::app.member_role[]))
  with check (app.has_role(org_id, array['administrator','redaktor']::app.member_role[]));

create or replace function app.duty_org(p_duty uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select org_id from public.duties where id = p_duty
$$;
create policy dchecks_sel on public.duty_checks for select using (app.is_org_member(app.duty_org(duty_id)));
create policy dchecks_cud on public.duty_checks for all
  using (app.has_role(app.duty_org(duty_id), array['administrator','redaktor']::app.member_role[]))
  with check (app.has_role(app.duty_org(duty_id), array['administrator','redaktor']::app.member_role[]));
create policy dsign_sel on public.duty_signers for select using (app.is_org_member(app.duty_org(duty_id)));
create policy dsign_cud on public.duty_signers for all
  using (app.has_role(app.duty_org(duty_id), array['administrator']::app.member_role[]))
  with check (app.has_role(app.duty_org(duty_id), array['administrator']::app.member_role[]));
create policy dlinks_all on public.duty_survey_links for all
  using (app.has_role(app.duty_org(duty_id), array['administrator','redaktor']::app.member_role[]))
  with check (app.has_role(app.duty_org(duty_id), array['administrator','redaktor']::app.member_role[]));
create policy dver_sel on public.duty_versions for select using (app.is_org_member(app.duty_org(duty_id)));
create policy dver_ins on public.duty_versions for insert
  with check (app.has_role(app.duty_org(duty_id), array['administrator','redaktor']::app.member_role[]));

-- reports ------------------------------------------------------------
create policy sect_sel on public.report_section_types for select using (auth.role() = 'authenticated');
create policy reports_sel on public.reports for select
  using (app.is_org_member(org_id) and deleted_at is null);
create policy reports_cud on public.reports for all
  using (app.has_role(org_id, array['administrator','redaktor']::app.member_role[]))
  with check (app.has_role(org_id, array['administrator','redaktor']::app.member_role[]));
create or replace function app.report_org(p_report uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select org_id from public.reports where id = p_report
$$;
create policy rshares_all on public.report_shares for all
  using (app.has_role(app.report_org(report_id), array['administrator','redaktor']::app.member_role[]))
  with check (app.has_role(app.report_org(report_id), array['administrator','redaktor']::app.member_role[]));
create policy rexports_sel on public.report_exports for select
  using (app.is_org_member(app.report_org(report_id)));
create policy rexports_ins on public.report_exports for insert
  with check (app.has_role(app.report_org(report_id), array['administrator','redaktor']::app.member_role[]));

create policy bench_sel on public.benchmarks for select using (auth.role() = 'authenticated');
create policy loop_sel on public.loop_actions for select using (app.is_org_member(org_id));
create policy loop_cud on public.loop_actions for all
  using (app.has_role(org_id, array['administrator','redaktor']::app.member_role[]))
  with check (app.has_role(org_id, array['administrator','redaktor']::app.member_role[]));

-- ops/i18n -----------------------------------------------------------
create policy i18n_sel on public.ui_messages for select using (true); -- public read; served to respondent surface too
create policy i18n_upd on public.ui_messages for update
  using (exists (select 1 from public.org_members m where m.user_id = auth.uid()
                 and m.role = 'administrator' and m.status = 'active'));
-- inserts of new keys arrive via migrations/seed (service role). Studio edits use service role anyway.

create policy dsr_sel on public.dsr_requests for select
  using (app.has_role(org_id, array['administrator']::app.member_role[]));
create policy dsr_cud on public.dsr_requests for all
  using (app.has_role(org_id, array['administrator']::app.member_role[]))
  with check (app.has_role(org_id, array['administrator']::app.member_role[]));

create policy audit_sel on public.audit_events for select
  using (org_id is not null and app.has_role(org_id, array['administrator']::app.member_role[]));
create policy audit_ins on public.audit_events for insert
  with check (org_id is not null and app.is_org_member(org_id));

create policy flags_sel on public.feature_flags for select
  using (org_id is null or app.is_org_member(org_id));
create policy notif_own on public.notifications for select
  using (member_id = app.member_id(org_id));
create policy notif_upd on public.notifications for update
  using (member_id = app.member_id(org_id));
