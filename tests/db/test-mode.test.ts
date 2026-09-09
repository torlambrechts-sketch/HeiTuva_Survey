import { execFileSync } from 'node:child_process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * V2-7 — test mode. DECISIONS **Q76 DEFAULTED, not answered**: a dry-run flag on
 * `submit_response` that runs every validation and returns without inserting.
 *
 * ── WHY THIS PHASE IS SMALL AND STILL MATTERS ──────────────────────────────
 *
 * CLAUDE.md invariant 2: **`rpc.submit_response` is the only write path.** Test
 * mode is the first feature that asks that path to do LESS, and the obvious
 * shortcut — a second function, or a client that skips the call and fakes the
 * thank-you — would either add a write path or make the preview a lie about the
 * logic it claims to exercise.
 *
 * So the dry run goes through the SAME function, and these five tests are the
 * phase. Numbers 1–3 are blockers.
 */
const DB_URL = process.env.LOCAL_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
function psql(query: string): string[][] {
  const out = execFileSync('psql', [DB_URL, '-tAF\t', '-c', query], { encoding: 'utf8' })
  return out.split('\n').filter(Boolean).map((r) => r.split('\t'))
}
const one = (q: string) => psql(q)[0]?.[0] ?? ''

const tag = `tm${process.pid}`
let org = ''
let survey = ''
let round = ''
let question = ''
let token = ''
let invitation = ''

beforeAll(() => {
  org = one(`insert into public.organizations (name, default_k_threshold) values ('${tag}', 5) returning id`)
  survey = one(`insert into public.surveys (org_id, title, status, anonymity, respondent_kind, k_threshold)
                values ('${org}', 'Testmodus', 'aktiv', 'anonymous', 'person', 5) returning id`)
  question = one(`insert into public.survey_questions (survey_id, position, type, text, required)
                  values ('${survey}', 1, 'scale', 'Hvordan går det?', true) returning id`)
  round = one(`insert into public.survey_rounds (survey_id, round_no, status, opens_at, question_snapshot)
               values ('${survey}', 1, 'open', now(), '[]'::jsonb) returning id`)
  // A real invitation with a real hashed token — the point is that the dry run
  // takes the SAME path a respondent takes, so the fixture must be one.
  token = `${tag}-token-abcdefghijklmnop`
  invitation = one(`insert into public.survey_invitations (round_id, email, token_hash)
                    values ('${round}', 'test@${tag}.no',
                            encode(extensions.digest('${token}', 'sha256'), 'hex'))
                    returning id`)
})

afterAll(() => {
  psql(`delete from public.organizations where id = '${org}'`)
})

function responses(): number {
  return Number(one(`select count(*) from public.responses where round_id = '${round}'`))
}

describe('(Q76) test mode is a dry run through the ONE write path', () => {
  it('1. BLOCKER — a test submission creates no `responses` row', () => {
    expect(responses(), 'nothing before').toBe(0)
    const out = one(
      `select public.submit_response('${token}', 'no',
         jsonb_build_object('${question}', jsonb_build_object('value', to_jsonb(4))), null, true)`,
    )
    expect(out, 'the call succeeded').toMatch(/"dry_run"\s*:\s*true/)
    expect(responses(), 'and wrote nothing').toBe(0)
  })

  it('2. BLOCKER — it does not set `responded_at` on the invitation', () => {
    expect(
      one(`select coalesce(responded_at::text, 'null') from public.survey_invitations where id = '${invitation}'`),
      'the invitation is untouched',
    ).toBe('null')
  })

  it('3. BLOCKER — it does not consume the token; a real respondent can still answer', () => {
    // The one that would bite in production: an editor previewing their own
    // survey would silently burn the recipient's link.
    const out = one(
      `select public.submit_response('${token}', 'no',
         jsonb_build_object('${question}', jsonb_build_object('value', to_jsonb(5))), null, false)`,
    )
    expect(out, 'the real submission works afterwards').toMatch(/"ok"\s*:\s*true|response_id/)
    expect(responses(), 'and this one DID write').toBe(1)
  })

  it('4. it runs the same validations — a closed round is refused in test mode too', () => {
    // «All logikk kjører som for en ekte respondent» (V2:3323) is a PROMISE, and
    // a dry run that skips the checks would make the preview useless exactly
    // where a preview matters. A second invitation, on a round that is closed.
    const t2 = `${tag}-token-2-abcdefghijkl`
    psql(`insert into public.survey_invitations (round_id, email, token_hash)
          values ('${round}', 'test2@${tag}.no', encode(extensions.digest('${t2}', 'sha256'), 'hex'))`)
    psql(`update public.survey_rounds set status = 'closed' where id = '${round}'`)
    const out = one(
      `select public.submit_response('${t2}', 'no',
         jsonb_build_object('${question}', jsonb_build_object('value', to_jsonb(3))), null, true)`,
    )
    expect(out, 'refused for the same reason a real one would be').toMatch(/not_found_or_closed/)
    psql(`update public.survey_rounds set status = 'open' where id = '${round}'`)
  })

  it('5. it is not a bypass — an unknown token is refused in test mode as in any other', () => {
    // Test mode must not become a way to reach a survey without a token. The
    // flag changes what happens AFTER validation, never whether validation runs.
    const out = one(
      `select public.submit_response('${tag}-not-a-real-token', 'no', '{}'::jsonb, null, true)`,
    )
    expect(out).toMatch(/not_found_or_closed/)
  })

  it('6. the anonymity CHECK is untouched by this phase — diffed, not remembered', () => {
    // The plan asks for this explicitly, and it is the right paranoia: a phase
    // that teaches the write path to skip its write is one edit away from
    // teaching it to skip its constraint.
    expect(
      one(`select pg_get_constraintdef(oid) from pg_constraint
            where conname = 'responses_anonymous_unlinked'`),
    ).toBe(
      "CHECK (((anonymity_at_submission <> 'anonymous'::app.anonymity_mode) OR (invitation_id IS NULL)))",
    )
  })

  it('7. and there is still exactly ONE function that inserts into `responses`', () => {
    // CLAUDE.md invariant 2, asserted over the catalogue rather than trusted.
    // The cheapest way to build test mode would have been a second function;
    // this is what makes that fail rather than pass review.
    const writers = psql(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname in ('app','public') and p.prokind = 'f'
          and regexp_replace(p.prosrc, '--[^\\n]*', '', 'g') ~ 'insert into public\\.responses'
        order by 1`,
    ).map((r) => r[0]!)
    expect(writers, 'one write path, and it is submit_response').toEqual(['submit_response'])
  })

  it('8. a test invitation is in NO count — asserted over the catalogue, not a list', () => {
    // `M:0076` promised in a comment that a test row is «excluded from
    // participation denominators». THIS PROJECT HAS BEEN BITTEN FOUR TIMES BY A
    // PROMISE THAT LIVED ONLY IN A COMMENT — weekly_digest, created_by,
    // close_round, snapshot_results — so the promise is asserted here.
    //
    // The split is deliberate and stated: functions that COUNT invitations must
    // exclude a test row; functions that ACT on one the caller already holds
    // must not, or the preview cannot resolve its own token.
    const counts = ['results_summary', 'dashboard_summary', 'overview_activity',
                    'attributed_rows', 'get_benchmarks', 'sync_survey_target',
                    'enqueue_reminders']
    const acts = ['resolve_token', 'submit_response', 'send_round', 'close_round',
                  'get_survey_for_token', 'mint_test_token']

    const excluding = new Set(psql(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname in ('app','public') and p.prokind = 'f'
          and regexp_replace(p.prosrc, '--[^\n]*', '', 'g') ~ 'not is_test'`,
    ).map((r) => r[0]!))

    expect(counts.filter((f) => !excluding.has(f)), 'every counting reader excludes a preview').toEqual([])
    expect(acts.filter((f) => excluding.has(f)), 'no acting reader filters, or the preview breaks').toEqual([])

    // And the enumeration itself: a NEW reader of survey_invitations arrives
    // unclassified rather than silently counting previews.
    const all = psql(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname in ('app','public') and p.prokind = 'f'
          and regexp_replace(p.prosrc, '--[^\n]*', '', 'g') ~ '\msurvey_invitations\M'
        order by 1`,
    ).map((r) => r[0]!)
    const known = new Set([...counts, ...acts, 'close_rounds_with_survey', 'run_due_schedules'])
    expect(
      all.filter((f) => !known.has(f)),
      'a new reader of survey_invitations. Decide whether it COUNTS (exclude is_test) ' +
        'or ACTS on one (do not), and add it to the right list here.',
    ).toEqual([])
  })

  it('9. THE SCHEDULER DOES NOT COPY A PREVIEW FORWARD — the same loop V2-3b found', () => {
    // `app.run_due_schedules` builds round N+1 by copying round N's invitations
    // verbatim, and the insert does not carry `is_test`, which DEFAULTS TO
    // FALSE. So a preview would have become a real invitation on the next
    // round, with a real token, and the mail worker would have sent the editor
    // a genuine invitation to the survey they were previewing.
    //
    // Found by reading the loop, not by a gate — the same way V2-3b's fourth
    // insertion point was found. Three guards now live in it and all three are
    // asserted, because a later patch that rewrites the body could drop any one.
    const body = one(
      `select regexp_replace(pg_get_functiondef(p.oid), '--[^\n]*', '', 'g')
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'app' and p.proname = 'run_due_schedules'`,
    )
    void body
    for (const [needle, why] of [
      ['not is_test', 'V2-7: a preview is not part of the next round’s audience'],
      ['is_suppressed', 'V2-3b: an objector is not re-invited by cron'],
      ['freeze_round', 'V2-5: the round it closes gets its numbers frozen'],
    ] as const) {
      expect(
        Number(one(`select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname = 'app' and p.proname = 'run_due_schedules'
                       and regexp_replace(p.prosrc, '--[^\n]*', '', 'g') ~ '${needle}'`)),
        why,
      ).toBe(1)
    }
  })
})
