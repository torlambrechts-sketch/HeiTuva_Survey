-- HeiTuva 0014 — bind audit rows to their actual actor
--
-- Found by attacking the policy with a persona client: audit_ins in 0008 only
-- required org membership, so ANY member could write the audit trail. A `leser`
-- inserted a fake "role.change" row and set actor_user_id to another user's id,
-- both accepted. audit_events is append-only against tampering, but forgery
-- walked straight in — and these rows are the evidence that statutory duties
-- were signed and privacy settings changed, so a forgeable trail is worthless
-- for Åpenhetsloven and ARP documentation.
--
-- The row must now name its real author. Insert is still open to any member
-- because members legitimately generate auditable events; what changes is that
-- they can no longer attribute one to somebody else, or to nobody.
drop policy if exists audit_ins on public.audit_events;

create policy audit_ins on public.audit_events for insert
  with check (
    org_id is not null
    and app.is_org_member(org_id)
    and actor_user_id = auth.uid()   -- cannot be null, cannot be another user
  );
