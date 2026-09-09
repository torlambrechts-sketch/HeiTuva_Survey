-- V2-9 — Live. **Q79, the QR join path, Q80, Q81 and Q82 ANSWERED BY TOR 2026-09-09.**
-- Q78 remains open and is named where it bites. `docs/v2/07-v2-9-opening.md` is the
-- opening note this migration implements.
--
-- ══ THE CODE IS A VOUCHER, NOT A TICKET (Tor, on the QR join path) ═════════
--
-- «Deltakerne skanner og svarer uten innlogging» (V2:6135) reads like a second
-- write path, and CLAUDE.md invariant 2 forbids one. Tor's resolution is not a
-- carve-out but a re-description:
--
--   > The code is a VOUCHER, not a ticket: scanning it calls a public RPC that
--   > mints a single-use token for that device, and the respondent enters the
--   > existing submit_response path like any other invitee. Invariant 2 stays
--   > «the only write path is submit_response» rather than becoming «the only
--   > write path for this kind», which is the same weakening I refused for quiz.
--
-- So `redeem_live_voucher` writes an INVITATION and returns a token. It writes
-- no response and cannot: `submit_response` is still the only function that
-- inserts into `responses`, and `tests/db/test-mode.test.ts` test 7 asserts that
-- over the catalogue.
--
-- ══ TWO CONDITIONS THAT CAME WITH IT, NEITHER OPTIONAL ═════════════════════
--
-- **1. The voucher is closable and expires with the session.** «A QR code on a
-- slide is otherwise valid tomorrow.» Implemented at BOTH levels, because
-- closing the code while leaving minted tokens alive would move the problem one
-- step down rather than solve it: `close_live_session` sets the session closed
-- AND expires every invitation the session minted. `survey_invitations` gains
-- `live_session_id` so those rows can be found — a reference, not a second
-- tenancy: `on delete set null` so erasing a session cannot strand an
-- invitation, per CLAUDE.md's referential-maintenance rule.
--
-- **2. Live over QR is anonymous or it is nothing.** «A token minted to a device
-- of unknown identity cannot produce a named response — the system does not know
-- who the device belongs to, and a named answer would be an assertion nobody can
-- support.» Enforced by a TRIGGER rather than a CHECK, because the anonymity
-- lives on `surveys` and a CHECK cannot see another table. It fires on the
-- session, not on the answer, so the refusal happens when the presenter opens
-- live — before a single person has scanned anything.
--
-- ══ AN HONEST LIMIT, RECORDED RATHER THAN LEFT SILENTLY TRUE ═══════════════
--
-- V2-3b built `suppressions` so an objector is never re-invited, and
-- `app.guard_invitation_not_suppressed` enforces it — but it returns early when
-- `new.email is null`, which is exactly a voucher invitation. **A person on the
-- Reservasjonsliste who scans the QR is not filtered out.** That is not a bug to
-- fix; it follows from the same fact that makes the anonymity rule necessary —
-- the system does not know who the device belongs to. It is stated here, and
-- asserted in `tests/db/live.test.ts`, so it is a known property rather than a
-- discovery waiting to happen.

create table public.live_sessions (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  survey_id   uuid not null,
  round_id    uuid not null references public.survey_rounds(id) on delete cascade,
  code        text not null unique check (code ~ '^[A-Z0-9]{6,10}$'),
  status      text not null default 'open' check (status in ('open','closed')),
  step        text,
  revealed    boolean not null default false,
  created_by  uuid references public.org_members(id) on delete set null,
  opened_at   timestamptz not null default now(),
  closed_at   timestamptz,
  expires_at  timestamptz not null,
  -- THE COMPOSITE TENANCY FK (the class V2-5 found eleven live instances of).
  -- `(survey_id, org_id)` rather than `survey_id` alone: a plain FK would let a
  -- session name one organisation's survey while carrying another's org_id, and
  -- every RLS policy below trusts `org_id`.
  constraint live_sessions_survey_tenancy
    foreign key (survey_id, org_id) references public.surveys(id, org_id)
    on update cascade
);

comment on table public.live_sessions is
  'Q78/Q79, V2-9. A presenter''s live run of one round. `code` is a VOUCHER — it '
  'mints a per-device token through public.redeem_live_voucher and is closable and '
  'expiring; it is never itself a write path. A session may only exist on an '
  'anonymous survey (app.guard_live_is_anonymous).';

create index live_sessions_round_idx on public.live_sessions (round_id);
create index live_sessions_open_idx  on public.live_sessions (code) where status = 'open';

alter table public.survey_invitations
  add column live_session_id uuid references public.live_sessions(id) on delete set null;

comment on column public.survey_invitations.live_session_id is
  'Set on an invitation minted by redeeming a live voucher, so close_live_session '
  'can expire exactly those. `on delete set null`: erasing a session must not '
  'strand the invitation rows that record who took part.';

create index survey_invitations_live_idx on public.survey_invitations (live_session_id)
  where live_session_id is not null;

-- ── Live is anonymous or it is nothing ─────────────────────────────────────
create or replace function app.guard_live_is_anonymous()
returns trigger language plpgsql as $$
declare v_mode app.anonymity_mode;
begin
  select s.anonymity into v_mode from public.surveys s where s.id = new.survey_id;
  if v_mode is distinct from 'anonymous' then
    raise exception 'live_requires_anonymous'
      using hint = 'A live session mints a token for a device of unknown identity. '
                   'A named answer from it would be an assertion nobody can support, '
                   'so live runs only on an anonymous survey.',
            errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger live_sessions_anonymous_only
  before insert or update of survey_id on public.live_sessions
  for each row execute function app.guard_live_is_anonymous();

alter table public.live_sessions enable row level security;

create policy live_sel on public.live_sessions for select
  using (app.is_org_member(org_id));
create policy live_ins on public.live_sessions for insert
  with check (app.has_role(org_id, array['administrator','redaktor']::app.member_role[])
              and app.can_edit_survey(survey_id));
create policy live_upd on public.live_sessions for update
  using (app.has_role(org_id, array['administrator','redaktor']::app.member_role[])
         and app.can_edit_survey(survey_id))
  with check (app.has_role(org_id, array['administrator','redaktor']::app.member_role[]));
create policy live_del on public.live_sessions for delete
  using (app.has_role(org_id, array['administrator']::app.member_role[]));

-- ── The voucher, redeemed ──────────────────────────────────────────────────
create or replace function public.redeem_live_voucher(p_code text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare
  v_s public.live_sessions%rowtype;
  v_token text;
begin
  select * into v_s from public.live_sessions
   where code = upper(trim(p_code)) and status = 'open' and expires_at > now();

  -- ONE refusal for every reason, and it is `submit_response`'s own vocabulary.
  -- A code that is wrong, closed, expired or never existed must be
  -- indistinguishable, or the refusal itself enumerates live sessions to an
  -- unauthenticated caller.
  if v_s.id is null then
    return jsonb_build_object('error', 'not_found_or_closed');
  end if;

  v_token := encode(extensions.gen_random_bytes(24), 'hex');

  insert into public.survey_invitations
    (round_id, token_hash, channel, expires_at, live_session_id)
  values
    (v_s.round_id, encode(extensions.digest(v_token, 'sha256'), 'hex'), 'qr',
     v_s.expires_at, v_s.id);

  -- The token, once, in the response body. Never stored in the clear, never
  -- logged — CLAUDE.md invariant 5.
  return jsonb_build_object('token', v_token, 'round_id', v_s.round_id);
end $$;

revoke all on function public.redeem_live_voucher(text) from public;
grant execute on function public.redeem_live_voucher(text) to anon, authenticated;

comment on function public.redeem_live_voucher(text) is
  'The voucher. Anon by design — a room scans a code and each device gets its own '
  'single-use token, then enters the ordinary submit_response path. It writes an '
  'invitation and never a response.';

-- ── Closing it, at both levels ─────────────────────────────────────────────
create or replace function public.close_live_session(p_id uuid)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_s public.live_sessions%rowtype; v_expired int;
begin
  select * into v_s from public.live_sessions where id = p_id;
  if v_s.id is null or not app.can_edit_survey(v_s.survey_id) then
    return jsonb_build_object('error', 'forbidden');
  end if;

  update public.live_sessions
     set status = 'closed', closed_at = coalesce(closed_at, now()), expires_at = least(expires_at, now())
   where id = p_id;

  -- AND the tokens it already minted. Closing only the code would move the
  -- problem one step down: a device that scanned during the session would keep
  -- a working token afterwards.
  update public.survey_invitations
     set expires_at = now()
   where live_session_id = p_id and responded_at is null;
  get diagnostics v_expired = row_count;

  return jsonb_build_object('ok', true, 'tokens_expired', v_expired);
end $$;

revoke all on function public.close_live_session(uuid) from public;
grant execute on function public.close_live_session(uuid) to authenticated;
