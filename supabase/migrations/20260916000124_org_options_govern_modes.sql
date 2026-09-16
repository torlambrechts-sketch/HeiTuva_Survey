-- G2 — admin-valg's four toggles, and the half that makes them settings.
--
-- ══ 1. WHAT v6 CHANGED, AND IT IS A WHOLE-PANEL SUBSTITUTION ═══════════════
--
-- v2, v3, v4 and v5 all draw the SAME five rows on «Alternativer»:
-- reminders · weeklyDigest · allowSelfServe · sso · brandMail. v6:8008 replaces
-- every one of them with tuva · quiz · live · paaminn · klarsprak, and even
-- reverses the tuple order (`[label, desc, key]` where the others are
-- `[key, label, desc]`). That is a rewrite, not an edit — D207.
--
-- **And it left the fixture behind.** v6:6561's `options` object is still
-- `{reminders, weeklyDigest, allowSelfServe, sso, brandMail}`, so the panel
-- reads five keys the object does not contain: every row evaluates
-- `undefined !== false`, every switch draws ON, and none of them survives a
-- reload. CLAUDE.md records this as the FIFTH who-writes-this instance and
-- names `tuva`; measured, it is true of ALL FIVE ROWS. The recorded instance
-- was one row of a five-row list, and the list is the whole panel.
--
-- ══ 2. AND OUR OWN PANEL HAD THE MIRROR DEFECT ════════════════════════════
--
-- Measured 2026-09-16 — `grep -rn "select('options" --include=*.ts app/ lib/`
-- plus a `pg_proc` sweep for the key names:
--
--   `organizations.options` is read in THREE places in the entire product. Two
--   are the settings screen reading and writing itself. **Exactly one key,
--   `sso`, changes what the product does** (`lib/auth/session.ts:94`).
--   `reminders`, `weekly_digest`, `allow_self_serve` and `brand_mail` have been
--   stored, audited and shown as ON since `M:0002`, and nothing reads them —
--   not a TypeScript module, not a function in `app` or `public`.
--
-- So «a switch whose state nothing stores is not a setting» has a twin: **a
-- switch whose state nothing READS is not a setting either**, and it is the
-- worse half, because it survives every test that checks the value round-trips.
-- The four are not deleted here — two of them govern features that do not exist
-- at all, and removing a shipped control is a product decision. They are
-- declared unenforced in `lib/org/options.ts` and say so on the screen.
--
-- ══ 3. WHY THE GUARD IS IN THE DATABASE AND NOT ONLY IN THE ACTION ════════
--
-- Tor's test: «a feature that is OFF but still reachable by URL is a switch
-- that describes rather than controls.» `/undersokelser/<id>/live` renders from
-- `surveys.run_mode`, so the honest way to make the route empty is to make the
-- STATE unreachable rather than to add a second gate that has to agree with the
-- first. With the rule here:
--
--   · nothing can put a survey into a disallowed mode — not the server action,
--     not the seed, not psql;
--   · nothing can disallow a mode while a survey is still in it;
--   · therefore OFF implies no survey is in the mode, and every `/live` URL in
--     the organisation already renders its own «this survey is not live» state
--     with no new branch.
--
-- CLAUDE.md: prefer the shape where the wrong thing cannot be EXPRESSED over
-- the shape where it is merely not done.
--
-- ══ 4. THE FOUR NEW KEYS DEFAULT TO TRUE, AND THAT IS NOT A PREFERENCE ════
--
-- The reader is `raw[k] === true`, so an ABSENT key is OFF. Adding four keys
-- without a backfill would therefore turn Tuva, quiz, live and klarspråk off
-- for every existing organisation — a migration that changes behaviour while
-- claiming to add a setting. The column default and the backfill both set them
-- true, so nothing observable changes on the day this applies.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. The column default, and the backfill
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.organizations
  alter column options set default jsonb_build_object(
    'tuva', true, 'quiz', true, 'live', true, 'klarsprak', true,
    'reminders', true, 'weekly_digest', true, 'allow_self_serve', false,
    'sso', false, 'brand_mail', true);

-- `||` puts the NEW keys under the existing object, so an organisation that has
-- already turned something off keeps its choice: only keys that are absent are
-- supplied. Written this way round deliberately — `options || jsonb_build_object(...)`
-- would overwrite every setting anyone has made.
update public.organizations
   set options = jsonb_build_object('tuva', true, 'quiz', true, 'live', true, 'klarsprak', true)
                 || options;

comment on column public.organizations.options is
  'The «Alternativer» switches. THE REGISTRY IS lib/org/options.ts, which carries the one '
  'place the product READS each key — or null with the reason, for the four that have no '
  'reader at all. Absent means OFF (app/(app)/administrasjon/valg/page.tsx), so a new key '
  'needs a default AND a backfill or it silently disables a shipped feature.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. No survey may enter a mode the organisation has not allowed
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function app.guard_run_mode_allowed()
returns trigger
language plpgsql security definer set search_path = public as $fn$
declare
  v_opts jsonb;
begin
  -- `standard` is not a setting and never can be: a survey must be runnable.
  if new.run_mode is null or new.run_mode = 'standard' then
    return new;
  end if;

  select o.options into v_opts from public.organizations o where o.id = new.org_id;
  if coalesce((v_opts ->> new.run_mode)::boolean, false) then
    return new;
  end if;

  raise exception 'run_mode_not_allowed: %', new.run_mode
    using hint = 'Administrasjon → Valg decides which run modes this organisation may use.';
end $fn$;

comment on function app.guard_run_mode_allowed() is
  'G2. Scoped `of run_mode` because that is the column the rule is about — Q137''s lesson, '
  'and an unscoped guard here would also refuse `app.close_rounds_with_survey` and every '
  'other write that touches a survey row. `org_id` is NOT in the scope on purpose: it is '
  'set once at insert and nothing moves a survey between organisations, so adding it would '
  'name a transition that does not exist.';

drop trigger if exists surveys_run_mode_allowed on public.surveys;
create trigger surveys_run_mode_allowed
  before insert or update of run_mode on public.surveys
  for each row execute function app.guard_run_mode_allowed();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. And no mode may be disallowed while a survey is still in it
-- ─────────────────────────────────────────────────────────────────────────────
--
-- The other half of «off means off». Without it, turning live off would leave
-- every existing live survey running — the feature disallowed and its route
-- still live, which is the exact case Tor's rule names.
create or replace function app.guard_mode_still_in_use()
returns trigger
language plpgsql security definer set search_path = public as $fn$
declare
  v_mode text;
  v_n int;
begin
  foreach v_mode in array array['live', 'quiz'] loop
    -- Only a transition from allowed to disallowed is this rule's business. An
    -- organisation whose key was already false is not newly refusing anything.
    if coalesce((old.options ->> v_mode)::boolean, false)
       and not coalesce((new.options ->> v_mode)::boolean, false) then
      select count(*) into v_n from public.surveys s
       where s.org_id = new.id and s.run_mode = v_mode and s.deleted_at is null;
      if v_n > 0 then
        raise exception 'run_mode_in_use: % (%)', v_mode, v_n
          using hint = 'Move those surveys to standard mode first.';
      end if;
    end if;
  end loop;
  return new;
end $fn$;

comment on function app.guard_mode_still_in_use() is
  'G2. Scoped `of options`, the column the rule is about. Fires only on the allowed -> '
  'disallowed EDGE, not on the state, so an organisation that never had the mode on is '
  'unaffected and an erasure that rewrites `options` for another reason passes through.';

drop trigger if exists organizations_mode_in_use on public.organizations;
create trigger organizations_mode_in_use
  before update of options on public.organizations
  for each row execute function app.guard_mode_still_in_use();
