import { execFileSync } from 'node:child_process'
import { afterAll, describe, expect, it } from 'vitest'

/**
 * V2-5 ITEM 0 — a round's numbers must survive the retention job, and until this
 * file existed they only did by luck.
 *
 * ── WHY THIS COMES BEFORE THE PHASE'S OWN SUBJECT ───────────────────────────
 *
 * `app.apply_retention` runs nightly and deletes `answers` then `responses`. It
 * snapshots nothing first, so a round's aggregates survive ONLY where a
 * `result_snapshots` row already exists. `M:0023` added that snapshot to
 * `public.close_round`, and its header names this exact failure — «the retention
 * job deletes answers on schedule, and a trend line loses its earlier points
 * because nothing ever wrote them down».
 *
 * Measured in V2-4: of the three live functions that close a round, only
 * `close_round` takes one, and `close_round` has no UI caller. The two paths a
 * user can actually reach — the `surveys` status trigger and the hourly
 * scheduler — closed rounds and wrote nothing. 34 of 36 seeded surveys with
 * responses had no snapshot at all.
 *
 * ── THE TRAP, WHICH IS WHY EVERY TEST HERE ASSERTS A ROW ────────────────────
 *
 * `public.snapshot_results` checks `app.can_edit_survey`, and
 * `public.aggregate_results` checks `app.is_org_member`. **Both are false for
 * the cron role**, which has no session and therefore no `auth.uid()`. So the
 * obvious fix — call `snapshot_results` from `app.run_due_schedules` — returns
 * `{"error":"forbidden"}`, writes nothing, and leaves a green diff that looks
 * like the bug is fixed. That is D110's mute, arriving through a fix rather
 * than through evidence.
 *
 * Tor, 2026-09-09: **«Assert the row exists after the scheduled path runs, not
 * that the call returned.»** Every test below reads
 * `public.result_snapshots`. None of them looks at a return value, and none of
 * them may be rewritten to.
 */
const DB_URL = process.env.LOCAL_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
function psql(query: string): string[][] {
  const out = execFileSync('psql', [DB_URL, '-tAF\t', '-c', query], { encoding: 'utf8' })
  return out.split('\n').filter(Boolean).map((r) => r.split('\t'))
}
function one(query: string): string {
  const rows = psql(query)
  return rows[0]?.[0] ?? ''
}

const stamp = `rf${process.pid}`
const madeOrgs: string[] = []

/**
 * A whole organisation, built through SQL rather than through the app, because
 * these paths run as the DATABASE and the fixture must not depend on a session.
 * Returns the ids the tests need.
 */
function makeOrg(label: string): {
  org: string
  survey: string
  round: string
  group: string
} {
  const org = one(`insert into public.organizations (name, default_k_threshold, retention_months)
                   values ('${stamp}-${label}', 5, 12) returning id`)
  madeOrgs.push(org)
  const group = one(`insert into public.groups (org_id, name) values ('${org}', 'Team ${label}') returning id`)
  const survey = one(`insert into public.surveys (org_id, title, status, anonymity, respondent_kind, k_threshold)
                      values ('${org}', 'Runde ${label}', 'aktiv', 'anonymous', 'person', 5) returning id`)
  const q = one(`insert into public.survey_questions (survey_id, position, type, text, required)
                 values ('${survey}', 1, 'scale', 'Hvordan har du det?', true) returning id`)
  // `question_snapshot` is NOT NULL and carries the frozen questions — the round
  // IS the frozen copy, which is the same idea this file is about one level up.
  const round = one(`insert into public.survey_rounds (survey_id, round_no, status, opens_at, question_snapshot)
                     values ('${survey}', 1, 'open', now() - interval '30 days',
                             (select coalesce(jsonb_agg(to_jsonb(x) order by x.position), '[]'::jsonb)
                                from (select id, type, text, position from public.survey_questions
                                       where survey_id = '${survey}') x))
                     returning id`)
  // Six responses: above k=5, so the snapshot carries real numbers rather than
  // `insufficient_data`. A snapshot of a gated cell would pass a row-exists test
  // and preserve nothing, which is the same mute one level down.
  for (let i = 0; i < 6; i++) {
    const r = one(`insert into public.responses
                     (round_id, anonymity_at_submission, invitation_id, respondent_group_id, lang, submitted_hour)
                   values ('${round}', 'anonymous', null, '${group}', 'no', date_trunc('hour', now() - interval '20 days'))
                   returning id`)
    psql(`insert into public.answers (response_id, question_id, value) values ('${r}', '${q}', '4'::jsonb)`)
  }
  return { org, survey, round, group }
}

function snapshotsFor(round: string): number {
  return Number(one(`select count(*) from public.result_snapshots where round_id = '${round}'`))
}

afterAll(() => {
  for (const org of madeOrgs) {
    psql(`delete from public.organizations where id = '${org}'`)
  }
})

describe('(V2-5 item 0) every path that closes a round freezes its numbers', () => {
  it('A. the SCHEDULER closes a round and a snapshot row exists afterwards', () => {
    const f = makeOrg('sched')
    expect(snapshotsFor(f.round), 'no snapshot before').toBe(0)

    // A due schedule on this survey. `run_due_schedules` closes the open round
    // before opening the next one — that close is the path under test.
    psql(`insert into public.schedules (survey_id, cadence, next_run_at, runs_total, runs_done, active)
          values ('${f.survey}', 'monthly', now() - interval '1 hour', 0, 0, true)`)

    // As the DATABASE, with no session: `select auth.uid()` is null here, which
    // is precisely the condition that makes the naive fix a no-op.
    psql(`select app.run_due_schedules()`)

    expect(
      one(`select status from public.survey_rounds where id = '${f.round}'`),
      'the round did close — otherwise this test proves nothing',
    ).toBe('closed')
    expect(
      snapshotsFor(f.round),
      'THE ROW, not the return value: the scheduler must leave a snapshot behind',
    ).toBe(1)
  })

  it('B. the SURVEY STATUS TRIGGER closes its rounds and freezes them', () => {
    const f = makeOrg('trigger')
    expect(snapshotsFor(f.round)).toBe(0)

    psql(`update public.surveys set status = 'lukket' where id = '${f.survey}'`)

    expect(one(`select status from public.survey_rounds where id = '${f.round}'`)).toBe('closed')
    expect(snapshotsFor(f.round), 'the trigger path must freeze too').toBe(1)
  })

  it('B2. and it does NOT write during an organisation cascade — the erasure path stays open', () => {
    // V2-3b's hazard, one table over: an audit trigger tried to write a row for
    // an organisation already erased. A snapshot taken while the org is being
    // deleted would recreate data under a row that is going away, and — worse —
    // would make the delete fail, which is a GDPR obligation broken by a
    // convenience feature. CLAUDE.md's referential-maintenance rule, sixth form.
    const f = makeOrg('cascade')
    expect(() => psql(`delete from public.organizations where id = '${f.org}'`)).not.toThrow()
    expect(
      Number(one(`select count(*) from public.organizations where id = '${f.org}'`)),
      'the organisation is gone',
    ).toBe(0)
    expect(
      Number(one(`select count(*) from public.result_snapshots where org_id = '${f.org}'`)),
      'and no snapshot was left pointing at it',
    ).toBe(0)
  })

  it('C. THE PROPERTY: after a scheduled close, retention deletes the raw data and the numbers remain', () => {
    // A and B are the mechanism. This is the promise the Personvern panel makes
    // to an administrator choosing a retention period, and the one the bundle
    // drew as «Summerte tall beholdes» in all three handoffs.
    const f = makeOrg('retain')
    psql(`insert into public.schedules (survey_id, cadence, next_run_at, runs_total, runs_done, active)
          values ('${f.survey}', 'monthly', now() - interval '1 hour', 0, 0, true)`)
    psql(`select app.run_due_schedules()`)

    // Age the answers past the org's 12-month retention and run the nightly job.
    psql(`update public.responses set submitted_hour = now() - interval '18 months'
           where round_id = '${f.round}'`)
    psql(`select app.apply_retention()`)

    expect(
      Number(one(`select count(*) from public.responses where round_id = '${f.round}'`)),
      'the raw data is gone, as the retention setting promises',
    ).toBe(0)

    const agg = one(`select aggregates->'questions'->0->>'n'
                       from public.result_snapshots where round_id = '${f.round}' limit 1`)
    expect(agg, 'and the summed figure survived it — this is «Summerte tall beholdes»').toBe('6')
  })

  it('D. closing an already-closed round does not append a second snapshot', () => {
    // `close_round` already guards this on the transition. The two new paths
    // must not reintroduce it: a scheduler that runs twice would otherwise
    // stack duplicate freezes of the same round, and «which one is the record»
    // has no answer.
    const f = makeOrg('idem')
    psql(`update public.surveys set status = 'lukket' where id = '${f.survey}'`)
    expect(snapshotsFor(f.round)).toBe(1)
    psql(`update public.surveys set status = 'aktiv' where id = '${f.survey}'`)
    psql(`update public.surveys set status = 'lukket' where id = '${f.survey}'`)
    expect(snapshotsFor(f.round), 'still one — the round closed once').toBe(1)
  })

  it('E. a round with too little data still closes, and its freeze says so rather than failing', () => {
    // `close_round`'s own rule, which the new paths inherit: «a round that cannot
    // be summarised is still a round that closed, and failing the close would
    // leave it open for ever». The k-gate is not bypassed by the freeze — the
    // stored payload must carry `insufficient_data`, not numbers.
    const f = makeOrg('subk')
    psql(`delete from public.responses where round_id = '${f.round}'
           and id in (select id from public.responses where round_id = '${f.round}' limit 4)`)
    psql(`update public.surveys set status = 'lukket' where id = '${f.survey}'`)

    expect(one(`select status from public.survey_rounds where id = '${f.round}'`)).toBe('closed')
    const gated = one(`select aggregates->'questions'->0->>'insufficient_data'
                         from public.result_snapshots where round_id = '${f.round}' limit 1`)
    expect(gated, 'the freeze is k-gated like every other read').toBe('true')
  })
})
