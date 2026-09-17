-- M:0128 — the `survey-media` bucket, for the Bilde block's upload.
--
-- V7-3c. `survey_blocks.media_key` has existed since M:0127 with a comment
-- saying nothing writes it yet; this migration is the other half of that
-- promise — CLAUDE.md's «ask WHO WRITES THIS COLUMN in the migration that adds
-- it», answered one migration late and answered here rather than left.
--
-- ── WHY THE PATH CARRIES THE SURVEY ID, AGAINST V7-3a's OWN RECOMMENDATION ──
--
-- `docs/v7/02-blocks-measurement.md § 4` measured that the org logo's path is
-- `<org_id>/logo_<slot>.<ext>`, that a signed URL contains its object path, and
-- that an image block would therefore be the FIRST storage URL on a respondent
-- surface — putting an organisation's primary key in front of somebody who was
-- promised anonymity. It proposed an OPAQUE key to avoid that, and that
-- recommendation was accepted.
--
-- **The CSP settles it differently, and better.** `next.config.ts` sets
-- `img-src 'self' data: blob:`. A Supabase signed URL is on the Supabase
-- origin, not `'self'`, so an `<img>` pointed at one is REFUSED BY THE BROWSER
-- — silently, with a correct URL and no picture. Shipping that would have been
-- another «green for something that structurally could not be seen».
--
-- So the image is served through our OWN route instead (measurement § 4's
-- second option, «strongest, and more to build»), and the consequence is that
-- **no storage path reaches any client at all.** The respondent's browser sees
-- `/s/<token>/media/<block_id>`; the editor's sees `/api/block-media/<id>`.
-- The opacity requirement is met at the URL a browser actually holds, which is
-- strictly stronger than meeting it at the storage key — and it frees the
-- storage path to carry the survey id, which is what lets these four policies
-- be a real predicate instead of a bet on a uuid being unguessable.
--
-- ── SVG IS REFUSED, AND THAT IS NOT INHERITED ───────────────────────────────
--
-- `org-logos` permits `image/svg+xml`. An SVG is a document that can carry
-- script, and a logo is chosen by an administrator for a manager-facing screen.
-- This bucket's objects are rendered to RESPONDENTS from content a redaktør
-- typed, so the allowlist is raster only. The route also sets the stored
-- content type explicitly and `X-Content-Type-Options: nosniff` is global.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('survey-media', 'survey-media', false, 2097152,
        array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

-- Path shape: <survey_id>/<random>.<ext>, the survey id first so all four
-- policies scope by prefix without joining anything — the same shape
-- `org-logos` uses, with `can_edit_survey` where that bucket has `has_role`.
--
-- SELECT is the editor's own preview and is the same authority as the write.
-- An editor who cannot see what they uploaded cannot tell they uploaded the
-- wrong picture, so the preview is a requirement rather than decoration — and
-- it reads through the VIEWER'S session, so this policy is the rule and the
-- route handler is only the message. The respondent's read does not come
-- through here at all: there is no session on that path, so the service role
-- signs for it, behind a token check, in one single-purpose function.
drop policy if exists svmedia_obj_sel on storage.objects;
create policy svmedia_obj_sel on storage.objects for select
  using (
    bucket_id = 'survey-media'
    and app.can_edit_survey(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists svmedia_obj_ins on storage.objects;
create policy svmedia_obj_ins on storage.objects for insert
  with check (
    bucket_id = 'survey-media'
    and app.can_edit_survey(((storage.foldername(name))[1])::uuid)
  );

-- Replaced in place, like a logo and unlike an export: the BLOCK is the
-- identity and versioning a picture nobody asked to keep is a feature.
drop policy if exists svmedia_obj_upd on storage.objects;
create policy svmedia_obj_upd on storage.objects for update
  using (
    bucket_id = 'survey-media'
    and app.can_edit_survey(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists svmedia_obj_del on storage.objects;
create policy svmedia_obj_del on storage.objects for delete
  using (
    bucket_id = 'survey-media'
    and app.can_edit_survey(((storage.foldername(name))[1])::uuid)
  );

-- The column comment said «no writer yet». It has one now, and the comment
-- says where, because a stale «nothing writes this» is how the next reader
-- concludes the feature is unbuilt.
comment on column public.survey_blocks.media_key is
  'v7:745 — the object path inside the PRIVATE `survey-media` bucket, written '
  'by `uploadBlockMedia` (app/(app)/undersokelser/[id]/bygg/actions.ts). Never '
  'a URL and never sent to a browser: the respondent reads the picture through '
  '/s/<token>/media/<block_id> and the editor through /api/block-media/<id>, '
  'so no storage path reaches any client (M:0128).';
