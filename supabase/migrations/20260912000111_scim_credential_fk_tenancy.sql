-- `scim_credentials.created_by` is made COMPOSITE, because the FK-tenancy gate
-- caught it as a fourteenth single-column FK between two org-scoped tables.
--
-- The gate is right and the fix is the key rather than an allowlist entry. What
-- a foreign value would DO here is not theoretical: `created_by` is rendered on
-- the Integrasjoner screen as «opprettet av», so a row whose `created_by` points
-- at a member of ANOTHER organisation would attribute this organisation's
-- credential to a stranger — a name from outside the tenant on a security
-- screen. The composite key makes that unrepresentable instead of merely
-- unlikely, which is the same choice V2-5 made for the other thirteen.
--
-- `org_members_id_org_uniq` on (id, org_id) is what the composite references;
-- it exists already and is what the other thirteen use.
--
-- ON DELETE SET NULL on the created_by half ONLY. Deleting the ORGANISATION
-- still cascades the credential away through `org_id`'s own FK; deleting the
-- administrator who minted the token must not take the credential with them —
-- the connector keeps working when the person who set it up leaves, which is
-- exactly the event this whole phase is about.
alter table public.scim_credentials
  drop constraint if exists scim_credentials_created_by_fkey;

alter table public.scim_credentials
  add constraint scim_credentials_created_by_fkey
  foreign key (created_by, org_id) references public.org_members(id, org_id)
  on delete set null (created_by);
