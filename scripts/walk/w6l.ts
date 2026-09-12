import { open, ensureServer, BASE_URL, report, psql, one } from './drive'
async function main(){
  const srv=await ensureServer(); const L=console.log
  const {browser,page,obs}=await open('administrator')
  const ORG=one(`select id from organizations where name='Nordisk Studio'`)
  try{
    await page.goto(`${BASE_URL}/administrasjon/grupper`,{waitUntil:'domcontentloaded'}); await page.waitForLoadState('networkidle').catch(()=>{}); obs.length=0
    const g=psql(`select g.id,g.name,(select count(*) from org_members m where m.group_id=g.id) from groups g where g.org_id='${ORG}' order by g.name limit 1`)[0]!
    const inv=one(`select count(*) from survey_invitations where group_id='${g[0]}'`)
    L(`«${g[1]}»: ${g[2]} member(s), ${inv} invitation(s) point at it`)
    const before=Number(one(`select count(*) from groups where org_id='${ORG}'`))
    await page.getByLabel(`Slett gruppe: ${g[1]}`).click()
    await page.waitForTimeout(6000)
    const after=Number(one(`select count(*) from groups where org_id='${ORG}'`))
    L(`groups ${before} -> ${after}`)
    const t=(await page.locator('main').innerText()).replace(/\s+/g,' ')
    L(`group still listed on screen: ${t.includes(g[1]!)}`)
    // any visible refusal, matched against the admin error copy
    const msgs=['Du har ikke tilgang','Noe gikk galt','kunne ikke','Ugyldig','siste administrator']
    for(const m of msgs) if(t.includes(m)) L(`refusal copy shown: «${m}»`)
    L(`any red/alert region: ${(await page.locator('[role=alert],[role=status]').allTextContents()).map(x=>x.replace(/\\s+/g,' ').trim()).filter(Boolean).join(' || ')||'(none)'}`)
    L(`members still in the org: ${one(`select count(*) from org_members where org_id='${ORG}'`)}`)
    L(`members that pointed at it now: ${one(`select count(*) from org_members where group_id='${g[0]}'`)}`)
    report('deleteGroup', obs)
  } finally { await browser.close(); if(srv.started)srv.stop() }
}
main().catch(e=>{console.error('FAILED:',e);process.exit(1)})
