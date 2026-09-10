import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

/**
 * `M:0095` — the consumer is scheduled, and `sent_at` says what it means.
 *
 * Nothing had ever drained `mail_outbox` because no consumer was scheduled
 * anywhere. Two things had to be true before that could change safely, and both
 * are asserted here rather than read off the migration.
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

describe('the mail worker is actually scheduled', () => {
  it('there is an active cron job that invokes it', () => {
    const row = psql(`
      select schedule, command, active::text from cron.job
       where jobname = 'mail-worker-minutely'`)[0]
    expect(row, 'a worker nobody schedules is a worker that never runs').toBeDefined()
    const [schedule, command, active] = row as string[]
    expect(schedule).toBe('* * * * *')
    expect(command).toContain('app.run_mail_worker')
    expect(active).toBe('true')
  })

  it('and the function it calls exists, definer, not reachable by a client role', () => {
    expect(
      one(`select p.prosecdef::text from pg_proc p
             join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'app' and p.proname = 'run_mail_worker'`),
    ).toBe('true')
    for (const role of ['anon', 'authenticated']) {
      expect(
        one(`select has_function_privilege('${role}', 'app.run_mail_worker()', 'execute')::text`),
        `${role} can invoke the mail worker`,
      ).toBe('false')
    }
  })

  it('runs without error when the vault secrets are absent, and sends nothing', () => {
    // The named condition, exercised. A missing secret must be a warning and a
    // return — not an exception that fills the cron log with failures, and not a
    // silent success that looks like a delivered batch. Any OTHER failure is
    // deliberately left to raise, which is why this is not a catch-all.
    const before = one(`select count(*) from net._http_response`)
    // `psql()` drops empty lines, so a `void` return is NO rows rather than one
    // empty row — the assertion is that the call does not raise, not that it
    // returns something. Written the other way first, and the test failed on my
    // own helper rather than on the function.
    expect(() => psql(`select app.run_mail_worker()`)).not.toThrow()
    expect(
      one(`select count(*) from net._http_response`),
      'with no URL to call, no request may be made',
    ).toBe(before)
  })
})

describe('what sent_at claims', () => {
  const comment = () =>
    one(`select replace(col_description('public.survey_invitations'::regclass,
           (select attnum from pg_attribute
             where attrelid = 'public.survey_invitations'::regclass
               and attname = 'sent_at')), chr(10), ' ')`)

  it('answers CLAUDE.md’s standing question', () => {
    expect(comment()).toContain('WHO WRITES IT')
  })

  /*
    THE ASSERTION THAT MATTERS. `sent_at` is written from our own 2xx, because
    this Brevo account exposes no Transactional webhooks and there is no
    delivered event to write it from. «Accepted by the provider» is strictly
    weaker than «delivered», and the difference has to be written down where the
    next reader is — otherwise it gets closed by guessing the stronger reading,
    and a response-rate denominator quietly starts meaning something else.
  */
  it('says it means ACCEPTED, not delivered — D133', () => {
    const c = comment()
    expect(c).toMatch(/ACCEPTED/)
    expect(c).toMatch(/DOES NOT MEAN DELIVERED/)
    expect(c, 'the reader should be able to find the entry that explains it').toContain('D133')
  })

  it('and names the reminder consequence, which is the non-obvious one', () => {
    // `app.enqueue_reminders` gates on `sent_at is not null`, so a worker that
    // never ran also meant a reminder cycle that never fired — three layers
    // silent about one gap. Asserted so the column comment keeps saying it.
    expect(comment()).toContain('enqueue_reminders')
    expect(
      one(`select replace(prosrc, chr(10), ' ') from pg_proc p
             join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'app' and p.proname = 'enqueue_reminders'`),
    ).toContain('sent_at')
  })
})

describe('the queue can be inspected without being spent', () => {
  it('depth() reports the four numbers an operator needs', () => {
    const d = JSON.parse(one(`select public.mail_outbox_depth()::text`)) as Record<string, number>
    expect(Object.keys(d).sort()).toEqual(['archived', 'invisible', 'max_read_ct', 'queued'])
  })

  it('looking twice changes nothing — which is the whole point', () => {
    /*
      `mail_outbox_read` LEASES: it hides the message for the visibility timeout
      and increments `read_ct`, the counter the worker compares against
      MAX_ATTEMPTS before dead-lettering. So using it to «just check» walks a
      pending invitation towards the archive, and five curious looks throw it
      away. S1's stop condition was «inspect the queue before draining it», and
      until now the only safe instrument for that was a psql connection.
    */
    const a = JSON.parse(one(`select public.mail_outbox_depth()::text`)) as Record<string, number>
    const b = JSON.parse(one(`select public.mail_outbox_depth()::text`)) as Record<string, number>
    expect(b.queued).toBe(a.queued)
    expect(b.max_read_ct, 'inspecting must not advance any message toward the archive').toBe(
      a.max_read_ct,
    )
  })

  it('is declared STABLE, so the catalogue itself forbids it writing', () => {
    // Stronger than the two assertions above, which observe behaviour on the
    // rows that happen to be there: a `stable` function cannot modify the
    // database at all, and Postgres enforces that rather than this test.
    expect(
      one(`select p.provolatile from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'mail_outbox_depth'`),
    ).toBe('s')
  })

  it('and no client role can call it — a depth is still operational detail', () => {
    for (const role of ['anon', 'authenticated']) {
      expect(
        one(`select has_function_privilege('${role}', 'public.mail_outbox_depth()', 'execute')::text`),
      ).toBe('false')
    }
    expect(
      one(`select has_function_privilege('service_role', 'public.mail_outbox_depth()', 'execute')::text`),
    ).toBe('true')
  })
})
