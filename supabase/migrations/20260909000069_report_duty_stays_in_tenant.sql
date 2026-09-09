-- V2-5 ITEM 0b — `reports.duty_id`, the one instance of the FK tenancy class
-- with a behavioural effect.
--
-- ── WHAT IT DOES, MEASURED RATHER THAN REASONED ─────────────────────────────
--
-- `public.publish_duty` takes its authority from the DUTY —
-- `app.is_org_member(d.org_id)` — and then selects that duty's report with **no
-- org filter at all**:
--
--     select r.id, r.title into v_report, v_title
--       from public.reports r
--      where r.duty_id = p_duty and r.deleted_at is null
--      order by r.created_at desc limit 1;
--
-- So a report belonging to org A, pointed at org B's duty, becomes «the most
-- recent report for this duty» for org B. Probed in V2-4 as org B's
-- administrator: it did **not** return `no_report` — it selected the foreign row
-- — and stopped at the next check.
--
-- **I expected a disclosure and there is not one, because a check is in the
-- right order.** `public.snapshot_report` tests `app.is_org_member(v_rep.org_id)`
-- at its line 19, BEFORE the `no_survey` return at line 39. Had those two been
-- swapped, the narrative-report exception that `publish_duty`'s own comment
-- describes — «`no_survey` is the one error that does not stop the publish» —
-- would have carried org A's report TITLE into org B's `duty_versions.label` and
-- flipped org A's report to `publisert`. A cross-tenant read and a cross-tenant
-- write, separated from happening by nothing but statement order. That is worth
-- writing down even though it did not happen: the defence is real but it is
-- incidental, and the next author to reorder those two lines has no way to know.
--
-- ── SO THE EFFECT IS AVAILABILITY, AND IT IS STILL A DEFECT ────────────────
--
-- Once org B's duty is signed, the freeze step resolves the foreign report and
-- returns `forbidden` **every time**. Org B's own statutory duty becomes
-- permanently unpublishable because of a row another tenant wrote, on a screen
-- org B cannot see. A compliance obligation, blocked at a distance.
--
-- The fix is the same shape as `M:0063`–`M:0066`: make the row unrepresentable
-- rather than filtered, and null ONE column on delete (`M:0065`'s lesson — a
-- bare `on delete set null` on a composite key nulls `org_id` too, which is NOT
-- NULL, and the delete fails with 23502 far from here).
--
-- `duties` already carries `UNIQUE (org_id, definition_key)`; the composite FK
-- needs `(id, org_id)`, which is what a target of a composite key must have.

alter table public.duties
  add constraint duties_id_org_uniq unique (id, org_id);

alter table public.reports
  drop constraint if exists reports_duty_id_fkey;

alter table public.reports
  add constraint reports_duty_id_fkey
  foreign key (duty_id, org_id) references public.duties (id, org_id)
  on delete set null (duty_id);

comment on constraint reports_duty_id_fkey on public.reports is
  'Composite so a report can only cite a duty in its OWN organisation — '
  '`publish_duty` selects a duty''s report with no org filter, and a foreign '
  'report made the duty permanently unpublishable. Nulls only `duty_id` on '
  'delete: nulling `org_id` too would break the delete (M:0065).';
