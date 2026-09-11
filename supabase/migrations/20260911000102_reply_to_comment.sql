-- C5 — the manager's reply, and `survey_comment_replies.author_member_id`'s
-- writer.
--
-- `M:0099` said NOTHING wrote it and that C5's reply action would. This is it.
--
-- ── WHY A FUNCTION, WHEN THE TABLE HAS AN INSERT POLICY ────────────────────
--
-- `survey_comment_replies_ins` already admits an administrator or redaktør of
-- the owning organisation, so a direct insert WOULD work. The function exists
-- for the column the policy cannot fill: `author_member_id` is the caller's
-- MEMBER id, and a client that supplies its own is supplying a claim. Resolved
-- from `auth.uid()` here, where it cannot be wrong.
--
-- The insert policy stays as it is. It is the boundary; this is the writer that
-- gets the bookkeeping right, and one does not replace the other.
create or replace function public.reply_to_comment(
  p_comment uuid,
  p_body text
) returns jsonb
language plpgsql security definer set search_path to 'public'
as $fn$
declare
  v_org uuid;
  v_member uuid;
  v_body text := btrim(coalesce(p_body, ''));
  v_id uuid;
begin
  if length(v_body) < 1 or length(v_body) > 4000 then
    return jsonb_build_object('error', 'invalid');
  end if;

  select s.org_id into v_org
    from public.survey_comments c
    join public.survey_rounds r on r.id = c.round_id
    join public.surveys s on s.id = r.survey_id
   where c.id = p_comment;

  -- Same refusal for "not yours" and "does not exist", so a caller cannot
  -- enumerate comment ids across organisations.
  if v_org is null
     or not app.has_role(v_org, array['administrator', 'redaktor']::app.member_role[]) then
    return jsonb_build_object('error', 'not_found');
  end if;

  select m.id into v_member
    from public.org_members m
   where m.org_id = v_org and m.user_id = auth.uid();

  insert into public.survey_comment_replies (comment_id, body, author_member_id)
  values (p_comment, v_body, v_member)
  returning id into v_id;

  -- Replying IS handling it. Two buttons that mean the same thing is how a
  -- queue ends up with rows that were answered and still look untouched — and
  -- the manager who just typed a reply is the last person who should have to
  -- tell the product that something happened.
  update public.survey_comments
     set handled_at = coalesce(handled_at, now()),
         handled_by = coalesce(handled_by, v_member)
   where id = p_comment;

  return jsonb_build_object('ok', true, 'reply_id', v_id);
end $fn$;

-- REVOKE FROM PUBLIC **AND ANON**, and only then grant.
--
-- `from public` alone is not enough and this migration had it wrong until CI
-- said so. PostgreSQL grants EXECUTE on a new function to PUBLIC by default and
-- `anon` inherits it, so revoking PUBLIC leaves the inherited grant standing.
-- `M:0013` learned this in 2026-09-04 and wrote the reason down; CLAUDE.md lists
-- it as instance 3 of «an enumeration mistaken for a property» — the PUBLIC
-- pseudo-role standing in for «no unauthenticated role may execute this» — and I
-- reproduced it anyway, in a tranche that cites that table twice.
--
-- Not exploitable as written: the body resolves the caller's authority from
-- `app.has_role`, and an anon caller has no `auth.uid()`, so it would have been
-- refused. The grant is still wrong, Gate 5a3 would still have failed it, and
-- «it refuses anyway» is the argument that keeps a wrong grant alive.
revoke all on function public.reply_to_comment(uuid, text) from public, anon;
grant execute on function public.reply_to_comment(uuid, text) to authenticated;

comment on function public.reply_to_comment(uuid, text) is
  'C5. The ONE writer for survey_comment_replies.author_member_id, resolved from '
  'auth.uid() rather than taken from the caller. Also marks the comment handled: '
  'replying IS handling it, and two controls meaning one thing is how a queue '
  'fills with rows that were answered and still look untouched. NOT anon — the '
  'respondent READS this through get_comment_thread and writes nothing.';
