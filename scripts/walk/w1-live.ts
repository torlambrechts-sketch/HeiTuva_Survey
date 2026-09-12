import { open, ensureServer, BASE_URL, report, psql } from './drive'

const LIVE_SURVEY = '27eafab6-f41f-4ef9-bc54-0315c27d9235' // Arbeidsmiljø — månedlig, run_mode=live

async function main() {
  const srv = await ensureServer()
  const { browser, page, obs } = await open('administrator')
  try {
    console.log('STEP 1 — open the survey page as a user would (not a deep link)')
    await page.goto(`${BASE_URL}/undersokelser/${LIVE_SURVEY}`, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle').catch(() => {})
    console.log('  url:', page.url())
    console.log('  h1 :', (await page.locator('h1').first().textContent().catch(() => null))?.trim())
    report('survey page', obs)
    obs.length = 0

    console.log('STEP 2 — is the «Kjør live» control present?')
    const live = page.getByRole('link', { name: /^(Kjør live|Run live)$/ })
    const n = await live.count()
    console.log('  «Kjør live» links found:', n)
    if (!n) {
      const all = await page.locator('a,button').allTextContents()
      console.log('  controls on page:', all.map((t) => t.trim()).filter(Boolean).slice(0, 40).join(' | '))
      throw new Error('no «Kjør live» control — cannot reach Live as a user')
    }

    console.log('STEP 3 — click it')
    await live.first().click()
    await page.waitForURL((u) => u.pathname.endsWith('/live'), { timeout: 15000 }).catch((e) => {
      console.log('  !! did not reach /live:', String(e).split('\n')[0])
    })
    await page.waitForLoadState('networkidle').catch(() => {})
    console.log('  url:', page.url())
    const body = (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 900)
    console.log('  visible text:', body)
    report('live page', obs)
  } finally {
    const shot = 'docs/walk/shots/w1-live.png'
    await page.screenshot({ path: shot, fullPage: true }).catch(() => {})
    console.log('  screenshot:', shot)
    await browser.close()
    if (srv.started) srv.stop()
  }
  console.log('--- live_sessions rows now:')
  console.log(psql('select id, survey_id, status, opened_at, closed_at from live_sessions order by opened_at').map((r) => r.join(' | ')).join('\n') || '  (none)')
}
main().catch((e) => { console.error('WALK FAILED:', e); process.exit(1) })
