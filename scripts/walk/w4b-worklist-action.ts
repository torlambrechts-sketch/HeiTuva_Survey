import { open, ensureServer, BASE_URL, report, psql, one } from './drive'

async function main() {
  const srv = await ensureServer()
  const { browser, page, obs } = await open('administrator')
  try {
    await page.goto(`${BASE_URL}/oppgaver`, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle').catch(() => {})
    obs.length = 0

    // ACTION A — setWorklistView (writes the heituva.worklist cookie)
    const ck = async () => (await page.context().cookies()).find((c) => c.name === 'heituva.worklist')?.value ?? '(none)'
    console.log('ACTION A — «Tavle».  cookie before:', await ck())
    const tavle = page.getByRole('button', { name: /^Tavle$/ })
    console.log('  matches:', await tavle.count())
    await tavle.first().click()
    await page.waitForTimeout(2500)
    console.log('  cookie after :', await ck())
    console.log('  board columns visible:', await page.getByText(/Til effektvurdering/i).count())
    report('Tavle', obs); obs.length = 0

    // ACTION B — advanceTask: a real row write. Pick a task NOT at lukket/effektvurdert.
    const row = psql(`select id, title, status from tasks where status in ('foreslatt','besluttet','pagar') order by created_at limit 1`)[0]
    if (!row) throw new Error('no advanceable task seeded')
    console.log('\nACTION B — advance one step on:', row?.join(' | '))
    await page.getByRole('button', { name: /^Liste$/ }).click()
    await page.waitForTimeout(2000)

    const title = row[1]
    const before = one(`select status from tasks where id='${row[0]}'`)
    // open that row
    const chev = page.getByRole('button', { name: new RegExp('Vis|detaljer', 'i') })
    // the chevron that belongs to this row
    const own = page.locator(`[aria-label*="${title}"]`)
    console.log('  aria-labelled controls for this row:', await own.count())
    const cand = (await own.count()) ? own : chev
    if (await cand.count()) { await cand.first().click(); await page.waitForTimeout(1500) }

    const step = page.getByRole('button', { name: /Flytt ett steg|ett steg/i })
    console.log('  «Flytt ett steg» buttons:', await step.count())
    if (await step.count()) { await step.first().click(); await page.waitForTimeout(3000) }
    const after = one(`select status from tasks where id='${row[0]}'`)
    console.log('  status', before, '->', after, before === after ? ' <-- NO WRITE' : ' <-- wrote')
    const txt = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
    if (/Application error|server-side exception/i.test(txt)) console.log('  !! ERROR PAGE:', txt.slice(0, 240))
    report('advance', obs)
  } finally {
    await page.screenshot({ path: 'docs/walk/shots/w4b-worklist.png', fullPage: true }).catch(() => {})
    await browser.close(); if (srv.started) srv.stop()
  }
}
main().catch((e) => { console.error('WALK FAILED:', e); process.exit(1) })
