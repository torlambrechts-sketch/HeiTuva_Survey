import { open, ensureServer, BASE_URL } from './drive'
async function main(){
  const srv=await ensureServer(); const L=console.log
  const {browser,page}=await open('administrator')
  try{
    for(const r of ['/administrasjon','/administrasjon/personvern','/administrasjon/brukere','/administrasjon/valg']){
      await page.goto(`${BASE_URL}${r}`,{waitUntil:'domcontentloaded'}); await page.waitForLoadState('networkidle').catch(()=>{})
      L(`\n### ${r}`)
      const ctrls=await page.locator('main select, main input, main button[role=switch], main textarea').evaluateAll(els=>els.map(e=>{
        const t=e.tagName.toLowerCase()
        const name=(e as HTMLInputElement).name||''
        const al=e.getAttribute('aria-label')||''
        const id=e.id||''
        const lbl=id?(document.querySelector(`label[for="${id}"]`)?.textContent||'').replace(/\s+/g,' ').trim():''
        const opts=t==='select'?Array.from((e as HTMLSelectElement).options).map(o=>o.value).slice(0,5).join('/'):''
        const type=(e as HTMLInputElement).type||''
        return `${t}${type?'['+type+']':''} name=${JSON.stringify(name)} label=${JSON.stringify(lbl||al)} ${opts?'opts='+opts:''}`
      }))
      for(const c of ctrls.slice(0,22)) L(`   ${c}`)
      if(ctrls.length>22) L(`   … ${ctrls.length-22} more`)
    }
  } finally { await browser.close(); if(srv.started)srv.stop() }
}
main().catch(e=>{console.error('FAILED:',e);process.exit(1)})
