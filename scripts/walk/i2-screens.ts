import { open, ensureServer, BASE_URL, report, psql, one } from './drive'
async function main(){
  const srv=await ensureServer(); const L=console.log
  const {browser,page,obs}=await open('administrator')
  try{
    L('=== state before ===')
    L(`  entra_connections rows: ${one(`select count(*) from entra_connections`)}`)
    L(`  entra_sync flag: ${psql(`select key||'='||enabled from feature_flags where key='entra_sync'`).map(r=>r[0]).join(' ')}`)
    L(`  members with directory provenance: ${one(`select count(*) from org_members where source='directory' or status_source='directory' or external_id is not null`)}`)

    L('\n=== /administrasjon/integrasjoner ===')
    await page.goto(`${BASE_URL}/administrasjon/integrasjoner`,{waitUntil:'domcontentloaded'}); await page.waitForLoadState('networkidle').catch(()=>{}); obs.length=0
    const t=(await page.locator('body').innerText()).replace(/\s+/g,' ')
    const count=t.match(/\d+ aktiv[e]? tilkobling(er)?/); L(`  connection count claim: ${count?count[0]:'(none)'}`)
    for(const c of ['Entra ID','Ikke tilgjengelig','Ikke tilkoblet','Trenger oppsett','Feiler','API-nøkkel','Webhooks'])
      L(`  «${c}»: ${t.includes(c)}`)
    const dis=await page.locator('button:disabled').count(); L(`  disabled controls: ${dis}`)
    const rows=await page.locator('button:visible, a:visible').filter({hasText:/Koble til|Sett opp|Åpne|Vis/}).allTextContents()
    L(`  actionable controls: ${[...new Set(rows.map(x=>x.trim()))].join(' | ').slice(0,160)}`)
    report('integrasjoner', obs); obs.length=0

    L('\n=== /administrasjon/integrasjoner/entra (unconnected — the only state that exists) ===')
    await page.goto(`${BASE_URL}/administrasjon/integrasjoner/entra`,{waitUntil:'domcontentloaded'}); await page.waitForLoadState('networkidle').catch(()=>{})
    const e=(await page.locator('body').innerText()).replace(/\s+/g,' ')
    L(`  first 420: ${e.slice(e.indexOf('Entra')>=0?e.indexOf('Entra'):0, 420)}`)
    L('\n  the refused fields must render their REFUSAL, not vanish:')
    for(const f of ['manager','employeeHireDate','employeeLeaveDateTime','Ingenting utover dette leses fra katalogen'])
      L(`     «${f}»: ${e.includes(f)}`)
    L('\n  the built fields:')
    for(const f of ['displayName','userName','active','externalId','department'])
      L(`     «${f}»: ${e.includes(f)}`)
    L(`\n  «Directory.Read.All» must NOT be requested: ${e.includes('Directory.Read.All')}  (false = correct, Q167)`)
    L(`  «User.Read.All» named: ${e.includes('User.Read.All')}`)
    L(`  «Group.Read.All» named: ${e.includes('Group.Read.All')}`)
    const btns=[...new Set(await page.locator('button:visible').allTextContents())].map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean)
    L(`  buttons: ${btns.join(' | ').slice(0,200)}`)
    const discon=page.locator('button:visible').filter({hasText:/Koble fra|Fjern tilkobling/})
    L(`  «Koble fra» present with no connection: ${await discon.count()}  (0 = correct)`)
    report('entra detail', obs)

    L('\n=== the Azure-gated half, named rather than skipped ===')
    L(`  AZURE_CLIENT_ID set in this environment:     ${process.env.AZURE_CLIENT_ID ? 'yes' : 'NO'}`)
    L(`  AZURE_CLIENT_SECRET set in this environment: ${process.env.AZURE_CLIENT_SECRET ? 'yes' : 'NO'}`)
    L(`  entra-sync Edge Function deployed locally:   (not checked — local stack runs no edge runtime)`)
    L(`  => unproven: the token exchange and every real Graph call.`)
    L(`     proven without them: the field list, paging parse, mailbox fallback and retry policy`)
    L(`     (tests/unit/entra-graph.test.ts) plus every database decision`)
    L(`     (entra-credential 25 + entra-sync 13).`)
  } finally { await page.screenshot({path:'docs/walk/shots/i2-entra.png',fullPage:true}).catch(()=>{}); await browser.close(); if(srv.started)srv.stop() }
}
main().catch(e=>{console.error('FAILED:',e);process.exit(1)})
