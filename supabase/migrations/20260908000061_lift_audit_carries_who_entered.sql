-- V2-3b carried item, closed. DECISIONS **Q96**.
--
-- ── THE DECISION THIS IMPLEMENTS, AND WHY THE OTHER SHAPE WAS A TRAP ────────
--
-- The Reservasjonsliste's scope copy says «only an administrator can lift it,
-- and lifting is logged». The stronger sentence — *an objection entered on
-- someone's behalf cannot be undone by the person who entered it* — was asked
-- for and is NOT what this product does, so it was not written on the card
-- (D112c). Q96 closes that gap as a decision rather than leaving it open.
--
-- **The mechanism is AUDIT, not SEPARATION.** A four-eyes rule is one line —
-- `created_by is distinct from (select auth.uid())` on `suppressions_del`,
-- using a column that already exists — and it would make the sentence true and
-- the product unusable: in a single-administrator organisation nobody could
-- ever lift anything, and `heituva-prod` has one member. A mistyped address
-- would be permanent with no support path. Tor: **«That is a trap, not a
-- safeguard.»**
--
-- So the answer at this product's size is that the same person MAY do both, and
-- a reviewer can SEE that they did. That only works if the audit row carries
-- both halves, and until now it carried one: `actor_user_id` is whoever lifted
-- it, and who ENTERED the objection was not recorded anywhere the reviewer
-- looks — the row it lived on is the row being deleted.
--
-- So `entered_by` and `entered_at` ride along in `meta`. Both are read off
-- `old`, which is still available in an AFTER DELETE trigger; after the
-- statement commits they exist nowhere else.
--
-- **Deliberately NOT stored: a `same_person` boolean.** It is derivable from the
-- two ids in the same row, and Q61's reasoning applies one surface over — a
-- second field carrying a derived fact is a field that disagrees with its source
-- the first time one of them is written alone. The reviewer compares two ids;
-- that is one glance and it cannot go stale.

-- ── FIRST: `created_by` HAD NO WRITER, WHICH Q96 NOW DEPENDS ON ────────────
--
-- `M:0060` gave `suppressions` a `created_by` column and **nothing ever set
-- it** — not the server action, not a default. It was D110's instance 2 waiting
-- in the same phase that named it: a feature flag with no call site is a comment
-- in a table, and a column with no writer is the same thing. Q96's whole
-- mechanism reads that column, so it had to become real before the trigger could
-- carry it.
--
-- A COLUMN DEFAULT rather than a line in the server action, and the reason is
-- this phase's own lesson one surface over: a predicate in the caller is a
-- predicate the next caller can forget. `addSuppression` is one writer today;
-- an import path or an unsubscribe endpoint would be the second and the third.
-- The default cannot be bypassed by a writer that does not know about it.
--
-- Service-role writes (the seed, the suite's fixtures) leave it NULL, which is
-- correct and not a gap: nobody entered those, and an audit row saying «entered
-- by null» is the honest answer to «which administrator did this» when none did.
alter table public.suppressions
  alter column created_by set default auth.uid();

create or replace function app.audit_suppression_lift()
returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  -- CLAUDE.md, «Immutability rules must permit referential maintenance» — the
  -- fifth rediscovery, and this trigger is the second half of it. Deleting an
  -- organisation cascades to `suppressions`, this fires for each row, and the
  -- audit row it writes references an organisation that is already gone:
  -- `audit_events_org_id_fkey` refuses it and the whole delete fails, far from
  -- anything about suppression. It surfaced as `dropOrg(Nordisk Studio)`
  -- failing in the demo seed.
  --
  -- The rule the note prescribes is «reject only what changes meaning, and let
  -- the database's own maintenance through». Here the meaning is plain: an
  -- audit row exists to answer «who let this address back in», and when the
  -- whole organisation is being erased there is nobody to answer it to and no
  -- organisation to hang it on. So a cascade is not a lift.
  --
  -- The parent row is deleted BEFORE its cascade reaches children, so this test
  -- is reliable rather than a race — proved rather than assumed, see
  -- `tests/db/suppressions.test.ts` — «ERASING AN ORGANISATION IS NOT A LIFT».
  if not exists (select 1 from public.organizations o where o.id = old.org_id) then
    return old;
  end if;

  insert into public.audit_events (org_id, actor_user_id, action, target, meta)
  values (old.org_id, (select auth.uid()), 'suppression.lift', old.email,
          jsonb_build_object(
            'reason', old.reason,
            'source', old.source,
            -- Q96. `actor_user_id` is who LIFTED it; these are who ENTERED it
            -- and when. The product does not refuse the same person doing both
            -- — it makes it visible, which is the trade Q96 states.
            'entered_by', old.created_by,
            'entered_at', old.created_at));
  return old;
end $fn$;

comment on function app.audit_suppression_lift() is
  'Q96: the lift audit carries WHO ENTERED the objection beside who lifted it, '
  'so a reviewer can see the same person did both. Separation of duties was '
  'considered and rejected: four-eyes leaves a single-administrator '
  'organisation unable to lift anything, which is a trap rather than a '
  'safeguard at this product''s size.';
