import { open, ensureServer, BASE_URL, report, one } from './drive'
async function main(){
  const srv=await ensureServer(); const L=console.log
  const {browser,page,obs}=await open('administrator')
  const ORG=one(`select id from organizations where name='Nordisk Studio'`)
  const col=(c:string)=>one(`select ${c}::text from organizations where id='${ORG}'`)
  try{
    for(const how of ['nav-link','browser-back'] as const){
      await page.goto(`${BASE_URL}/administrasjon`,{waitUntil:'domcontentloaded'}); await page.waitForLoadState('networkidle').catch(()=>{}); obs.length=0
      const sel=page.locator('select[name=worklist_view]')
      const b=col('worklist_view')
      await sel.focus(); await sel.selectOption(b==='list'?'board':'list')
      L(`\n${how}: worklist_view=${b}, select now=${await sel.inputValue()}`)
      if(how==='nav-link'){
        const link=page.getByRole('link',{name:/^Oversikt$/}).first()
        L(`   clicking the «Oversikt» nav link (soft navigation)`)
        await link.click()
      } else {
        await page.goto(`${BASE_URL}/oversikt`,{waitUntil:'domcontentloaded'})
      }
      await page.waitForTimeout(4000)
      const a=col('worklist_view')
      L(`   worklist_view ${b} -> ${a}${b===a?'   <-- SILENTLY LOST':'   <-- saved on the way out'}`)
      report(how, obs)
    }
  } finally { await browser.close(); if(srv.started)srv.stop() }
}
main().catch(e=>{console.error('FAILED:',e);process.exit(1)})
