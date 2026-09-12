import { open, ensureServer, BASE_URL, report, psql, one } from './drive'

async function main() {
  const srv = await ensureServer()
  const { browser, page, obs } = await open('administrator')
  const L = console.log
  try {
    await page.goto(`${BASE_URL}/oppgaver`, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle').catch(() => {}); obs.length = 0

    // 1 — per-row advance, «Flytt til X»
    const t1 = psql(`select id, title, status from tasks where status='pagar' order by created_at limit 1`)[0]!
    L(`1. advanceTask — "${t1[1]!.slice(0,40)}" (${t1[2]})`)
    const rb = page.locator('button[aria-expanded]').filter({ hasText: t1[1]!.slice(0,24) }).first()
    await rb.click(); await page.waitForTimeout(1200)
    const adv = page.getByRole('button', { name: /^Flytt til / })
    L(`   «Flytt til …» buttons: ${await adv.count()}  ${await adv.count() ? '-> ' + (await adv.first().textContent())?.trim() : ''}`)
    if (await adv.count()) { await adv.first().click(); await page.waitForTimeout(3000) }
    const a1 = one(`select status from tasks where id='${t1[0]}'`)
    L(`   status ${t1[2]} -> ${a1}${t1[2] === a1 ? '   <-- NO WRITE' : '   <-- wrote'}`)
    report('advanceTask', obs); obs.length = 0

    // 2 — Q158 on the real control: an effektvurdert row must not offer a step into lukket
    const t2 = psql(`select id, title, status from tasks where status='effektvurdert' order by created_at limit 1`)[0]!
    L(`\n2. Q158 — "${t2[1]!.slice(0,40)}" (${t2[2]})`)
    const rb2 = page.locator('button[aria-expanded]').filter({ hasText: t2[1]!.slice(0,24) }).first()
    await rb2.click(); await page.waitForTimeout(1200)
    const adv2 = page.getByRole('button', { name: /^Flytt til / })
    const n2 = await adv2.count()
    L(`   «Flytt til …» offered: ${n2}${n2 ? ' -> ' + (await adv2.first().textContent())?.trim() : '  (absent = the step into Lukket is refused)'}`)
    if (n2) {
      await adv2.first().click(); await page.waitForTimeout(2500)
      const st = one(`select status from tasks where id='${t2[0]}'`)
      L(`   status after: ${st}${st === 'lukket' ? '   !! Q158 BREACHED — closed without an effect assessment step' : '   (refused)'}`)
    }
    report('Q158', obs); obs.length = 0

    // 3 — the bulk bar
    L(`\n3. bulk bar — select rows with «Velg raden»`)
    const sel = page.getByRole('button', { name: 'Velg raden' }).or(page.getByLabel('Velg raden'))
    L(`   row selectors: ${await sel.count()}`)
    if (await sel.count()) { await sel.nth(0).click(); await page.waitForTimeout(1000); await sel.nth(1).click(); await page.waitForTimeout(1500) }
    const txt = (await page.locator('main').innerText()).replace(/\s+/g,' ')
    const actions = ['Flytt ett steg','Tildel','Sett frist','Lukk valgte']
    for (const a of actions) L(`   «${a}»: ${txt.includes(a)}`)
    const btns = await page.locator('main button').evaluateAll(e=>e.map(b=>(b.textContent||'').replace(/\s+/g,' ').trim()).filter(t=>t&&t.length<30))
    L(`   buttons now: ${[...new Set(btns)].join(' | ').slice(0,300)}`)
    report('bulk bar', obs)
  } finally {
    await page.screenshot({ path: 'docs/walk/shots/w4d.png', fullPage: true }).catch(()=>{})
    await browser.close(); if (srv.started) srv.stop()
  }
}
main().catch(e=>{console.error('WALK FAILED:',e);process.exit(1)})
