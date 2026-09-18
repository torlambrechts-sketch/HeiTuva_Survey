-- M:0134 — «Rapporter · N · frosset herfra» needs a relation, not a string.
--
-- v8 counts a dashboard's frozen reports by matching TITLES:
--
--     (st.savedReports || DEFAULT_SAVED)
--       .filter(r => r.frozen && r.frozen.from === t).length        v8:8970
--
-- where `t` is the dashboard's title. That is not a relation. Rename the
-- dashboard and its history empties; name two dashboards alike and their
-- histories merge. The cell states a COUNT OF RECORDS, so it needs a record to
-- count.
--
--   reports.dashboard_id
--     WHO WRITES IT: `freezeLayoutReport` (app/(app)/dashboard/actions.ts),
--     which is the only path that turns a dashboard into a report. Every other
--     report — a duty report, a template report — leaves it NULL, which is the
--     true statement that no dashboard produced it.
--     WHAT READS IT: the meta bar's «Rapporter» cell, and the dashboard's own
--     history list.
--     ON DELETE SET NULL, not CASCADE: deleting a dashboard must not delete
--     reports made from it. A frozen report is a record of what was true on a
--     date and it outlives the arrangement that produced it — the same reason
--     `reports.snapshot_id` and `reports.duty_id` are SET NULL. CASCADE here
--     would make «delete this dashboard» quietly destroy published documents.
alter table public.reports
  add column dashboard_id uuid references public.dashboards(id) on delete set null;

create index reports_dashboard_idx on public.reports (dashboard_id)
  where dashboard_id is not null;

comment on column public.reports.dashboard_id is
  'The dashboard this report was frozen from, or NULL when no dashboard made '
  'it. Written by freezeLayoutReport; read by the dashboard meta bar. SET NULL '
  'on delete — a frozen report outlives the arrangement it came from.';
