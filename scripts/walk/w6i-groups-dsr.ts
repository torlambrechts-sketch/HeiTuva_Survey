import { open, ensureServer, BASE_URL, report, psql, one } from './drive'
async function main(){
  const srv=await ensureServer(); const L=console.log
  const {browser,page,obs}=await open('administrator')
  const ORG=one(`select id from organizations where name='Nordisk Studio'`)
  try{
    L('1. GRUPPER — createGroup («Ny gruppe» + «Opprett»)')
    await page.goto(`${BASE_URL}/administrasjon/grupper`,{waitUntil:'domcontentloaded'}); await page.waitForLoadState('networkidle').catch(()=>{}); obs.length=0
    const gB=Number(one(`select count(*) from groups where org_id='${ORG}'`))
    const name='Walk gruppe '+(Date.now()%10000)
    await page.getByPlaceholder('Ny gruppe').or(page.getByRole('textbox')).first().fill(name)
    await page.getByRole('button',{name:'Opprett'}).click(); await page.waitForTimeout(4000)
    const gA=Number(one(`select count(*) from groups where org_id='${ORG}'`))
    L(`   groups ${gB} -> ${gA}${gB===gA?'   <-- NO WRITE':'   <-- wrote'}`)
    L(`   it is on screen: ${(await page.locator('main').innerText()).includes(name)}`)
    report('createGroup', obs); obs.length=0

    L('\n2. GRUPPER — deleteGroup (the «×» on that row)')
    if(gA>gB){
      const row=page.locator('li,div').filter({hasText:name}).last()
      const x=row.getByRole('button',{name:'×'})
      L(`   «×» on the new row: ${await x.count()}`)
      if(await x.count()){
        await x.first().click(); await page.waitForTimeout(1500)
        const t=(await page.locator('main').innerText()).replace(/\s+/g,' ')
        const conf=t.match(/Slett[^.]{0,120}\./); L(`   confirmation: ${conf?conf[0]:'(none — deleted directly)'}`)
        const yes=page.getByRole('button',{name:/^(Ja|Slett|Bekreft)/})
        if(await yes.count()){ await yes.last().click(); await page.waitForTimeout(3500) }
      }
      const gD=Number(one(`select count(*) from groups where org_id='${ORG}'`))
      L(`   groups after delete: ${gD}${gD===gA?'   <-- NO WRITE':'   <-- deleted'}`)
    }
    report('deleteGroup', obs); obs.length=0

    L('\n3. PERSONVERN — the DSR «Behandle» flow (createDsr / setDsrStatus)')
    await page.goto(`${BASE_URL}/administrasjon/personvern`,{waitUntil:'domcontentloaded'}); await page.waitForLoadState('networkidle').catch(()=>{})
    const dB=Number(one(`select count(*) from dsr_requests where org_id='${ORG}'`))
    L(`   dsr rows before: ${dB}`)
    await page.getByRole('button',{name:'Behandle'}).first().click(); await page.waitForTimeout(1500)
    const fields=await page.locator('main input, main select, main textarea').evaluateAll(e=>e.map(x=>`${x.tagName.toLowerCase()} ${JSON.stringify(x.getAttribute('aria-label')||(x as HTMLInputElement).placeholder||(x as HTMLInputElement).name||'')}`))
    L(`   fields after «Behandle»: ${[...new Set(fields)].join(' | ').slice(0,300)}`)
    const em=page.locator('main input').filter({hasNot:page.locator('[type=hidden]')}).first()
    if(await em.count()){
      await em.fill(`walk-dsr-${Date.now()}@example.invalid`)
      const sb=page.getByRole('button',{name:/^(Lagre|Registrer|Opprett|Send)/})
      L(`   submit buttons: ${await sb.count()} -> ${[...new Set(await sb.allTextContents())].join(' | ')}`)
      if(await sb.count()){ await sb.first().click(); await page.waitForTimeout(4000) }
    }
    const dA=Number(one(`select count(*) from dsr_requests where org_id='${ORG}'`))
    L(`   dsr_requests ${dB} -> ${dA}${dB===dA?'   <-- NO WRITE':'   <-- wrote'}`)
    L(`   statuses: ${psql(`select status from dsr_requests where org_id='${ORG}'`).map(r=>r[0]).join(', ')}`)
    report('dsr', obs)
  } finally { await browser.close(); if(srv.started)srv.stop() }
}
main().catch(e=>{console.error('FAILED:',e);process.exit(1)})
