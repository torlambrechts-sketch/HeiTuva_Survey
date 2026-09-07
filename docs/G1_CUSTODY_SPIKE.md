# G1 — the custody spike

What was asked (`docs/INTEGRATION_ARCHITECTURE.md` G1): decide who may read a
customer's integration credential, and put evidence under the decision rather
than judgement.

The spike changed the answer. The architecture plan recommended **option B** —
Vault plus a bespoke Postgres role, with `service_role` revoked from the
accessor. The evidence says **option C**, envelope encryption in the
integration runtime, **with Vault dropped rather than layered underneath**.
Reasoning below; the decision itself is DECISIONS **Q18**.

All catalog facts were read from `heituva-prod` (`jmhhszsnjfqgclxzhciq`,
`eu-central-1`, Postgres 17.6.1.166) on 2026-09-07. No DDL was run: a spike
does not get to leave objects on production.

---

## 1. Evidence

### Proven — read from the live catalog

| # | Fact | How |
|---|---|---|
| E1 | `supabase_vault` 0.3.1 is installed, schema `vault`. `pgcrypto` 1.3 is installed in `extensions`; `pgsodium` is available but **not** installed. | `list_extensions` |
| E2 | `vault.secrets` and `vault.decrypted_secrets` both carry `service_role=rd`. `anon` and `authenticated` have no grant at all. | `pg_class.relacl` |
| E3 | `vault.create_secret` and `vault.update_secret` both carry `service_role=X`. | `pg_proc.proacl` |
| E4 | `authenticator` — the role PostgREST logs in as — is a member of exactly `anon, authenticated, service_role`. | `pg_auth_members` |
| E5 | No table in the project sets `FORCE ROW LEVEL SECURITY`, so a table's owner and any `SECURITY DEFINER` function owned by it bypass RLS entirely. | grep over `supabase/migrations/` |
| E6 | The **legacy JWT secret is still live**: the `anon` key is present as `type: legacy`, `disabled: false`, alongside a new `sb_publishable_…` key. | `get_publishable_keys` |
| E7 | Production runs three `pg_cron` jobs: `retention-daily`, `reminders-hourly` (`app.enqueue_reminders`) and `schedules-hourly` (`app.run_due_schedules`). Two of the three **enqueue into `mail_outbox`**. | `cron.job` |
| E8 | **Nothing anywhere drains that queue.** `scripts/mail-worker.ts` is reachable only through the `mail:worker` npm script: no `crons` key in `vercel.json`, no GitHub Actions workflow but `ci.yml`, no container definition, no scheduler. | grep over the repository |
| E9 | The gap is latent, not yet biting: `pgmq.q_mail_outbox` and `pgmq.a_mail_outbox` are both empty and `survey_invitations` holds zero rows, so no send has ever been attempted on production. | counts only — those messages carry raw invitation tokens and nothing was selected from them |

### Established from Supabase's own documentation

| # | Fact |
|---|---|
| E10 | The legacy JWT secret is **"No longer recommended. Available for backward compatibility."** Supabase ships a dashboard migration to asymmetric JWT signing keys and states the benefit as, among others, that "the private key or shared secret can't be extracted". |

### Inferred, not executed — flagged as such

| # | Claim | Why it was not proven here |
|---|---|---|
| I1 | A `SECURITY DEFINER` function owned by `postgres` can read `vault.decrypted_secrets` (E2 gives `postgres` `r*`). | Requires creating a function; that is DDL on production. |
| I2 | Reaching a bespoke role through PostgREST requires `grant <role> to authenticator` (E4 shows the current membership set). | Same. |
| I3 | Revoking `service_role` from one function does not disturb PostgREST for the rest. | Same. |

### Untested — and now moot

Whether `supabase_vault` is present in the local stack CI starts, and whether
it survives `supabase db reset`. **This container has neither the Supabase CLI
nor a running Docker daemon**, so no local stack could be started. It stops
mattering under the recommendation below, which does not use Vault; it returns
if Tor overrules and picks A or B.

---

## 2. What the evidence does to each option

### Option A — Vault, read with the service key: **refused**

E2 and E3 say `service_role` can both write and read Vault secrets. The app
holds the service key (G0 established that: `kom-i-gang/actions.ts:45` and
`administrasjon/actions.ts:390` call `createAdminClient()` on the request path).
So under A, the threat we set out to stop — a request-path bug disclosing
another tenant's credential — is not stopped at all. A is the status quo with
extra ceremony.

### Option B — Vault plus a bespoke Postgres role: **sound in principle, both mechanisms are shaky today**

The design is right: grant the accessor to a role the app does not hold and
revoke `service_role`. Reaching that role needs one of two things, and neither
is currently solid.

- **A JWT carrying `role: heituva_integrations`, signed with the project's JWT
  secret.** This works today (E6), and it is exactly the mechanism Supabase
  says is no longer recommended and is steering projects off (E10). Building a
  new security boundary on the deprecated half of an auth system, in the same
  quarter the product is trying to reach its first customer, is a bad trade.
- **A direct Postgres connection as that role.** Cleaner and not deprecated.
  But migration `0009_mail_outbox_api.sql` justified its three RPC wrappers on
  the grounds that "the mail worker had no way to reach the queue except a
  direct Postgres connection — **which the deploy target does not have**." E8
  says there is no deploy target: the worker is an npm script. So that
  constraint is currently un-evidenced rather than false, and cannot be relied
  on either way until the runtime has a home.

### Option C — envelope encryption in the integration runtime: **recommended**

The stored value is AES-256-GCM ciphertext; the data key lives only in the
integration runtime's environment and has never been inside the database. Node
does this with `crypto.createCipheriv`, so it adds no dependency.

It is indifferent to every problem above. It does not care that `service_role`
can read the row, because the row is useless. It does not care where the
runtime runs, or which JWT system Supabase settles on. It needs no new
Postgres role, no `grant … to authenticator`, and no PostgREST plumbing —
which also means it introduces no new way to get any of that wrong.

**And Vault should be dropped, not layered underneath it.** Vault's protection
boundary on Supabase is everything below `supabase_admin` — and `service_role`
sits *inside* that boundary for both read (E2) and write (E3). The one threat
Vault genuinely covers is a database dump leaking; envelope encryption covers
that too, with a key Supabase does not hold. Keeping Vault as well would add a
second key-management surface, a second failure mode and two more grants, in
exchange for protection we would already have. Defence in depth means layers
that fail independently, not layers that fail to the same key.

**The cost, stated plainly:** if the data key is lost, every connected customer
must reconnect through OAuth. That is annoying, visible and recoverable — no
respondent data, no survey and no report depends on it. It is a better failure
than the one A accepts.

---

## 3. What the spike found that was not being looked for

**The send pipeline has producers and no consumer.** Two cron jobs enqueue into
`mail_outbox` every hour on production (E7) and nothing drains it (E8). Today
that is invisible because nothing has been sent (E9). The moment the first real
round goes out, invitations queue and stay queued: no email, no SMS, no error
anyone sees — `survey_invitations.sent_at` simply stays null and
`app.enqueue_reminders` skips the row, because it requires `sent_at is not
null`. A compliance product silently failing to send is precisely the failure
`scripts/mail-worker.ts`'s own header says the queue exists to prevent.

This is not integration work and it is not G1's to fix. It is a launch blocker
that belongs beside the four already in DECISIONS Q5 and Q14, and it is
recorded here because the integration runtime and the mail worker are the same
hosting question asked twice — whichever answer that question gets, both use it.

---

## 4. Recommendation

1. **Q18-a: option C.** Envelope encryption in the integration runtime; Vault
   not used. Written up as a DECISIONS default, overrulable in one line.
2. **Q18-b withdrawn.** No bespoke Postgres role and no JWT for it, so the
   operational question that entry asked does not arise. It returns if and only
   if the runtime later gets a host with a direct Postgres connection, at which
   point B becomes an independent second layer worth adding on its merits.
3. **Q18-d stands open** and still needs `vercel env ls`. It no longer blocks
   G2: under C the answer changes nothing, which is the point of C.
4. **New: the runtime needs a home** (Q19). Decide where the mail worker and the
   integration worker run before G2 ends, because G2's accessor is written
   against whatever that is.

G2 can start on 1. It does not depend on 3 or 4 landing first.
