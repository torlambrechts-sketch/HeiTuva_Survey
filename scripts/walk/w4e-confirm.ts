import { open, ensureServer, BASE_URL, report, psql, one } from './drive'
async function main(){
  const srv = await ensureServer(); const { browser, page, obs } = await open('administrator'); const L=console.log
  try{
    await page.goto(`${BASE_URL}/oppgaver`,{waitUntil:'domcontentloaded'}); await page.waitForLoadState('networkidle').catch(()=>{}); obs.length=0
    const t = psql(`select id,title,status from tasks where status='effektvurdert' order by created_at limit 1`)[0]!
    L(`Q97 confirmation — "${t[1]!.slice(0,40)}" (${t[2]})`)
    await page.locator('button[aria-expanded]').filter({hasText:t[1]!.slice(0,24)}).first().click(); await page.waitForTimeout(1200)
    await page.getByRole('button',{name:/^Flytt til Lukket$/}).first().click(); await page.waitForTimeout(1200)
    const dlg=(await page.locator('main').innerText()).replace(/\s+/g,' ')
    const m=dlg.match(/Lukk oppgaven[^|]{0,220}/); L(`  dialog: ${m?m[0].trim():'(none)'}`)
    L(`  status while dialog open: ${one(`select status from tasks where id='${t[0]}'`)}`)
    await page.getByRole('button',{name:/^Ja, lukk oppgaven$/}).first().click(); await page.waitForTimeout(3000)
    const after=one(`select status from tasks where id='${t[0]}'`)
    L(`  after confirming: ${after}${after==='lukket'?'   <-- wrote (closed, with its effect assessment present)':'   <-- NO WRITE'}`)
    L(`  effect assessments for it: ${one(`select count(*) from task_effect_assessments where task_id='${t[0]}'`)}`)
    report('Q97 confirm', obs)

    // and a task WITHOUT an effect assessment must be refused by the database
    L(`\nQ69 — close a task that has no effect assessment`)
    const t2 = psql(`select id,title,status from tasks where status='gjennomfort' order by created_at limit 1`)[0]
    if(!t2){L('  no gjennomfort task — state not reachable from this seed')}
    else{
      L(`  task "${t2[1]!.slice(0,40)}" (${t2[2]}), assessments=${one(`select count(*) from task_effect_assessments where task_id='${t2[0]}'`)}`)
      await page.locator('button[aria-expanded]').filter({hasText:t2[1]!.slice(0,24)}).first().click(); await page.waitForTimeout(1200)
      const adv=page.getByRole('button',{name:/^Flytt til /}); L(`  «Flytt til …»: ${await adv.count()} -> ${(await adv.first().textContent().catch(()=>''))?.trim()}`)
      if(await adv.count()){await adv.first().click(); await page.waitForTimeout(2500)}
      L(`  status: ${one(`select status from tasks where id='${t2[0]}'`)}`)
      const txt=(await page.locator('main').innerText()).replace(/\s+/g,' '); const e=txt.match(/[^.]*effektvurder[^.]*\./i); if(e)L(`  copy: ${e[0].trim()}`)
    }
    report('Q69', obs)
  } finally { await browser.close(); if(srv.started)srv.stop() }
}
main().catch(e=>{console.error('FAILED:',e);process.exit(1)})
