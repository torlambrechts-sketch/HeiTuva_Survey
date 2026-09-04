-- HeiTuva 0029 — a new report defaults to the narrower audience.
--
-- reports.share_scope defaulted to 'ledelse' (HR og admin — everything, all
-- groups). The design's Del panel opens on "Teamledere · Ser bare sitt eget
-- team" (HeiTuva.dc.html:3110, `st.shareRole || "leder"`), and that is also the
-- safer default: a report shared before anyone thinks about the audience
-- reaches the narrower one, not the widest.
alter table public.reports alter column share_scope set default 'ledere_eget_team';
