import { open, ensureServer, BASE_URL, report, psql, one } from './drive'
async function main(){
  const srv=await ensureServer(); const L=console.log
  const {browser,page,obs}=await open('administrator')
  const ORG=one(`select id from organizations where name='Nordisk Studio'`)
  const col=(c:string)=>one(`select ${c}::text from organizations where id='${ORG}'`)
  try{
    L('1. BRUKERE — setMemberRole / setMemberGroup')
    await page.goto(`${BASE_URL}/administrasjon/brukere`,{waitUntil:'domcontentloaded'}); await page.waitForLoadState('networkidle').catch(()=>{}); obs.length=0
    const m=psql(`select id, role, coalesce(group_id::text,''), name from org_members where org_id='${ORG}' and role='leser' limit 1`)[0]!
    L(`   ${m[3]}: role=${m[1]} group=${(m[2]||'(none)').slice(0,8)}`)
    const rsel=page.getByLabel(`Brukere: ${m[3]}`)
    L(`   role select: ${await rsel.count()}`)
    if(await rsel.count()){ await rsel.selectOption('redaktor'); await page.waitForTimeout(3500) }
    const r2=one(`select role from org_members where id='${m[0]}'`)
    L(`   role ${m[1]} -> ${r2}${m[1]===r2?'   <-- NO WRITE':'   <-- wrote'}`)
    const gsel=page.getByLabel(`gruppe: ${m[3]}`)
    if(await gsel.count()){
      const gopts=await gsel.evaluateAll(e=>Array.from((e[0] as HTMLSelectElement).options).map(o=>o.value))
      const gt=gopts.find(o=>o&&o!==m[2])
      if(gt){ await gsel.selectOption(gt); await page.waitForTimeout(3500) }
      const g2=one(`select coalesce(group_id::text,'(none)') from org_members where id='${m[0]}'`)
      L(`   group ${(m[2]||'(none)').slice(0,8)} -> ${g2.slice(0,8)}${(m[2]||'(none)')===g2?'   <-- NO WRITE':'   <-- wrote'}`)
    }
    report('members', obs); obs.length=0

    L('\n2. BRUKERE — inviteMember, and the duplicate refusal')
    const invB=one(`select count(*) from org_members where org_id='${ORG}'`)
    const em=`walk-invite-${Date.now()}@nordiskstudio.test`
    await page.getByLabel('Inviter').fill(em)
    const ib=page.getByRole('button',{name:/Inviter|Send invitasjon/})
    L(`   invite buttons: ${await ib.count()}`)
    if(await ib.count()){ await ib.first().click(); await page.waitForTimeout(4000) }
    L(`   org_members ${invB} -> ${one(`select count(*) from org_members where org_id='${ORG}'`)}`)
    L(`   the invited address exists: ${one(`select count(*) from org_members where org_id='${ORG}' and email='${em}'`)||'(column differs)'}`)
    report('inviteMember', obs); obs.length=0

    L('\n3. VALG — setOption switch + setDefaultLang')
    await page.goto(`${BASE_URL}/administrasjon/valg`,{waitUntil:'domcontentloaded'}); await page.waitForLoadState('networkidle').catch(()=>{})
    let b=col('options')
    await page.getByLabel('Automatiske påminnelser').click(); await page.waitForTimeout(3500)
    L(`   options changed: ${b!==col('options')}   ${b.slice(0,44)} -> ${col('options').slice(0,44)}`)
    b=col('default_lang')
    const lsel=page.getByLabel('Standardspråk for ansatte')
    if(await lsel.count()){ await lsel.selectOption(b==='no'?'en':'no'); await page.waitForTimeout(3500) }
    L(`   default_lang ${b} -> ${col('default_lang')}${b===col('default_lang')?'   <-- NO WRITE':'   <-- wrote'}`)
    report('options', obs); obs.length=0

    L('\n4. GRUPPER — createGroup then deleteGroup')
    await page.goto(`${BASE_URL}/administrasjon/grupper`,{waitUntil:'domcontentloaded'}); await page.waitForLoadState('networkidle').catch(()=>{})
    const gB=one(`select count(*) from groups where org_id='${ORG}'`)
    const gname='Walk gruppe '+(Date.now()%10000)
    const gin=page.locator('main input[type=text]').first()
    L(`   text inputs: ${await page.locator('main input[type=text]').count()}  groups before: ${gB}`)
    if(await gin.count()){
      await gin.fill(gname)
      const gb=page.getByRole('button',{name:/Legg til|Opprett|Ny gruppe/})
      L(`   create buttons: ${await gb.count()} -> ${[...new Set(await gb.allTextContents())].join(' | ')}`)
      if(await gb.count()){ await gb.first().click(); await page.waitForTimeout(4000) }
    }
    const gA=one(`select count(*) from groups where org_id='${ORG}'`)
    L(`   groups ${gB} -> ${gA}${gB===gA?'   <-- NO WRITE':'   <-- wrote'}`)
    if(gA>gB){
      const del=page.getByRole('button',{name:/Slett/})
      L(`   delete buttons: ${await del.count()}`)
      const row=page.locator('li,tr,div').filter({hasText:gname}).last()
      const d2=row.getByRole('button',{name:/Slett/})
      if(await d2.count()){ await d2.first().click(); await page.waitForTimeout(1200)
        const yes=page.getByRole('button',{name:/Ja|Bekreft|Slett/}); if(await yes.count()){await yes.last().click(); await page.waitForTimeout(3500)} }
      L(`   groups after delete: ${one(`select count(*) from groups where org_id='${ORG}'`)}`)
    }
    report('groups', obs); obs.length=0

    L('\n5. PERSONVERN — createDsr + setDsrStatus')
    await page.goto(`${BASE_URL}/administrasjon/personvern`,{waitUntil:'domcontentloaded'}); await page.waitForLoadState('networkidle').catch(()=>{})
    const dB=one(`select count(*) from dsr_requests where org_id='${ORG}'`)
    const open1=page.getByRole('button',{name:/Ny forespørsel|Registrer|Legg til/})
    L(`   dsr rows before: ${dB}   open-form buttons: ${await open1.count()}`)
    if(await open1.count()){ await open1.first().click(); await page.waitForTimeout(1200) }
    const de=page.locator('main input[type=email], main input[type=text]').first()
    if(await de.count()){
      await de.fill(`walk-dsr-${Date.now()}@example.invalid`)
      const sb=page.getByRole('button',{name:/Lagre|Registrer|Opprett/})
      L(`   submit buttons: ${await sb.count()}`)
      if(await sb.count()){ await sb.first().click(); await page.waitForTimeout(4000) }
    }
    const dA=one(`select count(*) from dsr_requests where org_id='${ORG}'`)
    L(`   dsr_requests ${dB} -> ${dA}${dB===dA?'   <-- NO WRITE':'   <-- wrote'}`)
    const dsel=page.locator('select').filter({hasText:/Under behandling|Mottatt/}).first()
    if(await dsel.count()){
      const cur=await dsel.inputValue()
      await dsel.selectOption(cur==='fullfort'?'mottatt':'fullfort'); await page.waitForTimeout(3500)
      L(`   a DSR status changed: ${psql(`select status from dsr_requests where org_id='${ORG}' order by created_at limit 2`).map(r=>r[0]).join(',')}`)
    }
    report('dsr', obs)
  } finally { await browser.close(); if(srv.started)srv.stop() }
}
main().catch(e=>{console.error('FAILED:',e);process.exit(1)})
