-- HeiTuva 0041 — one policy per command (Phase 7a, from the performance advisors).
--
-- The Phase 0 pattern gave every org-scoped table a `*_sel for select` policy
-- and a `*_cud for all` policy. `for all` includes SELECT, so Postgres evaluated
-- BOTH permissive policies on every read, OR-ed — 75 advisor findings across
-- 15 tables, and a cost paid on the hottest path in the product. Security was
-- never at stake: the OR of two correct org-scoped predicates cannot widen
-- access beyond either. This migration splits each `for all` policy into
-- insert / update / delete policies carrying exactly its former USING and
-- WITH CHECK, so each command has one permissive policy and the select path
-- is the `*_sel` policy alone. Where a `for all` policy was the table's ONLY
-- select path, a `_sel` policy with the same USING is created so nothing that
-- could be read before becomes unreadable.
--
-- Policies that called auth.uid() or auth.role() per row (`auth_rls_initplan`)
-- are recreated with `(select auth.uid())` / `(select auth.role())`, evaluated
-- once per statement.
--
-- Generated from pg_policies on the local stack after migration 0028; every
-- USING / WITH CHECK below is the exact expression that was in force, not a
-- retyping. Gate 5a3 and the full suite re-run after it.


-- dsr_requests: dsr_cud (for all) -> per command
drop policy if exists dsr_cud on public.dsr_requests;
create policy dsr_cud_ins on public.dsr_requests for insert with check (app.has_role(org_id, ARRAY['administrator'::app.member_role]));
create policy dsr_cud_upd on public.dsr_requests for update using (app.has_role(org_id, ARRAY['administrator'::app.member_role])) with check (app.has_role(org_id, ARRAY['administrator'::app.member_role]));
create policy dsr_cud_del on public.dsr_requests for delete using (app.has_role(org_id, ARRAY['administrator'::app.member_role]));

-- duties: duties_cud (for all) -> per command
drop policy if exists duties_cud on public.duties;
create policy duties_cud_ins on public.duties for insert with check (app.has_role(org_id, ARRAY['administrator'::app.member_role, 'redaktor'::app.member_role]));
create policy duties_cud_upd on public.duties for update using (app.has_role(org_id, ARRAY['administrator'::app.member_role, 'redaktor'::app.member_role])) with check (app.has_role(org_id, ARRAY['administrator'::app.member_role, 'redaktor'::app.member_role]));
create policy duties_cud_del on public.duties for delete using (app.has_role(org_id, ARRAY['administrator'::app.member_role, 'redaktor'::app.member_role]));

-- duty_checks: dchecks_cud (for all) -> per command
drop policy if exists dchecks_cud on public.duty_checks;
create policy dchecks_cud_ins on public.duty_checks for insert with check (app.has_role(app.duty_org(duty_id), ARRAY['administrator'::app.member_role, 'redaktor'::app.member_role]));
create policy dchecks_cud_upd on public.duty_checks for update using (app.has_role(app.duty_org(duty_id), ARRAY['administrator'::app.member_role, 'redaktor'::app.member_role])) with check (app.has_role(app.duty_org(duty_id), ARRAY['administrator'::app.member_role, 'redaktor'::app.member_role]));
create policy dchecks_cud_del on public.duty_checks for delete using (app.has_role(app.duty_org(duty_id), ARRAY['administrator'::app.member_role, 'redaktor'::app.member_role]));

-- duty_signers: dsign_cud (for all) -> per command
drop policy if exists dsign_cud on public.duty_signers;
create policy dsign_cud_ins on public.duty_signers for insert with check (app.has_role(app.duty_org(duty_id), ARRAY['administrator'::app.member_role]));
create policy dsign_cud_upd on public.duty_signers for update using (app.has_role(app.duty_org(duty_id), ARRAY['administrator'::app.member_role])) with check (app.has_role(app.duty_org(duty_id), ARRAY['administrator'::app.member_role]));
create policy dsign_cud_del on public.duty_signers for delete using (app.has_role(app.duty_org(duty_id), ARRAY['administrator'::app.member_role]));

-- duty_survey_links: dlinks_all (for all) -> per command
drop policy if exists dlinks_all on public.duty_survey_links;
create policy dlinks_all_sel on public.duty_survey_links for select using (app.has_role(app.duty_org(duty_id), ARRAY['administrator'::app.member_role, 'redaktor'::app.member_role]));
create policy dlinks_all_ins on public.duty_survey_links for insert with check (app.has_role(app.duty_org(duty_id), ARRAY['administrator'::app.member_role, 'redaktor'::app.member_role]));
create policy dlinks_all_upd on public.duty_survey_links for update using (app.has_role(app.duty_org(duty_id), ARRAY['administrator'::app.member_role, 'redaktor'::app.member_role])) with check (app.has_role(app.duty_org(duty_id), ARRAY['administrator'::app.member_role, 'redaktor'::app.member_role]));
create policy dlinks_all_del on public.duty_survey_links for delete using (app.has_role(app.duty_org(duty_id), ARRAY['administrator'::app.member_role, 'redaktor'::app.member_role]));

-- groups: groups_cud (for all) -> per command
drop policy if exists groups_cud on public.groups;
create policy groups_cud_ins on public.groups for insert with check (app.has_role(org_id, ARRAY['administrator'::app.member_role]));
create policy groups_cud_upd on public.groups for update using (app.has_role(org_id, ARRAY['administrator'::app.member_role])) with check (app.has_role(org_id, ARRAY['administrator'::app.member_role]));
create policy groups_cud_del on public.groups for delete using (app.has_role(org_id, ARRAY['administrator'::app.member_role]));

-- import_jobs: imports_all (for all) -> per command
drop policy if exists imports_all on public.import_jobs;
create policy imports_all_sel on public.import_jobs for select using (app.has_role(org_id, ARRAY['administrator'::app.member_role, 'redaktor'::app.member_role]));
create policy imports_all_ins on public.import_jobs for insert with check (app.has_role(org_id, ARRAY['administrator'::app.member_role, 'redaktor'::app.member_role]));
create policy imports_all_upd on public.import_jobs for update using (app.has_role(org_id, ARRAY['administrator'::app.member_role, 'redaktor'::app.member_role])) with check (app.has_role(org_id, ARRAY['administrator'::app.member_role, 'redaktor'::app.member_role]));
create policy imports_all_del on public.import_jobs for delete using (app.has_role(org_id, ARRAY['administrator'::app.member_role, 'redaktor'::app.member_role]));

-- logic_rules: logic_all (for all) -> per command
drop policy if exists logic_all on public.logic_rules;
create policy logic_all_sel on public.logic_rules for select using (app.can_edit_survey(survey_id));
create policy logic_all_ins on public.logic_rules for insert with check (app.can_edit_survey(survey_id));
create policy logic_all_upd on public.logic_rules for update using (app.can_edit_survey(survey_id)) with check (app.can_edit_survey(survey_id));
create policy logic_all_del on public.logic_rules for delete using (app.can_edit_survey(survey_id));

-- loop_actions: loop_cud (for all) -> per command
drop policy if exists loop_cud on public.loop_actions;
create policy loop_cud_ins on public.loop_actions for insert with check (app.has_role(org_id, ARRAY['administrator'::app.member_role, 'redaktor'::app.member_role]));
create policy loop_cud_upd on public.loop_actions for update using (app.has_role(org_id, ARRAY['administrator'::app.member_role, 'redaktor'::app.member_role])) with check (app.has_role(org_id, ARRAY['administrator'::app.member_role, 'redaktor'::app.member_role]));
create policy loop_cud_del on public.loop_actions for delete using (app.has_role(org_id, ARRAY['administrator'::app.member_role, 'redaktor'::app.member_role]));

-- profiles: profiles_own (for all) -> per command
drop policy if exists profiles_own on public.profiles;
create policy profiles_own_sel on public.profiles for select using ((user_id = ( SELECT auth.uid() AS uid)));
create policy profiles_own_ins on public.profiles for insert with check ((user_id = ( SELECT auth.uid() AS uid)));
create policy profiles_own_upd on public.profiles for update using ((user_id = ( SELECT auth.uid() AS uid))) with check ((user_id = ( SELECT auth.uid() AS uid)));
create policy profiles_own_del on public.profiles for delete using ((user_id = ( SELECT auth.uid() AS uid)));

-- question_bank: bank_cud (for all) -> per command
drop policy if exists bank_cud on public.question_bank;
create policy bank_cud_ins on public.question_bank for insert with check (((org_id IS NOT NULL) AND app.has_role(org_id, ARRAY['administrator'::app.member_role, 'redaktor'::app.member_role])));
create policy bank_cud_upd on public.question_bank for update using (((org_id IS NOT NULL) AND app.has_role(org_id, ARRAY['administrator'::app.member_role, 'redaktor'::app.member_role]))) with check (((org_id IS NOT NULL) AND app.has_role(org_id, ARRAY['administrator'::app.member_role, 'redaktor'::app.member_role])));
create policy bank_cud_del on public.question_bank for delete using (((org_id IS NOT NULL) AND app.has_role(org_id, ARRAY['administrator'::app.member_role, 'redaktor'::app.member_role])));

-- question_translations: qt_cud (for all) -> per command
drop policy if exists qt_cud on public.question_translations;
create policy qt_cud_ins on public.question_translations for insert with check ((EXISTS ( SELECT 1
   FROM survey_questions q
  WHERE ((q.id = question_translations.question_id) AND app.can_edit_survey(q.survey_id)))));
create policy qt_cud_upd on public.question_translations for update using ((EXISTS ( SELECT 1
   FROM survey_questions q
  WHERE ((q.id = question_translations.question_id) AND app.can_edit_survey(q.survey_id))))) with check ((EXISTS ( SELECT 1
   FROM survey_questions q
  WHERE ((q.id = question_translations.question_id) AND app.can_edit_survey(q.survey_id)))));
create policy qt_cud_del on public.question_translations for delete using ((EXISTS ( SELECT 1
   FROM survey_questions q
  WHERE ((q.id = question_translations.question_id) AND app.can_edit_survey(q.survey_id)))));

-- report_shares: rshares_all (for all) -> per command
drop policy if exists rshares_all on public.report_shares;
create policy rshares_all_sel on public.report_shares for select using (app.has_role(app.report_org(report_id), ARRAY['administrator'::app.member_role, 'redaktor'::app.member_role]));
create policy rshares_all_ins on public.report_shares for insert with check (app.has_role(app.report_org(report_id), ARRAY['administrator'::app.member_role, 'redaktor'::app.member_role]));
create policy rshares_all_upd on public.report_shares for update using (app.has_role(app.report_org(report_id), ARRAY['administrator'::app.member_role, 'redaktor'::app.member_role])) with check (app.has_role(app.report_org(report_id), ARRAY['administrator'::app.member_role, 'redaktor'::app.member_role]));
create policy rshares_all_del on public.report_shares for delete using (app.has_role(app.report_org(report_id), ARRAY['administrator'::app.member_role, 'redaktor'::app.member_role]));

-- schedules: schedules_all (for all) -> per command
drop policy if exists schedules_all on public.schedules;
create policy schedules_all_sel on public.schedules for select using (app.can_edit_survey(survey_id));
create policy schedules_all_ins on public.schedules for insert with check (app.can_edit_survey(survey_id));
create policy schedules_all_upd on public.schedules for update using (app.can_edit_survey(survey_id)) with check (app.can_edit_survey(survey_id));
create policy schedules_all_del on public.schedules for delete using (app.can_edit_survey(survey_id));

-- share_links: links_cud (for all) -> per command
drop policy if exists links_cud on public.share_links;
create policy links_cud_ins on public.share_links for insert with check (app.can_edit_survey(app.round_survey(round_id)));
create policy links_cud_upd on public.share_links for update using (app.can_edit_survey(app.round_survey(round_id))) with check (app.can_edit_survey(app.round_survey(round_id)));
create policy links_cud_del on public.share_links for delete using (app.can_edit_survey(app.round_survey(round_id)));

-- survey_editors: editors_cud (for all) -> per command
drop policy if exists editors_cud on public.survey_editors;
create policy editors_cud_ins on public.survey_editors for insert with check (app.can_edit_survey(survey_id));
create policy editors_cud_upd on public.survey_editors for update using (app.can_edit_survey(survey_id)) with check (app.can_edit_survey(survey_id));
create policy editors_cud_del on public.survey_editors for delete using (app.can_edit_survey(survey_id));

-- survey_invitations: inv_cud (for all) -> per command
drop policy if exists inv_cud on public.survey_invitations;
create policy inv_cud_ins on public.survey_invitations for insert with check (app.can_edit_survey(app.round_survey(round_id)));
create policy inv_cud_upd on public.survey_invitations for update using (app.can_edit_survey(app.round_survey(round_id))) with check (app.can_edit_survey(app.round_survey(round_id)));
create policy inv_cud_del on public.survey_invitations for delete using (app.can_edit_survey(app.round_survey(round_id)));

-- survey_questions: sq_cud (for all) -> per command
drop policy if exists sq_cud on public.survey_questions;
create policy sq_cud_ins on public.survey_questions for insert with check (app.can_edit_survey(survey_id));
create policy sq_cud_upd on public.survey_questions for update using (app.can_edit_survey(survey_id)) with check (app.can_edit_survey(survey_id));
create policy sq_cud_del on public.survey_questions for delete using (app.can_edit_survey(survey_id));

-- survey_rounds: rounds_cud (for all) -> per command
drop policy if exists rounds_cud on public.survey_rounds;
create policy rounds_cud_ins on public.survey_rounds for insert with check (app.can_edit_survey(survey_id));
create policy rounds_cud_upd on public.survey_rounds for update using (app.can_edit_survey(survey_id)) with check (app.can_edit_survey(survey_id));
create policy rounds_cud_del on public.survey_rounds for delete using (app.can_edit_survey(survey_id));

-- template_packs: packs_cud (for all) -> per command
drop policy if exists packs_cud on public.template_packs;
create policy packs_cud_ins on public.template_packs for insert with check (((org_id IS NOT NULL) AND app.has_role(org_id, ARRAY['administrator'::app.member_role, 'redaktor'::app.member_role])));
create policy packs_cud_upd on public.template_packs for update using (((org_id IS NOT NULL) AND app.has_role(org_id, ARRAY['administrator'::app.member_role, 'redaktor'::app.member_role]))) with check (((org_id IS NOT NULL) AND app.has_role(org_id, ARRAY['administrator'::app.member_role, 'redaktor'::app.member_role])));
create policy packs_cud_del on public.template_packs for delete using (((org_id IS NOT NULL) AND app.has_role(org_id, ARRAY['administrator'::app.member_role, 'redaktor'::app.member_role])));

-- ui_messages: i18n_org_cud (for all) -> per command
drop policy if exists i18n_org_cud on public.ui_messages;
create policy i18n_org_cud_ins on public.ui_messages for insert with check (((org_id IS NOT NULL) AND app.has_role(org_id, ARRAY['administrator'::app.member_role])));
create policy i18n_org_cud_upd on public.ui_messages for update using (((org_id IS NOT NULL) AND app.has_role(org_id, ARRAY['administrator'::app.member_role]))) with check (((org_id IS NOT NULL) AND app.has_role(org_id, ARRAY['administrator'::app.member_role])));
create policy i18n_org_cud_del on public.ui_messages for delete using (((org_id IS NOT NULL) AND app.has_role(org_id, ARRAY['administrator'::app.member_role])));

-- audit_events: audit_ins — auth function once per statement
drop policy if exists audit_ins on public.audit_events;
create policy audit_ins on public.audit_events for insert with check (((org_id IS NOT NULL) AND app.is_org_member(org_id) AND (actor_user_id = ( SELECT auth.uid() AS uid))));

-- benchmarks: bench_sel — auth function once per statement
drop policy if exists bench_sel on public.benchmarks;
create policy bench_sel on public.benchmarks for select using ((( SELECT auth.role() AS role) = 'authenticated'::text));

-- duty_definitions: dutydef_sel — auth function once per statement
drop policy if exists dutydef_sel on public.duty_definitions;
create policy dutydef_sel on public.duty_definitions for select using ((( SELECT auth.role() AS role) = 'authenticated'::text));

-- quality_rules: quality_sel — auth function once per statement
drop policy if exists quality_sel on public.quality_rules;
create policy quality_sel on public.quality_rules for select using ((( SELECT auth.role() AS role) = 'authenticated'::text));

-- report_section_types: sect_sel — auth function once per statement
drop policy if exists sect_sel on public.report_section_types;
create policy sect_sel on public.report_section_types for select using ((( SELECT auth.role() AS role) = 'authenticated'::text));
