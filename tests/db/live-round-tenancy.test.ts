import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

/**
 * S3 item 3 — the audit's BLOCKER, closed and kept closed (`A5-1`).
 *
 * An administrator or redaktør of ANY organisation could cause anonymous
 * respondents to write real responses into ANOTHER organisation's round, by
 * opening a live session on their own survey and naming the victim's round:
 *
 *   live_sessions(org_id = A, survey_id = A's own, round_id = B's round)
 *
 * `live_ins`'s WITH CHECK is `has_role(org_id, …) and can_edit_survey(survey_id)`
 * — `round_id` never appears in it — and the FK was single-column, so the row
 * was accepted. `redeem_live_voucher` then minted a token for B's round and
 * `submit_response` wrote into B.
 *
 * ── WHY THE ASSERTIONS ARE WHERE THEY ARE ─────────────────────────────────
 *
 * These run as SERVICE ROLE, which bypasses RLS on purpose. The policy was
 * never the thing that stopped this and closing the policy would not have
 * closed the second path (`authenticated` holds INSERT on the table directly).
 * The claim under test is therefore about the SCHEMA: this row cannot exist,
 * whoever writes it and through whatever client.
 *
 * The last test is the one that generalises. `tests/db/fk-tenancy.test.ts`
 * could not see this FK because it enumerates single-column keys where BOTH
 * source and target carry a literal `org_id`, and `survey_rounds` has none — it
 * is org-scoped transitively. That is an enumeration standing in for a
 * property, so the property is asserted here directly: no single-column foreign
 * key points at `survey_rounds`.
 */
const DB_URL = process.env.LOCAL_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

function psql(query: string): string[][] {
  const out = execFileSync('psql', [DB_URL, '-tAF\t', '-v', 'ON_ERROR_STOP=1', '-c', query], {
    encoding: 'utf8',
  })
  return out.split('\n').filter(Boolean).map((r) => r.split('\t'))
}
/** Runs a statement that is EXPECTED to fail, and returns the error text. */
function psqlExpectError(query: string): string {
  try {
    execFileSync('psql', [DB_URL, '-tA', '-v', 'ON_ERROR_STOP=1', '-c', query], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return ''
  } catch (e) {
    const err = e as { stderr?: Buffer | string; stdout?: Buffer | string }
    return String(err.stderr ?? '') + String(err.stdout ?? '')
  }
}
const one = (q: string) => {
  const rows = psql(q)
  const v = rows[0]?.[0]
  if (v === undefined) throw new Error(`no row for: ${q}`)
  return v
}

describe('a live session cannot name a round it does not own', () => {
  it('refuses a round belonging to ANOTHER organisation — the BLOCKER itself', () => {
    // The victim is BUILT rather than looked up. The demo seed's second
    // organisation happens to have no rounds, and a probe that silently found
    // no victim would have reported «no row» instead of «the write was
    // accepted» — a test of nothing, dressed as a failure.
    const attackerOrg = one(`
      select o.id from public.organizations o
       join public.surveys s on s.org_id = o.id
       where s.anonymity = 'anonymous' order by o.created_at limit 1`)
    const attackerSurvey = one(`
      select s.id from public.surveys s
       where s.org_id = '${attackerOrg}' and s.anonymity = 'anonymous'
       order by s.created_at limit 1`)
    const victimOrg = one(`
      insert into public.organizations (name) values ('S3 A5-1 victim') returning id`)
    const victimSurvey = one(`
      insert into public.surveys (org_id, title, status, anonymity)
      values ('${victimOrg}', 'S3 A5-1 victim survey', 'aktiv', 'anonymous') returning id`)
    const victimRound = one(`
      insert into public.survey_rounds (survey_id, round_no, status, question_snapshot)
      values ('${victimSurvey}', 1, 'open', '[]'::jsonb) returning id`)

    try {
      const err = psqlExpectError(`
        insert into public.live_sessions (org_id, survey_id, round_id, code, expires_at)
        values ('${attackerOrg}', '${attackerSurvey}', '${victimRound}', 'CROSS1', now() + interval '1 hour')`)

      expect(
        err,
        'the row was ACCEPTED — an anonymous respondent can now be routed into ' +
          'another organisation’s round, which is the whole of A5-1',
      ).not.toBe('')
      expect(err).toMatch(/live_sessions_round_id_fkey|foreign key/i)
    } finally {
      psql(`delete from public.organizations where id = '${victimOrg}'`)
    }
  })

  it('refuses a round of a DIFFERENT SURVEY in the same organisation', () => {
    // The composite binds to survey_id, not org_id, so it also rules out the
    // in-tenant version — a presenter pointing their session at a colleague's
    // round. Not in the audit; it falls out of choosing the stronger pair, and
    // it is asserted so that a later «simplification» to (round_id, org_id)
    // fails here rather than quietly widening the rule.
    const org = one(`
      select s.org_id from public.surveys s
       join public.survey_rounds r on r.survey_id = s.id
       where s.anonymity = 'anonymous'
       group by s.org_id having count(distinct s.id) > 1 limit 1`)
    const surveyA = one(`
      select s.id from public.surveys s join public.survey_rounds r on r.survey_id = s.id
       where s.org_id = '${org}' and s.anonymity = 'anonymous' order by s.created_at limit 1`)
    const roundOfB = one(`
      select r.id from public.survey_rounds r join public.surveys s on s.id = r.survey_id
       where s.org_id = '${org}' and s.id <> '${surveyA}' limit 1`)

    const err = psqlExpectError(`
      insert into public.live_sessions (org_id, survey_id, round_id, code, expires_at)
      values ('${org}', '${surveyA}', '${roundOfB}', 'CROSS2', now() + interval '1 hour')`)
    expect(err).not.toBe('')
  })

  it('still accepts a session on the survey’s OWN round', () => {
    // The constraint must refuse the wrong thing without refusing the right
    // one. A rule that closes the hole and the feature is not a fix.
    const row = psql(`
      select s.org_id, s.id, r.id from public.surveys s
       join public.survey_rounds r on r.survey_id = s.id
       where s.anonymity = 'anonymous' and s.run_mode = 'live' limit 1`)[0]
    expect(row, 'the demo seed carries a live-mode survey with a round').toBeDefined()
    const [org, survey, round] = row as string[]
    const id = one(`
      insert into public.live_sessions (org_id, survey_id, round_id, code, expires_at)
      values ('${org}', '${survey}', '${round}', 'OK0001', now() + interval '1 hour')
      returning id`)
    expect(id).toMatch(/^[0-9a-f-]{36}$/)
    psql(`delete from public.live_sessions where id = '${id}'`)
  })

  it('deleting the round still removes the session rather than being refused', () => {
    // CLAUDE.md's referential-maintenance rule, checked as BEHAVIOUR. V2-3b's
    // RESTRICT made a whole organisation undeletable and surfaced miles away in
    // dropOrg, so the cascade is exercised rather than read off the definition.
    const row = psql(`
      select s.org_id, s.id from public.surveys s
       where s.anonymity = 'anonymous' order by s.created_at limit 1`)[0]
    const [org, survey] = row as string[]
    const round = one(`
      insert into public.survey_rounds (survey_id, round_no, status, question_snapshot)
      values ('${survey}', 9001, 'open', '[]'::jsonb) returning id`)
    const session = one(`
      insert into public.live_sessions (org_id, survey_id, round_id, code, expires_at)
      values ('${org}', '${survey}', '${round}', 'CASC01', now() + interval '1 hour')
      returning id`)
    psql(`delete from public.survey_rounds where id = '${round}'`)
    const left = one(`select count(*) from public.live_sessions where id = '${session}'`)
    expect(left, 'the session goes with its round; nothing is left dangling').toBe('0')
  })
})

describe('the property the enumeration missed', () => {
  /**
   * THE FIRST VERSION OF THIS TEST WAS WRONG, AND USEFULLY SO.
   *
   * It asserted «no single-column foreign key points at survey_rounds», and it
   * found SIX rather than the one the audit named. But four of those six —
   * `responses`, `share_links`, `survey_invitations`, `task_effect_assessments`
   * — carry no tenancy columns at all, so the round IS their anchor and there
   * is nothing for it to disagree with. `share_links`' own policies are
   * `can_edit_survey(app.round_survey(round_id))`: they derive the survey FROM
   * the round, so a foreign round is refused by the only rule there is. Making
   * those composite is impossible — there is no second column to pair with.
   *
   * The property is not «references to rounds are composite». It is:
   *
   *   A TABLE THAT NAMES ITS OWN TENANT AND ALSO NAMES A ROUND MUST MAKE THE
   *   TWO AGREE — otherwise the row can claim one survey and write into another.
   *
   * Derived from the catalogue rather than listed, so the third such table is
   * covered by whichever migration adds it.
   */
  it('every table carrying both a round and a survey binds them together', () => {
    const unbound = psql(`
      with anchored as (
        select t.oid, t.relname
          from pg_class t
          join pg_namespace n on n.oid = t.relnamespace
         where n.nspname = 'public' and t.relkind = 'r'
           and exists (select 1 from pg_attribute a
                        where a.attrelid = t.oid and a.attname = 'round_id'
                          and a.attnum > 0 and not a.attisdropped)
           and exists (select 1 from pg_attribute a
                        where a.attrelid = t.oid and a.attname = 'survey_id'
                          and a.attnum > 0 and not a.attisdropped)
      )
      select b.relname || ': ' || pg_get_constraintdef(c.oid)
        from anchored b
        join pg_constraint c on c.conrelid = b.oid and c.contype = 'f'
        join pg_class f on f.oid = c.confrelid
       where f.relname = 'survey_rounds'
         and cardinality(c.conkey) = 1`)
    expect(
      unbound.map((r) => r[0]),
      'this table can claim one survey and point at another survey’s round',
    ).toEqual([])
  })

  it('and there are two such tables, so the assertion is not vacuous', () => {
    // A property test that matches nothing passes for the wrong reason. This is
    // the guard against the query above quietly stopping to select anything —
    // the shape of «green for something that structurally could not be seen».
    const tables = psql(`
      select t.relname
        from pg_class t
        join pg_namespace n on n.oid = t.relnamespace
       where n.nspname = 'public' and t.relkind = 'r'
         and exists (select 1 from pg_attribute a where a.attrelid = t.oid
                      and a.attname = 'round_id' and a.attnum > 0 and not a.attisdropped)
         and exists (select 1 from pg_attribute a where a.attrelid = t.oid
                      and a.attname = 'survey_id' and a.attnum > 0 and not a.attisdropped)
       order by t.relname`)
    expect(tables.map((r) => r[0])).toEqual(['live_sessions', 'result_snapshots'])
  })
})
