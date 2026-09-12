import { open, ensureServer, BASE_URL } from './drive'
async function main(){
  const srv=await ensureServer(); const L=console.log
  const {browser,page}=await open('administrator')
  try{
    for(const r of ['/rapporter','/rapporter?fane=lov']){
      await page.goto(`${BASE_URL}${r}`,{waitUntil:'domcontentloaded'}); await page.waitForLoadState('networkidle').catch(()=>{})
      L(`\n### ${r}`)
      const c=await page.locator('button, a[href], select, input').evaluateAll(e=>e.map(x=>`${x.tagName.toLowerCase()} ${JSON.stringify((x.textContent||'').replace(/\s+/g,' ').trim().slice(0,30)||x.getAttribute('aria-label')||'')}`))
      L(`   ${[...new Set(c)].join('  ').slice(0,800)}`)
      L(`   text: ${(await page.locator('body').innerText()).replace(/\s+/g,' ').slice(0,300)}`)
    }
  } finally { await browser.close(); if(srv.started)srv.stop() }
}
main().catch(e=>{console.error('FAILED:',e);process.exit(1)})
