import { open, ensureServer, BASE_URL, report, psql, one } from './drive'
async function main(){
  const srv=await ensureServer(); const L=console.log
  const {browser,page,obs}=await open('administrator')
  const ORG=one(`select id from organizations where name='Nordisk Studio'`)
  const snap=()=>one(`select workspace||'|'||timezone||'|'||default_k_threshold||'|'||worklist_view||'|'||coalesce(name,'') from organizations where id='${ORG}'`)
  try{
    L('=== FIRMA: saveCompany — workspace, timezone, worklist_view all live here ===')
    await page.goto(`${BASE_URL}/administrasjon`,{waitUntil:'domcontentloaded'}); await page.waitForLoadState('networkidle').catch(()=>{}); obs.length=0
    const before=snap(); L(`   before: ${before}`)
    const selects=await page.locator('select').evaluateAll(e=>e.map(s=>({name:(s as HTMLSelectElement).name, opts:Array.from((s as HTMLSelectElement).options).slice(0,3).map(o=>o.value)})))
    L(`   selects on the Firma form: ${JSON.stringify(selects).slice(0,320)}`)
    // change worklist_view and timezone through the real controls
    for(const [nm,val] of [['worklist_view','board'],['workspace','cx']] as const){
      const sel=page.locator(`select[name=${nm}]`)
      if(await sel.count()){ await sel.selectOption(val).catch(async()=>{ L(`   ${nm}: option ${val} not offered`) }) }
      else L(`   no select[name=${nm}] on the page`)
    }
    // The Firma form saves ON CHANGE (CompanyForm.tsx:128); the sr-only submit is a fallback.
    await page.waitForTimeout(3500)
    const after=snap(); L(`   after : ${after}`)
    L(`   CHANGED: ${before!==after}`)
    const t=(await page.locator('body').innerText()).replace(/\s+/g,' ')
    L(`   confirmation shown: ${/Lagret|lagret/.test(t)}`)
    report('saveCompany', obs); obs.length=0

    L('\n=== VALG: setOption ===')
    await page.goto(`${BASE_URL}/administrasjon/valg`,{waitUntil:'domcontentloaded'}); await page.waitForLoadState('networkidle').catch(()=>{})
    const sw=page.locator('button[role=switch], input[type=checkbox]')
    L(`   switches: ${await sw.count()}`)
    if(await sw.count()){ await sw.first().click({force:true}); await page.waitForTimeout(3000) }
    L(`   organizations row after the toggle: ${snap()}`)
    report('setOption', obs); obs.length=0

    L('\n=== PERSONVERN: setDefaultThreshold + setRetention + setPrivacy ===')
    await page.goto(`${BASE_URL}/administrasjon/personvern`,{waitUntil:'domcontentloaded'}); await page.waitForLoadState('networkidle').catch(()=>{})
    const thBefore=one(`select default_k_threshold from organizations where id='${ORG}'`)
    const thSel=page.locator('select').first()
    const opts=await page.locator('select').first().evaluateAll(e=>e.length?Array.from((e[0] as HTMLSelectElement).options).map(o=>o.value):[])
    L(`   threshold before=${thBefore}  select options: ${opts.join(',')}`)
    const target=opts.find(o=>o!==thBefore&&/^\d+$/.test(o))
    if(target){ await thSel.selectOption(target); await page.waitForTimeout(3000) }
    L(`   threshold after =${one(`select default_k_threshold from organizations where id='${ORG}'`)}  (target ${target})`)
    report('threshold', obs); obs.length=0

    L('\n=== BRUKERE: setMemberRole / setMemberStatus / setMemberGroup ===')
    await page.goto(`${BASE_URL}/administrasjon/brukere`,{waitUntil:'domcontentloaded'}); await page.waitForLoadState('networkidle').catch(()=>{})
    const m=psql(`select id,role,status,coalesce(group_id::text,'(none)') from org_members where org_id='${ORG}' and role='leser' limit 1`)[0]!
    L(`   leser before: role=${m[1]} status=${m[2]} group=${m[3]!.slice(0,8)}`)
    const roleSel=page.locator('select').filter({hasText:/Leser|Redaktør|Administrator/})
    L(`   role selects: ${await roleSel.count()}`)
    if(await roleSel.count()){
      await roleSel.last().selectOption({label:'Redaktør'}).catch(()=>L('   «Redaktør» option not found'))
      await page.waitForTimeout(3000)
    }
    L(`   leser after : role=${one(`select role from org_members where id='${m[0]}'`)}`)
    report('setMemberRole', obs); obs.length=0

    L('\n=== SPRÅK: saveMessage / resetMessage ===')
    await page.goto(`${BASE_URL}/administrasjon/sprak`,{waitUntil:'domcontentloaded'}); await page.waitForLoadState('networkidle').catch(()=>{})
    const ovBefore=one(`select count(*) from ui_messages where org_id='${ORG}'`)
    L(`   org overrides before: ${ovBefore}`)
    const inputs=page.locator('input[type=text], textarea')
    L(`   editable fields: ${await inputs.count()}`)
    if(await inputs.count()){
      await inputs.first().fill('Walk egen tekst')
      const s2=page.getByRole('button',{name:/^Lagre/})
      L(`   «Lagre»: ${await s2.count()}`)
      if(await s2.count()){ await s2.first().click({force:true}).catch(()=>L('   Lagre not clickable')); await page.waitForTimeout(3000) }
    }
    L(`   org overrides after : ${one(`select count(*) from ui_messages where org_id='${ORG}'`)}`)
    report('saveMessage', obs)
  } finally { await page.screenshot({path:'docs/walk/shots/w6-admin.png',fullPage:true}).catch(()=>{}); await browser.close(); if(srv.started)srv.stop() }
}
main().catch(e=>{console.error('FAILED:',e);process.exit(1)})
