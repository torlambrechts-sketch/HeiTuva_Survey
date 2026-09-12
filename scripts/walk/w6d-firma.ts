import { open, ensureServer, BASE_URL, report, one } from './drive'
async function main(){
  const srv=await ensureServer(); const L=console.log
  const {browser,page,obs}=await open('administrator')
  const ORG=one(`select id from organizations where name='Nordisk Studio'`)
  const col=(c:string)=>one(`select ${c}::text from organizations where id='${ORG}'`)
  try{
    await page.goto(`${BASE_URL}/administrasjon`,{waitUntil:'domcontentloaded'}); await page.waitForLoadState('networkidle').catch(()=>{}); obs.length=0
    L('A. change worklist_view, then move focus OUT of the card (what a user does)')
    let b=col('worklist_view')
    await page.locator('select[name=worklist_view]').selectOption(b==='list'?'board':'list')
    await page.locator('h1').first().click()          // focus leaves the form card
    await page.waitForTimeout(3500)
    L(`   worklist_view ${b} -> ${col('worklist_view')}${b===col('worklist_view')?'   <-- NO WRITE':'   <-- wrote'}`)
    L(`   «Lagret» chip: ${/Lagret/.test((await page.locator('body').innerText()))}`)
    report('blur save', obs); obs.length=0

    L('\nB. change a text field and press Enter (the form onSubmit path)')
    b=col('dpo')
    const dpo=page.locator('input[name=dpo]')
    await dpo.fill('Walk DPO '+Date.now()%1000); await dpo.press('Enter'); await page.waitForTimeout(3000)
    L(`   dpo "${b}" -> "${col('dpo')}"${b===col('dpo')?'   <-- NO WRITE':'   <-- wrote'}`)
    report('enter save', obs); obs.length=0

    L('\nC. change timezone and navigate away WITHOUT blurring first')
    b=col('timezone')
    await page.locator('select[name=timezone]').selectOption(b==='Europe/Oslo'?'Europe/Stockholm':'Europe/Oslo')
    await page.goto(`${BASE_URL}/oversikt`,{waitUntil:'domcontentloaded'}); await page.waitForTimeout(2500)
    L(`   timezone ${b} -> ${col('timezone')}${b===col('timezone')?'   <-- LOST (navigated before blur)':'   <-- saved'}`)
    report('navigate away', obs)
  } finally { await browser.close(); if(srv.started)srv.stop() }
}
main().catch(e=>{console.error('FAILED:',e);process.exit(1)})
