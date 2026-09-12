import { execFileSync } from 'node:child_process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { adminClient, anonClient, serviceClient, type Client } from './clients'
import { ORG_PRIMARY } from './personas'

/**
 * V2-3a's BLOCKER — **DECISIONS Q64**, the per-round freeze.
 *
 * «Send a round, change the membership, re-read the round's denominator and
 * participation rate → unchanged.» The plan calls it *the phase's most important
 * test and the one nothing errors on*, and that second half is the reason it
 * exists: nothing throws when a denominator moves. A report simply says
 * something different in June than it said in March, and nobody can tell which
 * of the two was the lie.
 *
 * ── WHAT THIS TEST IS ACTUALLY GUARDING, AFTER THE GROUNDWORK ───────────────
 *
 * The freeze **already holds** — `survey_invitations` is a per-round snapshot,
 * written by `send_round` (`M:0052:107`, `:140`), and the denominator counts
 * those rows rather than live membership. So this is not a test for work being
 * added; it is a test for a property nothing currently protects. The plan
 * proposed `round_audience_members` to CREATE the freeze; Q64 dropped that on
 * the measurement, and dropping a proposed table is exactly when the property it
 * would have provided needs pinning down.
 *
 * **The derived half matters more than the scenario.** A scenario proves the
 * denominator did not move for the one change I made. The catalogue assertion
 * proves no denominator reader consults live membership AT ALL — over the set of
 * functions, not the one I picked (standing question 3).
 */
const DB_URL = process.env.LOCAL_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
function psql(query: string): string[][] {
  const out = execFileSync('psql', [DB_URL, '-tAF\t', '-c', query], { encoding: 'utf8' })
  return out.split('\n').filter(Boolean).map((r) => r.split('\t'))
}

let svc: Client
let admin: Client
let anon: Client
let orgId: string
let surveyId = ''
let groupA = ''
let groupB = ''
const movedMembers: string[] = []
const stamp = `${process.pid}`

beforeAll(async () => {
  svc = serviceClient()
  admin = await adminClient()
  anon = anonClient()
  const { data: orgs } = await svc.from('organizations').select('id, name')
  orgId = orgs!.find((o) => o.name === ORG_PRIMARY)!.id

  const { data: gs } = await svc
    .from('groups')
    .insert([
      { org_id: orgId, name: `Frys A ${stamp}` },
      { org_id: orgId, name: `Frys B ${stamp}` },
    ])
    .select('id, name')
  groupA = gs!.find((g) => g.name === `Frys A ${stamp}`)!.id
  groupB = gs!.find((g) => g.name === `Frys B ${stamp}`)!.id

  // Six active members in A. Six so that moving three leaves a number that
  // could not be mistaken for a rounding artefact.
  const rows = Array.from({ length: 6 }, (_, i) => ({
    org_id: orgId,
    email: `frys-${i}-${stamp}@example.test`,
    name: `Frys ${i}`,
    role: 'leser' as const,
    group_id: groupA,
    status: 'active',
  }))
  const { data: members } = await svc.from('org_members').insert(rows).select('id')
  movedMembers.push(...members!.map((m) => m.id))

  const { data: survey } = await svc
    .from('surveys')
    .insert({
      org_id: orgId,
      title: `Frysetest ${stamp}`,
      respondent_kind: 'person',
      anonymity: 'anonymous',
    })
    .select('id')
    .single()
  surveyId = survey!.id
  await svc
    .from('survey_questions')
    .insert({ survey_id: surveyId, position: 1, type: 'scale', text: 'Frys' })
}, 120_000)

afterAll(async () => {
  // Standing question 4. A survey and six members left behind would change the
  // recipient counts every later phase measures.
  await svc.from('surveys').delete().eq('id', surveyId)
  if (movedMembers.length) await svc.from('org_members').delete().in('id', movedMembers)
  await svc.from('groups').delete().in('id', [groupA, groupB])
})

/** The round's recipient count, read the way the product reads it. */
const invitedCount = async (): Promise<number> => {
  const { data: rounds } = await svc
    .from('survey_rounds')
    .select('id')
    .eq('survey_id', surveyId)
    .order('created_at', { ascending: false })
    .limit(1)
  const { count } = await svc
    .from('survey_invitations')
    .select('id', { count: 'exact', head: true })
    .eq('round_id', rounds![0]!.id)
  return count ?? 0
}

describe('(Q64) BLOCKER — a membership change after send moves no denominator', () => {
  it('sends to the group and records six recipients', async () => {
    const { error } = await admin.rpc('send_round', {
      p_survey: surveyId,
      p_channels: ['email'],
      p_group_ids: [groupA],
    })
    expect(error, 'the round sends').toBeNull()
    expect(await invitedCount(), 'six members, six invitations').toBe(6)
  })

  it('MOVES THREE OF THE SIX, AND THE ROUND DOES NOT NOTICE', async () => {
    // The scenario. Half the group leaves for another group after the round is
    // out — the ordinary case of a reorganisation mid-quarter.
    const { error } = await svc
      .from('org_members')
      .update({ group_id: groupB })
      .in('id', movedMembers.slice(0, 3))
    expect(error).toBeNull()

    expect(await invitedCount(), 'the denominator is the snapshot, not the membership').toBe(6)

    // And the group is genuinely half its size now — without this the assertion
    // above would pass if the update had silently done nothing.
    const { count: liveA } = await svc
      .from('org_members')
      .select('id', { count: 'exact', head: true })
      .eq('group_id', groupA)
    expect(liveA, 'POSITIVE CONTROL: live membership really did change').toBe(3)
  })

  it('deactivating a member does not move it either', async () => {
    // `send_round` filters `status = 'active'` when it builds the audience, so
    // a status change is the other way live membership could reach a sent round.
    await svc.from('org_members').update({ status: 'inactive' }).eq('id', movedMembers[3]!)
    expect(await invitedCount(), 'a sent round is not re-filtered by status').toBe(6)
  })

  it('THE DERIVED HALF: no denominator reader consults live membership', () => {
    // The scenario proves one change did not move one number. This proves the
    // property over the SET (standing question 3): every function that counts a
    // round's recipients reads `survey_invitations`, and none of them joins
    // `org_members` to do it.
    //
    // `send_round` and `run_due_schedules` are the two that legitimately read
    // both — they BUILD an audience, which is the one moment live membership is
    // the right source. They are named with that reason rather than pattern-
    // matched, so a third builder appearing here has to be justified by a person.
    //
    // V2-7 added a third, and THIS TEST CAUGHT IT — the derivation working.
    // `mint_test_token` reads `org_members` for one thing only: the editor's own
    // address, so the preview invitation is addressed to the person previewing
    // rather than to a recipient. It computes no denominator, and the row it
    // writes is excluded from every one of them
    // (`tests/db/test-mode.test.ts` asserts that over the catalogue). The reason
    // is here rather than a name being silently added, per D110's addition:
    // **state the scope of the exemption, not only that there is one.**
    //
    // I1-1 (M:0108) added a FOURTH and this test caught it — the derivation
    // working a second time. `app.enqueue_reminders` now reads live membership,
    // and it is not a builder: it decides whether to send a SECOND piece of mail
    // to someone already invited. It computes no denominator at all.
    //
    // AND THE REASONS ARE NOW CHECKED RATHER THAN TRUSTED, which is the repair
    // this entry earned. A reason written as prose is true on the day it is
    // typed; `M:0107`'s sweep showed what it costs when the function moves under
    // it. Each predicate below is verified against the body it describes, so an
    // exemption that stops being true fails here instead of standing.
    const BUILDERS: Record<string, { why: string; check: (src: string) => boolean }> = {
      send_round: {
        why: 'builds the audience — the one moment live membership is correct',
        check: (src) => /insert into public\.survey_rounds/.test(src),
      },
      run_due_schedules: {
        why: 'builds round N+1 by copying round N, and may read members',
        check: (src) => /insert into public\.survey_rounds/.test(src),
      },
      mint_test_token: {
        why: 'V2-7: reads org_members ONLY for the previewing editor’s own address, and ' +
             'computes no denominator — the row it writes is is_test and is excluded from ' +
             'all of them',
        check: (src) => /insert into public\.survey_invitations[^;]*is_test/s.test(src),
      },
      enqueue_reminders: {
        why: 'M:0108: reads live membership to decide whether a SECOND piece of mail may ' +
             'be sent to someone already invited — a prohibition, not a denominator. It ' +
             'creates no round and reads neither responses nor answers, so there is no ' +
             'number here for a membership change to move',
        check: (src) =>
          !/insert into public\.survey_rounds/.test(src) &&
          !/\bpublic\.responses\b/.test(src) &&
          !/\bpublic\.answers\b/.test(src),
      },
    }
    const readsBoth = psql(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname in ('public','app')
          and p.prosrc ~ 'survey_invitations'
          and p.prosrc ~ 'org_members'
        order by 1`,
    ).map((r) => r[0]!)

    // Non-vacuity (D158): the four known readers must be among them, or the
    // sweep is broken and every assertion below passes for the wrong reason.
    expect(readsBoth).toEqual(expect.arrayContaining(Object.keys(BUILDERS)))

    for (const fn of readsBoth) {
      const allow = BUILDERS[fn]
      if (!allow) continue
      const src = psql(
        `select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname in ('public','app') and p.proname = '${fn}' limit 1`,
      )
        .map((r) => r[0]!)
        .join('\n')
      expect(allow.check(src), `${fn} is exempt because it ${allow.why} — and it no longer does`)
        .toBe(true)
    }

    const offenders = readsBoth.filter((fn) => !(fn in BUILDERS))
    expect(
      offenders,
      `these read a round's invitations AND live membership: ${offenders.join(', ') || '(none)'}`,
    ).toEqual([])
  })

  it('the snapshot carries the group it was sent to, not the group they are in now', async () => {
    // `survey_invitations.group_id` is copied at send (`M:0052:137`). It is what
    // makes a per-group breakdown of a past round mean what it said at the time.
    const { data: rounds } = await svc
      .from('survey_rounds')
      .select('id')
      .eq('survey_id', surveyId)
      .order('created_at', { ascending: false })
      .limit(1)
    const { count } = await svc
      .from('survey_invitations')
      .select('id', { count: 'exact', head: true })
      .eq('round_id', rounds![0]!.id)
      .eq('group_id', groupA)
    expect(count, 'all six were sent as group A, and still are').toBe(6)
  })

  it('and it carries WHO — Q64 gap 1, which was open until V2-3b', async () => {
    // `member_id` (`M:0059`) is written by the group loop, the only one that
    // knows the member: named recipients and imports address people who may not
    // be members at all. Without it the snapshot holds an address and no person,
    // so «who was invited to round 3» stops being answerable the moment an
    // address changes.
    //
    // A column nothing writes is D110's instance 2 — a feature flag with no call
    // site is a comment in a table — so this asserts the WRITE, not the column.
    const { data: rounds } = await svc
      .from('survey_rounds')
      .select('id')
      .eq('survey_id', surveyId)
      .order('created_at', { ascending: false })
      .limit(1)
    const { data: rows } = await svc
      .from('survey_invitations')
      .select('email, member_id')
      .eq('round_id', rounds![0]!.id)
    expect(rows?.length, 'six recipients').toBe(6)
    expect(
      rows!.filter((r) => r.member_id !== null).length,
      'every one of them is linked to the member it was sent to',
    ).toBe(6)
    expect(new Set(rows!.map((r) => r.member_id)).size, 'six DIFFERENT people').toBe(6)
  })
})

/**
 * Q64 gap 2 — the `ON DELETE` behaviour of the four columns referencing
 * `groups`, which existed as `set null` and had never been CHOSEN.
 *
 * Measuring it found a live privacy defect that predates this phase, and these
 * are its regression tests. The reasoning is in `M:0059`'s header; the short
 * version is that `compose_report` gates a share link with
 *
 *     if v_rep.filters->>'group' is not null and v_share.group_id is not null
 *        and v_share.group_id <> (v_rep.filters->>'group')::uuid then forbidden
 *
 * — so nulling `report_shares.group_id` DISABLES the check that was refusing a
 * mismatched link, and `v_group` then falls back to the report's own filter.
 * Deleting a group, on an unrelated screen, widened a share link's access.
 */
describe('(Q64 gap 2) deleting a group cannot rewrite the record or widen a link', () => {
  it('the four FKs carry the behaviour that was DECIDED, not the one inherited', () => {
    // Asserted from the catalogue rather than described, because the whole
    // finding was that nobody had ever looked at these four values.
    // POSITION-AWARE since S3/M:0090. `org_members.group_id` became a COMPOSITE
    // key — `(group_id, org_id) -> groups(id, org_id)` — the moment the column
    // got a writer, and an `unnest(conkey)` that ignores which target column
    // each source column points at then reported `org_members.org_id` as a
    // fifth «FK into groups». It is not one: it is the tenant half of one key.
    // Unnesting conkey WITH confkey and keeping the pair that lands on
    // `groups.id` names exactly the reference whose delete behaviour this test
    // is about, and keeps working however many composites arrive later.
    const rows = psql(
      `select c.conrelid::regclass::text||'.'||a.attname, c.confdeltype
         from pg_constraint c
         join lateral unnest(c.conkey, c.confkey) as u(src, tgt) on true
         join pg_attribute a on a.attrelid = c.conrelid and a.attnum = u.src
         join pg_attribute fa on fa.attrelid = c.confrelid and fa.attnum = u.tgt
        where c.contype = 'f' and c.confrelid = 'public.groups'::regclass
          and fa.attname = 'id'
        order by 1`,
    )
    const by = Object.fromEntries(rows.map((r) => [r[0]!, r[1]!]))
    expect(by, 'all four are accounted for').toEqual({
      // A person outlives a group; that is what a group is.
      'org_members.group_id': 'n',
      // A share scoped to a group that is gone has no meaning. It must not come
      // to mean something else.
      'report_shares.group_id': 'c',
      // These two ARE the record: a sent round and an answer already given.
      // 'a' = NO ACTION, and the constraints are DEFERRABLE INITIALLY DEFERRED
      // — asserted separately below, because 'a' alone would also describe the
      // undeferred form, which cannot express what this rule means.
      'responses.respondent_group_id': 'a',
      'survey_invitations.group_id': 'a',
    })
  })

  it('and DEFERRED, which is the half RESTRICT could not express', () => {
    // CLAUDE.md's referential-maintenance rule, fifth instance. RESTRICT is
    // checked immediately and made the ORGANISATION undeletable — a broken
    // erasure path wearing a freeze's clothes. Deferring the check to commit
    // refuses the group delete and allows the org cascade. Both halves are
    // asserted: the flags below and `dropOrg` in every seed run.
    const rows = psql(
      `select c.conrelid::regclass::text||'.'||a.attname, c.condeferrable, c.condeferred
         from pg_constraint c join unnest(c.conkey) k on true
         join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k
        where c.contype = 'f' and c.confrelid = 'public.groups'::regclass
          and c.conrelid::regclass::text in ('responses','survey_invitations')
        order by 1`,
    )
    expect(rows.map((r) => [r[0], r[1], r[2]])).toEqual([
      ['responses.respondent_group_id', 't', 't'],
      ['survey_invitations.group_id', 't', 't'],
    ])
  })

  it('a group a round was sent to CANNOT be deleted, and the refusal is the FK', async () => {
    // Before this, the delete succeeded and nulled the column, which is the
    // freeze holding only until somebody tidies up.
    const { error } = await svc.from('groups').delete().eq('id', groupA)
    expect(error?.code, 'foreign_key_violation').toBe('23503')

    const { count } = await svc
      .from('groups')
      .select('id', { count: 'exact', head: true })
      .eq('id', groupA)
    expect(count, 'POSITIVE CONTROL: the group is still there').toBe(1)
  })

  it('a share link scoped to a deleted group GOES, rather than coming to mean another group', async () => {
    // The regression test for the widening. A link scoped to group B on a
    // report filtered elsewhere used to survive B's deletion with its scope
    // check switched off; now the link is deleted with the group it was for.
    const { data: report } = await svc
      .from('reports')
      .insert({ org_id: orgId, title: `Frys-rapport ${stamp}`, filters: {} })
      .select('id')
      .single()
    const { data: share } = await svc
      .from('report_shares')
      .insert({
        report_id: report!.id,
        group_id: groupB,
        scope: 'ledere_eget_team',
        token_hash: `frys${stamp}`.padEnd(64, '0'),
      })
      .select('id')
      .single()

    const { error } = await svc.from('groups').delete().eq('id', groupB)
    expect(error, 'group B has no round and no answer, so it may go').toBeNull()

    const { data: after } = await svc.from('report_shares').select('id').eq('id', share!.id)
    expect(after ?? [], 'the link went with it').toEqual([])

    // And the property, not just the row: the token no longer opens anything.
    // Asserted through the RPC because the claim is about ACCESS, and a deleted
    // row is only evidence of access if something reads it.
    const { data: composed } = await anon.rpc('compose_report', {
      p_report: report!.id,
      p_token: `frys${stamp}`,
    })
    expect(
      (composed as { error?: string } | null)?.error,
      'the link is refused rather than re-scoped',
    ).toBe('forbidden')

    await svc.from('reports').delete().eq('id', report!.id)
  })
})
