-- C1 — `survey_comments`, the token read capability, and `surveys.feedback_mode`.
--
-- DECISIONS Q111 (a used invitation token gains a read-after-submit capability
-- and NOTHING else), Q112 (a comment is a message, not an answer), Q113 (the
-- anonymity choice is per SUBMISSION), Q114 (no pack lock, two conditions).
--
-- ═══ THE DESIGN DECISION THAT IS NOT OBVIOUS, AND WHY ═══════════════════════
--
-- `survey_comments` DOES NOT REFERENCE `responses`. The first draft gave it both
-- a `response_id` and an `invitation_id`, so that a test could compare a
-- comment's anonymity against its own response's. Written out, that pair is a
-- join from an INVITATION to a RESPONSE — which is precisely the link the
-- anonymity CHECK on `responses` exists to forbid. A comment table built that
-- way would have defeated CLAUDE.md invariant 2 through the side door, in the
-- migration whose job was to protect it.
--
-- So the comment knows its ROUND and its INVITATION, and knows nothing about
-- which response was written in the same transaction. Q113's property — no
-- named comment shares a `response_id` with an anonymous answer — then holds
-- because **no row has a `response_id` at all**, which is a stronger guarantee
-- than any check over values.

-- ═══ 1. surveys.feedback_mode ═══════════════════════════════════════════════
--
-- THE ORDER OF THESE FOUR STATEMENTS IS THE FEATURE, not ceremony.
--
-- `add column ... not null default 'anonymous'` in one statement writes
-- 'anonymous' into every row that already exists, and a backfill after it is a
-- no-op on exactly the rows it was meant to fix. **A survey already sent
-- without a comment field must not acquire one by migration** — its respondents
-- were invited to something else, and the promise they were given mentioned no
-- thread. So: add it nullable, backfill 'off', then set the default that
-- governs rows created from now on, then make it NOT NULL.
alter table public.surveys add column if not exists feedback_mode text;

update public.surveys set feedback_mode = 'off' where feedback_mode is null;

alter table public.surveys alter column feedback_mode set default 'anonymous';
alter table public.surveys alter column feedback_mode set not null;

alter table public.surveys drop constraint if exists surveys_feedback_mode_known;
alter table public.surveys add constraint surveys_feedback_mode_known
  check (feedback_mode in ('off', 'anonymous', 'named', 'optional'));

comment on column public.surveys.feedback_mode is
  'C1/Q114. Whether a respondent may comment, and under what name. '
  'WHO WRITES IT: the Builder''s setFeedbackMode server action, built in C2 — '
  'and until C2 lands the honest answer is NOTHING except the seed, which is '
  'recorded here rather than discovered in an audit (CLAUDE.md''s standing '
  'question; four instances, three of them columns that were READ everywhere). '
  'DEFAULT is ''anonymous'' for rows created from now on; every row that existed '
  'when this migration ran was backfilled to ''off'', deliberately. '
  'Q114: statutory packs do NOT lock this — the product''s other locks govern '
  'what the employer may SEE, and this governs whether the employer may REPLY.';

-- ═══ 2. The comment table ═══════════════════════════════════════════════════
create table if not exists public.survey_comments (
  id          uuid primary key default gen_random_uuid(),
  -- Org-scoped through the round, like every other respondent-side row. Denormalising
  -- org_id here would be a second source of truth for tenancy on a table whose whole
  -- point is that it is reachable from a token.
  round_id    uuid not null references public.survey_rounds(id) on delete cascade,
  -- NULL means "about the survey itself" — the end-of-survey box. A question id
  -- means the per-question comment. Not a separate table: same lifetime, same
  -- policy, same thread.
  question_id uuid references public.survey_questions(id) on delete set null,

  -- ── THE COLUMN TOR ASKED TO HAVE EXPLAINED, BECAUSE IT LOOKS LIKE A BREACH ──
  --
  -- `invitation_id` scopes a THREAD, not an answer. The anonymity CHECK on
  -- `responses` forbids this link because an ANSWER must not be attributable; a
  -- COMMENT must be, or the respondent can never read the reply to it (Q111
  -- property 1: "reads that respondent's own thread"). Rejecting the
  -- alternative — a named comment with no link at all — is what forces this:
  -- the thread IS the link.
  --
  -- **THE COST IS REAL AND IS ACCEPTED DELIBERATELY: a comment is attributable
  -- to its author by whoever holds the database, in a way an answer is not.**
  -- That is why the respondent screen (C3, Q112) says the comment «leses som den
  -- står» instead of reusing the anonymity banner — the banner promises
  -- something this row cannot deliver, and saying it anyway would be technically
  -- true and materially misleading.
  --
  -- DO NOT "RESTORE THE INVARIANT" HERE. Removing this column does not make
  -- comments safer; it makes the thread unreadable and the feature a suggestion
  -- box. What anonymity still means for a comment: no name is RENDERED, to any
  -- role, anywhere in the product; no join to the response exists (see the
  -- header); and the row is outside the answers vault (Q112).
  --
  -- NULL where there is no invitation at all — a share link or a QR code. Such a
  -- comment is a message with no thread, and C3 must not offer a reply to it.
  invitation_id uuid references public.survey_invitations(id) on delete set null,

  body        text not null check (length(btrim(body)) between 1 and 4000),
  -- Written from `v_mode` in submit_response — the SAME variable that decides
  -- whether the response links to its invitation. There is no per-comment input
  -- for it (Q113), so a comment and its submission cannot disagree.
  is_anonymous boolean not null,
  created_at  timestamptz not null default now(),
  -- WHO WRITES IT: C4's «Marker som behandlet» action. Until C4 lands, nothing
  -- writes it and the surface must render «ubehandlet» from its being null
  -- rather than from a value nobody sets.
  handled_at  timestamptz,
  handled_by  uuid references public.org_members(id) on delete set null
);

create index if not exists survey_comments_round_idx on public.survey_comments (round_id, created_at desc);
create index if not exists survey_comments_thread_idx on public.survey_comments (invitation_id)
  where invitation_id is not null;

alter table public.survey_comments enable row level security;

comment on column public.survey_comments.handled_at is
  'C4. WHO WRITES IT: NOTHING yet — C4''s «Marker som behandlet» action does, and '
  'until it lands the surface must render «ubehandlet» from this being null '
  'rather than from a value nobody sets.';

comment on column public.survey_comments.handled_by is
  'C4. WHO WRITES IT: NOTHING yet — the same action as handled_at. ON DELETE SET '
  'NULL deliberately: a member leaving must not delete the record that the '
  'comment was handled, nor block the row from being read.';

comment on column public.survey_comments.invitation_id is
  'C1. WHO WRITES IT: public.submit_response, and nothing else. It scopes a '
  'THREAD, not an answer — see the migration header. The anonymity CHECK on '
  'responses forbids this link for an ANSWER because an answer must not be '
  'attributable; a comment must be, or the respondent can never read the reply '
  'to it (Q111 property 1). The cost is accepted deliberately: a comment is '
  'attributable to its author by whoever holds the database, in a way an answer '
  'is not. Do NOT "restore the invariant" by removing this column — that does '
  'not make comments safer, it makes the thread unreadable.';

comment on table public.survey_comments is
  'C1/Q112. A comment is a MESSAGE, not an answer: it lives outside the answers '
  'vault, has its own RLS, and no aggregate path may reach it — asserted '
  'catalogue-derived in tests/db/comments.test.ts test 3, so the next aggregate '
  'that touches it fails in the commit that adds it. The k-gate on CONTENT does '
  'not apply and is not meant to: a thread is one person by construction and '
  'there is no aggregate to hide in. That is a deliberate downgrade of a '
  'guarantee this product sells on, and the respondent is told so in words.';

-- ═══ 3. The reply ═══════════════════════════════════════════════════════════
--
-- Its own table rather than a jsonb array on the comment, decided on three
-- grounds and recorded because the plan left it open:
--   1. an author FK that is `on delete set null` — a member leaving must not
--      delete the record that the reply happened;
--   2. ordering and a real `created_at` per reply;
--   3. appending to a jsonb array is a read-modify-write, so two managers
--      replying at once lose one reply silently.
create table if not exists public.survey_comment_replies (
  id         uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.survey_comments(id) on delete cascade,
  body       text not null check (length(btrim(body)) between 1 and 4000),
  -- WHO WRITES IT: C5's reply action. Nothing writes it before C5 and this
  -- migration says so rather than leaving the question open.
  author_member_id uuid references public.org_members(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists survey_comment_replies_comment_idx
  on public.survey_comment_replies (comment_id, created_at);

alter table public.survey_comment_replies enable row level security;

comment on column public.survey_comment_replies.author_member_id is
  'C5. WHO WRITES IT: NOTHING yet — C5''s reply action does. ON DELETE SET NULL '
  'so a member leaving does not delete the record that the reply happened.';

comment on table public.survey_comment_replies is
  'C1/Q111. The manager''s half of the thread. The respondent reads it through '
  'her own invitation token via public.get_comment_thread and through nothing '
  'else — there is no select policy that reaches the anon role.';

-- ═══ 4. Policies ════════════════════════════════════════════════════════════
--
-- ── THE READ RULE, AND WHY IT IS NOT `is_org_member` ALONE ──────────────────
--
-- Q114's second condition is that a thread inside a statutory survey is visible
-- to the verneombud «on the same footing as the rest of the documentation,
-- since that is the supervision mechanism that already exists». There is no
-- verneombud ROLE — it is an assignment (M:0034, duty signing) — so "the same
-- footing" means the rules that already exist, not a new grant.
--
-- And the rule that already exists is CLAUDE.md invariant 4: a `leser` gets
-- **no named free text**, anywhere in the product. A named comment is named
-- free text. So:
--
--   anonymous comment -> any member of the organisation, leser included
--   named comment     -> administrator and redaktor only
--
-- Both halves of Q114 condition 2 hold: the thread is documentation a
-- verneombud may read, and a leser who is one reads exactly what a leser reads
-- everywhere else. Widening this to `is_org_member` alone would hand every
-- leser named free text and would be a security-invariant change, not a policy
-- tweak.
drop policy if exists survey_comments_sel on public.survey_comments;
create policy survey_comments_sel on public.survey_comments for select
  using (
    exists (
      select 1
        from public.survey_rounds r
        join public.surveys s on s.id = r.survey_id
       where r.id = round_id
         and app.is_org_member(s.org_id)
         and (
           is_anonymous
           or app.has_role(s.org_id, array['administrator', 'redaktor']::app.member_role[])
         )));

-- No insert policy, and that is the point: the ONE write path is
-- `public.submit_response`, which is SECURITY DEFINER. A member of the
-- organisation cannot manufacture a comment attributed to a respondent.
--
-- No update policy: a message is not editable by its recipient. The one field a
-- manager changes is `handled_at`, and C4 changes it through a definer function
-- rather than by widening this table to UPDATE, so "nobody rewrites a
-- respondent's words" stays a property of the schema.
--
-- Delete: administrator only, because erasure (DSR) has to be able to reach it.
drop policy if exists survey_comments_del on public.survey_comments;
create policy survey_comments_del on public.survey_comments for delete
  using (exists (
    select 1 from public.survey_rounds r
      join public.surveys s on s.id = r.survey_id
     where r.id = round_id
       and app.has_role(s.org_id, array['administrator']::app.member_role[])));

drop policy if exists survey_comment_replies_sel on public.survey_comment_replies;
create policy survey_comment_replies_sel on public.survey_comment_replies for select
  using (exists (select 1 from public.survey_comments c where c.id = comment_id));
  -- The comment's own select policy decides: a reply is readable exactly when
  -- the comment it answers is. Restating the role test here would be a second
  -- copy of the rule, and the two would drift.

drop policy if exists survey_comment_replies_ins on public.survey_comment_replies;
create policy survey_comment_replies_ins on public.survey_comment_replies for insert
  with check (exists (
    select 1 from public.survey_comments c
      join public.survey_rounds r on r.id = c.round_id
      join public.surveys s on s.id = r.survey_id
     where c.id = comment_id
       and app.has_role(s.org_id, array['administrator', 'redaktor']::app.member_role[])));

-- ═══ 5. The write path ══════════════════════════════════════════════════════
--
-- ── WHY THE SIGNATURE WIDENS THIS TIME, WHEN V2-10 REFUSED TO ──────────────
--
-- `M:0087` put `elapsed_ms` inside `p_answers` rather than adding a parameter,
-- and its reasoning is good: the signature is named in CLAUDE.md invariant 2,
-- allowlisted by name in 5a3, probed by `verify:attack`, and asserted by the
-- catalogue sweep in test-mode.test.ts. That argument applied to `elapsed_ms`
-- because a timing IS per-answer data and fitted the existing per-question
-- object.
--
-- A comment does not fit it. The end-of-survey comment belongs to no question,
-- so it has nowhere to live inside a map keyed by question id, and smuggling it
-- under a reserved key would collide with a real uuid the day someone generates
-- one. So `p_comments` is a sixth parameter, and the four references above are
-- re-checked rather than assumed unaffected — that is the cost M:0087 named,
-- paid rather than avoided.
--
-- The body is rewritten in full rather than patched with `replace()`. M:0087
-- patched because it changed one statement; this changes the contract.
create or replace function public.submit_response(
  p_token text,
  p_lang text,
  p_answers jsonb,
  p_anon_choice boolean default null,
  p_dry_run boolean default false,
  p_comments jsonb default null
) returns jsonb
language plpgsql security definer set search_path to 'public'
as $fn$
declare
  v_res record;
  v_inv public.survey_invitations;
  v_round public.survey_rounds;
  v_survey public.surveys;
  v_mode app.anonymity_mode;
  v_response_id uuid;
  v_group uuid;
  v_link_invitation uuid;
  v_answered int := 0;
  v_comment jsonb;
  v_body text;
  v_qid uuid;
  v_comment_anon boolean;
  v_comments_written int := 0;
  k text; v jsonb;
begin
  select * into v_res from app.resolve_token(p_token);
  if v_res.status <> 'live' then
    return jsonb_build_object('error','not_found_or_closed');
  end if;

  select r.* into v_round from public.survey_rounds r where r.id = v_res.round_id for update;
  if v_res.invitation_id is not null then
    select i.* into v_inv from public.survey_invitations i
     where i.id = v_res.invitation_id for update;
  end if;

  -- Q111 property 2. This refusal happens BEFORE any write, so a spent
  -- invitation writes no comment either — the shape a regression would undo
  -- silently is a handler that refuses the response and inserts the comments
  -- anyway, because they arrive in the same payload.
  if v_inv.id is not null and v_inv.responded_at is not null then
    return jsonb_build_object('error','already_responded');
  end if;

  select s.* into v_survey from public.surveys s where s.id = v_round.survey_id;

  v_mode := case
    when v_survey.anonymity = 'optional' then
      case when coalesce(p_anon_choice, true) then 'anonymous'::app.anonymity_mode
           else 'named'::app.anonymity_mode end
    else v_survey.anonymity end;

  v_group := v_inv.group_id;
  v_link_invitation := case when v_mode = 'anonymous' then null else v_inv.id end;

  -- ── Q113: ONE CHOICE, MADE ONCE, APPLYING TO EVERYTHING IN THIS SUBMISSION ──
  --
  -- `surveys.anonymity` and `surveys.feedback_mode` are separate settings —
  -- whether ANSWERS are attributable, and whether COMMENTS exist and under what
  -- name — and they are independently configurable in the Builder. What must
  -- NOT be independent is the respondent's CHOICE: where either setting is
  -- 'optional', the single `p_anon_choice` decides it. That is what Q113 means
  -- by one choice applying to everything in the submission, and it is why there
  -- is no second parameter for a comment's anonymity.
  --
  -- A named comment on an anonymously-answered survey is a COHERENT state, not
  -- a breach: the respondent signs her message and not her answers, and nothing
  -- can join the two (there is no response_id — see the header). Forbidding it
  -- would be forbidding the bundle's own «Med navn» mode.
  v_comment_anon := case v_survey.feedback_mode
    when 'named'    then false
    when 'optional' then coalesce(p_anon_choice, true)
    else true                 -- 'anonymous', and 'off' (where nothing is written anyway)
  end;

  if p_dry_run then
    select count(*) into v_answered from jsonb_each(coalesce(p_answers, '{}'::jsonb));
    return jsonb_build_object(
      'dry_run', true,
      'ok', true,
      'anonymity', v_mode,
      'round_id', v_round.id,
      'answers', v_answered);
  end if;

  insert into public.responses
    (round_id, anonymity_at_submission, invitation_id, respondent_group_id, lang, submitted_hour)
  values
    (v_round.id, v_mode, v_link_invitation, v_group, p_lang, date_trunc('hour', now()))
  returning id into v_response_id;

  for k, v in select * from jsonb_each(p_answers) loop
    insert into public.answers (response_id, question_id, value, comment, follow_up, elapsed_ms)
    values (v_response_id, k::uuid, v->'value', v->>'comment', v->>'follow_up',
            case when (v->>'elapsed_ms') ~ '^[0-9]{1,7}$'
                  and (v->>'elapsed_ms')::int between 0 and 3600000
                 then (v->>'elapsed_ms')::int else null end);
  end loop;

  -- ── The comments ─────────────────────────────────────────────────────────
  --
  -- `v_response_id` is DELIBERATELY NOT USED BELOW. The comment carries the
  -- round and the invitation and nothing that could join it to the answers just
  -- written; see the header. If a later phase wants "which submission was this
  -- comment part of", the answer is that the product does not know and must not.
  --
  -- `is_anonymous` comes from `v_mode` — the same variable `v_link_invitation`
  -- came from — so Q113 holds by construction: one choice, made once, applying
  -- to everything in this submission. THE PAYLOAD CARRIES NO ANONYMITY KEY AND
  -- MUST NOT GAIN ONE.
  --
  -- `feedback_mode = 'off'` DROPS them, and the count comes back in the payload
  -- rather than being swallowed. A hand-rolled client can post anything; the
  -- mode has to be enforced where the write happens, or it is decorative. Not a
  -- refusal, because refusing the whole submission would lose real answers over
  -- a field the respondent never saw — the same reasoning M:0087 applied to an
  -- out-of-range stopwatch. Not silent either: the caller is told how many were
  -- written, so 0-of-2 is visible instead of being a catch-all's shrug.
  if p_comments is not null
     and jsonb_typeof(p_comments) = 'array'
     and v_survey.feedback_mode <> 'off' then
    -- Bounded. A respondent can write at most one comment per question plus one
    -- about the survey; a hand-rolled client can send any number, and an
    -- unbounded loop over client input is a write amplifier.
    for v_comment in select * from jsonb_array_elements(p_comments) limit 50 loop
      v_body := btrim(coalesce(v_comment->>'text', ''));
      continue when v_body = '';

      -- A question id that is not a question of THIS survey is dropped rather
      -- than stored: the column is a foreign key, so a bad one would abort the
      -- whole submission and lose real answers over a stray field. Treated as
      -- "a comment about the survey" — which is what an unplaceable comment is.
      --
      -- THE SHAPE CHECK IS PART OF THAT AND WAS MISSING FROM THE FIRST DRAFT.
      -- `::uuid` on a client-supplied string RAISES on anything that is not one,
      -- and a raise here aborts the transaction — so the comment above would
      -- have been describing a protection the code did not have, against the
      -- easiest input to send. Same reasoning M:0087 applied to an out-of-range
      -- stopwatch: a malformed field is treated as absent, never as fatal.
      v_qid := null;
      if (v_comment->>'question_id') ~
         '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
        select q.id into v_qid
          from public.survey_questions q
         where q.id = (v_comment->>'question_id')::uuid
           and q.survey_id = v_survey.id;
      end if;

      insert into public.survey_comments
        (round_id, question_id, invitation_id, body, is_anonymous)
      values
        (v_round.id, v_qid, v_inv.id, left(v_body, 4000), v_comment_anon);
      v_comments_written := v_comments_written + 1;
    end loop;
  end if;

  if v_inv.id is not null then
    update public.survey_invitations
       set responded_at = now(),
           previous_token_hash = null,
           previous_token_expires_at = null
     where id = v_inv.id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'response_id', v_response_id,
    -- How many comments were actually stored. A client that sent two and is
    -- told 0 knows the survey has comments switched off; without this the mode
    -- would be enforced invisibly, which is the shape a catch-all makes.
    'comments', v_comments_written);
end $fn$;

drop function if exists public.submit_response(text, text, jsonb, boolean, boolean);

revoke all on function public.submit_response(text, text, jsonb, boolean, boolean, jsonb) from public;
grant execute on function public.submit_response(text, text, jsonb, boolean, boolean, jsonb)
  to anon, authenticated;

comment on function public.submit_response(text, text, jsonb, boolean, boolean, jsonb) is
  'The ONE write path (CLAUDE.md invariant 2). `p_answers` maps question_id to '
  '{value, comment, follow_up, elapsed_ms}. `p_comments` is C1''s addition: an '
  'array of {question_id, text}, with NO anonymity key — the comment''s '
  'is_anonymous is taken from the submission''s own mode (Q113), so one choice '
  'applies to everything in the submission and nothing can disagree.';

-- ═══ 6. The token read capability ═══════════════════════════════════════════
--
-- Q111, stated as five properties because a capability described by what it
-- enables is an enumeration and this one will be attacked:
--
--   1. reads that respondent's own thread                 — invitation_id match
--   2. does NOT re-open submission                        — this function writes nothing
--   3. cannot read another respondent's thread            — invitation_id match
--   4. cannot read results                                — names neither responses nor answers
--   5. expires with the round                             — app.resolve_token returns 'live' only
--
-- A SHARE LINK READS NOTHING, and that is not an oversight. `resolve_token`
-- returns `invitation_id = NULL` for a share link, and every holder of that link
-- is the same principal — so "her own thread" has no referent. Returning the
-- round's comments for a share-link token would hand every QR-code scanner
-- every other scanner's messages.
create or replace function public.get_comment_thread(p_token text)
returns jsonb
language plpgsql stable security definer set search_path to 'public'
as $fn$
declare
  v_res record;
  v_out jsonb;
begin
  select * into v_res from app.resolve_token(p_token);
  if v_res.status <> 'live' then
    return jsonb_build_object('error', 'not_found_or_closed');
  end if;

  if v_res.invitation_id is null then
    -- Property 3, the share-link case. An empty thread, not an error: there is
    -- nothing wrong with the token, there is simply no thread that belongs to
    -- one holder of it.
    return jsonb_build_object('comments', '[]'::jsonb, 'thread', false);
  end if;

  select coalesce(jsonb_agg(t order by t->>'created_at'), '[]'::jsonb) into v_out
    from (
      select jsonb_build_object(
               'id', c.id,
               'question_id', c.question_id,
               'text', c.body,
               'is_anonymous', c.is_anonymous,
               'created_at', c.created_at,
               'replies', coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'text', rp.body,
                          'created_at', rp.created_at)
                        order by rp.created_at)
                   from public.survey_comment_replies rp
                  where rp.comment_id = c.id), '[]'::jsonb)) as t
        from public.survey_comments c
       where c.invitation_id = v_res.invitation_id) s;

  return jsonb_build_object('comments', v_out, 'thread', true);
end $fn$;

revoke all on function public.get_comment_thread(text) from public;
grant execute on function public.get_comment_thread(text) to anon, authenticated;

comment on function public.get_comment_thread(text) is
  'Q111. A used invitation token''s read-after-submit capability, scoped to that '
  'respondent''s own thread and nothing else. It writes nothing, so it cannot '
  're-open submission; it names neither public.responses nor public.answers, so '
  'it cannot read results; it matches on invitation_id, so it cannot reach '
  'another respondent''s thread; and app.resolve_token refuses a closed round, so '
  'it expires with the round. A SHARE LINK gets an empty thread by design — every '
  'holder of that link is the same principal, so there is no "own thread".';
