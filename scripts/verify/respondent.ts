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
import { DEMO_SHARE_TOKEN } from '../../tests/db/personas'

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
    const { data: round } = await svc
      .from('survey_rounds')
      .select('id, survey_id, question_snapshot, surveys(title, anonymity)')
      .eq('status', 'open')
      .order('created_at')
      .limit(1)
      .single()
    if (!round) throw new Error('no open round seeded')

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
      check(
        'a bilingual survey offers a language switch',
        (await page.getByRole('link', { name: 'EN' }).count()) > 0,
        `chips: ${(await page.locator('a[href^="?lang="]').allInnerTexts()).join('/')}`,
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
