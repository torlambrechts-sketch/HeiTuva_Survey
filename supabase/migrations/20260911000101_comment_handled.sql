-- C4 — `survey_comments.handled_at` gets its writer.
--
-- `M:0099` created the column and said, in its own comment, that NOTHING wrote
-- it yet and that C4's «Marker som behandlet» would. This is that writer, and
-- `tests/db/no-writer-columns.test.ts` loses both rows in the same commit.
--
-- ── WHY A FUNCTION RATHER THAN AN UPDATE POLICY ────────────────────────────
--
-- `survey_comments` has NO update policy, deliberately: «nobody may change this
-- content» is a property of the schema, and a message is not editable by its
-- recipient. Adding `for update` to reach one bookkeeping column would open the
-- whole row — `body` included — and the guard would then have to be a trigger
-- comparing columns, which is the shape CLAUDE.md's immutability section warns
-- about from the other side.
--
-- So the one mutable field is reached through one function that writes one
-- column, and the table stays closed. `tests/db/comments.test.ts` test 21
-- asserts the body is unchanged after an administrator tries.
create or replace function public.set_comment_handled(
  p_comment uuid,
  p_handled boolean
) returns jsonb
language plpgsql security definer set search_path to 'public'
as $fn$
declare
  v_org uuid;
  v_member uuid;
begin
  -- The caller's authority comes from the comment's OWN organisation, resolved
  -- here rather than taken from the caller: a uuid from a client is a claim.
  select s.org_id into v_org
    from public.survey_comments c
    join public.survey_rounds r on r.id = c.round_id
    join public.surveys s on s.id = r.survey_id
   where c.id = p_comment;

  if v_org is null then
    -- Indistinguishable from "not yours": a different answer here would let a
    -- caller enumerate comment ids across organisations.
    return jsonb_build_object('error', 'not_found');
  end if;

  if not app.has_role(v_org, array['administrator', 'redaktor']::app.member_role[]) then
    return jsonb_build_object('error', 'not_found');
  end if;

  select m.id into v_member
    from public.org_members m
   where m.org_id = v_org and m.user_id = auth.uid();

  update public.survey_comments
     set handled_at = case when p_handled then now() else null end,
         handled_by = case when p_handled then v_member else null end
   where id = p_comment;

  return jsonb_build_object('ok', true, 'handled', p_handled);
end $fn$;

-- Not anon. A respondent has no business marking her own message handled, and
-- this is the half of C4 that keeps `set_comment_handled` a CHECKED surface in
-- Gate 5a3 rather than an allowlisted one.
revoke all on function public.set_comment_handled(uuid, boolean) from public;
grant execute on function public.set_comment_handled(uuid, boolean) to authenticated;

comment on function public.set_comment_handled(uuid, boolean) is
  'C4. The ONE writer for survey_comments.handled_at and handled_by. A function '
  'rather than an update policy, because the table has none by design — «nobody '
  'may change this content» — and widening it to reach one bookkeeping column '
  'would open `body` with it. Refuses a comment in another organisation with the '
  'same answer it gives for one that does not exist, so the refusal cannot '
  'enumerate ids.';
