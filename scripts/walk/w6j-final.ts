import { open, ensureServer, BASE_URL, report, psql, one } from './drive'
async function main(){
  const srv=await ensureServer(); const L=console.log
  const {browser,page,obs}=await open('administrator')
  const ORG=one(`select id from organizations where name='Nordisk Studio'`)
  try{
    L('1. deleteGroup — the «×» beside the walk group')
    await page.goto(`${BASE_URL}/administrasjon/grupper`,{waitUntil:'domcontentloaded'}); await page.waitForLoadState('networkidle').catch(()=>{}); obs.length=0
    const g=psql(`select id,name from groups where org_id='${ORG}' and name like 'Walk gruppe%' limit 1`)[0]
    if(!g){ L('   no walk group present') } else {
      L(`   group: ${g[1]}`)
      const labels=await page.locator('main button').evaluateAll(e=>e.map(b=>`${JSON.stringify((b.textContent||'').trim().slice(0,12))}|al=${JSON.stringify(b.getAttribute('aria-label')||'')}`))
      L(`   buttons: ${[...new Set(labels)].join('  ').slice(0,300)}`)
      const xs=page.locator('main button').filter({hasText:'×'})
      L(`   «×» buttons (by text): ${await xs.count()}`)
      // the one whose accessible description names this group, else the last
      const n=await xs.count()
      const before=Number(one(`select count(*) from groups where org_id='${ORG}'`))
      await xs.nth(n-1).click(); await page.waitForTimeout(1500)
      const t=(await page.locator('main').innerText()).replace(/\s+/g,' ')
      const conf=t.match(/(Slett|Fjern)[^.]{0,130}\./); L(`   confirmation copy: ${conf?conf[0]:'(none)'}`)
      const yes=page.getByRole('button',{name:/^(Ja|Slett|Fjern|Bekreft)/})
      L(`   confirm buttons: ${await yes.count()} -> ${[...new Set(await yes.allTextContents())].join(' | ')}`)
      if(await yes.count()){ await yes.last().click(); await page.waitForTimeout(3500) }
      const after=Number(one(`select count(*) from groups where org_id='${ORG}'`))
      L(`   groups ${before} -> ${after}${before===after?'   <-- NO WRITE':'   <-- deleted'}`)
    }
    report('deleteGroup', obs); obs.length=0

    L('\n2. createDsr — «Behandle» then the visible field')
    await page.goto(`${BASE_URL}/administrasjon/personvern`,{waitUntil:'domcontentloaded'}); await page.waitForLoadState('networkidle').catch(()=>{})
    const dB=Number(one(`select count(*) from dsr_requests where org_id='${ORG}'`))
    await page.getByRole('button',{name:'Behandle'}).first().click(); await page.waitForTimeout(1500)
    const field=page.getByLabel('Innsyn i egne data')
    L(`   «Innsyn i egne data» field: ${await field.count()}`)
    if(await field.count()){
      await field.fill(`walk-dsr-${Date.now()}@example.invalid`)
      const btns=[...new Set(await page.locator('main button').allTextContents())].map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean)
      L(`   buttons now: ${btns.join(' | ').slice(0,220)}`)
      const sb=page.getByRole('button',{name:/^(Registrer|Lagre|Opprett|Legg til)/})
      if(await sb.count()){ await sb.first().click(); await page.waitForTimeout(4000) }
      else L(`   no submit button matched — form may submit on Enter`)
      if(!(await sb.count())){ await field.press('Enter'); await page.waitForTimeout(4000) }
    }
    const dA=Number(one(`select count(*) from dsr_requests where org_id='${ORG}'`))
    L(`   dsr_requests ${dB} -> ${dA}${dB===dA?'   <-- NO WRITE':'   <-- wrote'}`)
    report('createDsr', obs)
  } finally { await browser.close(); if(srv.started)srv.stop() }
}
main().catch(e=>{console.error('FAILED:',e);process.exit(1)})
