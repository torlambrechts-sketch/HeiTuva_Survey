-- DECISIONS Q14 (administrators must clear TOTP) becomes a flag rather than a
-- constant.
--
-- Tor suspended the requirement on 2026-09-03 so the first administrator is not
-- locked at /sikkerhet before App Authenticator is switched on in GoTrue. The
-- enforcement code is untouched; only this row decides whether it runs, so
-- turning the requirement back on is `update ... set enabled = true` and no
-- deploy.
--
-- feature_flags is the right home rather than an env var because the column
-- shape already supports what this will eventually need: org_id NULL is the
-- global default, and a per-org row overrides it — "require MFA for our
-- administrators" is a per-tenant policy, not a build-time constant.

insert into public.feature_flags (key, org_id, enabled)
values ('admin_mfa', null, false)
on conflict (key, org_id) do nothing;

comment on table public.feature_flags is
  'Global (org_id NULL) and per-org feature switches. Keys: sms_channel | '
  'entra_sync | google_sync | hr_sync | ai_insights | ai_translate | '
  'pptx_export | stripe_billing | admin_mfa.';
