import { open, ensureServer, BASE_URL, report, psql, one } from './drive'
const S='27eafab6-f41f-4ef9-bc54-0315c27d9235'
async function main(){
  const srv=await ensureServer(); const L=console.log
  // presenter
  const p=await open('administrator'); 
  // respondent, mobile
  const r=await open('anon',{width:400,height:860})
  try{
    // clean slate: close any open session from earlier steps
    psql(`update live_sessions set status='closed', closed_at=now() where survey_id='${S}' and status='open'`)
    await p.page.goto(`${BASE_URL}/undersokelser/${S}/live`,{waitUntil:'domcontentloaded'}); await p.page.waitForLoadState('networkidle').catch(()=>{}); p.obs.length=0

    L('1. open a session')
    await p.page.getByRole('button',{name:/^Start live/}).first().click(); await p.page.waitForTimeout(3000)
    const sess=psql(`select id,code,status,revealed from live_sessions where survey_id='${S}' and status='open' order by opened_at desc limit 1`)[0]
    L(`   session: ${sess?.join(' | ') ?? 'NONE — no write'}`)
    if(!sess) throw new Error('no open session')
    const code=sess[1]!
    report('open', p.obs); p.obs.length=0

    L(`\n2. the code is shown on the presenter screen`)
    const ptxt=(await p.page.locator('body').innerText()).replace(/\s+/g,' ')
    L(`   code «${code}» visible: ${ptxt.includes(code)}`)
    const joinUrl=`${BASE_URL}/l/${code}`
    L(`   join url: /l/${code}`)

    L(`\n3. a respondent redeems the voucher (what the QR does)`)
    const invBefore=one(`select count(*) from survey_invitations`)
    await r.page.goto(joinUrl,{waitUntil:'domcontentloaded'}); await r.page.waitForLoadState('networkidle').catch(()=>{})
    L(`   landed on: ${new URL(r.page.url()).pathname.slice(0,40)}`)
    const redeemed=/^\/s\//.test(new URL(r.page.url()).pathname)
    L(`   redirected into /s/<token>: ${redeemed}`)
    L(`   invitations ${invBefore} -> ${one(`select count(*) from survey_invitations`)}`)
    report('redeem', r.obs); r.obs.length=0
    if(!redeemed){ L(`   page said: ${(await r.page.locator('body').innerText()).replace(/\s+/g,' ').slice(0,200)}`) }

    if(redeemed){
      L(`\n4. answer as that respondent (mobile 400px)`)
      const respBefore=one(`select count(*) from responses`)
      const rtxt=(await r.page.locator('body').innerText()).replace(/\s+/g,' ')
      L(`   question: ${rtxt.slice(0,160)}`)
      // answer whatever the first question offers
      const radios=r.page.locator('input[type=radio], [role=radio]')
      const tas=r.page.locator('textarea')
      L(`   radios: ${await radios.count()}  textareas: ${await tas.count()}`)
      if(await radios.count()) await radios.first().check({force:true}).catch(()=>{})
      if(await tas.count()) await tas.first().fill('Walk svar')
      const send=r.page.getByRole('button',{name:/Send|Lever|Fullfør|Neste/i})
      L(`   submit-ish buttons: ${(await send.count())} -> ${[...new Set(await send.allTextContents())].join(' | ')}`)
      for(let i=0;i<6 && await send.count();i++){
        await send.first().click(); await r.page.waitForTimeout(2000)
        const t=(await r.page.locator('body').innerText()).replace(/\s+/g,' ')
        if(/Takk|takk/.test(t)){L(`   finished: ${t.slice(0,120)}`);break}
        const rad=r.page.locator('input[type=radio], [role=radio]'); if(await rad.count()) await rad.first().check({force:true}).catch(()=>{})
        const ta=r.page.locator('textarea'); if(await ta.count()) await ta.first().fill('Walk svar')
      }
      L(`   responses ${respBefore} -> ${one(`select count(*) from responses`)}`)
      report('answer', r.obs); r.obs.length=0
    }

    L(`\n5. the presenter's counter`)
    await p.page.reload({waitUntil:'domcontentloaded'}); await p.page.waitForTimeout(2000)
    const c=(await p.page.locator('body').innerText()).replace(/\s+/g,' ').match(/\d+ svar/); L(`   counter: ${c?c[0]:'(not found)'}`)

    L(`\n6. reveal`)
    const rev0=one(`select revealed from live_sessions where id='${sess[0]}'`)
    const vis=p.page.getByRole('button',{name:/Vis resultat|Skjul/}); L(`   reveal button: ${(await vis.count())} -> ${(await vis.first().textContent().catch(()=>''))?.trim()}`)
    if(await vis.count()){await vis.first().click(); await p.page.waitForTimeout(2500)}
    L(`   revealed ${rev0} -> ${one(`select revealed from live_sessions where id='${sess[0]}'`)}`)
    report('reveal', p.obs); p.obs.length=0

    L(`\n7. close the session, and what happens to its tokens`)
    const liveInv=one(`select count(*) from survey_invitations where live_session_id='${sess[0]}'`)
    L(`   invitations minted by this session: ${liveInv}`)
    const close=p.page.getByRole('button',{name:/Avslutt live/}); L(`   close button: ${await close.count()}`)
    if(await close.count()){await close.first().click(); await p.page.waitForTimeout(1500)
      const yes=p.page.getByRole('button',{name:/Ja|Avslutt|Bekreft/}); if(await yes.count()){await yes.first().click(); await p.page.waitForTimeout(3000)}}
    const st=psql(`select status,closed_at is not null,revealed from live_sessions where id='${sess[0]}'`)[0]
    L(`   session now: status=${st?.[0]} closed_at_set=${st?.[1]} revealed=${st?.[2]}`)
    report('close', p.obs)

    if(redeemed){
      L(`\n8. the respondent's token after the session closed`)
      const url=r.page.url()
      await r.page.goto(url.split('?')[0]!,{waitUntil:'domcontentloaded'}); await r.page.waitForTimeout(1500)
      L(`   reopening the same /s/<token>: ${(await r.page.locator('body').innerText()).replace(/\s+/g,' ').slice(0,180)}`)
    }
  } finally {
    await p.page.screenshot({path:'docs/walk/shots/w1-presenter.png',fullPage:true}).catch(()=>{})
    await r.page.screenshot({path:'docs/walk/shots/w1-respondent.png',fullPage:true}).catch(()=>{})
    await p.browser.close(); await r.browser.close(); if(srv.started)srv.stop()
  }
}
main().catch(e=>{console.error('FAILED:',e);process.exit(1)})
