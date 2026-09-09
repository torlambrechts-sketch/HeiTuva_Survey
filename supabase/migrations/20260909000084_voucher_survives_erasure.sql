-- V2-9 FIX PASS — **the referential-maintenance rule, sixth instance, and I
-- wrote it myself in the migration that was supposed to accommodate it.**
--
-- `M:0081` widened `invitations_reachable_check` to
--
--     email is not null or phone is not null or live_session_id is not null
--
-- and `M:0079` gave `survey_invitations.live_session_id` `on delete set null`,
-- deliberately, so that erasing a session could not strand the rows recording
-- who took part. **Those two decisions are individually right and together
-- broken.** Deleting the organisation cascades to `live_sessions`, which nulls
-- `live_session_id` — and the invitation then has no email, no phone and no
-- session, so the CHECK I had just widened refuses the database's own cascade.
--
-- The symptom is the one CLAUDE.md names in as many words: **a parent row that
-- cannot be deleted, discovered far from the rule.** It surfaced as `dropOrg`
-- failing in a probe, exactly as V2-3b's FK pair did. That section warns about
-- triggers and about foreign keys; this is the same collision through a **CHECK
-- constraint**, which is a third construct, and the reason it belongs to the
-- same family is that all three are rules written over a column the database
-- reserves the right to change on your behalf.
--
-- ── THE FIX IS THE COLUMN, NOT THE PREDICATE ───────────────────────────────
--
-- The rule I meant is «a voucher invitation is never DELIVERED, so it needs no
-- address». `live_session_id` was the wrong column to say that with — not
-- because it is the wrong fact, but because **it is nullable by cascade**, and a
-- rule may not rest on a column whose value the database can withdraw.
--
-- `channel` says the same thing durably: it is set at insert, it is `not null`,
-- and nothing nulls it. A `qr` invitation carries no address by construction —
-- that is true of the Send screen's QR poster as much as of a live voucher,
-- which is why this is a better statement of the rule and not merely a working
-- one.
--
-- **The general form, for the next person who widens a constraint:** ask which
-- of the columns your predicate names can be changed by something other than
-- the code you are looking at. A cascade is such a something.
alter table public.survey_invitations drop constraint invitations_reachable_check;

alter table public.survey_invitations add constraint invitations_reachable_check
  check (email is not null or phone is not null or channel = 'qr');

comment on constraint invitations_reachable_check on public.survey_invitations is
  'An invitation the product must DELIVER has somewhere to deliver it. A `qr` '
  'invitation is never delivered — the respondent scanned a code and already '
  'holds the token — and carries no address by design (V2-9). Stated over '
  '`channel` and not over `live_session_id`, because the latter is nulled by '
  'cascade when a session is erased and a rule may not rest on a column the '
  'database can withdraw.';

-- ── The composite tenancy FK, which V2-5's own test caught ─────────────────
--
-- `live_sessions.created_by` was a single-column FK to `org_members(id)`
-- between two org-scoped tables — the class `tests/db/fk-tenancy.test.ts`
-- enumerates, and it arrived FAILING, which is what that test is for. A
-- foreign value would attribute one organisation's live session to another
-- organisation's member, and every RLS policy on this table trusts `org_id`.
alter table public.live_sessions drop constraint live_sessions_created_by_fkey;

alter table public.live_sessions add constraint live_sessions_created_by_fkey
  foreign key (created_by, org_id) references public.org_members(id, org_id)
  on delete set null (created_by) on update cascade;
