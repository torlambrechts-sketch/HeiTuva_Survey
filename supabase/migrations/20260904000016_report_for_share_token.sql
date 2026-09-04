-- HeiTuva 0027 — resolve a share token to its report, and nothing else.
--
-- /r/[token] has only the token. The report id is not in the URL by design: a
-- share link that carried it would let a reader who has ONE link probe for
-- other reports by editing the id, and the id would sit in every referrer
-- header and browser history alongside the credential.
--
-- So the lookup is by hash, and the function returns a uuid or nothing. It
-- deliberately does NOT return the report: `compose_report` is the only path to
-- content, and giving this function a second job would create a second path
-- with its own idea of who may read what.
--
-- Expiry is honoured here as well as in compose_report. Not redundancy for its
-- own sake — this is what makes an expired link a 404 rather than a page that
-- renders a refusal, and a 404 tells a probing reader nothing about whether the
-- token was ever valid.
create or replace function public.report_for_share_token(p_token text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.report_id
  from public.report_shares s
  join public.reports r on r.id = s.report_id and r.deleted_at is null
  where s.token_hash = app.hash_token(p_token)
    and (s.expires_at is null or s.expires_at > now())
$$;

revoke all on function public.report_for_share_token(text) from public;
grant execute on function public.report_for_share_token(text) to anon, authenticated;

comment on function public.report_for_share_token(text) is
  'Resolves a share token to its report id, honouring expiry and soft deletion. '
  'Returns an id or nothing — never content. compose_report is the only read '
  'path for the document itself.';
