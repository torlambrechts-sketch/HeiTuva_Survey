import { open, ensureServer, BASE_URL, report, psql, one } from './drive'
async function main(){
  const srv=await ensureServer(); const L=console.log
  const {browser,page,obs}=await open('administrator')
  const ORG=one(`select id from organizations where name='Nordisk Studio'`)
  const col=(c:string)=>one(`select ${c}::text from organizations where id='${ORG}'`)
  try{
    L('1. FIRMA — worklist_view select (saveCompany, saves on change)')
    await page.goto(`${BASE_URL}/administrasjon`,{waitUntil:'domcontentloaded'}); await page.waitForLoadState('networkidle').catch(()=>{}); obs.length=0
    let b=col('worklist_view')
    await page.locator('select[name=worklist_view]').selectOption(b==='list'?'board':'list')
    await page.waitForTimeout(3500)
    L(`   worklist_view ${b} -> ${col('worklist_view')}${b===col('worklist_view')?'   <-- NO WRITE':'   <-- wrote'}`)
    b=col('timezone')
    await page.locator('select[name=timezone]').selectOption('Europe/Stockholm'); await page.waitForTimeout(3500)
    L(`   timezone ${b} -> ${col('timezone')}${b===col('timezone')?'   <-- NO WRITE':'   <-- wrote'}`)
    report('saveCompany', obs); obs.length=0

    L('\n2. PERSONVERN — threshold chips (setDefaultThreshold)')
    await page.goto(`${BASE_URL}/administrasjon/personvern`,{waitUntil:'domcontentloaded'}); await page.waitForLoadState('networkidle').catch(()=>{})
    b=col('default_k_threshold')
    const chips=page.locator('button[aria-pressed]')
    const labels=await chips.evaluateAll(e=>e.map(x=>(x.textContent||'').replace(/\s+/g,' ').trim()))
    L(`   aria-pressed chips: ${labels.join(' | ')}`)
    const other=labels.findIndex(l=>/\d/.test(l)&&!l.includes(b))
    L(`   threshold before=${b}, clicking chip «${labels[other]}»`)
    if(other>=0){ await chips.nth(other).click(); await page.waitForTimeout(3500) }
    L(`   default_k_threshold ${b} -> ${col('default_k_threshold')}${b===col('default_k_threshold')?'   <-- NO WRITE':'   <-- wrote'}`)
    report('setDefaultThreshold', obs); obs.length=0

    L('\n3. PERSONVERN — a privacy switch (setPrivacy) and Oppbevaringstid (setRetention)')
    b=col('privacy')
    await page.getByLabel('Ikke lagre IP-adresse').click(); await page.waitForTimeout(3000)
    L(`   privacy ${b.slice(0,46)} -> ${col('privacy').slice(0,46)}${b===col('privacy')?'   <-- NO WRITE':'   <-- wrote'}`)
    const rb=col('retention_months')
    const rsel=page.getByLabel('Oppbevaringstid')
    const ropts=await rsel.evaluateAll(e=>e.length?Array.from((e[0] as HTMLSelectElement).options).map(o=>o.value):[])
    const rt=ropts.find(o=>o!==rb)
    if(rt){ await rsel.selectOption(rt); await page.waitForTimeout(3000) }
    L(`   retention_months ${rb} -> ${col('retention_months')} (target ${rt})${rb===col('retention_months')?'   <-- NO WRITE':'   <-- wrote'}`)
    report('privacy/retention', obs); obs.length=0

    L('\n4. BRUKERE — role and group (setMemberRole / setMemberGroup)')
    await page.goto(`${BASE_URL}/administrasjon/brukere`,{waitUntil:'domcontentloaded'}); await page.waitForLoadState('networkidle').catch(()=>{})
    const m=psql(`select id, role, coalesce(group_id::text,'') , name from org_members om join profiles p on p.id=om.user_id where om.org_id='${ORG}' and om.role='leser' limit 1`)[0]
      ?? psql(`select id, role, coalesce(group_id::text,''), 'Mari Holm' from org_members where org_id='${ORG}' and role='leser' limit 1`)[0]!
    L(`   member ${m[3]}: role=${m[1]} group=${(m[2]||'(none)').slice(0,8)}`)
    const rsel2=page.getByLabel(`Brukere: ${m[3]}`)
    L(`   role select for them: ${await rsel2.count()}`)
    if(await rsel2.count()){ await rsel2.selectOption('redaktor'); await page.waitForTimeout(3500) }
    L(`   role ${m[1]} -> ${one(`select role from org_members where id='${m[0]}'`)}${m[1]===one(`select role from org_members where id='${m[0]}'`)?'   <-- NO WRITE':'   <-- wrote'}`)
    const gsel=page.getByLabel(`gruppe: ${m[3]}`)
    if(await gsel.count()){
      const gopts=await gsel.evaluateAll(e=>Array.from((e[0] as HTMLSelectElement).options).map(o=>o.value))
      const gt=gopts.find(o=>o&&o!==m[2])
      if(gt){ await gsel.selectOption(gt); await page.waitForTimeout(3500) }
      L(`   group ${(m[2]||'(none)').slice(0,8)} -> ${(one(`select coalesce(group_id::text,'(none)') from org_members where id='${m[0]}'`)).slice(0,8)}`)
    }
    report('members', obs); obs.length=0

    L('\n5. VALG — a switch (setOption) and the default language (setDefaultLang)')
    await page.goto(`${BASE_URL}/administrasjon/valg`,{waitUntil:'domcontentloaded'}); await page.waitForLoadState('networkidle').catch(()=>{})
    const ob=col('options')
    await page.getByLabel('Automatiske påminnelser').click(); await page.waitForTimeout(3000)
    L(`   options ${ob.slice(0,50)} -> ${col('options').slice(0,50)}${ob===col('options')?'   <-- NO WRITE':'   <-- wrote'}`)
    const lb=col('source_lang')
    const lsel=page.getByLabel('Standardspråk for ansatte')
    if(await lsel.count()){ await lsel.selectOption(lb==='no'?'en':'no'); await page.waitForTimeout(3000) }
    L(`   source_lang ${lb} -> ${col('source_lang')}${lb===col('source_lang')?'   <-- NO WRITE':'   <-- wrote'}`)
    report('options', obs)
  } finally { await browser.close(); if(srv.started)srv.stop() }
}
main().catch(e=>{console.error('FAILED:',e);process.exit(1)})
