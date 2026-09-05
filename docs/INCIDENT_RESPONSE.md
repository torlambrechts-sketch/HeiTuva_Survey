# Incident response

What to do when something has gone wrong with HeiTuva that touches customer or
respondent data, and who does it. Written for the person on the phone at 02:00,
so it is short and the order matters.

HeiTuva is a **databehandler** for every organisation that uses it (the
organisation is the **behandlingsansvarlig**). That one fact sets the clock and
the audience for everything below: GDPR Art. 33(2) says a processor notifies the
controller *without undue delay* once it becomes aware of a breach; Art. 33(1)
gives the controller 72 hours from *their* awareness to notify Datatilsynet.
Our promise in every DPA is therefore: **the customer hears from us first, and
fast, with what we know.** We do not notify Datatilsynet on a customer's behalf
unless the DPA says so.

## 1. Severity

| Level | Meaning | Examples | Clock |
|---|---|---|---|
| **S1 — breach** | Personal data was, or may have been, read, altered or lost by someone not entitled to it | A respondent link resolves to the wrong survey; `responses`/`answers` readable without the k-gate; a leaked service-role key; a lost or exposed export; a wrong-recipient send that carried a personal link | Customer notified **within 24 hours** of awareness, target 4 hours. Their 72 hours to Datatilsynet run from when *they* know. |
| **S2 — exposure risk** | A control that protects data failed, no evidence data was reached | RLS policy found permissive in review; an advisor ERROR; a dependency advisory reachable from our code; a token found in a log | Fix or contain within 24 hours; customer told if their data was in scope |
| **S3 — availability** | The product is down or a pipeline is stuck, no data at risk | Queue not draining; cron stopped; Vercel outage | Status update to affected customers within 4 hours if user-visible |
| **S4 — defect** | Wrong behaviour without data impact | A wrong number on a screen, a broken export | Normal fix cycle |

If in doubt between two levels, take the higher one. Downgrading later is
cheap; a late notification is not.

## 2. First hour (S1/S2)

1. **Stop the bleeding, do not investigate yet.** In order of blast radius:
   - Leaked credential → rotate it in the Supabase dashboard (service role key,
     DB password) and in Vercel; redeploy. A rotated key invalidates every
     copy at once.
   - A route or RPC serving data it should not → disable it by revoking EXECUTE
     from `anon`/`authenticated` (`revoke execute on function ... from anon,
     authenticated;`) or by setting the affected feature flag off. Prefer the
     revoke: a flag hides a button, a revoke closes the door.
   - Wrong-recipient send → `close_round` on the round (kills both token hashes
     — see migration 0012) and `update share_links set active = false`.
2. **Preserve evidence before anything is cleaned.** `audit_events` is
   append-only and cannot be edited; export the relevant window anyway
   (`select * from audit_events where created_at > now() - interval '48 hours'`)
   along with Supabase auth logs and Vercel function logs for the same window,
   to a place outside the affected project.
3. **Open the incident record**: time of awareness (this is the timestamp the
   clock runs from), who noticed, what is known, what is contained. One
   document, appended to, never rewritten.
4. **Decide who is affected.** Which organisations, which surveys, which
   respondents. Respondent data is anonymous by construction for anonymous
   surveys (no `invitation_id`, no IP, hour-truncated time): say so explicitly
   in the record when it applies, because it changes what the customer must
   tell Datatilsynet and whether Art. 34 (notifying data subjects) applies.

## 3. Notifying the customer (S1)

Send to the organisation's registered contact (`organizations.contact_email`)
and its DPO if one is named (`organizations.dpo`). Plain language, in Norwegian
unless the org's default language is English. Include, per Art. 33(3):

- what happened and when we became aware
- the categories and approximate number of people and records concerned
- the likely consequences
- what we have done and are doing
- a named person and a phone number

Send it even if the picture is incomplete — Art. 33(4) allows information to be
provided in phases. "We know X, we do not yet know Y, next update by Z" is a
valid first notification; silence is not.

## 4. After containment

- Root cause, written down, with the file and line or the setting.
- The fix, shipped through a migration or a PR like any other change — not a
  Studio edit on prod. If it was a policy, the fix comes with the invariant test
  that would have caught it (tests/invariants).
- Whether the same class of problem exists elsewhere (Gate 5a3 enumerates every
  table and function: run it).
- Close the incident record with the timeline and the notifications sent.

## 5. Who

| Role | Person |
|---|---|
| Incident lead | Tor Lambrechts |
| Technical response | Tor Lambrechts |
| Customer communication | Tor Lambrechts |
| Datatilsynet contact (only if a DPA delegates it) | — |

Until there is a second person, the lead is also the backup; the DPA must not
promise a response time one person cannot keep while asleep. Revisit before the
first customer with respondents in more than one time zone.

## 6. Contacts and places

- Supabase project `jmhhszsnjfqgclxzhciq`, eu-central-1 — dashboard for key
  rotation, auth logs, PITR restore.
- Vercel project — env vars, deployment logs, instant rollback.
- Datatilsynet melding om brudd: https://www.datatilsynet.no/ (the customer's
  path, not ours, unless delegated).
- This file is the runbook; `docs/OPERATIONS.md` says how the environments are
  wired; `DECISIONS.md` Q14 lists the controls that are deliberately not yet on.
