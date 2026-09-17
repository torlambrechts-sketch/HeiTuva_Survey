-- M:0127 — V7-3: content blocks, as a SECOND TABLE.
--
-- v7 introduces six content types an editor can interleave with the questions:
-- Seksjon, Tekst, Bilde, Video, Faktaboks and Skillelinje (v7:6858-6867). They
-- render in the respondent's flow, they carry no answer, and they order as one
-- sequence with the questions (`insertFlowAt` splices at any index, v7:6808).
--
-- Sitat is the seventh and is DROPPED, not deferred (Tor): asking for consent
-- afterwards means reaching the one person who wrote the text, and a free-text
-- ANSWER is unlinked by construction — `responses` carries no `invitation_id`,
-- which is invariant 2 and structural. Only comments carry it (QR-2), so only
-- comments could ever be quoted, and a share-link respondent can never be asked
-- at all.
--
-- ── WHY A SECOND TABLE, AND NOT A FLAG ON survey_questions ────────────────
--
-- The measurement is `docs/v7/02-blocks-measurement.md` and it is the whole
-- argument. `survey_questions` is read by FIFTEEN functions in `app` and
-- `public`, and ELEVEN of them reach it as
-- `join public.survey_questions q on q.id = a.question_id` — through an ANSWER.
-- A row nobody can answer is a row they never see, and that includes the entire
-- k-anonymity reporting path, which counts answers rather than questions.
--
-- Tor: «That is not a lucky side effect to preserve — it is how the whole
-- k-anonymity path is built. One table makes an answer against a block
-- EXPRESSIBLE, and converts eleven structural immunities into eleven filters
-- somebody has to remember. That is the shape this project has corrected eleven
-- times: a property traded for a list.»
--
-- So, with the blocks in their own table and `answers.question_id` pointing
-- only at questions:
--
--   app.aggregate_rows      cannot emit a result row for a block   — no edit
--   public.submit_response  cannot accept a comment on a block     — no edit
--   public.get_benchmarks   cannot count one as a scale question   — no edit
--   the six TypeScript `survey_questions(count)` reads keep counting questions
--
-- **None of those four files is touched by this migration, and that is the
-- point.** The third time this project has taken expressible-versus-
-- unrepresentable over a filter (Q93, Q178's «blokkert», this), and each time
-- the cost was one constraint and the gain a class of error that cannot arise.
--
-- Two functions ARE rewritten, because they read `survey_questions` by
-- `survey_id` and a block genuinely belongs in what they produce: `send_round`
-- and `app.run_due_schedules`, which build the round's `question_snapshot`.
--
-- ── WHO WRITES EACH COLUMN ────────────────────────────────────────────────
--
-- Asked here, in writing, beside the column, as CLAUDE.md requires:
--
--   survey_id, position, type   `saveDraft` (bygg/actions.ts), the same save
--                               path that renumbers the questions
--   title, body, caption, url   the editor, through that save
--   media_key                   the UPLOAD action, and nothing else — it is an
--                               opaque storage key and an editor never types it
--   created_at                  the default
--
-- Every column has a writer in the phase that adds it. `media_key`'s writer
-- lands with the upload; until then no row can carry one, which the CHECK below
-- makes true rather than merely likely.

begin;

-- ── The vocabulary ────────────────────────────────────────────────────────
-- Six values, DISJOINT from `app.question_type` by construction: a block type
-- is not a question type and no row can be mistaken for the other kind even
-- before the `kind` discriminator below.
create type app.block_type as enum ('section', 'info', 'img', 'video', 'fact', 'rule');

comment on type app.block_type is
  'v7 content blocks (v7:6858-6867). Sitat is deliberately absent — see M:0127''s header.';

create table public.survey_blocks (
  id         uuid primary key default gen_random_uuid(),
  survey_id  uuid not null references public.surveys(id) on delete cascade,
  -- ONE ORDER ACROSS TWO TABLES. Unique within this table, and unique against
  -- `survey_questions` through `app.guard_flow_position` below — the pair is
  -- the constraint, neither half is.
  position   int  not null,
  type       app.block_type not null,
  title      text,
  body       text,
  caption    text,
  -- Video only. A URL an editor typed, rendered on a respondent surface — see
  -- the DEVIATIONS note; the RENDERING is a separate decision from the column.
  url        text,
  -- Bilde only, and OPAQUE ON PURPOSE.
  --
  -- A signed Storage URL contains its object path. `org-logos` is keyed
  -- `${orgId}/logo_${slot}.${ext}`, so its signed URL shows the organisation's
  -- primary key — contained today because, measured, the logo reaches exactly
  -- two manager-facing screens and NO signed URL reaches `/s/[token]` at all.
  -- An image block would be the first, and copying that path shape would put an
  -- organisation's UUID in front of someone who was promised anonymity, which
  -- is invariant 3's corollary arriving through a file path.
  --
  -- So this holds a random key with no organisation, survey or respondent in
  -- it, and the server signs it at render time behind the token check.
  media_key  text,
  created_at timestamptz not null default now(),

  unique (survey_id, position) deferrable initially deferred,

  -- A Skillelinje is «luft mellom to deler, uten tekst» (v7:6866). Carrying
  -- text it can never render is how a field becomes a place to put something
  -- nobody reads.
  constraint survey_blocks_rule_is_empty check (
    type <> 'rule'
    or (title is null and body is null and caption is null
        and url is null and media_key is null)
  ),
  -- Both stated over `type`, which is `not null` and which nothing nulls on our
  -- behalf: the question CLAUDE.md asks of every new rule is which of the
  -- columns it names can be changed by something other than the code in front
  -- of you, and the answer here is none. `survey_id` is the only FK and it
  -- cascades rather than setting null.
  constraint survey_blocks_url_is_video check (url is null or type = 'video'),
  constraint survey_blocks_media_is_img  check (media_key is null or type = 'img')
);

comment on table public.survey_blocks is
  'V7-3 content blocks. A SECOND table rather than a flag on survey_questions, so that an answer '
  'against a block is unrepresentable rather than merely refused: answers.question_id has no target '
  'here. See M:0127''s header and docs/v7/02-blocks-measurement.md.';
comment on column public.survey_blocks.position is
  'One order space shared with survey_questions.position; app.guard_flow_position enforces the half '
  'a unique constraint cannot reach.';
comment on column public.survey_blocks.media_key is
  'Opaque Storage key for a Bilde block. Written by the upload action only. Carries no organisation, '
  'survey or respondent identifier, because a signed URL contains its object path and this one is '
  'read on a respondent surface.';

create index survey_blocks_survey_position_idx on public.survey_blocks (survey_id, position);

-- ── RLS, the same authority the questions have ────────────────────────────
alter table public.survey_blocks enable row level security;

create policy sb_sel on public.survey_blocks for select
  using (app.can_view_survey(survey_id));
create policy sb_cud_ins on public.survey_blocks for insert
  with check (app.can_edit_survey(survey_id));
create policy sb_cud_upd on public.survey_blocks for update
  using (app.can_edit_survey(survey_id)) with check (app.can_edit_survey(survey_id));
create policy sb_cud_del on public.survey_blocks for delete
  using (app.can_edit_survey(survey_id));

-- `from public, anon` and not `from anon`: revoking from anon alone leaves the
-- grant anon INHERITS from PUBLIC standing. M:0013 found that on 2026-09-04 and
-- M:0101/M:0102 reproduced it anyway, which is why the rule this project keeps
-- is «a grant is a fact about the catalogue and must be read back from the
-- catalogue» rather than a spelling.
revoke all on table public.survey_blocks from public, anon;
grant select, insert, update, delete on table public.survey_blocks to authenticated;

-- ── Frozen after send, exactly as the questions are ───────────────────────
-- `app.forbid_edit_after_send` reads `coalesce(new.survey_id, old.survey_id)`
-- and is therefore already generic over any table keyed to a survey. Reused
-- rather than copied; only its MESSAGE widens, because it now speaks for two
-- tables and «its questions are frozen» would be false of half its callers.
create or replace function app.forbid_edit_after_send()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_survey uuid;
begin
  v_survey := coalesce(new.survey_id, old.survey_id);

  if tg_op = 'DELETE'
     and not exists (select 1 from public.surveys s where s.id = v_survey)
  then
    return old;   -- the survey is being deleted; its content goes with it
  end if;

  if exists (
    select 1 from public.survey_rounds r
    where r.survey_id = v_survey and r.status <> 'scheduled'
  ) then
    raise exception
      'survey % has an open or closed round; its questions and content blocks are frozen (docs/DEVIATIONS.md D31)',
      v_survey
      using errcode = 'check_violation';
  end if;

  return coalesce(new, old);
end
$$;

create trigger sb_freeze_after_send
  before insert or update or delete on public.survey_blocks
  for each row execute function app.forbid_edit_after_send();

-- ── The half a unique constraint cannot reach ─────────────────────────────
--
-- The flow is ONE sequence over two tables, so «no two elements share a
-- position» is a claim about both of them and no single `unique` spans them.
--
-- DEFERRABLE INITIALLY DEFERRED, and that is not a detail: `saveDraft` writes
-- every row to a temporary NEGATIVE position and then to its real one
-- (bygg/actions.ts:141-158), precisely so a reorder never collides mid-flight.
-- An immediate check would refuse the intermediate state and the symptom would
-- be a save that fails on a reorder — the shape this project has now hit nine
-- times, where a rule written as «reject any collision» collides with
-- maintenance the system does on its own behalf.
--
-- It guards INSERT and UPDATE OF position, and nothing else. The scope is the
-- column the rule is about: writing it over every UPDATE would refuse an edit
-- to a block's body for a position it did not touch, which is Q137's inversion.
create or replace function app.guard_flow_position()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_clash int;
begin
  -- The survey may be going away underneath us; there is nothing to order.
  if not exists (select 1 from public.surveys s where s.id = new.survey_id) then
    return new;
  end if;

  if tg_table_name = 'survey_questions' then
    select count(*) into v_clash
      from public.survey_blocks b
     where b.survey_id = new.survey_id and b.position = new.position;
  else
    select count(*) into v_clash
      from public.survey_questions q
     where q.survey_id = new.survey_id and q.position = new.position;
  end if;

  if v_clash > 0 then
    raise exception
      'survey % already has an element at flow position % — questions and content blocks share one order (M:0127)',
      new.survey_id, new.position
      using errcode = 'unique_violation';
  end if;

  return new;
end
$$;

create constraint trigger sq_flow_position
  after insert or update of position on public.survey_questions
  deferrable initially deferred
  for each row execute function app.guard_flow_position();

create constraint trigger sb_flow_position
  after insert or update of position on public.survey_blocks
  deferrable initially deferred
  for each row execute function app.guard_flow_position();

-- ── The snapshot, and the guard whose NAME was already right ──────────────
--
-- `get_survey_for_token` returns `survey_rounds.question_snapshot` and nothing
-- else, so a block reaches a respondent only by being in it.
--
-- Every entry gains `kind`. A snapshot written before this migration has none,
-- and its reader treats an absent `kind` as 'question' — the two vocabularies
-- are disjoint anyway, so the discriminator is belt and braces rather than the
-- only way to tell.
--
-- AND THE EMPTY GUARD IS RESTATED OVER QUESTIONS. It read
-- `jsonb_array_length(v_snapshot) = 0`, which meant «no questions» only while
-- the snapshot held nothing else. With blocks in it that sentence would have
-- quietly become «nothing at all», and **a survey of six info blocks and zero
-- questions would send** — a defect that exists only in the shape we did not
-- choose, and one this function would have introduced silently. The error it
-- already returns is `no_questions`: the NAME was right and the implementation
-- was about to stop matching it.
CREATE OR REPLACE FUNCTION public.send_round(p_survey uuid, p_channels text[], p_recipients jsonb DEFAULT '[]'::jsonb, p_group_ids uuid[] DEFAULT '{}'::uuid[], p_anonymity text DEFAULT NULL::text, p_cadence text DEFAULT 'once'::text, p_runs integer DEFAULT 1, p_reminder_days integer DEFAULT 2, p_rotate boolean DEFAULT false, p_closes_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_test_only boolean DEFAULT false, p_custom_every integer DEFAULT NULL::integer, p_custom_unit text DEFAULT NULL::text, p_custom_weekday integer DEFAULT NULL::integer, p_send_at_local time without time zone DEFAULT NULL::time without time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_survey public.surveys;
  v_round_id uuid;
  v_round_no int;
  v_share_token text;
  v_invited int := 0;
  v_by_sms int := 0;
  v_raw text;
  v_rec jsonb;
  v_email text;
  v_phone text;
  v_channel app.channel;
  v_lang text;
  v_group uuid;
  v_snapshot jsonb;
  v_email_on boolean := 'email' = any(p_channels);
  v_sms_on boolean := 'sms' = any(p_channels);
begin
  select s.* into v_survey from public.surveys s
    where s.id = p_survey and s.deleted_at is null;
  if v_survey.id is null then
    return jsonb_build_object('error','not_found');
  end if;

  if not app.can_edit_survey(p_survey) then
    return jsonb_build_object('error','forbidden');
  end if;

  -- The flag is enforced HERE, not only in the screen that hides the card. A
  -- caller who posts 'sms' to an org without the flag gets nothing sent by SMS
  -- — silently downgraded would be wrong too, so the call is refused outright.
  if v_sms_on and not exists (
    select 1 from public.feature_flags f
     where f.key = 'sms_channel' and f.enabled
       and (f.org_id = v_survey.org_id or f.org_id is null)
     order by f.org_id nulls last limit 1
  ) then
    return jsonb_build_object('error','sms_not_enabled');
  end if;

  if p_anonymity is not null and p_anonymity <> v_survey.anonymity::text then
    update public.surveys set anonymity = p_anonymity::app.anonymity_mode
      where id = p_survey;
    v_survey.anonymity := p_anonymity::app.anonymity_mode;
  end if;

  -- M:0127 — the flow, not just the questions: one sequence over two tables,
  -- each entry tagged with its `kind` so a reader never has to infer it.
  select coalesce(jsonb_agg(e order by pos), '[]'::jsonb)
    into v_snapshot
    from (
      select q.position as pos,
             to_jsonb(q) || jsonb_build_object('kind', 'question') as e
      from (
        select id, type, text, help, required, comment_mode, follow_up_on_low, config, position
        from public.survey_questions where survey_id = p_survey
      ) q
      union all
      select b.position as pos,
             to_jsonb(b) || jsonb_build_object('kind', 'block') as e
      from (
        select id, type::text as type, title, body, caption, url, media_key, position
        from public.survey_blocks where survey_id = p_survey
      ) b
    ) f;

  -- OVER THE QUESTIONS, not over the snapshot. `jsonb_array_length(v_snapshot)`
  -- meant «no questions» only while the snapshot held nothing else; with blocks
  -- in it a survey of six info blocks and zero questions would have sent. The
  -- error's NAME was already right.
  if not exists (
    select 1 from public.survey_questions where survey_id = p_survey
  ) then
    return jsonb_build_object('error','no_questions');
  end if;

  select coalesce(max(round_no), 0) + 1 into v_round_no
    from public.survey_rounds where survey_id = p_survey;

  insert into public.survey_rounds (survey_id, round_no, question_snapshot, status, closes_at)
  values (p_survey, v_round_no, v_snapshot, 'open', p_closes_at)
  returning id into v_round_id;

  -- Named recipients ------------------------------------------------------
  for v_rec in select * from jsonb_array_elements(p_recipients) loop
    v_email := nullif(lower(trim(v_rec->>'email')), '');
    v_phone := app.normalize_phone(v_rec->>'phone');
    -- Email when it can be, SMS when it must be, nothing when neither applies.
    v_channel := case
      when v_email is not null and v_email_on then 'email'::app.channel
      when v_phone is not null and v_sms_on then 'sms'::app.channel
      else null end;
    continue when v_channel is null;

    -- V2-3b · GDPR art. 21. The SKIP, not the guard — see this migration's header. It is
    -- here rather than only in the trigger because the trigger cannot stop the
    -- `pgmq.send` below: a row silently dropped would still put the mail on the
    -- queue, and the worker never reads survey_invitations before sending.
    continue when v_email is not null and app.is_suppressed(v_survey.org_id, v_email);
    -- M:0108. The named loop is the second of this function's TWO insertion
    -- points, and M:0107's sweep read the body as one — so the group loop's
    -- `m.status = 'active'` was standing in for a check this loop never made.
    -- Skipped rather than refused: the trigger would abort the whole send, and
    -- one leaver in a pasted list should not cost the other forty their round.
    continue when v_email is not null and exists (
      select 1 from public.org_members om
       where om.org_id = v_survey.org_id
         and lower(om.email) = lower(trim(v_email))
         and app.member_blocks_invitation(om.status));

    v_lang := coalesce(v_rec->>'lang', v_survey.langs[1], 'no');
    v_group := nullif(v_rec->>'group_id','')::uuid;
    v_raw := encode(extensions.gen_random_bytes(32), 'hex');

    insert into public.survey_invitations
      (round_id, email, phone, name, group_id, lang, channel, token_hash, expires_at)
    values (v_round_id, v_email, case when v_channel = 'sms' then v_phone else v_phone end,
            nullif(v_rec->>'name',''), v_group, v_lang, v_channel,
            app.hash_token(v_raw), p_closes_at);

    perform pgmq.send('mail_outbox', jsonb_build_object(
      'kind', case when p_test_only then 'test' else 'invitation' end,
      'channel', v_channel,
      'round_id', v_round_id, 'survey_id', p_survey, 'org_id', v_survey.org_id,
      'email', v_email, 'phone', case when v_channel = 'sms' then v_phone end,
      'name', v_rec->>'name', 'lang', v_lang,
      'token', v_raw, 'survey_title', v_survey.title));
    v_invited := v_invited + 1;
    if v_channel = 'sms' then v_by_sms := v_by_sms + 1; end if;
  end loop;

  -- Whole groups ----------------------------------------------------------
  -- Members are reached by email: an org_members row has an address and no
  -- phone, and a member of the organisation has a work inbox by definition.
  if array_length(p_group_ids, 1) is not null and v_email_on then
    for v_rec in
      select to_jsonb(m) from public.org_members m
       where m.group_id = any(p_group_ids)
         and m.org_id = v_survey.org_id
         and m.status = 'active'
    loop
      v_email := lower(trim(v_rec->>'email'));
      continue when v_email is null or v_email = '';
      -- Plan test 5: a suppressed address that is also a group member is
      -- excluded from a group-targeted send. Same reason as above.
      continue when app.is_suppressed(v_survey.org_id, v_email);
      v_lang := coalesce(v_survey.langs[1], 'no');
      v_group := nullif(v_rec->>'group_id','')::uuid;
      v_raw := encode(extensions.gen_random_bytes(32), 'hex');

      -- Q64 gap 1, whose column `M:0059` adds. This is the only loop that KNOWS the member —
      -- named recipients and imports address people who may not be members at
      -- all, which is why the column is nullable rather than required. Frozen
      -- here and never re-resolved from the email later; re-resolving is what
      -- the freeze exists to prevent.
      insert into public.survey_invitations (round_id, email, name, group_id, lang, channel, token_hash, expires_at, member_id)
      values (v_round_id, v_email, v_rec->>'name', v_group, v_lang, 'email',
              app.hash_token(v_raw), p_closes_at, (v_rec->>'id')::uuid);

      perform pgmq.send('mail_outbox', jsonb_build_object(
        'kind', case when p_test_only then 'test' else 'invitation' end,
        'channel', 'email',
        'round_id', v_round_id, 'survey_id', p_survey, 'org_id', v_survey.org_id,
        'email', v_email, 'name', v_rec->>'name', 'lang', v_lang,
        'token', v_raw, 'survey_title', v_survey.title));
      v_invited := v_invited + 1;
    end loop;
  end if;

  if p_channels && array['link','qr'] then
    v_share_token := encode(extensions.gen_random_bytes(24), 'hex');
    insert into public.share_links (round_id, kind, token_hash, active)
    values (v_round_id, 'link', app.hash_token(v_share_token), true);
  end if;

  if p_cadence <> 'once' then
    insert into public.schedules
      (survey_id, cadence, runs_total, runs_done, rotate_questions, reminder_after_days,
       custom_every, custom_unit, custom_weekday, send_at_local, next_run_at, active)
    values
      (p_survey, p_cadence::app.cadence, greatest(p_runs, 0), 1, p_rotate, p_reminder_days,
       p_custom_every, p_custom_unit, p_custom_weekday,
       coalesce(p_send_at_local, '09:00'::time),
       -- ONE definition of how long a cadence step is (M:0044). The CASE this
       -- replaces was the SECOND copy of it, and it had the same four arms and
       -- the same `else interval '7 days'` — so the first next run of an annual
       -- survey was a week away even after 0044 fixed the sweep.
       -- Q50: the first next run is the LOCAL send time on the day the
       -- cadence lands on, in the organisation's zone — not "this time of day,
       -- one interval from now". Before this, `send_at_local` was stored and
       -- never read here at all: a weekly survey sent at 14:32 kept arriving
       -- at 14:32 forever, and the column the customer set was decoration.
       app.local_send_at(
         ((now() + app.cadence_interval(p_cadence::app.cadence, p_custom_every, p_custom_unit))
            at time zone (select o.timezone from public.organizations o
                           join public.surveys s on s.org_id = o.id
                          where s.id = p_survey))::date,
         coalesce(p_send_at_local, '09:00'::time),
         (select o.timezone from public.organizations o
            join public.surveys s on s.org_id = o.id
           where s.id = p_survey)
       ),
       true);
  end if;

  update public.surveys set status = 'aktiv' where id = p_survey and status = 'utkast';
  -- Q17: a real send promises the respondents a threshold, so the policy
  -- freezes here. A test-only send promises no one, and leaves it editable.
  if not p_test_only then
    update public.surveys set policy_locked = true where id = p_survey;
  end if;

  -- Q98: fire at SEND, once per round. Deduplicated on (source_ref,
  -- source_round_id) by `tasks_blind_spot_once`, so a retried send is not a
  -- second prompt.
  --
  -- The handler is NARROW ON PURPOSE. `M:0070` used `when others then null` and
  -- that turned a five-times-applied patch into a silent one. These two are the
  -- conditions a concurrent send can raise; anything else is a bug and must
  -- reach a human.
  begin
    perform app.generate_blind_spot_tasks(p_survey);
  exception
    when unique_violation or foreign_key_violation then
      null;
  end;

  return jsonb_build_object(
    'ok', true,
    'round_id', v_round_id,
    'round_no', v_round_no,
    'invited', v_invited,
    'by_sms', v_by_sms,
    'share_token', v_share_token,
    'queued', v_invited);
end $function$;

-- `app.run_due_schedules` builds the same snapshot for the RECURRING send, and
-- carries one thing `send_round` does not: `rotate_questions`, which picks
-- three at random. Rotation stays over the QUESTIONS and the blocks always ride
-- along — picking three of a mixed flow would ship a heading for a part that is
-- not in the round.
--
-- AND IT GAINS THE GUARD IT NEVER HAD. Measured while rewriting it: nothing
-- here stopped a scheduled survey with zero questions from opening an empty
-- round and mailing every recipient a link to it. `send_round` has refused that
-- since Phase 3. Closed on the silent job too, because the phase that runs the
-- sweep owns what it finds.
CREATE OR REPLACE FUNCTION app.run_due_schedules()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_frozen uuid;
  v_s record;
  v_prev uuid;
  v_round_id uuid;
  v_round_no int;
  v_inv record;
  v_raw text;
  v_snapshot jsonb;
  v_qs jsonb;
  v_count int := 0;
begin
  for v_s in
    -- Q50: the organisation's zone rides along with the schedule, so the
    -- advance below computes a LOCAL send time without a second lookup.
    select sc.*, s.org_id, s.title, s.langs, o.timezone as tz
      from public.schedules sc
      join public.surveys s on s.id = sc.survey_id
      join public.organizations o on o.id = s.org_id
     where sc.active
       -- Q22. Before anything else in the loop body, so a paused series never
       -- reaches the statement that closes the open round.
       and sc.paused_at is null
       and sc.next_run_at is not null
       and sc.next_run_at <= now()
       and s.deleted_at is null
       and (sc.runs_total = 0 or sc.runs_done < sc.runs_total)
  loop
    select id into v_prev from public.survey_rounds
      where survey_id = v_s.survey_id order by round_no desc limit 1;

    for v_frozen in
      update public.survey_rounds set status = 'closed'
        where survey_id = v_s.survey_id and status = 'open'
      returning id
    loop
      perform app.freeze_round(v_s.survey_id, v_frozen);
    end loop;
    update public.share_links set active = false
      where round_id in (select id from public.survey_rounds where survey_id = v_s.survey_id);

    -- M:0127 — THE QUESTIONS FIRST, BECAUSE ROTATION IS OVER QUESTIONS.
    -- `rotate_questions` picks three at random; picking three of a flow that
    -- mixes questions with section headings would ship a heading for a part
    -- that is not in the round, or drop the heading of a part that is.
    select coalesce(jsonb_agg(to_jsonb(q) order by q.position), '[]'::jsonb) into v_qs
      from (
        select id, type, text, help, required, comment_mode, follow_up_on_low, config, position
          from public.survey_questions where survey_id = v_s.survey_id order by position
      ) q;

    -- M:0127 — A ROUND WITH NO QUESTIONS IS NOT A ROUND. `send_round` has
    -- refused this since Phase 3 and this path never did: measured while
    -- rewriting it, nothing here stopped a scheduled survey with zero questions
    -- from opening an empty round and mailing every recipient a link to it. The
    -- same class the interactive path already closed, on the silent job.
    if jsonb_array_length(v_qs) = 0 then
      continue;
    end if;

    if v_s.rotate_questions and jsonb_array_length(v_qs) > 3 then
      select coalesce(jsonb_agg(value), '[]'::jsonb) into v_qs
        from (
          select value from jsonb_array_elements(v_qs)
          order by md5(value::text || v_s.runs_done::text) limit 3
        ) picked;
    end if;

    -- The blocks ALWAYS ride along, in position order: a rotated round still
    -- needs its headings and its «før du begynner».
    select coalesce(jsonb_agg(e order by pos), '[]'::jsonb) into v_snapshot
      from (
        select (value->>'position')::int as pos,
               value || jsonb_build_object('kind', 'question') as e
          from jsonb_array_elements(v_qs)
        union all
        select b.position as pos,
               to_jsonb(b) || jsonb_build_object('kind', 'block') as e
          from (
            select id, type::text as type, title, body, caption, url, media_key, position
              from public.survey_blocks where survey_id = v_s.survey_id
          ) b
      ) f;

    select coalesce(max(round_no), 0) + 1 into v_round_no
      from public.survey_rounds where survey_id = v_s.survey_id;

    insert into public.survey_rounds (survey_id, round_no, question_snapshot, status)
    values (v_s.survey_id, v_round_no, v_snapshot, 'open')
    returning id into v_round_id;

    for v_inv in
      select distinct on (coalesce(email, phone))
             email, phone, channel, name, group_id, lang, member_id
        from public.survey_invitations where round_id = v_prev and not is_test
       order by coalesce(email, phone), created_at
    loop
      -- V2-3b. THIS IS THE PATH THE PLAN DID NOT COUNT, and the one that makes
      -- suppression matter: round N+1 is built by copying round N's invitation
      -- rows verbatim, so without this line a person who objects after round 1
      -- is re-invited by cron, from a path no screen leads to.
      continue when v_inv.email is not null
                and app.is_suppressed(v_s.org_id, lower(trim(v_inv.email)));

      -- DEACTIVATION. Keyed on the PERSON, not on `member_id`: that column is
      -- `on delete set null` and only the group loop ever sets it, so it would
      -- protect some invitations and not others. `(org_id, email)` is unique.
      -- An address with no membership at all is left alone — an external
      -- respondent is not ours to deactivate.
      continue when v_inv.email is not null and exists (
        select 1 from public.org_members om
         where om.org_id = v_s.org_id
           and lower(om.email) = lower(trim(v_inv.email))
           and app.member_blocks_invitation(om.status));

      v_raw := encode(extensions.gen_random_bytes(32), 'hex');
      insert into public.survey_invitations
        (round_id, email, phone, name, group_id, lang, channel, token_hash, member_id)
      values (v_round_id, v_inv.email, v_inv.phone, v_inv.name, v_inv.group_id, v_inv.lang,
              v_inv.channel, app.hash_token(v_raw), v_inv.member_id);

      perform pgmq.send('mail_outbox', jsonb_build_object(
        'kind', 'invitation',
        'channel', v_inv.channel,
        'round_id', v_round_id, 'survey_id', v_s.survey_id, 'org_id', v_s.org_id,
        'email', v_inv.email, 'phone', case when v_inv.channel = 'sms' then v_inv.phone end,
        'name', v_inv.name, 'lang', v_inv.lang,
        'token', v_raw, 'survey_title', v_s.title));
    end loop;

    update public.schedules
       set runs_done = runs_done + 1,
           -- Q50: same rule as the first run — the local send time on the
           -- day the cadence lands on, in the organisation's zone. `v_zone` is
           -- carried on the loop's own row, so there is no second lookup.
           next_run_at = app.local_send_at(
             ((now() + app.cadence_interval(cadence, custom_every, custom_unit))
                at time zone v_s.tz)::date,
             send_at_local,
             v_s.tz
           ),
           active = case when runs_total = 0 then true
                         else runs_done + 1 < runs_total end
     where id = v_s.id;

    v_count := v_count + 1;
  end loop;

  return v_count;
end $function$;

commit;
