-- V2-9 — `invitations_reachable_check` said more than it meant, and the voucher
-- is what found it.
--
-- The constraint as written:
--
--     CHECK (email IS NOT NULL OR phone IS NOT NULL)
--
-- **What it means** is «an invitation the product must DELIVER has somewhere to
-- deliver it» — an email row with no address and a sms row with no number are
-- both unsendable and would sit in the queue for ever. **What it says** is
-- «every invitation names a person», and those are not the same sentence.
--
-- A voucher invitation is never delivered. The respondent is holding the token
-- already: they scanned a code in the room and `redeem_live_voucher` minted a
-- row so that `submit_response` — still the only write path — has an invitation
-- to validate against. There is nobody to send anything to, and there must not
-- be: Tor's second condition on the QR path is that **the system does not know
-- who the device belongs to**, so an address on that row would be a fiction.
--
-- This is CLAUDE.md's referential-maintenance lesson one constraint over. That
-- rule is about triggers and foreign keys written as «reject any DELETE» when
-- what was meant is «no record may be left pointing at something that stopped
-- existing». The same failure mode in a CHECK: a rule stated over the columns it
-- happened to be about at the time, which then refuses a case nobody had yet.
-- The symptom arrived far from the constraint — `redeem_live_voucher` raising
-- `23514` from an insert that looks unremarkable.
--
-- Restated as what it means. `live_session_id is not null` is the third way an
-- invitation can be legitimate, and it is not a loophole: that column is only
-- ever set by `redeem_live_voucher`, which sets no address, and the row is
-- expired by `close_live_session` with the session.
alter table public.survey_invitations drop constraint invitations_reachable_check;

alter table public.survey_invitations add constraint invitations_reachable_check
  check (email is not null or phone is not null or live_session_id is not null);

comment on constraint invitations_reachable_check on public.survey_invitations is
  'An invitation the product must DELIVER has somewhere to deliver it. A voucher '
  'invitation (live_session_id set) is never delivered — the respondent already '
  'holds the token — and carries no address by design (V2-9, the QR join path).';
