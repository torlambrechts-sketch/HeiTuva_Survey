import { open, ensureServer, BASE_URL, report, psql, one } from './drive'

async function main() {
  const srv = await ensureServer()
  const { browser, page, obs } = await open('administrator')
  const log = (s: string) => console.log(s)
  try {
    await page.goto(`${BASE_URL}/oppgaver`, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle').catch(() => {})
    obs.length = 0

    const disc = page.locator('button[aria-expanded]')
    log(`rows with a disclosure button: ${await disc.count()}`)

    // ---- ACTION: advanceTask on a task that may legally advance
    const t1 = psql(`select id, title, status from tasks where status='pagar' order by created_at limit 1`)[0]!
    if (!t1) throw new Error('no pagar task')
    log(`\nACTION advanceTask — "${t1[1]!.slice(0,48)}" status=${t1[2]}`)
    // open the row whose text contains the title
    const rowBtn = page.locator('button[aria-expanded]').filter({ hasText: t1[1]!.slice(0, 24) })
    log(`  disclosure matching the title: ${await rowBtn.count()}`)
    const target = (await rowBtn.count()) ? rowBtn.first() : disc.first()
    await target.click(); await page.waitForTimeout(1200)
    const step = page.getByRole('button', { name: /Flytt ett steg/i })
    log(`  «Flytt ett steg»: ${await step.count()}`)
    if (await step.count()) { await step.first().click(); await page.waitForTimeout(3000) }
    const after1 = one(`select status from tasks where id='${t1[0]}'`)
    log(`  status ${t1[2]} -> ${after1}${t1[2] === after1 ? '   <-- NO WRITE' : '   <-- wrote'}`)
    report('advanceTask', obs); obs.length = 0

    // ---- Q158: the step INTO lukket must be refused from the UI
    const t2 = psql(`select id, title, status from tasks where status='effektvurdert' order by created_at limit 1`)[0]
    log(`\nQ158 — a task at effektvurdert must NOT be closable by «Flytt ett steg»`)
    if (!t2) { log('  no effektvurdert task seeded — cannot reach this state (finding)') }
    else {
      log(`  task: "${t2[1]!.slice(0,48)}" status=${t2[2]}`)
      const rb = page.locator('button[aria-expanded]').filter({ hasText: t2[1]!.slice(0, 24) })
      log(`  disclosure matching: ${await rb.count()}`)
      if (await rb.count()) {
        await rb.first().click(); await page.waitForTimeout(1200)
        const s2 = page.getByRole('button', { name: /Flytt ett steg/i })
        log(`  «Flytt ett steg» present on an effektvurdert row: ${await s2.count()}  (0 = refused in the UI)`)
        if (await s2.count()) {
          await s2.first().click(); await page.waitForTimeout(2500)
          const st = one(`select status from tasks where id='${t2[0]}'`)
          log(`  status after pressing it: ${st}  ${st === 'lukket' ? '!! CLOSED IN BULK-FREE PATH — Q158 BREACHED' : '(unchanged — refused)'}`)
          const err = (await page.locator('main').innerText()).replace(/\s+/g,' ')
          const m = err.match(/[^.]*effektvurder[^.]*\./i); if (m) log(`  refusal copy: ${m[0].trim()}`)
        }
      }
    }
    report('Q158', obs); obs.length = 0

    // ---- ACTION: addWorklistNote
    const nb = one('select count(*) from worklist_notes')
    log(`\nACTION addWorklistNote — notes before: ${nb}`)
    const noteBox = page.getByRole('textbox', { name: /notat|Interne/i })
    const anyTa = page.locator('textarea')
    log(`  note textboxes: ${await noteBox.count()}  (any textarea: ${await anyTa.count()})`)
    const box = (await noteBox.count()) ? noteBox.first() : anyTa.first()
    if (await box.count()) {
      await box.fill('Walk note ' + Date.now())
      const save = page.getByRole('button', { name: /Lagre notat|Lagre|Legg til/i })
      log(`  save buttons: ${await save.count()}`)
      if (await save.count()) { await save.first().click(); await page.waitForTimeout(3000) }
    }
    const na = one('select count(*) from worklist_notes')
    log(`  notes after : ${na}${nb === na ? '   <-- NO WRITE' : '   <-- wrote'}`)
    report('addWorklistNote', obs); obs.length = 0

    // ---- the bulk bar: «Lukk valgte» must NOT exist (Tor's decision)
    log(`\nBULK BAR — select a row and read the actions offered`)
    const sel = page.getByRole('checkbox').or(page.locator('input[type=checkbox]'))
    log(`  checkboxes: ${await sel.count()}`)
    if (await sel.count()) { await sel.nth(1).check({ force: true }).catch(()=>{}); await page.waitForTimeout(1200) }
    const bodyTxt = (await page.locator('main').innerText()).replace(/\s+/g,' ')
    log(`  «Lukk valgte» present: ${/Lukk valgte/.test(bodyTxt)}  (false = as decided)`)
    const bulk = bodyTxt.match(/valgt[^|]{0,160}/i); if (bulk) log(`  bulk bar text: ${bulk[0].trim()}`)
    report('bulk bar', obs)
  } finally {
    await page.screenshot({ path: 'docs/walk/shots/w4c-worklist.png', fullPage: true }).catch(()=>{})
    await browser.close(); if (srv.started) srv.stop()
  }
}
main().catch((e)=>{console.error('WALK FAILED:', e); process.exit(1)})
