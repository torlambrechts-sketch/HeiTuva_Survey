/**
 * Phase 3 — the respondent flow, driven end to end through the browser.
 *
 * The point is not that the screen renders. It is that a real submission, made
 * the way a real respondent makes it, lands in the database with the anonymity
 * invariants intact — CLAUDE.md 1 and 2. Asserting that from SQL alone would
 * prove the RPC works while saying nothing about whether the page calls it
 * correctly, which is where the linkage would actually leak from.
 */
import { chromium } from '@playwright/test'
import { config } from 'dotenv'
import { createHash, randomBytes } from 'node:crypto'
import { BASE_URL, ensureServer } from './server'
import { serviceClient } from '../../tests/db/clients'
import { DEMO_SHARE_TOKEN, ORG_PRIMARY } from '../../tests/db/personas'
import {
  createRound,
  createShareLink,
  createSurvey,
  hashToken,
  submitResponses,
} from '../../tests/db/factories'

/** A share token for the below-k fixture this script creates for itself. */
const BELOW_K_TOKEN = 'verify-below-k-share-token-local-only'
const ORG_ID: { current: string | null } = { current: null }

config({ path: '.env.local', quiet: true })

let failures = 0
function check(label: string, ok: boolean, detail: string) {
  if (!ok) failures++
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(52)} ${detail.slice(0, 90)}`)
}

async function main() {
  const server = await ensureServer()
  const browser = await chromium.launch()
  const svc = serviceClient()

  try {
    const { data: org } = await svc
      .from('organizations')
      .select('id')
      .eq('name', ORG_PRIMARY)
      .single()
    if (!org) throw new Error(`no organisation named ${ORG_PRIMARY}`)
    ORG_ID.current = org.id

    /*
      The round this gate needs, NAMED rather than assumed.

      This used to be "the oldest open round in the database" — no organisation
      filter and no anonymity filter — and it picked whatever the test suites
      happened to have left behind. On a stack where `verify:db` had run first
      it chose `Leverandør-…`, an ATTRIBUTED fixture in another organisation, and
      three checks then failed for the only reason they could: they assert the
      anonymity banner, an anonymous response row and an hour-truncated
      timestamp, and a named organisation survey has none of those.

      Every property the checks below depend on is now in the query: the demo
      organisation, an anonymous survey, an open round. If no such round exists
      the gate says so instead of testing something else — a check that silently
      retargets is the failure this phase has hit three times.
    */
    const { data: rounds } = await svc
      .from('survey_rounds')
      .select('id, survey_id, question_snapshot, surveys!inner(title, anonymity, org_id)')
      .eq('status', 'open')
      .eq('surveys.org_id', org.id)
      .eq('surveys.anonymity', 'anonymous')
      .order('created_at')
    const round = (rounds ?? []).find(
      (r) => ((r.question_snapshot ?? []) as unknown[]).length > 0,
    )
    if (!round) {
      throw new Error(
        `no open anonymous round with questions in ${ORG_PRIMARY} — run "npm run seed:demo"`,
      )
    }

    const survey = round.surveys as unknown as { title: string; anonymity: string }
    const questions = (round.question_snapshot ?? []) as { id: string; type: string; text: string }[]
    console.log(`  round: "${survey.title}" (${survey.anonymity}), ${questions.length} question(s)`)

    // A token the harness knows the plaintext of. Real ones are minted at send
    // time and only the hash is stored — which is the whole point, so the test
    // has to create its own rather than read one back.
    // `app.hash_token` lives in the app schema and is not exposed to PostgREST,
    // so the harness computes the same digest the migration does:
    // encode(digest(raw,'sha256'),'hex'). If those two ever diverge this token
    // stops resolving and the first check fails loudly, which is the point.
    const raw = `verify-${randomBytes(24).toString('hex')}`
    const tokenHash = createHash('sha256').update(raw).digest('hex')

    const { data: invitation, error: invError } = await svc
      .from('survey_invitations')
      .insert({
        round_id: round.id,
        email: 'verify-respondent@example.test',
        name: 'Verify Respondent',
        lang: 'no',
        token_hash: tokenHash,
      })
      .select('id')
      .single()
    if (invError || !invitation) throw new Error(`could not mint invitation: ${invError?.message}`)

    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'nb-NO' })
    const page = await ctx.newPage()

    // --- an unknown token must not distinguish itself from a closed one -----
    {
      const res = await page.goto(`${BASE_URL}/s/not-a-real-token-at-all`, {
        waitUntil: 'domcontentloaded',
      })
      const body = await page.locator('body').innerText()
      check(
        'unknown token shows the closed screen, HTTP 200',
        res?.status() === 200 && /lukket|closed/i.test(body),
        `HTTP ${res?.status()}`,
      )
      check(
        'closed screen leaks no survey title',
        !body.includes(survey.title),
        `title "${survey.title}" absent`,
      )
    }

    // --- the real flow -----------------------------------------------------
    await page.goto(`${BASE_URL}/s/${raw}`, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('load')

    const heading = await page.locator('h1').first().innerText()
    check('token opens the survey', heading.trim() === survey.title, heading.trim())

    const banner = await page.locator('body').innerText()
    check(
      'anonymity is stated to the respondent',
      /anonyme|anonymt/i.test(banner),
      banner.split('\n').find((l) => /anonym/i.test(l))?.slice(0, 70) ?? '',
    )

    // Answer whatever the round actually asks, one screen at a time.
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i]!
      if (q.type === 'text') {
        await page.locator('textarea').first().fill('Verifiseringssvar')
      } else {
        // Every non-text type renders its choices as buttons inside the card.
        const choice = page.locator('section button[aria-pressed]').first()
        await choice.click()
      }
      const last = i === questions.length - 1
      await page.getByRole('button', { name: last ? 'Send inn svar' : 'Neste' }).click()
      if (!last) await page.waitForTimeout(150)
    }

    // The heading, not the text — a survey's own thank-you copy may also start
    // with "Takk!", and matching loosely made the probe ambiguous rather than
    // wrong.
    await page.locator('.font-display', { hasText: /^Takk!$/ }).waitFor({ timeout: 20_000 })
    check('submission reaches the thank-you screen', true, 'Takk!')

    // --- what actually landed ---------------------------------------------
    const { data: responses } = await svc
      .from('responses')
      .select('id, round_id, invitation_id, anonymity_at_submission, respondent_group_id, lang, submitted_hour')
      .eq('round_id', round.id)
      .order('submitted_hour', { ascending: false })
    const mine = (responses ?? []).filter((r) => r.anonymity_at_submission === 'anonymous')
    check('a response row exists', mine.length > 0, `${mine.length} anonymous row(s) on this round`)

    const linked = mine.filter((r) => r.invitation_id !== null)
    check(
      'no anonymous response carries an invitation_id',
      linked.length === 0,
      `${linked.length} linked row(s) — must be 0`,
    )

    const newest = mine[0]
    const hourTruncated =
      !!newest && new Date(newest.submitted_hour).getUTCMinutes() === 0 &&
      new Date(newest.submitted_hour).getUTCSeconds() === 0
    check('submitted_hour is truncated to the hour', hourTruncated, newest?.submitted_hour ?? '')

    const { data: inv } = await svc
      .from('survey_invitations')
      .select('responded_at')
      .eq('id', invitation.id)
      .single()
    check(
      'participation is recorded on the invitation',
      Boolean(inv?.responded_at),
      `responded_at=${inv?.responded_at ?? 'null'}`,
    )

    // The columns that would carry identity do not exist. Asserting the schema
    // rather than the row is the stronger claim: a future migration that adds
    // one fails this check on an empty table.
    const { error: ipError } = await svc.from('responses').select('ip').limit(1)
    check(
      'responses has no ip column',
      Boolean(ipError),
      ipError?.message.slice(0, 70) ?? 'column exists — invariant broken',
    )
    const { error: uaError } = await svc.from('responses').select('user_agent').limit(1)
    check(
      'responses has no user_agent column',
      Boolean(uaError),
      uaError?.message.slice(0, 70) ?? 'column exists — invariant broken',
    )

    // --- the English path --------------------------------------------------
    // The i18n gate walks administrator routes only, so without this the one
    // surface that actually ships in two languages is the one nobody checks.
    {
      // The SHARE LINK, not the invitation: the invitation has just been used
      // and correctly shows the thank-you screen, which has no language chips
      // and no promise line to check. A share link stays answerable.
      await page.goto(`${BASE_URL}/s/${DEMO_SHARE_TOKEN}?lang=en`, {
        waitUntil: 'domcontentloaded',
      })
      await page.waitForLoadState('load')
      const body = await page.locator('body').innerText()
      // Q31: the chip SHOWS a two-letter code and is NAMED by the language.
      // Both halves, because either alone is the defect — a code with no
      // accessible name announces as "E N", and a chip labelled «English»
      // would have left the drawing. The accessible-name lookup is what
      // changed when the bundle's `aria-label` was adopted; asserting on the
      // text alone would have kept passing while the name was absent.
      const enChip = page.getByRole('link', { name: 'English', exact: true })
      check(
        'a bilingual survey offers a language switch, named by its language',
        (await enChip.count()) > 0 && (await enChip.first().innerText()).trim() === 'EN',
        `chips: ${(await page.locator('a[href^="?lang="]').allInnerTexts()).join('/')} · accessible name: ${
          (await enChip.count()) > 0 ? 'English' : 'MISSING'
        }`,
      )
      check(
        'English chrome renders on ?lang=en',
        /Do you have 90 seconds/i.test(body) && !/Har du 90 sekunder/i.test(body),
        body.split('\n')[0] ?? '',
      )
      check(
        'no raw message key leaks on the respondent page',
        !/respondent\.[a-zA-Z]/.test(body),
        body.match(/respondent\.[a-zA-Z]+/)?.[0] ?? 'none',
      )
    }

    // --- peer results on the thank-you screen ------------------------------
    // The k-gate is the thing under test, so it is exercised in both
    // directions rather than only the passing one.
    {
      const { data: below } = await svc.rpc('get_peer_results', { p_token: DEMO_SHARE_TOKEN })
      const b = (below ?? {}) as { n?: number; insufficient_data?: boolean; buckets?: unknown[] }
      check(
        'peer results are returned above the k threshold',
        (b.n ?? 0) >= 5 && Array.isArray(b.buckets),
        `n=${b.n} buckets=${(b.buckets as unknown[])?.length}`,
      )

      // A round of its OWN, with four responses. The first cut deleted
      // responses from the seeded round to drop it below k — which worked, and
      // then broke the suite's "a survey above the threshold returns real data"
      // test on the next run. A verification script must not leave the database
      // in a state that fails the tests.
      const belowSurvey = await createSurvey(
        ORG_ID.current!,
        `k-gate probe ${Date.now()}`,
        [{ type: 'scale', text: 'Hvordan går det?' }],
        { audience: 'Probe' },
      )
      const belowRound = await createRound(belowSurvey, 4)
      // The token is a fixed constant — the harness cannot look up a value that
      // is only stored hashed — so a run that died before this point leaves the
      // row behind and the NEXT run dies on the unique index instead of
      // reporting whatever actually went wrong. Clearing it first makes the
      // probe idempotent: the survey is new each run, only the token is reused.
      await svc.from('share_links').delete().eq('token_hash', hashToken(BELOW_K_TOKEN))
      await createShareLink(belowRound.id, BELOW_K_TOKEN)
      await submitResponses(
        belowRound.tokens,
        (i) => ({ [belowSurvey.questions[0]!.id]: { value: 3 + (i % 2) } }),
        4, // one short of k
      )

      const { data: gated } = await svc.rpc('get_peer_results', { p_token: BELOW_K_TOKEN })
      const g = (gated ?? {}) as { insufficient_data?: boolean; n?: number; buckets?: unknown }
      check('below k the aggregate is refused', g.insufficient_data === true, JSON.stringify(g))
      check(
        'a refused aggregate leaks no count at all',
        g.n === undefined && g.buckets === undefined,
        `n=${g.n} buckets=${g.buckets}`,
      )

      const { data: unknownTok } = await svc.rpc('get_peer_results', { p_token: 'not-a-real-token' })
      check(
        'peer results refuse an unknown token',
        ((unknownTok ?? {}) as { error?: string }).error === 'not_found',
        JSON.stringify(unknownTok),
      )
    }

    // --- the promise is derived from the threshold, not fixed copy (Q17) ---
    // The whole risk of the threshold-policy change is a banner that promises
    // more than the setting holds. Proving that from SQL says nothing about
    // what the respondent is actually shown, so it is proven here, rendered,
    // as a change case: the same banner slot must say "fem" at k=5 and "tre"
    // at k=3, and only the low threshold carries the small-group caveat.
    {
      async function bannerForThreshold(k: number): Promise<string> {
        const s = await createSurvey(
          ORG_ID.current!,
          `promise probe k=${k} ${Date.now()}`,
          [{ type: 'scale', text: 'Hvordan går det?' }],
          { audience: 'Probe', anonymity: 'anonymous' },
        )
        // Fresh and unlocked, so the policy guard permits the threshold move;
        // service role runs as backend (auth.uid() null), skipping the
        // redaktor/audit branch. Set before any round exists — send_round is
        // what locks a survey, and this survey never gets one.
        const { error: setErr } = await svc.from('surveys').update({ k_threshold: k }).eq('id', s.id)
        if (setErr) throw new Error(`set k_threshold=${k}: ${setErr.message}`)
        const probeToken = `verify-promise-k${k}-${randomBytes(8).toString('hex')}`
        await createShareLink((await createRound(s, 1)).id, probeToken)
        await page.goto(`${BASE_URL}/s/${probeToken}`, { waitUntil: 'domcontentloaded' })
        await page.waitForLoadState('load')
        return page.locator('body').innerText()
      }

      const atFive = await bannerForThreshold(5)
      const atThree = await bannerForThreshold(3)

      check(
        'k=5 banner promises the threshold in words ("fem")',
        /minst fem/i.test(atFive) && !/små grupper/i.test(atFive),
        atFive.split('\n').find((l) => /minst/i.test(l))?.slice(0, 70) ?? '',
      )
      check(
        'k=3 banner tracks the changed threshold ("tre")',
        /minst tre/i.test(atThree) && !/minst fem/i.test(atThree),
        atThree.split('\n').find((l) => /minst/i.test(l))?.slice(0, 70) ?? '',
      )
      check(
        'the low threshold adds the small-group caveat',
        /små grupper/i.test(atThree),
        atThree.split('\n').find((l) => /gjenkjennelig/i.test(l))?.slice(0, 70) ?? '',
      )

      /*
        DECISIONS Q91 — k=2 IS ITS OWN TIER, CHECKED IN THE BROWSER BECAUSE THAT
        IS WHERE IT WENT WRONG.

        "The promise is derived, so it follows automatically" was true and
        insufficient. Before the third tier existed, k=2 fell into
        `promiseAnonymousLow` and this very banner read «I små grupper kan svar
        likevel være gjenkjennelige» — a caveat about RECOGNISABILITY at a
        threshold where the other respondent can DERIVE the answer by
        subtraction. The function was working correctly; the boundary was in the
        wrong place. So the assertion here is two-sided: the arithmetic must be
        said, and the softer caveat must be ABSENT — a one-sided check would
        have passed on the old copy the moment the new sentence was appended.
      */
      const atTwo = await bannerForThreshold(2)
      check(
        'k=2 states the arithmetic — the other respondent can work it out',
        /regne seg fram/i.test(atTwo),
        atTwo.split('\n').find((l) => /regne seg fram/i.test(l))?.slice(0, 90) ?? '',
      )
      check(
        'k=2 does NOT carry the softer «gjenkjennelig» caveat',
        !/gjenkjennelig/i.test(atTwo),
        atTwo.split('\n').find((l) => /gjenkjennelig/i.test(l))?.slice(0, 70) ?? '(absent)',
      )
    }

    // --- the token is single-use for an invited respondent -----------------
    {
      await page.goto(`${BASE_URL}/s/${raw}`, { waitUntil: 'domcontentloaded' })
      await page.waitForLoadState('load')
      const body = await page.locator('body').innerText()
      const reAnswerable = await page.getByRole('button', { name: 'Send inn svar' }).count()
      check(
        'replaying the token cannot answer twice',
        /Takk!/i.test(body) && reAnswerable === 0,
        `submit buttons on replay: ${reAnswerable}`,
      )
    }

    await ctx.close()
  } finally {
    await browser.close()
    server.stop()
  }

  console.log(failures === 0 ? '\nrespondent flow verified' : `\n${failures} check(s) failed`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack : e)
  process.exit(1)
})
