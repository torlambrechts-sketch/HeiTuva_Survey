-- HeiTuva 0020 — DECISIONS Q14 changes from "suspended" to "deferred", so the
-- flag that suspended it goes away with the code it gated.
--
-- 20260903000001 introduced `admin_mfa` as a switch over enforcement that was
-- still in the tree: OFF meant "not required today", and turning it back on was
-- an UPDATE with no deploy. That is no longer true. The enrollment screen, the
-- login-time challenge and the layout gate are deleted (Q14, docs/DEVIATIONS.md
-- D27), so a row reading `admin_mfa = true` would now assert a control that
-- nothing reads — the worst state for a security flag to be in, because the
-- register says the control is on and no code enforces it.
--
-- Supabase Auth's MFA capability is untouched; it is simply not required at
-- login. DECISIONS Q14 records the re-enable trigger (the first real
-- organisation, or any real respondent data in prod, whichever comes first),
-- and re-enabling then means restoring the enforcement code, not flipping a row.
delete from public.feature_flags where key = 'admin_mfa';

comment on table public.feature_flags is
  'Global (org_id NULL) and per-org feature switches. Keys: sms_channel | '
  'entra_sync | google_sync | hr_sync | ai_insights | ai_translate | '
  'pptx_export | stripe_billing.';
