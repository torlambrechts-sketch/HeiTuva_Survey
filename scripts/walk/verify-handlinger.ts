import { open, ensureServer, BASE_URL } from './drive'
async function main(){
  const srv=await ensureServer(); const L=console.log
  const {browser,page}=await open('administrator')
  try{
    await page.goto(`${BASE_URL}/oppgaver`,{waitUntil:'domcontentloaded'}); await page.waitForLoadState('networkidle').catch(()=>{})
    const h1=()=>page.locator('h1').first().innerText()
    const crumb=async()=>(await page.locator('body').innerText()).replace(/\s+/g,' ')

    L('1. the nav label and the surface name')
    const nav=await page.locator('nav').first().innerText().catch(()=>'')
    L(`   nav items: ${nav.replace(/\s+/g,' | ')}`)
    const b=await crumb()
    L(`   «Oppgaver og tilbakemeldinger» anywhere on the page: ${b.includes('Oppgaver og tilbakemeldinger')}  (false = renamed)`)
    L(`   breadcrumb «Handlinger»: ${/Oversikt → Handlinger|Oversikt Handlinger/.test(b)}`)
    L(`   footer link «Handlinger»: ${b.includes('Handlinger')}`)

    L('\n2. the heading under each type filter')
    // The type filter is the SUBNAV (AppSubnav), a rail of LINKS carrying
    // ?type=, not buttons inside the card. The scope rail inside the card is a
    // different control.
    for (const [url,label,expected] of [
      ['/oppgaver','Alt','Handlinger'],
      ['/oppgaver?type=oppgaver','Oppgaver','Oppgaver'],
      ['/oppgaver?type=tilbakemeldinger','Tilbakemeldinger','Tilbakemeldinger'],
    ] as const){
      await page.goto(`${BASE_URL}${url}`,{waitUntil:'domcontentloaded'}); await page.waitForLoadState('networkidle').catch(()=>{})
      const got=(await h1()).trim()
      const current=await page.locator('[aria-current="page"]').allTextContents()
      L(`   «${label}» -> h1 «${got}»   ${got===expected?'CORRECT':'!! expected «'+expected+'»'}   aria-current: ${current.map(x=>x.trim()).join(',')}`)
    }

    L('\n3. English')
    await page.goto(`${BASE_URL}/oppgaver?lang=en`,{waitUntil:'domcontentloaded'}).catch(()=>{})
    await page.waitForTimeout(800)
    L(`   h1 now: «${(await h1()).trim()}»`)
  } finally { await page.screenshot({path:'docs/walk/shots/handlinger.png',fullPage:true}).catch(()=>{}); await browser.close(); if(srv.started)srv.stop() }
}
main().catch(e=>{console.error('FAILED:',e);process.exit(1)})
