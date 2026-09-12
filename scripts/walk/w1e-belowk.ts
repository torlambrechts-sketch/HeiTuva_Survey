import { open, ensureServer, BASE_URL, report, psql, one } from './drive'
async function main(){
  const srv=await ensureServer(); const L=console.log
  const {browser,page,obs}=await open('administrator')
  try{
    const s=psql(`select s.id,s.title,s.anonymity,s.run_mode,(select count(*) from responses r join survey_rounds sr on sr.id=r.round_id where sr.survey_id=s.id) as n
                  from surveys s where s.title='Psykososial kartlegging'`)[0]!
    L(`survey "${s[1]}" anonymity=${s[2]} run_mode=${s[3]} responses=${s[4]}  (k=5, so below threshold)`)

    L(`\n1. set run_mode=live from the UI (bygg -> Innstillinger)`)
    await page.goto(`${BASE_URL}/undersokelser/${s[0]}/bygg`,{waitUntil:'domcontentloaded'}); await page.waitForLoadState('networkidle').catch(()=>{}); obs.length=0
    const inn=page.getByRole('button',{name:/^Innstillinger$/}).or(page.getByRole('tab',{name:/Innstillinger/}))
    L(`   «Innstillinger»: ${await inn.count()}`)
    if(await inn.count()){await inn.first().click(); await page.waitForTimeout(1500)}
    const live=page.getByRole('button',{name:/^Live$/}).or(page.getByLabel(/Live/))
    L(`   live mode control: ${await live.count()}`)
    if(await live.count()){await live.first().click(); await page.waitForTimeout(3000)}
    const after=one(`select run_mode from surveys where id='${s[0]}'`)
    L(`   run_mode ${s[3]} -> ${after}${s[3]===after?'   <-- NO WRITE':'   <-- wrote'}`)
    report('setRunMode', obs); obs.length=0
    if(after!=='live'){ psql(`update surveys set run_mode='live' where id='${s[0]}'`); L(`   (forced in SQL so the gating can still be measured)`) }

    L(`\n2. open live on it and read the counter + bars`)
    await page.goto(`${BASE_URL}/undersokelser/${s[0]}/live`,{waitUntil:'domcontentloaded'}); await page.waitForLoadState('networkidle').catch(()=>{})
    const st=page.getByRole('button',{name:/^Start live/}); if(await st.count()){await st.first().click(); await page.waitForTimeout(3000)}
    const txt=(await page.locator('body').innerText()).replace(/\s+/g,' ')
    const hidden=/færre svar enn terskelen|ingen tall|minst (fem|5)/i.test(txt)
    L(`   counter text: ${(txt.match(/\d+ svar|Ingen tall[^.]*\.|færre svar[^.]*\./i)||['(none)'])[0]}`)
    L(`   threshold sentence present: ${hidden}`)
    L(`\n3. press «Vis resultat» below k and see what is drawn`)
    const vis=page.getByRole('button',{name:/Vis resultat/}); L(`   reveal button: ${await vis.count()}`)
    if(await vis.count()){
      const dis=await vis.first().isDisabled()
      L(`   «Vis resultat» disabled below k: ${dis}   ${dis?'(this IS the refusal)':''}`)
      if(!dis){await vis.first().click(); await page.waitForTimeout(2500)}
      else { L(`   forcing the action anyway, to check the server refuses it too`)
        await vis.first().evaluate((el)=>{(el as HTMLButtonElement).disabled=false;(el as HTMLButtonElement).click()})
        await page.waitForTimeout(2500)
        L(`   revealed column after forcing: ${one(`select revealed from live_sessions where survey_id='${s[0]}' order by opened_at desc limit 1`)}`)
      }
    }
    const t2=(await page.locator('body').innerText()).replace(/\s+/g,' ')
    const nums=t2.match(/\b\d+\s*%/g)||[]
    L(`   percentages drawn after reveal: ${nums.length?nums.join(', '):'(none — gated)'}`)
    const gated=/for få svar|ikke nok|terskelen|Ingen tall/i.test(t2)
    L(`   gated message shown: ${gated}`)
    L(`   excerpt: ${t2.slice(t2.indexOf('LIVE')>=0?t2.indexOf('LIVE'):0, 520)}`)
    report('reveal below k', obs)
  } finally { await page.screenshot({path:'docs/walk/shots/w1e-belowk.png',fullPage:true}).catch(()=>{}); await browser.close(); if(srv.started)srv.stop() }
}
main().catch(e=>{console.error('FAILED:',e);process.exit(1)})
