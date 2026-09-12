import { open, ensureServer, BASE_URL, report, one } from './drive'

async function main() {
  const srv = await ensureServer()
  const { browser, page, obs } = await open('administrator')
  try {
    await page.goto(`${BASE_URL}/oppgaver`, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle').catch(() => {})
    console.log('url:', page.url())
    report('oppgaver load', obs); obs.length = 0

    console.log('\nvisible text (1200):', (await page.locator('main').innerText()).replace(/\s+/g,' ').slice(0,1200))

    // open the first row so its controls are reachable
    const chev = page.getByRole('button', { name: /Vis|Åpne|detaljer|rad/i })
    console.log('\nrow-opening buttons:', await chev.count())

    // ACTION: the note form — addWorklistNote
    const notesBefore = one('select count(*) from worklist_notes')
    console.log('worklist_notes before:', notesBefore)

    if (await chev.count()) { await chev.first().click(); await page.waitForTimeout(1200) }
    const ta = page.locator('textarea')
    console.log('textareas after opening a row:', await ta.count())
    if (await ta.count()) {
      await ta.first().fill('Walk-note ' + Date.now())
      const save = page.getByRole('button', { name: /Lagre|Legg til|Send/i })
      console.log('save-ish buttons:', await save.count())
      if (await save.count()) { await save.first().click(); await page.waitForTimeout(3000) }
    }
    const notesAfter = one('select count(*) from worklist_notes')
    console.log('worklist_notes after :', notesAfter, notesBefore === notesAfter ? ' <-- NO WRITE' : ' <-- wrote')
    const txt = (await page.locator('body').innerText()).replace(/\s+/g,' ')
    if (/Application error|server-side exception/i.test(txt)) console.log('!! ERROR PAGE:', txt.slice(0,200))
    report('note action', obs)
  } finally {
    await page.screenshot({ path: 'docs/walk/shots/w4-worklist.png', fullPage: true }).catch(()=>{})
    await browser.close(); if (srv.started) srv.stop()
  }
}
main().catch((e)=>{console.error('WALK FAILED:', e); process.exit(1)})
