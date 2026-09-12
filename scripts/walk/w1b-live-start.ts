import { open, ensureServer, BASE_URL, report, psql, one } from './drive'

const S = '27eafab6-f41f-4ef9-bc54-0315c27d9235'

async function main() {
  const srv = await ensureServer()
  const { browser, page, obs } = await open('administrator')
  try {
    await page.goto(`${BASE_URL}/undersokelser/${S}/live`, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle').catch(() => {})

    const before = one(`select count(*) from live_sessions where survey_id='${S}'`)
    console.log('live_sessions before:', before)
    obs.length = 0

    console.log('\nACTION — click «Start live»')
    const btn = page.getByRole('button', { name: /^(Start live|Start)/ })
    console.log('  buttons matching:', await btn.count())
    if (!(await btn.count())) {
      console.log('  all buttons:', (await page.locator('button').allTextContents()).map(t=>t.trim()).filter(Boolean).join(' | '))
      throw new Error('no Start live button')
    }
    await btn.first().click()
    await page.waitForTimeout(4000)
    await page.waitForLoadState('networkidle').catch(() => {})

    console.log('  url after:', page.url())
    const after = one(`select count(*) from live_sessions where survey_id='${S}'`)
    console.log('  live_sessions after :', after, before === after ? '  <-- NO WRITE' : '  <-- wrote')
    console.log('  rows:')
    for (const r of psql(`select id, status, opened_at, code, revealed from live_sessions where survey_id='${S}' order by opened_at desc limit 3`)) console.log('   ', r.join(' | '))

    const text = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
    // the error surface: Next renders a digest string in prod on an action throw
    for (const pat of [/En feil[^.]*\./i, /noe gikk galt[^.]*\./i, /error/i, /Application error/i, /digest/i]) {
      const m = text.match(pat)
      if (m) console.log('  ERROR TEXT ON PAGE:', m[0])
    }
    console.log('  body (900):', text.slice(0, 900))
    report('start live', obs)
  } finally {
    await page.screenshot({ path: 'docs/walk/shots/w1b-live-start.png', fullPage: true }).catch(() => {})
    await browser.close()
    if (srv.started) srv.stop()
  }
}
main().catch((e) => { console.error('WALK FAILED:', e); process.exit(1) })
