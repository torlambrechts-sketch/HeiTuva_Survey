-- V2-2 · «Profil og avsender», the half that is not blocked.
--
-- The v2 tab has five cards (V2:2310-2404). Three of them — sender domains with
-- DNS verification state, sender profiles, and the per-template lock rows that
-- name a sender — need an SES/DNS integration that V2-11 owns, and a
-- verification chip with nothing behind it is exactly what CLAUDE.md's
-- never-fabricate rule forbids. So this migration carries the two that stand on
-- their own: LOGO (V2:2313-2325) and FARGE OG TYPOGRAFI (V2:2327-2347).
--
-- ── WHY ACCENTS ARE A REGISTRY AND TYPE PAIRS ARE A CHECK ───────────────────
--
-- These look like the same kind of thing and are not, which is the whole reason
-- the asymmetry is written down here rather than discovered later.
--
-- An ACCENT is data: a hex, a name and a measured contrast ratio. Design adds a
-- sixth and nothing in the application has to change — the swatch renders, the
-- organisation may pick it. So it is a row (CLAUDE.md, data-not-code), with the
-- same shape `use_cases` and `dashboard_presets` already use.
--
-- A TYPE PAIR is not. «Bricolage + DM Sans» works only because Bricolage
-- Grotesque is loaded by the app shell; a row naming a font nobody loaded
-- renders as a silent fallback to the previous face, which is the worst
-- possible failure — it looks like it worked. **A row that cannot work without
-- a matching code change is not data**, so the two pairs are a CHECK, and
-- adding a third is deliberately a migration that lands beside the font import.

-- 1. The accent registry ------------------------------------------------------
create table if not exists public.brand_accents (
  key        text primary key,
  hex        text not null check (hex ~ '^#[0-9A-Fa-f]{6}$'),
  -- The measured contrast between #191510 and this surface, stored as the
  -- design states it («11,3:1»). Stored rather than computed because it is what
  -- the card shows and what a procurement reviewer is entitled to see; a value
  -- computed at render time could not be checked against the design.
  contrast   text not null,
  sort_order int not null default 0
);

alter table public.brand_accents enable row level security;

-- Public by design, and the reason is the same one `use_cases` carries: the row
-- holds no org id, no survey id and no number about anybody. The 5a3 allowlist
-- entry says so, and `tests/db/branding.test.ts` CHECKS the claim rather than
-- repeating it — it asserts the table has no column matching org/survey/count.
drop policy if exists brand_accents_sel on public.brand_accents;
create policy brand_accents_sel on public.brand_accents for select using (true);

grant select on public.brand_accents to anon, authenticated;

comment on table public.brand_accents is
  'V2-2: the five accents the design offers (V2:4898). A registry, so a sixth '
  'is a row. Names come from next-intl by key, not from a column — Q48(b): the '
  'registry holds keys, the message catalogue holds text.';

-- The five, verbatim from V2:4898 including the contrast figures. The names are
-- next-intl keys under `admin.accent*`, so «Varm gul» is translatable and this
-- table stays language-free.
insert into public.brand_accents (key, hex, contrast, sort_order) values
  ('varm_gul',  '#F5C64A', '11,3:1', 1),
  ('rav',       '#E8A33D', '8,4:1',  2),
  ('salvie',    '#A8D5D2', '11,3:1', 3),
  ('fersken',   '#FBD5C4', '13,3:1', 4),
  ('lavendel',  '#EDE9F7', '15,2:1', 5)
on conflict (key) do update
  set hex = excluded.hex, contrast = excluded.contrast, sort_order = excluded.sort_order;

-- 2. The organisation's choices ----------------------------------------------
-- A FOREIGN KEY rather than a CHECK, for the same reason `template_packs.
-- use_case` is one: a CHECK would make adding an accent a migration.
alter table public.organizations
  add column if not exists brand_accent text
    references public.brand_accents(key) on delete set null;

alter table public.organizations
  add column if not exists brand_type text
    check (brand_type in ('playfair', 'bricolage'));

comment on column public.organizations.brand_accent is
  'V2-2 (V2:4898). NULL means the product default (--ac, #F5C64A) — deliberately '
  'distinct from the row whose hex happens to equal it, so "never chose" and '
  '"chose varm gul" stay different facts. The accent is a SURFACE behind dark '
  'text and never a text colour; every row''s contrast is >= 4,5:1 against '
  '#191510, which is why V2:4903 says no free colour picker is offered.';

comment on column public.organizations.brand_type is
  'V2-2 (V2:4904). Two pairs, a CHECK rather than a registry: a third requires '
  'the font to be loaded by the app shell, and a row naming an unloaded font '
  'falls back silently — it looks like it worked. NULL = the product default '
  '(Playfair + DM Sans).';

-- 3. The logo slots -----------------------------------------------------------
-- Three nullable storage paths rather than a `logos` table: there are exactly
-- three slots, each with a different purpose named in the design, and a table
-- would let a fourth appear that no screen renders.
alter table public.organizations
  add column if not exists logo_light text,
  add column if not exists logo_dark  text,
  add column if not exists logo_icon  text;

comment on column public.organizations.logo_light is
  'V2:4909 «Logo, lys bakgrunn» — SVG or PNG, min 240px wide. A path inside the '
  'private `org-logos` bucket, never a URL: reads go through a signed URL '
  '(CLAUDE.md invariant 5).';
comment on column public.organizations.logo_dark is
  'V2:4909 «Logo, mørk bakgrunn» — used in Live and in dark e-mail.';
comment on column public.organizations.logo_icon is
  'V2:4909 «Ikon til QR-plakat» — square, min 512px.';

-- 4. The bucket, with its policies in the same migration ---------------------
-- Invariant 3 applies to storage exactly as to a table: an unpoliced bucket is
-- an unpoliced table (the reasoning `report-exports` carries).
--
-- PRIVATE. A logo is not secret, but a PUBLIC bucket makes every object
-- enumerable by a guessable URL, and the objects here are keyed by org id — so
-- a public bucket would turn the customer list into something you can walk.
-- The cost of private is one signed URL per render, which the report path
-- already pays.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('org-logos', 'org-logos', false, 2097152,
        array['image/svg+xml', 'image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

-- Path shape: <org_id>/<slot>.<ext>, the org id first so the policies scope by
-- prefix without joining anything — the same tenancy root as every other policy.
drop policy if exists orglogo_obj_sel on storage.objects;
create policy orglogo_obj_sel on storage.objects for select
  using (
    bucket_id = 'org-logos'
    and app.is_org_member(((storage.foldername(name))[1])::uuid)
  );

-- WRITES ARE ADMINISTRATOR-ONLY, and that is narrower than `report-exports`
-- deliberately: branding is an organisation-wide setting on the tab that
-- already belongs to administrators (Q57's reasoning for the threshold picker,
-- applied to the same tab). A redaktør who could replace the logo could change
-- what every survey the organisation sends looks like.
drop policy if exists orglogo_obj_ins on storage.objects;
create policy orglogo_obj_ins on storage.objects for insert
  with check (
    bucket_id = 'org-logos'
    and app.has_role(((storage.foldername(name))[1])::uuid,
                     array['administrator']::app.member_role[])
  );

-- Unlike an export, a logo IS replaced in place — the slot is the identity, and
-- versioning three images would be a feature nobody asked for. So this bucket
-- has an update policy where `report-exports` deliberately has none.
drop policy if exists orglogo_obj_upd on storage.objects;
create policy orglogo_obj_upd on storage.objects for update
  using (
    bucket_id = 'org-logos'
    and app.has_role(((storage.foldername(name))[1])::uuid,
                     array['administrator']::app.member_role[])
  );

drop policy if exists orglogo_obj_del on storage.objects;
create policy orglogo_obj_del on storage.objects for delete
  using (
    bucket_id = 'org-logos'
    and app.has_role(((storage.foldername(name))[1])::uuid,
                     array['administrator']::app.member_role[])
  );

-- 5. Branding changes are audited --------------------------------------------
-- The same rule the threshold carries (Q17): a setting that changes what every
-- respondent sees is one somebody has to be accountable for. Written as a
-- trigger rather than in the action, because the action is one caller.
create or replace function app.audit_branding_change()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then return new; end if;

  -- Compare only the branding columns. A guard written as "any UPDATE" would
  -- fire on every unrelated organisation edit and fill the log with noise —
  -- and CLAUDE.md's immutability rule is the same shape: compare the columns
  -- that carry meaning, not the fact that an UPDATE happened.
  if new.brand_accent is distinct from old.brand_accent
     or new.brand_type   is distinct from old.brand_type
     or new.logo_light   is distinct from old.logo_light
     or new.logo_dark    is distinct from old.logo_dark
     or new.logo_icon    is distinct from old.logo_icon then
    insert into public.audit_events (org_id, actor_user_id, action, target, meta)
    values (new.id, v_uid, 'branding.change', new.id::text,
            jsonb_build_object(
              'accent_from', old.brand_accent, 'accent_to', new.brand_accent,
              'type_from',   old.brand_type,   'type_to',   new.brand_type,
              -- Paths, not contents. A storage path names a slot and an org id,
              -- both of which the actor already knows.
              'logos_changed', (new.logo_light is distinct from old.logo_light)
                            or (new.logo_dark  is distinct from old.logo_dark)
                            or (new.logo_icon  is distinct from old.logo_icon)));
  end if;
  return new;
end $$;

drop trigger if exists organizations_audit_branding on public.organizations;
create trigger organizations_audit_branding
  before update on public.organizations
  for each row execute function app.audit_branding_change();
