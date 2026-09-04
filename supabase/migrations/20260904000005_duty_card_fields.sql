-- HeiTuva 0016 — the two duty settings the card can set but the table cannot hold.
--
-- The design's duty settings panel (HeiTuva.dc.html:1052-1090) offers three
-- controls. `Rytme` maps to `duties.interval_months`, which exists. The other
-- two had nowhere to live:
--
--   `Varsel før`  — 2 / 4 / 8 weeks before the deadline. Without it the
--                   "Krever handling" list on Oversikt has no idea when a duty
--                   becomes urgent, so the chip could only ever appear on the
--                   day it is already late.
--   `Publiser rapporten offentlig` — Åpenhetsloven § 5 requires publication;
--                   `duty_definitions.publish` is the REGISTRY default for that
--                   law, not the organisation's own choice about this duty.
--                   Reading the registry as the org's setting would show the
--                   toggle on for everyone and change nothing when clicked.
alter table public.duties
  add column if not exists reminder_weeks int not null default 4
    check (reminder_weeks in (2, 4, 8)),
  add column if not exists publish boolean;

comment on column public.duties.publish is
  'The organisation''s own choice for THIS duty. NULL means "follow the '
  'registry default in duty_definitions.publish" — so a duty created before '
  'anyone touched the toggle keeps the law''s default rather than silently '
  'becoming false.';

comment on column public.duties.reminder_weeks is
  'How long before next_due_at the duty starts counting as needing action. '
  'Feeds the Oversikt deadline chips.';
