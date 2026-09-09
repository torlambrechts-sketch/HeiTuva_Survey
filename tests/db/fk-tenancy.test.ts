import { execFileSync } from 'node:child_process'
import { afterAll, describe, expect, it } from 'vitest'

/**
 * V2-5 ITEM 0b — the FK tenancy class, closed where it bites and MEASURED
 * everywhere else.
 *
 * ── THE CLASS ───────────────────────────────────────────────────────────────
 *
 * A single-column foreign key constrains EXISTENCE, not TENANCY. RLS on the
 * SOURCE table checks the source row's own `org_id` and never what its
 * reference points at, so `org A row → org B row` is representable and no
 * policy refuses it. V2-4 found it on `tasks.source_ref` (the plan asserted the
 * FK refused it; it did not), and Tor asked whether the assumption had been made
 * anywhere else.
 *
 * It had. Thirteen candidates after `M:0063`/`M:0064`/`M:0066`, and **eleven
 * accepted the cross-tenant write** when probed as a real administrator through
 * the RLS path. The per-instance table is in `docs/v2/reports/V2-4.md`'s
 * annotation.
 *
 * ── WHY THIS FILE ASSERTS THE CATALOGUE AND NOT THIRTEEN WRITES ─────────────
 *
 * A list of thirteen probes is a list of symptoms and it goes stale the first
 * time somebody adds a fourteenth column — V1-6's first rule, and the reason
 * V2-3b's suppression test enumerates `pg_proc` instead of naming three
 * functions. So the guard below is **catalogue-derived**: it re-runs the
 * enumeration and fails when a single-column FK between two org-scoped tables
 * is not on the recorded list. A new one arrives failing, which is the only
 * version worth having.
 */
const DB_URL = process.env.LOCAL_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
function psql(query: string): string[][] {
  const out = execFileSync('psql', [DB_URL, '-tAF\t', '-c', query], { encoding: 'utf8' })
  return out.split('\n').filter(Boolean).map((r) => r.split('\t'))
}
function one(query: string): string {
  return psql(query)[0]?.[0] ?? ''
}

/** The enumeration itself — the property, not a list of names. */
const CLASS_QUERY = `
  with fk as (
    select c.conname,
           c.conrelid::regclass::text as src,
           c.confrelid::regclass::text as tgt,
           (select a.attname from pg_attribute a
             where a.attrelid = c.conrelid and a.attnum = c.conkey[1]) as col,
           array_length(c.conkey, 1) as ncols
    from pg_constraint c join pg_namespace n on n.oid = c.connamespace
    where c.contype = 'f' and n.nspname = 'public'
  )
  select replace(src,'public.','') || '.' || col
  from fk
  where ncols = 1
    and exists (select 1 from information_schema.columns x where x.table_schema='public'
                 and x.table_name = replace(tgt,'public.','') and x.column_name='org_id')
    and exists (select 1 from information_schema.columns y where y.table_schema='public'
                 and y.table_name = replace(src,'public.','') and y.column_name='org_id')
  order by 1`

/**
 * Every remaining single-column instance, WITH THE REASON IT IS STILL ONE.
 * D110's 2026-09-09 addition applies here as much as to an allowlist: **state
 * the SCOPE of the reason, not only its content.** So each says what the column
 * does, what a foreign value would do, and whether anything reads it.
 */
const KNOWN: Record<string, string> = {
  // Attribution: «who made this». A foreign value renders as a blank name,
  // because `org_members` RLS refuses the row. Nothing reads it for a decision.
  'surveys.created_by': 'attribution; RLS refuses the foreign member, so the name renders empty',
  'reports.created_by': 'attribution; same',
  'import_jobs.created_by': 'attribution; same',
  'question_bank.author_member_id': 'attribution; same',
  'template_packs.author_member_id': 'attribution; same',
  'dsr_requests.handled_by': 'attribution on a GDPR handling record; same, and worth fixing sooner for that reason',
  'groups.lead_member_id': 'attribution; same',
  // Membership shape rather than attribution.
  'org_members.group_id':
    'a member pointing at a foreign group reads as UNGROUPED — `groups` RLS refuses the row, so no name and no aggregate follows it',
  // Read by something, and defended at the point of reading.
  'reports.snapshot_id':
    'INERT BY A DELIBERATE GUARD: `compose_report` selects `where sn.id = v_rep.snapshot_id AND sn.org_id = v_rep.org_id AND sn.survey_id = v_survey`, so a foreign pointer yields no snapshot and the live path runs instead',
  'import_jobs.survey_id':
    'NO CONSUMER: no function and no app code reads it; the importer does not write invitations from it',
  // Not reachable at all, and structurally so.
  'result_snapshots.survey_id':
    'NOT REACHABLE: `result_snapshots` has no INSERT or UPDATE policy, and its only writer derives `org_id` from the survey it was given',
  // Probed and INCONCLUSIVE in V2-4; resolved by measurement below, and the
  // answer was NOT the one I first wrote down.
  'notifications.member_id':
    'NOT REACHABLE: the UPDATE policy is `USING (member_id = app.member_id(org_id))` with NO with_check, and Postgres then applies USING as the check too — so the new value must still be the caller\'s own member. Proven by attempting the write, not by reading the policy',
}

// Unique per run: the previous run's rows survive a failed cleanup, and a
// colliding email is then indistinguishable from the defect under test.
const tag = `fk${process.pid}`

afterAll(() => {
  psql(`delete from public.organizations where name like 'fk-tenancy-%'`)
  psql(`delete from auth.users where email like '%@${tag}.test'`)
})

describe('(V2-5 item 0b) the single-column FK tenancy class', () => {
  it('the enumeration matches the recorded list — a fourteenth arrives FAILING', () => {
    const found = psql(CLASS_QUERY).map((r) => r[0]!)
    const unrecorded = found.filter((f) => !(f in KNOWN))
    expect(
      unrecorded,
      'a new single-column FK between two org-scoped tables. Either make the key composite ' +
        '(source_col, org_id) -> target(id, org_id), or add it to KNOWN with a reason that ' +
        'says what a foreign value would DO — not merely that it is allowed.',
    ).toEqual([])
  })

  it('and the list has no dead entries — a name that no longer enumerates suppresses nothing', () => {
    // The same rule as 5a3's dead-allowlist check and `threshold-copy`'s. An
    // entry for a key that is no longer in the class reads as coverage and is a
    // permanent no-op.
    const found = new Set(psql(CLASS_QUERY).map((r) => r[0]!))
    const dead = Object.keys(KNOWN).filter((k) => !found.has(k))
    expect(dead, 'these are recorded as single-column and are not — remove them').toEqual([])
  })

  it('`reports.duty_id` is COMPOSITE, and the availability defect it caused is closed', () => {
    // The one instance with a behavioural effect. `publish_duty` takes authority
    // from the DUTY and then selects its report with NO org filter:
    //
    //   select r.id, r.title into v_report, v_title
    //     from public.reports r where r.duty_id = p_duty ...
    //
    // so a foreign report becomes «the most recent report for this duty».
    // Measured in V2-4: it did NOT return `no_report` — it selected the foreign
    // row — and then stopped, because `snapshot_report` checks
    // `app.is_org_member` BEFORE its `no_survey` return. Nothing crossed. What
    // was real is AVAILABILITY: the organisation's own duty becomes
    // unpublishable because of a row another tenant wrote.
    const def = one(`select pg_get_constraintdef(oid) from pg_constraint
                      where conrelid = 'public.reports'::regclass
                        and conname = 'reports_duty_id_fkey'`)
    expect(def, 'composite, so a cross-tenant duty reference is unrepresentable').toMatch(
      /FOREIGN KEY \(duty_id, org_id\) REFERENCES duties\(id, org_id\)/,
    )
    expect(def, 'and it nulls ONE column — the M:0065 lesson').toMatch(/ON DELETE SET NULL \(duty_id\)/)
  })

  it('a report cannot be pointed at another organisation’s duty', () => {
    const orgA = one(`insert into public.organizations (name) values ('fk-tenancy-a-${tag}') returning id`)
    const orgB = one(`insert into public.organizations (name) values ('fk-tenancy-b-${tag}') returning id`)
    const dutyB = one(`insert into public.duties (org_id, definition_key, interval_months)
                       select '${orgB}', d.key, 12 from public.duty_definitions d limit 1
                       returning id`)
    const repA = one(`insert into public.reports (org_id, title, status)
                      values ('${orgA}', 'Rapport A', 'utkast') returning id`)

    // Service role: RLS cannot be what refuses this, or the test proves the
    // wrong control. Standing question 1 — what ELSE could refuse this.
    const out = psql(
      `do $$ begin update public.reports set duty_id = '${dutyB}' where id = '${repA}';
         exception when others then raise notice 'REFUSED %', sqlstate; end $$`,
    )
    void out
    expect(
      one(`select coalesce(duty_id::text,'null') from public.reports where id = '${repA}'`),
      'the write did not land',
    ).toBe('null')
  })

  it('`notifications.member_id` — INCONCLUSIVE in V2-4, resolved here by a real fixture', () => {
    // V2-4's probe reported «no rows matched under RLS», which is 5a3's
    // PROTECTED-BUT-UNPROVEN and NOT a refusal. Recording it as safe would have
    // been the exact mistake this project keeps finding. So: build the row.
    //
    // AND THE ANSWER WAS NOT THE ONE I FIRST WROTE. I asserted «no client UPDATE
    // policy exists»; there is one — `notif_upd`. What makes the instance
    // unreachable is subtler and better: the policy has a USING clause and NO
    // `with_check`, and PostgreSQL then applies USING as the check as well, so
    // after the update `member_id = app.member_id(org_id)` must STILL hold. A
    // foreign member fails it. Asserted by attempting the write, because a
    // policy read is what produced the wrong answer the first time.
    const org = one(`insert into public.organizations (name) values ('fk-tenancy-n-${tag}') returning id`)
    const other = one(`insert into public.organizations (name) values ('fk-tenancy-n2-${tag}') returning id`)
    const mine = one(`insert into public.org_members (org_id, email, name, role, status)
                      values ('${org}', 'n@${tag}.test', 'N', 'administrator', 'active') returning id`)
    const theirs = one(`insert into public.org_members (org_id, email, name, role, status)
                        values ('${other}', 'x@${tag}.test', 'X', 'leser', 'active') returning id`)
    const note = one(`insert into public.notifications (org_id, member_id, kind, payload)
                      values ('${org}', '${mine}', 'system', '{}'::jsonb) returning id`)

    // As that member, through the RLS path a client uses. The auth row has to
    // exist before `org_members.user_id` can point at it.
    const uid = one(`select gen_random_uuid()`)
    psql(`insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                                  email_confirmed_at, created_at, updated_at)
          values ('${uid}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
                  'n@${tag}.test', '', now(), now(), now()) on conflict (id) do nothing`)
    psql(`update public.org_members set user_id = '${uid}' where id = '${mine}'`)
    psql(`do $$ begin
            perform set_config('request.jwt.claims',
              json_build_object('sub','${uid}','role','authenticated')::text, true);
            set local role authenticated;
            update public.notifications set member_id = '${theirs}' where id = '${note}';
          exception when others then null; end $$`)

    expect(
      one(`select member_id from public.notifications where id = '${note}'`),
      'the reference did not move to the other organisation',
    ).toBe(mine)
  })
})
