-- G3 · Tor's split of the four unread switches (D208, D211).
--
-- ══ reminders — WIRED ═════════════════════════════════════════════════════
--
-- `app.enqueue_reminders` gains the reader the switch never had. An
-- organisation that turns automatic reminders off stops producing them; the
-- per-survey `reminder_after_days` still decides WHEN for everyone else. A
-- master switch and a schedule, not two spellings of one rule.
--
-- ══ weekly_digest and allow_self_serve — REMOVED (Tor's decision) ═════════
--
-- «A switch over nothing is worse than no switch: it promises a capability.»
-- Neither feature exists — there is no digest and no approval flow — so the
-- controls go rather than being wired.
--
-- **WHAT REMOVAL MEANS FOR THE STORED VALUES, stated because it is the part a
-- reader will wonder about:** THE COLUMN KEEPS THEM. A key nothing reads is not
-- migrated away, it is ignored. Three reasons, and the third is the one that
-- decides it:
--
--   1. Deleting a key from every row is a bulk write on production, which
--      CLAUDE.md makes a stop-and-ask. The benefit would be tidiness.
--   2. An ignored key costs nothing: `optionsOf` builds its object from
--      `OPTION_KEYS`, so a key outside the registry is not read, not rendered
--      and not writable — `setOption`'s Zod enum derives from the same list, so
--      `setOption('weekly_digest', true)` now returns `invalid` rather than
--      storing something. The removal is STRUCTURAL rather than cosmetic.
--   3. **The stored value is evidence.** `audit_events` already holds every
--      `option.change` anyone made to these two, and a row saying «somebody
--      turned the weekly digest off in March» is only interpretable while the
--      key it names is still visible in the column. Deleting the key would
--      leave the audit trail pointing at nothing.
--
-- What DOES change is the column DEFAULT: a new organisation is no longer given
-- keys the product does not read. Existing rows keep theirs, inert.
--
-- ══ brand_mail — NOT WIRED, AND THE PREMISE IS WHY (D211) ═════════════════
--
-- Tor's instruction groups it with `reminders` as a feature that exists: «the
-- logo in the invitation template». Measured, there is no such template.
-- `invitationMessage` (lib/mail/copy.ts:73) returns `{ subject, text }` and
-- nothing else; `MailMessage.html` is optional and the ONLY place a message is
-- built — `supabase/functions/mail-worker/index.ts:190` — never sets it. The
-- invitation is plain text, so there is no HTML for a logo to sit in.
--
-- The organisation's logos DO exist (`logo_light`, `logo_dark`, `logo_icon`,
-- Q58/V2-2). The gap is the mail body, not the asset. So «wire it» is not a
-- wiring: it is «build an HTML invitation», which is a new respondent-facing
-- surface and Tor's decision rather than mine. The switch keeps its notice,
-- corrected to say what is actually missing.

CREATE OR REPLACE FUNCTION app.enqueue_reminders()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'app', 'pgmq', 'extensions', 'pg_temp'
AS $function$
declare
  v_inv record;
  v_raw text;
  v_count int := 0;
  v_grace interval := interval '72 hours';
begin
  for v_inv in
    select i.id, i.email, i.phone, i.channel, i.name, i.lang, i.round_id, i.token_hash,
           r.survey_id, s.org_id, s.title, sc.reminder_after_days
      from (select * from public.survey_invitations where not is_test) i
      join public.survey_rounds r on r.id = i.round_id
      join public.surveys s on s.id = r.survey_id
      join public.organizations o on o.id = s.org_id
      left join public.schedules sc on sc.survey_id = r.survey_id
     where r.status = 'open'
       and s.status <> 'lukket'
       and i.responded_at is null
       and i.bounced_at is null
       and i.sent_at is not null
       and coalesce(sc.reminder_after_days, 0) > 0
       and i.sent_at < now() - make_interval(days => sc.reminder_after_days)
       and (o.options ->> 'reminders')::boolean is true
       and coalesce(array_length(i.reminded_at, 1), 0) = 0
       -- G3 · Tor's split. THE READER `options.reminders` NEVER HAD.
       -- The switch has been stored, audited and drawn as ON since `M:0002`
       -- with nothing honouring it (D208). This is the honouring: an
       -- organisation that turns automatic reminders off stops producing them,
       -- and the per-survey `reminder_after_days` above still decides WHEN for
       -- everyone else — the two are a master switch and a schedule, not two
       -- spellings of one rule.
       --
       -- `= true` and not `coalesce(..., true)`: `optionsOf` reads an absent key
       -- as OFF and there is exactly one reading of this column in the product.
       -- Absence is unreachable anyway — `M:0124` backfilled every row and
       -- `M:0125`'s merge means no write can drop a key — and
       -- `tests/db/org-options.test.ts` asserts both, so the consistent reading
       -- costs nothing and a second convention would cost the next reader.
       -- M:0108. THE TWO CLAUSES THIS SWEEP NEVER HAD. A reminder is a second
       -- piece of mail to the same person, so every rule about who may be
       -- reached applies to it exactly as it applies to the first — and this
       -- function inserts no row, so neither trigger on survey_invitations
       -- could ever have seen it. GDPR art. 21 first:
       and not (i.email is not null and app.is_suppressed(s.org_id, i.email))
       -- and the member who has left:
       and not exists (
         select 1 from public.org_members om
          where i.email is not null
            and om.org_id = s.org_id
            and lower(om.email) = lower(trim(i.email))
            and app.member_blocks_invitation(om.status))
  loop
    v_raw := encode(extensions.gen_random_bytes(32), 'hex');
    update public.survey_invitations
       set previous_token_hash = v_inv.token_hash,
           previous_token_expires_at = now() + v_grace,
           token_hash = app.hash_token(v_raw),
           reminded_at = coalesce(reminded_at, '{}') || now()
     where id = v_inv.id;

    perform pgmq.send('mail_outbox', jsonb_build_object(
      'kind', 'reminder',
      'channel', v_inv.channel,
      'round_id', v_inv.round_id, 'survey_id', v_inv.survey_id, 'org_id', v_inv.org_id,
      'email', v_inv.email, 'phone', case when v_inv.channel = 'sms' then v_inv.phone end,
      'name', v_inv.name, 'lang', v_inv.lang,
      'token', v_raw, 'survey_title', v_inv.title));
    v_count := v_count + 1;
  end loop;
  return v_count;
end $function$;

comment on function app.enqueue_reminders() is
  'G3: reads `organizations.options->>''reminders''`, the reader that switch never had (D208). An organisation with it off produces no reminders; `schedules.reminder_after_days` still decides WHEN for the rest.';

-- The default stops supplying the two removed keys. Existing rows keep theirs,
-- inert: outside `OPTION_KEYS` nothing reads them and `setOption` refuses them.
alter table public.organizations
  alter column options set default jsonb_build_object(
    'tuva', true, 'quiz', true, 'live', true, 'klarsprak', true,
    'reminders', true, 'sso', false, 'brand_mail', true);
