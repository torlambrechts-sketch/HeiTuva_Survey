import { open, ensureServer, BASE_URL, report, psql, one } from './drive'
async function main(){
  const srv=await ensureServer(); const L=console.log
  const {browser,page,obs}=await open('administrator')
  const ORG=one(`select id from organizations where name='Nordisk Studio'`)
  try{
    L('=== REPORTS ===')
    await page.goto(`${BASE_URL}/rapporter`,{waitUntil:'domcontentloaded'}); await page.waitForLoadState('networkidle').catch(()=>{}); obs.length=0
    const rB=Number(one(`select count(*) from reports where org_id='${ORG}'`))
    L(`   reports before: ${rB}`)
    const btns=[...new Set(await page.locator('main button').allTextContents())].map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean)
    L(`   buttons: ${btns.join(' | ').slice(0,260)}`)
    const mk=page.getByRole('button',{name:/Ny rapport|Lag rapport|Opprett/})
    L(`   create controls: ${await mk.count()}`)
    if(await mk.count()){ await mk.first().click(); await page.waitForTimeout(4000) }
    const rA=Number(one(`select count(*) from reports where org_id='${ORG}'`))
    L(`   reports ${rB} -> ${rA}${rB===rA?'   <-- NO WRITE':'   <-- wrote'}`)
    L(`   url now: ${new URL(page.url()).pathname}`)
    report('createReport', obs); obs.length=0

    L('\n=== REPORTS — duty checklist, sign, publish ===')
    await page.goto(`${BASE_URL}/rapporter?fane=lov`,{waitUntil:'domcontentloaded'}); await page.waitForLoadState('networkidle').catch(()=>{})
    const chk=page.locator('main button[aria-pressed], main input[type=checkbox]')
    L(`   checklist controls: ${await chk.count()}`)
    const cB=one(`select count(*) from duty_checks`)
    if(await chk.count()){ await chk.first().click({force:true}); await page.waitForTimeout(3500) }
    L(`   duty_checks ${cB} -> ${one(`select count(*) from duty_checks`)}`)
    const sign=page.getByRole('button',{name:/Signer|Godkjenn/})
    L(`   sign controls: ${await sign.count()}`)
    const sB=one(`select count(*) from duty_signatures`)
    if(await sign.count()){ await sign.first().click(); await page.waitForTimeout(1500)
      const yes=page.getByRole('button',{name:/^(Ja|Signer|Bekreft)/}); if(await yes.count()){await yes.last().click(); await page.waitForTimeout(3500)} }
    L(`   duty_signatures ${sB} -> ${one(`select count(*) from duty_signatures`)}`)
    report('duty', obs); obs.length=0

    L('\n=== SEND — which channels does the picker offer? ===')
    const sid=one(`select id from surveys where title='Utkast uten svar'`)
    await page.goto(`${BASE_URL}/undersokelser/${sid}/send`,{waitUntil:'domcontentloaded'}); await page.waitForLoadState('networkidle').catch(()=>{})
    const t=(await page.locator('main').innerText()).replace(/\s+/g,' ')
    for(const c of ['E-post','Lenke','QR','SMS','Teams']) L(`   «${c}»: ${t.includes(c)}`)
    const flags=psql(`select key||'='||enabled from feature_flags order by key`).map(r=>r[0])
    L(`   feature_flags: ${flags.join('  ')}`)
    const smsHint=t.match(/[^.]*SMS[^.]*\./); L(`   SMS copy: ${smsHint?smsHint[0].trim().slice(0,170):'(none)'}`)
    report('send', obs); obs.length=0

    L('\n=== SHELL — workspace switcher, language, mobile slide-over ===')
    await page.goto(`${BASE_URL}/oversikt`,{waitUntil:'domcontentloaded'}); await page.waitForLoadState('networkidle').catch(()=>{})
    const ws=page.locator('header select, header button').filter({hasText:/HR|Quiz|Tilpasset|Kunder/})
    L(`   workspace controls in the header: ${await ws.count()}`)
    const ck=async()=>(await page.context().cookies()).find(c=>c.name==='heituva.workspace')?.value??'(none)'
    L(`   cookie before: ${await ck()}`)
    const hsel=page.locator('header select').first()
    if(await hsel.count()){ await hsel.selectOption('quiz').catch(()=>L('   quiz not offered')); await page.waitForTimeout(3000) }
    L(`   cookie after : ${await ck()}`)
    const t2=(await page.locator('body').innerText()).replace(/\s+/g,' ')
    L(`   the quiz workspace is showing: ${/Quiz og arrangement|Start en quiz/.test(t2)}`)
    report('workspace', obs); obs.length=0

    L('\n   language switch (setLocale)')
    const lang=page.getByRole('button',{name:/^EN$/}).or(page.getByRole('link',{name:/^EN$/}))
    L(`   «EN» control: ${await lang.count()}`)
    if(await lang.count()){ await lang.first().click(); await page.waitForTimeout(3500)
      const t3=(await page.locator('body').innerText()).replace(/\s+/g,' ')
      L(`   page now in English: ${/Overview|Surveys|Library/.test(t3)}`)
      L(`   still Norwegian strings: ${/Undersøkelser|Oversikt/.test(t3)}`) }
    report('locale', obs); obs.length=0

    L('\n   mobile slide-over at 390px')
    const m=await open('administrator',{width:390,height:844})
    await m.page.goto(`${BASE_URL}/oversikt`,{waitUntil:'domcontentloaded'}); await m.page.waitForLoadState('networkidle').catch(()=>{})
    const burger=m.page.getByRole('button',{name:/Meny|meny|Åpne/}).or(m.page.locator('header button').last())
    L(`   menu control: ${await burger.count()}`)
    if(await burger.count()){
      await burger.first().click(); await m.page.waitForTimeout(1200)
      const nav=(await m.page.locator('body').innerText()).replace(/\s+/g,' ')
      L(`   slide-over lists the nav: ${/Undersøkelser/.test(nav)&&/Bibliotek/.test(nav)}`)
      const closed=m.page.getByRole('button',{name:/Lukk|×/})
      L(`   close control: ${await closed.count()}`)
      if(await closed.count()){ await closed.first().click(); await m.page.waitForTimeout(800) }
    }
    report('mobile nav', m.obs)
    await m.page.screenshot({path:'docs/walk/shots/w7-mobile.png',fullPage:true}).catch(()=>{})
    await m.browser.close()
  } finally { await browser.close(); if(srv.started)srv.stop() }
}
main().catch(e=>{console.error('FAILED:',e);process.exit(1)})
