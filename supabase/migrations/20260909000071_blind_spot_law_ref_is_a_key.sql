-- V2-5 fix, inside the same build: `tasks.law_ref` is a FOREIGN KEY to
-- `duty_definitions(key)`, not the law's display text.
--
-- `M:0070` wrote `duty_definitions.law` into it — «Arbeidsmiljøloven § 4-3 ·
-- internkontroll» — and the insert failed on `tasks_law_ref_fkey`. The
-- constraint was right and the generator was wrong, which is the good direction:
-- **Q70's data-not-code rule is enforced by the schema rather than by review**,
-- and writing Norwegian into the column is exactly what it refuses. The label is
-- resolved from the registry at render time (V2-4's Oppgaver card already does
-- this), so a fifth statutory duty is a row and not a translation task.
create or replace function app.generate_blind_spot_tasks(p_survey uuid)
returns int
language plpgsql security definer set search_path to 'public'
as $fn$
declare
  v_org uuid; v_k int; v_kind text; v_anon text;
  v_round uuid; v_duty text; v_small int; v_made int := 0;
begin
  select s.org_id, s.respondent_kind, s.anonymity::text
    into v_org, v_kind, v_anon
    from public.surveys s where s.id = p_survey and s.deleted_at is null;
  if v_org is null then
    return 0;
  end if;
  v_k := app.k_for(p_survey);

  select r.id into v_round from public.survey_rounds r
   where r.survey_id = p_survey order by r.round_no desc limit 1;
  if v_round is null then
    return 0;
  end if;

  select count(*) into v_small from (
    select g.id, count(m.id) as n
      from public.groups g
      left join public.org_members m on m.group_id = g.id and m.status <> 'inactive'
     where g.org_id = v_org
     group by g.id
  ) sizes
  where app.below_threshold(sizes.n::int, v_k, v_kind, v_anon);

  if v_small = 0 then
    return 0;
  end if;

  select d.key into v_duty from public.duty_definitions d
   where d.pack_key = (select template_pack_key from public.surveys where id = p_survey);
  if v_duty is null then
    v_duty := 'arbeidsmiljo';
  end if;

  insert into public.tasks (org_id, title, kind, law_ref, source_kind, source_ref, source_round_id)
  values (v_org,
          'Denne undersøkelsen har grupper som ikke får egne resultater. '
          || 'Plikten til å kartlegge og følge opp gjelder likevel.',
          'undersokelsesplikt', v_duty, 'survey', p_survey, v_round)
  on conflict do nothing;

  get diagnostics v_made = row_count;
  return v_made;
end $fn$;
