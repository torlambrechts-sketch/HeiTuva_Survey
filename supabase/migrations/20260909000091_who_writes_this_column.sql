-- S3 item 2, the rest of the pass — «WHO WRITES THIS COLUMN?», answered in
-- writing, beside the column, for every one the audit found without a writer.
--
-- CLAUDE.md's standing question has two answers and this migration gives the
-- second one:
--
--   «a server action»  -> the phase adds the action and a test asserts it
--                         exists. That is `org_members.group_id`, done in
--                         M:0090 and tests/db/member-group.test.ts.
--   «nothing yet»      -> SAY SO IN THE COLUMN COMMENT AND LOG IT.
--
-- Seven columns get the second answer, and the reason each gets it is that the
-- CONTROL DOES NOT EXIST IN ANY OF THE THREE HANDOFF BUNDLES. That was measured
-- rather than assumed, screen by screen. CLAUDE.md forbids inventing features,
-- and a writer for a control nobody drew is an invented feature — the one
-- exception being `group_id`, where the absence made a SHIPPED feature (every
-- group count, the Send headcount, every per-group aggregate) permanently
-- empty rather than merely unreachable.
--
-- Audit finding `A7a-11` was that fifteen of sixteen no-writer columns carried
-- no comment at all — «the specific thing CLAUDE.md's standing question asks
-- for». After this migration the answer is written down for all of them, so the
-- next reader meets a decision instead of a gap. Logged in docs/DEVIATIONS.md
-- as D126.

comment on column public.duties.next_due_at is
  'The statutory deadline Oversikt reads for «Krever handling». WHO WRITES IT: '
  'NOTHING YET (audit A7a-2). No bundle draws a deadline control on a duty; the '
  'duty settings panel the v2 bundle does draw carries owner and rhythm, not a '
  'date. Until a writer exists this is NULL on every real organisation and '
  '«Krever handling» is therefore permanently empty — the chip is honest about '
  'having no deadline, not wrong. Logged as D126.';

comment on column public.groups.lead_member_id is
  'The person answerable for a group, rendered by the Grupper card as «ansvarlig '
  '{lead}». WHO WRITES IT: NOTHING — not even scripts/seed-demo.ts (audit '
  'A7b-4), which makes it the only column in this family with no writer at all. '
  'All three bundles render the lead as text and none draws a control for it. '
  'The card falls back to «Ingen ansvarlig», which is the true state rather than '
  'a placeholder. Logged as D126.';

comment on column public.report_shares.expires_at is
  'When a share link stops working. Read by report_for_share_token and by '
  'compose_report, both of which treat NULL as «never expires». WHO WRITES IT: '
  'NOTHING YET (audit A7a-3 / B7a-10 / B5-2), so every report share link is '
  'permanent and there is no revocation anywhere in the product. That is the '
  'sharpest consequence in this family and it is a gap in the DESIGN, not in '
  'the implementation: no bundle draws an expiry field or a revoke control on '
  'the share dialog. Deleting the report_shares row is the only revocation that '
  'exists, and it is not reachable from any screen. Logged as D126.';

comment on column public.survey_invitations.bounced_at is
  'When the last send to this address came back. Read by the member-status '
  'derivation (Q61) to show «Adressen svarer ikke». WHO WRITES IT: NOTHING YET '
  '— it needs a bounce webhook from the mail provider, and there is no endpoint '
  'for one. The status therefore never fires on a real organisation. It is not '
  'a screen that is missing: it is the provider callback. Logged as D126.';

comment on column public.live_sessions.created_by is
  'Who opened the live session. WHO WRITES IT: NOTHING YET (audit A7a-5) — the '
  'fifth instance of the standing question, and the one added AFTER the audit '
  'that fixed the previous four, which is why it is worth naming here. Nothing '
  'reads it either, so it is currently a column that records nothing about '
  'nobody. Logged as D126.';

comment on column public.live_sessions.step is
  'Which question the room is on. Read and rendered by the Live screen. WHO '
  'WRITES IT: only scripts/seed-demo.ts (audit A7a-13) — the presenter controls '
  'that would advance it are among the Live surfaces the v2 bundle marks as not '
  'built («Fullskjermvisning er ikke bygget ennå»), so a real session opens at '
  'the seeded step and stays there. Logged as D126.';

comment on column public.tasks.due_at is
  'The deadline the Oppgaver list renders as «frist {when}» and sorts «Nær '
  'frist» by. WHO WRITES IT: only scripts/seed-demo.ts (audit A7a-13). The '
  'Oppgaver screen has no date control in any bundle, so a task created by a '
  'real administrator has no deadline and renders «ingen frist» — which is the '
  'true state. This is the one in the family closest to being worth a writer, '
  'because the list already sorts and filters by it. Logged as D126.';

-- ── The two that already had a comment, and still did not answer it ────────
--
-- Audit `A7a-7` names the timezone one exactly: the comment «reads as though it
-- were settable». Both are re-stated with the same clause appended, so the
-- assertion in tests/db/no-writer-columns.test.ts can be uniform: every column
-- in this family says WHO WRITES IT, in those words. Original text kept
-- verbatim — it was right about what the column MEANS, and only silent about
-- who fills it.

comment on column public.organizations.timezone is
  'Q50: the clock a scheduled send runs on. An IANA zone name, never an offset — '
  'an offset is right for half the year, which is the intermittent behaviour this '
  'column exists to remove. Defaults to Europe/Oslo: Oslo, Stockholm and '
  'Copenhagen share an offset all year, so one column is exact for most Nordic '
  'customers and at most an hour out for a Finnish office, against the two-hour '
  'seasonally-varying error it replaces. WHO WRITES IT: NOTHING YET (audit '
  'A7a-7) — all three next_run_at sites READ it and app.timezone_known validates '
  'it, but no screen sets it, so every organisation runs on the default. Q50''s '
  'own remainder walk is where this was found. Logged as D126.';

comment on column public.surveys.run_mode is
  'V2-9. `live` makes the «Kjør live» button appear on the survey context bar. '
  'Only a survey that could run live may carry it — app.guard_run_mode_anonymous '
  'refuses `live` on a named survey, for the same reason live_sessions does: a '
  'token minted to a device of unknown identity cannot produce a named response. '
  'WHO WRITES IT: NOTHING YET — the Kjøremodus card in the builder renders the '
  'three modes and the bundle marks Quiz «ikke bygget ennå», so a real editor '
  'cannot move a survey off `standard`. Live and the whole of V2-10''s quiz are '
  'therefore reachable only from psql. Logged as D126.';
