-- HeiTuva 0001 — foundation: extensions, private schema, enums, helpers
create extension if not exists pgcrypto;

create schema if not exists app;

-- Enums --------------------------------------------------------------
create type app.member_role as enum ('administrator','redaktor','leser');
create type app.survey_status as enum ('utkast','aktiv','lukket');
create type app.anonymity_mode as enum ('anonymous','named','optional');
create type app.question_type as enum
  ('scale','likert','smiley','enps','slider','choice','dropdown','image','yesno','ranking','matrix','text','field');
create type app.comment_mode as enum ('arv','pa','av');
create type app.channel as enum ('email','link','qr','sms');
create type app.import_source as enum ('csv','excel','entra','google','hr','paste');
create type app.report_kind as enum ('lov','egen');
create type app.report_status as enum ('utkast','klar','publisert');
create type app.share_scope as enum ('ledelse','ledere_eget_team','alle_ansatte');
create type app.dsr_type as enum ('innsyn','retting','sletting','portabilitet');
create type app.dsr_status as enum ('mottatt','under_behandling','fullfort','avvist');
create type app.cadence as enum ('once','weekly','biweekly','monthly','quarterly','biannual','annual');

-- Constants ----------------------------------------------------------
-- k-anonymity threshold. Referenced by all aggregate RPCs. Not org-configurable (DECISIONS Q3).
create or replace function app.k_threshold() returns int
language sql immutable as $$ select 5 $$;

-- Token hashing (invitations, share links, report shares)
create or replace function app.hash_token(raw text) returns text
language sql immutable as $$ select encode(digest(raw, 'sha256'), 'hex') $$;

-- updated_at trigger
create or replace function app.touch_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
