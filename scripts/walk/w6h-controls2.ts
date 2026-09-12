import { open, ensureServer, BASE_URL } from './drive'
async function main(){
  const srv=await ensureServer(); const L=console.log
  const {browser,page}=await open('administrator')
  try{
    for(const r of ['/administrasjon/grupper','/administrasjon/personvern']){
      await page.goto(`${BASE_URL}${r}`,{waitUntil:'domcontentloaded'}); await page.waitForLoadState('networkidle').catch(()=>{})
      L(`\n### ${r}`)
      const all=await page.locator('main button, main input, main select, main textarea, main a').evaluateAll(els=>els.map(e=>{
        const t=e.tagName.toLowerCase(); const ty=(e as HTMLInputElement).type||''
        const txt=(e.textContent||'').replace(/\s+/g,' ').trim().slice(0,34)
        const al=e.getAttribute('aria-label')||''
        return `${t}${ty?'['+ty+']':''} ${JSON.stringify(txt||al)}`
      }))
      for(const c of [...new Set(all)].slice(0,26)) L(`   ${c}`)
      L(`   --- first 400 chars of the page:`)
      L(`   ${(await page.locator('main').innerText()).replace(/\s+/g,' ').slice(0,400)}`)
    }
  } finally { await browser.close(); if(srv.started)srv.stop() }
}
main().catch(e=>{console.error('FAILED:',e);process.exit(1)})
