-- HeiTuva 0021 — the UI copy for the screens Q14 deleted.
--
-- `ui_messages` is an OVERLAY on the bundled /messages/*.json (lib/i18n/
-- messages.ts), and scripts/seed-i18n.ts upserts rather than replaces: removing
-- a key from the JSON therefore does not remove it from a database that has
-- been seeded before. A fresh `supabase db reset` looks clean because it starts
-- from nothing; prod does not.
--
-- Left alone, prod would keep overlaying `mfa.*` and `auth.mfa*` back onto a
-- message set whose code is gone — 32 rows of Norwegian and English copy
-- telling an administrator that two-factor is required, for a screen that no
-- longer exists. Dead copy is how a deferral gets rediscovered as a bug.
delete from public.ui_messages
 where namespace = 'mfa'
    or (namespace = 'auth' and key in
        ('mfaTitle', 'mfaSub', 'mfaCode', 'mfaVerify', 'mfaRequired'));
