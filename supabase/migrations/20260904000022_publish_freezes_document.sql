-- HeiTuva 0033 — publishing a statutory report freezes the document it says.
--
-- Everything else in this system is built so respondent data stops being
-- readable: the k-gate at render, quotes stored as ids and re-resolved, the
-- retention job that deletes answers. A published Åpenhetslov or § 4-3 report
-- has the opposite duty — it is the organisation's record of what it found and
-- signed, and it has to still say that when the answers behind it are gone.
--
-- So publish freezes. The freeze is gated at publish time under the MOST
-- RESTRICTIVE scope the report will be shared at, and that scope is recorded on
-- the snapshot, because a frozen document cannot re-gate itself later:
-- `compose_report` will only serve it to a reader the freeze already covers,
-- and falls back to live composition for anyone it does not.
--
-- "Most restrictive" is `max()` over the report's own share_scope and every
-- live share on it, because `app.share_scope`'s enum order runs from most
-- content (ledelse) to least (alle_ansatte). If one all-employees link exists,
-- the frozen copy is the all-employees document — with no per-group breakdown
-- at all — and the boardroom reader falls through to live composition, which
-- is exactly the right way round: the audience that may see less decides what
-- gets written down for ever.
create or replace function public.snapshot_report(p_report uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rep    public.reports;
  v_scope  app.share_scope;
  v_survey uuid;
  v_round  uuid;
  v_group  uuid;
  v_doc    jsonb;
  v_hash   text;
  v_id     uuid;
begin
  select r.* into v_rep from public.reports r
   where r.id = p_report and r.deleted_at is null;
  if v_rep.id is null or not app.is_org_member(v_rep.org_id) then
    return jsonb_build_object('error', 'forbidden');
  end if;
  if not app.has_role(v_rep.org_id, array['administrator','redaktor']::app.member_role[]) then
    return jsonb_build_object('error', 'forbidden');
  end if;

  select greatest(v_rep.share_scope,
                  coalesce(max(s.scope), v_rep.share_scope))
    into v_scope
    from public.report_shares s
   where s.report_id = p_report
     and (s.expires_at is null or s.expires_at > now());

  v_survey := (select (x)::uuid from jsonb_array_elements_text(
                 coalesce(v_rep.filters->'surveys', '[]'::jsonb)) x limit 1);
  v_round  := (select (x)::uuid from jsonb_array_elements_text(
                 coalesce(v_rep.filters->'rounds', '[]'::jsonb)) x limit 1);
  v_group  := (v_rep.filters->>'group')::uuid;

  if v_survey is null then
    return jsonb_build_object('error', 'no_survey');
  end if;

  -- Re-publishing must recompose, not re-freeze the previous freeze. Clearing
  -- the pointer first is what makes compose_report take the live path; the old
  -- snapshot row stays where it is, because the history of what was published
  -- is the point of keeping it.
  update public.reports set snapshot_id = null where id = p_report;

  v_doc := public.compose_report(p_report, null, v_scope);
  if v_doc ? 'error' then
    return v_doc;
  end if;

  v_hash := encode(extensions.digest(v_doc::text, 'sha256'), 'hex');

  insert into public.result_snapshots (org_id, survey_id, round_id, scope, aggregates, content_hash)
  values (v_rep.org_id, v_survey, v_round,
          jsonb_build_object('group', v_group, 'round', v_round,
                             'share_scope', v_scope, 'report', p_report),
          jsonb_build_object('document', v_doc,
                             -- The plain aggregate freeze too, so the row is
                             -- still readable by anything that reads a
                             -- close_round snapshot.
                             'questions', coalesce((
                               select s->'cells' from jsonb_array_elements(v_doc->'sections') s
                                where s->>'key' = 'summary' and jsonb_typeof(s->'cells') = 'array'
                                limit 1), '[]'::jsonb)),
          v_hash)
  returning id into v_id;

  update public.reports set snapshot_id = v_id where id = p_report;

  return jsonb_build_object('snapshot_id', v_id, 'content_hash', v_hash,
                            'share_scope', v_scope, 'created_at', now());
end $$;

revoke all on function public.snapshot_report(uuid) from public, anon;
grant execute on function public.snapshot_report(uuid) to authenticated;

comment on function public.snapshot_report(uuid) is
  'Freezes a report''s composed document into result_snapshots, gated under the '
  'most restrictive scope the report is shared at, and records that scope on '
  'the snapshot so compose_report can refuse to serve it to a broader reader.';

-- publish_duty now freezes as its last act before the version row, so a
-- published version and the document it published are written together or not
-- at all. A freeze that fails aborts the publish rather than recording a
-- version pointing at nothing.
create or replace function public.publish_duty(p_duty uuid, p_label text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_hash text;
  v_report uuid;
  v_title text;
  v_total int; v_signed int; v_current int;
  v_version uuid;
  v_snap jsonb;
begin
  select d.org_id into v_org from public.duties d where d.id = p_duty;
  if v_org is null or not app.is_org_member(v_org) then
    return jsonb_build_object('error', 'forbidden');
  end if;
  if not app.has_role(v_org, array['administrator','redaktor']::app.member_role[]) then
    return jsonb_build_object('error', 'forbidden');
  end if;

  v_hash := app.duty_content_hash(p_duty);

  select r.id, r.title into v_report, v_title
  from public.reports r
  where r.duty_id = p_duty and r.deleted_at is null
  order by r.created_at desc limit 1;
  if v_report is null then
    return jsonb_build_object('error', 'no_report');
  end if;

  select count(*),
         count(*) filter (where s.signed_at is not null),
         count(*) filter (where s.signed_content_hash = v_hash)
    into v_total, v_signed, v_current
  from public.duty_signers s where s.duty_id = p_duty;

  if v_total = 0 or v_signed < v_total then
    return jsonb_build_object('error', 'unsigned');
  end if;
  if v_current < v_total then
    return jsonb_build_object('error', 'stale_signature');
  end if;

  -- Freeze first, so a version row never points at a document that could not
  -- be written down.
  --
  -- `no_survey` is the one error that does not stop the publish: a statutory
  -- report can be entirely narrative — an Åpenhetslov aktsomhetsvurdering is
  -- mostly prose about due diligence — and there is nothing to freeze when no
  -- survey feeds it. Refusing there would make the duty unpublishable. Every
  -- other error means the freeze was possible and failed, which does stop it.
  v_snap := public.snapshot_report(v_report);
  if v_snap ? 'error' and v_snap->>'error' <> 'no_survey' then
    return v_snap;
  end if;

  insert into public.duty_versions (duty_id, report_id, label, content_hash, archived_by)
  values (p_duty, v_report,
          coalesce(nullif(btrim(p_label), ''), v_title),
          v_hash, app.member_id(v_org))
  returning id into v_version;

  update public.reports set status = 'publisert' where id = v_report;

  insert into public.audit_events (org_id, actor_user_id, action, target, meta)
  values (v_org, (select auth.uid()), 'duty.publish', p_duty::text,
          jsonb_build_object('version_id', v_version, 'report_id', v_report,
                             'content_hash', v_hash,
                             'snapshot_id', v_snap->'snapshot_id',
                             'share_scope', v_snap->'share_scope'));

  return jsonb_build_object('ok', true, 'version_id', v_version, 'content_hash', v_hash,
                            'snapshot_id', v_snap->'snapshot_id',
                            'share_scope', v_snap->'share_scope');
end $$;

comment on function public.publish_duty(uuid, text) is
  'Archives a duty version. Refuses unsigned and stale-signature duties, and '
  'freezes the report''s composed document into result_snapshots before the '
  'version row exists, so a published version always points at the text that '
  'was published.';
