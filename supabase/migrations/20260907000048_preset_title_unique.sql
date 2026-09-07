-- V1-4 · A shared preset may not take a shipped preset's name.
--
-- FOUND BY LOOKING AT THE SCREEN, not by a test. The «Bytt oppsett» row draws
-- the shipped presets and the organisation's own side by side (NEW:1033-1037),
-- and the demo seed happened to name an organisation preset «Arbeidsmiljø» —
-- which is also a shipped one. Two identical chips, one with a delete control
-- and one without, and no way for a reader to tell which is which.
--
-- `dashboard_layouts`' unique index is (org_id, user_id, title) and cannot see
-- `dashboard_presets`, so this is the collision it structurally cannot catch.
-- A cross-table rule is a trigger, not a constraint.
--
-- WHY THE DATABASE AND NOT THE ACTION. The same reason as every other rule on
-- this table (Q36's lesson, migration 0046): an action is one caller, and the
-- table is writable through PostgREST by any authenticated session. And the
-- SEED is one of those callers — this constraint is what stops a demo fixture
-- from reintroducing the confusion it was written to remove.
--
-- SCOPE, deliberately narrow: only ORGANISATION presets (`user_id is null`)
-- are checked. A member's own working row is titled «Mitt oppsett» and never
-- appears in the switch list, so a collision there is invisible and forbidding
-- it would be a rule with no reader.
create or replace function app.preset_title_free()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.user_id is null and exists (
    select 1 from public.dashboard_presets p
     where lower(btrim(p.title)) = lower(btrim(new.title))
  ) then
    -- 23505 so PostgREST reports it as a uniqueness violation and the action's
    -- existing «Det finnes allerede et oppsett med dette navnet» is reached —
    -- one message for one situation, whichever table the clash was with.
    raise exception 'dashboard_layouts: "%" is the name of a shipped preset', new.title
      using errcode = '23505';
  end if;
  return new;
end $$;

revoke all on function app.preset_title_free() from public, anon;

drop trigger if exists dashboard_layouts_title on public.dashboard_layouts;
create trigger dashboard_layouts_title
  before insert or update of title, user_id on public.dashboard_layouts
  for each row execute function app.preset_title_free();
