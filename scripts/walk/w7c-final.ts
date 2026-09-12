import { open, ensureServer, BASE_URL, report, psql, one } from './drive'
async function main(){
  const srv=await ensureServer(); const L=console.log
  const {browser,page,obs}=await open('administrator')
  try{
    L('=== DUTY — toggleDutyCheck, then signDuty ===')
    await page.goto(`${BASE_URL}/rapporter?fane=lov`,{waitUntil:'domcontentloaded'}); await page.waitForLoadState('networkidle').catch(()=>{}); obs.length=0
    const cB=Number(one(`select count(*) from duty_checks`))
    const unchecked=page.getByRole('button',{name:'Tiltaksplan med frister'})
    L(`   duty_checks before: ${cB};  «Tiltaksplan med frister»: ${await unchecked.count()}`)
    if(await unchecked.count()){ await unchecked.first().click(); await page.waitForTimeout(4000) }
    const cA=Number(one(`select count(*) from duty_checks`))
    L(`   duty_checks ${cB} -> ${cA}${cB===cA?'   <-- NO WRITE':'   <-- wrote'}`)
    const sB=Number(one(`select count(*) from duty_signers where signed_at is not null`))
    const sign=page.getByRole('button',{name:'Signer'})
    L(`   «Signer»: ${await sign.count()};  signed signers before: ${sB}`)
    if(await sign.count()){
      await sign.first().click(); await page.waitForTimeout(1500)
      const t=(await page.locator('body').innerText()).replace(/\s+/g,' ')
      const conf=t.match(/(Signer|endelig|Bekreft)[^.]{0,140}\./); L(`   confirmation: ${conf?conf[0].slice(0,150):'(none)'}`)
      const yes=page.getByRole('button',{name:/^(Ja|Signer|Bekreft)/}); if(await yes.count()){ await yes.last().click(); await page.waitForTimeout(4000) }
    }
    L(`   signed signers after : ${one(`select count(*) from duty_signers where signed_at is not null`)}`)
    report('duty', obs); obs.length=0

    L('\n=== SEND — the channels offered ===')
    const sid=one(`select id from surveys where title='Utkast uten svar'`)
    await page.goto(`${BASE_URL}/undersokelser/${sid}/send`,{waitUntil:'domcontentloaded'}); await page.waitForLoadState('networkidle').catch(()=>{})
    const t=(await page.locator('body').innerText()).replace(/\s+/g,' ')
    for(const c of ['E-post','Lenke','QR','SMS','Teams']) L(`   «${c}» on screen: ${t.includes(c)}`)
    L(`   feature_flags: ${psql(`select key||'='||enabled from feature_flags order by key`).map(r=>r[0]).join('  ')}`)
    const sms=t.match(/[^.]*SMS[^.]*\./); L(`   SMS copy: ${sms?sms[0].trim().slice(0,180):'(none)'}`)
    const disabled=await page.locator('button:disabled, input:disabled, select:disabled').evaluateAll(e=>e.map(x=>(x.textContent||'').replace(/\s+/g,' ').trim().slice(0,26)).filter(Boolean))
    L(`   disabled controls: ${[...new Set(disabled)].join(' | ').slice(0,200)}`)
    report('send', obs); obs.length=0

    L('\n=== SHELL — workspace switcher (header select) ===')
    await page.goto(`${BASE_URL}/oversikt`,{waitUntil:'domcontentloaded'}); await page.waitForLoadState('networkidle').catch(()=>{})
    const ck=async()=>(await page.context().cookies()).find(c=>c.name==='heituva.workspace')?.value??'(none)'
    L(`   cookie before: ${await ck()}`)
    const hsel=page.locator('header select').first()
    const opts=await hsel.evaluateAll(e=>e.length?Array.from((e[0] as HTMLSelectElement).options).map(o=>o.value):[])
    L(`   options: ${opts.join(', ')}`)
    await hsel.selectOption('quiz'); await page.waitForTimeout(3500)
    L(`   cookie after : ${await ck()}`)
    const t2=(await page.locator('body').innerText()).replace(/\s+/g,' ')
    L(`   quiz workspace showing: ${/Start en quiz|Quiz og arrangement/.test(t2)}`)
    L(`   the word «deltaker» (quiz vocabulary) appears: ${/deltaker/i.test(t2)}`)
    report('workspace', obs); obs.length=0

    L('\n=== SHELL — language, then the mobile slide-over ===')
    const en=page.getByRole('link',{name:/^EN$/}).or(page.getByRole('button',{name:/^EN$/}))
    L(`   «EN»: ${await en.count()}`)
    if(await en.count()){ await en.first().click(); await page.waitForTimeout(4000)
      const t3=(await page.locator('body').innerText()).replace(/\s+/g,' ')
      L(`   English now: ${/Overview|Surveys|Library/.test(t3)}   Norwegian left: ${/Undersøkelser|Oversikt/.test(t3)}`) }
    report('locale', obs)

    const m=await open('administrator',{width:390,height:844})
    await m.page.goto(`${BASE_URL}/oversikt`,{waitUntil:'domcontentloaded'}); await m.page.waitForLoadState('networkidle').catch(()=>{})
    const b=m.page.getByRole('button',{name:'Åpne meny'})
    L(`\n   «Åpne meny» at 390px: ${await b.count()}`)
    if(await b.count()){
      await b.first().click(); await m.page.waitForTimeout(1200)
      const nav=(await m.page.locator('body').innerText()).replace(/\s+/g,' ')
      L(`   slide-over lists the nav: ${/Undersøkelser/.test(nav)&&/Bibliotek/.test(nav)}`)
      const cl=m.page.getByRole('button',{name:/Lukk|×/}); L(`   close control: ${await cl.count()}`)
      if(await cl.count()){ await cl.first().click(); await m.page.waitForTimeout(900)
        L(`   closed again: ${!/Min profil/.test((await m.page.locator('body').innerText()))}`) }
    }
    report('mobile nav', m.obs)
    await m.page.screenshot({path:'docs/walk/shots/w7-mobile.png',fullPage:true}).catch(()=>{})
    await m.browser.close()
  } finally { await browser.close(); if(srv.started)srv.stop() }
}
main().catch(e=>{console.error('FAILED:',e);process.exit(1)})
