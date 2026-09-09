import { execFileSync } from 'node:child_process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  adminClient,
  anonClient,
  leserClient,
  redaktorClient,
  serviceClient,
  type Client,
} from './clients'
import { ORG_PRIMARY } from './personas'

/**
 * S3 item 5 — the table M:0089 composes from.
 *
 * `result_snapshots` had one policy, `using (app.is_org_member(org_id))`, and
 * `publish_report` stores the WHOLE composed document in
 * `aggregates->'document'` — selected quotes with their group labels, every
 * supplier's attributed answer by name. One `GET /rest/v1/result_snapshots`
 * therefore returned, to any member including a `leser`, the content that
 * `get_quotes`, `attributed_results`, the CSV route and `compose_report` all
 * refuse them (audit `B6-03` / `A2-5`).
 *
 * THIS IS WHAT WOULD HAVE MADE ITEM 1 DECORATION. Fixing `compose_report` and
 * leaving the table open is a guard on one road, which is the shape this whole
 * session keeps finding.
 *
 * ── WHAT IS ASSERTED, AND WHY IT IS TWO THINGS ────────────────────────────
 *
 * The policy stops a leser. The column revoke stops EVERY client, including an
 * administrator, from reading the payload without going through the function
 * that redacts it — RLS is row-level and cannot hide a column, so a policy
 * alone would leave the next role rule having to remember this table exists.
 */
const DB_URL = process.env.LOCAL_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
function psql(query: string): string[][] {
  const out = execFileSync('psql', [DB_URL, '-tAF\t', '-v', 'ON_ERROR_STOP=1', '-c', query], {
    encoding: 'utf8',
  })
  return out.split('\n').filter(Boolean).map((r) => r.split('\t'))
}
const one = (q: string) => {
  const v = psql(q)[0]?.[0]
  if (v === undefined) throw new Error(`no row for: ${q}`)
  return v
}

let svc: Client
let admin: Client
let redaktor: Client
let leser: Client
let anon: Client
let orgId: string
let snapshotId: string

beforeAll(async () => {
  svc = serviceClient()
  ;[admin, redaktor, leser] = await Promise.all([adminClient(), redaktorClient(), leserClient()])
  anon = anonClient()
  const { data: orgs } = await svc.from('organizations').select('id, name')
  orgId = orgs!.find((o) => o.name === ORG_PRIMARY)!.id
  const surveyId = one(`select id from public.surveys where org_id = '${orgId}' limit 1`)
  // A snapshot shaped like a PUBLISHED one: the payload carries a document with
  // a quote in it, which is the content the leser rule is about.
  snapshotId = one(`
    insert into public.result_snapshots (org_id, survey_id, scope, content_hash, aggregates)
    values ('${orgId}', '${surveyId}', '{}'::jsonb, 's3-snapshot-reads-${Date.now()}',
            '{"document":{"sections":[{"key":"quotes","extra":{"quotes":[{"text":"Sagt i fortrolighet","group":"Ledelse"}]}}]}}'::jsonb)
    returning id`)
})

afterAll(async () => {
  if (snapshotId) await svc.from('result_snapshots').delete().eq('id', snapshotId)
})

describe('a leser cannot read a frozen snapshot at all', () => {
  it('gets no rows from the table', async () => {
    const { data, error } = await leser
      .from('result_snapshots')
      .select('id')
      .eq('id', snapshotId)
    expect(error).toBeNull()
    expect(
      data ?? [],
      'the whole composed document — quotes and attributed rows — was one GET away',
    ).toEqual([])
  })

  it('and neither does an anonymous caller', async () => {
    const { data } = await anon.from('result_snapshots').select('id').eq('id', snapshotId)
    expect(data ?? []).toEqual([])
  })
})

describe('nobody reads the payload column through PostgREST', () => {
  for (const [name, who] of [
    ['an administrator', () => admin],
    ['a redaktør', () => redaktor],
  ] as const) {
    it(`${name} is refused the aggregates column`, async () => {
      const { error } = await who()
        .from('result_snapshots')
        .select('aggregates')
        .eq('id', snapshotId)
      expect(
        error,
        'compose_report is where the leser rule lives; a direct column read is a ' +
          'second road to the same bytes, and the next role rule should not have ' +
          'to remember this table exists',
      ).not.toBeNull()
      expect(error!.message).toMatch(/permission denied|aggregates/i)
    })
  }

  it('but the metadata stays readable, so listing frozen snapshots still works', async () => {
    const { data, error } = await admin
      .from('result_snapshots')
      .select('id, survey_id, content_hash, created_at')
      .eq('id', snapshotId)
    expect(error, 'revoking one column must not take the table away').toBeNull()
    expect(data?.length).toBe(1)
  })

  it('and compose_report still reaches it, because SECURITY DEFINER runs as the owner', () => {
    const def = one(`
      select p.prosecdef::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'compose_report'`)
    expect(def, 'if this ever stops being definer, the column revoke breaks the report').toBe('true')
  })
})

describe('the retention switch is read', () => {
  it('apply_retention consults privacy->>auto_delete', () => {
    // `psql()` splits on newlines, so a multi-line prosrc arrives as many
    // «rows» and `one()` returns the word «begin». Flattened in SQL rather than
    // in the helper: the helper is right for tabular results, and this is not one.
    const src = one(`
      select replace(prosrc, chr(10), ' ') from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'app' and p.proname = 'apply_retention'`)
    expect(
      src,
      '«Slett rådata automatisk» was a toggle nothing read — its state and the ' +
        'system’s behaviour agreed on prod by coincidence',
    ).toContain('auto_delete')
  })

  it('an organisation that switched it OFF keeps its answers', () => {
    const org = one(`
      insert into public.organizations (name, retention_months, privacy)
      values ('S3 retention off', 6, '{"auto_delete": false}'::jsonb) returning id`)
    const survey = one(`
      insert into public.surveys (org_id, title, status, anonymity)
      values ('${org}', 'S3 retention probe', 'aktiv', 'anonymous') returning id`)
    const round = one(`
      insert into public.survey_rounds (survey_id, round_no, status, question_snapshot)
      values ('${survey}', 1, 'open', '[]'::jsonb) returning id`)
    psql(`
      insert into public.responses (round_id, submitted_hour, anonymity_at_submission)
      values ('${round}', date_trunc('hour', now() - interval '13 months'), 'anonymous')`)
    try {
      psql(`select app.apply_retention()`)
      expect(
        one(`select count(*) from public.responses where round_id = '${round}'`),
        'the toggle is the promise; the promise is now the rule',
      ).toBe('1')
    } finally {
      psql(`delete from public.organizations where id = '${org}'`)
    }
  })

  it('and one that left it ON still loses them, so the default did not move', () => {
    // `coalesce(..., true)`: an organisation whose privacy has no auto_delete
    // key at all must behave exactly as it did before this change. That is the
    // half a «now it reads the toggle» change is most likely to get wrong.
    const org = one(`
      insert into public.organizations (name, retention_months, privacy)
      values ('S3 retention default', 6, '{}'::jsonb) returning id`)
    const survey = one(`
      insert into public.surveys (org_id, title, status, anonymity)
      values ('${org}', 'S3 retention probe 2', 'aktiv', 'anonymous') returning id`)
    const round = one(`
      insert into public.survey_rounds (survey_id, round_no, status, question_snapshot)
      values ('${survey}', 1, 'open', '[]'::jsonb) returning id`)
    psql(`
      insert into public.responses (round_id, submitted_hour, anonymity_at_submission)
      values ('${round}', date_trunc('hour', now() - interval '13 months'), 'anonymous')`)
    try {
      psql(`select app.apply_retention()`)
      expect(one(`select count(*) from public.responses where round_id = '${round}'`)).toBe('0')
    } finally {
      psql(`delete from public.organizations where id = '${org}'`)
    }
  })
})
