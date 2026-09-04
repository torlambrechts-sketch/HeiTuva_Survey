-- HeiTuva 0017 — the five standard report templates, as data.
--
-- CLAUDE.md's data-not-code rule names report sections as data; the templates
-- that COMBINE those sections are the same kind of thing. The design ships five
-- (HeiTuva.dc.html:2474-2486) and `reports.base_template` already stores which
-- one a report was built from — but there was nowhere to read the list from, so
-- the Rapporter screen would have had to hard-code five titles, five Norwegian
-- descriptions and five section lists in a component. Adding a sixth would then
-- be a deploy instead of a row, and the copy would sit outside next-intl and
-- outside the translation editor.
create table if not exists public.report_templates (
  key        text primary key,
  tag        text not null,          -- Ledelse | Team | Trend | Kvalitativ | Styret
  title      text not null,
  description text not null,
  sections   jsonb not null,         -- ordered [section_type key]
  sort_order int not null default 0
);

alter table public.report_templates enable row level security;
-- A registry, like report_section_types and benchmarks: any signed-in user
-- reads it, only a migration writes it.
drop policy if exists rtpl_sel on public.report_templates;
create policy rtpl_sel on public.report_templates for select
  using ((select auth.role()) = 'authenticated');
grant select on public.report_templates to authenticated;

insert into public.report_templates (key, tag, title, description, sections, sort_order) values
('ledergruppe','Ledelse','Ledergruppe — sammendrag',
 'Én side med hovedfunn, trend og tiltak. Den vanligste rapporten før ledermøtet.',
 '["summary","trend","drivers","actions"]', 1),
('team','Team','Teamrapport',
 'Resultat per gruppe med terskel på fem svar, til bruk i teammøter.',
 '["heatmap","teams","participation","themes"]', 2),
('trend','Trend','Utvikling over året',
 'Alle runder side om side, med retning per spørsmål.',
 '["trend","summary","method"]', 3),
('kvalitativ','Kvalitativ','Frisvar og temaer',
 'Temagruppering med anonymiserte sitater — grunnlag for tiltak.',
 '["themes","quotes","actions"]', 4),
('styresak','Styret','Styresak — arbeidsmiljø',
 'Formell struktur med metode, deltakelse, funn og tiltaksplan.',
 '["method","participation","summary","actions"]', 5)
on conflict (key) do nothing;

-- Every template must reference sections that exist, or "Bruk mal" builds a
-- report with a section the renderer has never heard of.
do $$
declare v_missing text;
begin
  select string_agg(distinct s, ', ') into v_missing
  from public.report_templates t,
       lateral jsonb_array_elements_text(t.sections) s
  where not exists (select 1 from public.report_section_types r where r.key = s);
  if v_missing is not null then
    raise exception 'report_templates reference unknown section types: %', v_missing;
  end if;
end $$;
