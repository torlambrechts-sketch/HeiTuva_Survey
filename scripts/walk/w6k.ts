import { open, ensureServer, BASE_URL, report, psql, one } from './drive'
async function main(){
  const srv=await ensureServer(); const L=console.log
  const {browser,page,obs}=await open('administrator')
  const ORG=one(`select id from organizations where name='Nordisk Studio'`)
  try{
    L('1. deleting a group with MEMBERS — is there a confirmation?')
    await page.goto(`${BASE_URL}/administrasjon/grupper`,{waitUntil:'domcontentloaded'}); await page.waitForLoadState('networkidle').catch(()=>{}); obs.length=0
    const g=psql(`select g.id,g.name,(select count(*) from org_members m where m.group_id=g.id) from groups g where g.org_id='${ORG}' order by g.name limit 1`)[0]!
    L(`   «${g[1]}» has ${g[2]} member(s)`)
    const before=Number(one(`select count(*) from groups where org_id='${ORG}'`))
    await page.getByLabel(`Slett gruppe: ${g[1]}`).click()
    await page.waitForTimeout(2000)
    const after=Number(one(`select count(*) from groups where org_id='${ORG}'`))
    const t=(await page.locator('main').innerText()).replace(/\s+/g,' ')
    L(`   after ONE click: groups ${before} -> ${after}`)
    L(`   ${after<before?'DELETED IMMEDIATELY — no confirmation':'not deleted; a confirmation is in the way'}`)
    const conf=t.match(/(Sikker|Slett|Bekreft|angre)[^.]{0,140}\./); L(`   copy on screen: ${conf?conf[0]:'(nothing about deleting)'}`)
    L(`   members still in the org: ${one(`select count(*) from org_members where org_id='${ORG}'`)} (deleting a group must not delete people)`)
    L(`   their group_id now: ${psql(`select coalesce(group_id::text,'(null)') from org_members where org_id='${ORG}' limit 3`).map(r=>r[0]!.slice(0,8)).join(', ')}`)
    report('deleteGroup with members', obs); obs.length=0

    L('\n2. createDsr via «Registrer»')
    await page.goto(`${BASE_URL}/administrasjon/personvern`,{waitUntil:'domcontentloaded'}); await page.waitForLoadState('networkidle').catch(()=>{})
    const dB=Number(one(`select count(*) from dsr_requests where org_id='${ORG}'`))
    await page.getByRole('button',{name:'Behandle'}).first().click(); await page.waitForTimeout(1200)
    await page.getByLabel('Innsyn i egne data').fill(`walk-dsr-${Date.now()}@example.invalid`)
    const reg=page.getByRole('button',{name:'Registrer'})
    L(`   «Registrer»: ${await reg.count()}  disabled=${await reg.count()?await reg.first().isDisabled():'n/a'}`)
    if(await reg.count()){ await reg.first().click(); await page.waitForTimeout(4000) }
    const dA=Number(one(`select count(*) from dsr_requests where org_id='${ORG}'`))
    L(`   dsr_requests ${dB} -> ${dA}${dB===dA?'   <-- NO WRITE':'   <-- wrote'}`)
    L(`   rows: ${psql(`select type||'/'||status from dsr_requests where org_id='${ORG}'`).map(r=>r[0]).join(', ')}`)
    report('createDsr', obs)
  } finally { await browser.close(); if(srv.started)srv.stop() }
}
main().catch(e=>{console.error('FAILED:',e);process.exit(1)})
