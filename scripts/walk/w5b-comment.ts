import { open, ensureServer, BASE_URL, report, psql, one } from './drive'
const TOKEN='demo-share-link-token-for-local-verification'
const q=(s:string)=>s.replace(/'/g,"''")
async function main(){
  const srv=await ensureServer(); const L=console.log
  const r=await open('anon',{width:400,height:860})
  try{
    const MARK='WalkKomm'+Date.now()
    const before=one('select count(*) from survey_comments')
    await r.page.goto(`${BASE_URL}/s/${TOKEN}`,{waitUntil:'domcontentloaded'}); await r.page.waitForLoadState('networkidle').catch(()=>{}); r.obs.length=0
    L(`survey_comments before: ${before}`)
    L(`\n1. open the comment box on Q1 and type`)
    await r.page.getByRole('button',{name:/Legg til en kommentar/}).first().click(); await r.page.waitForTimeout(700)
    const ta=r.page.locator('textarea').first()
    await ta.fill(MARK); await r.page.waitForTimeout(400)
    L(`   textarea value after fill: "${await ta.inputValue()}"`)
    L(`\n2. answer Q1 and go to Q2`)
    const opt=r.page.locator('button').filter({hasText:/^[1-5]$/}).or(r.page.getByRole('button',{name:/^[1-5]$/}))
    L(`   scale buttons: ${await opt.count()}`)
    if(await opt.count()) { await opt.nth(3).click(); await r.page.waitForTimeout(500) }
    await r.page.getByRole('button',{name:'Neste'}).click(); await r.page.waitForTimeout(1500)
    L(`\n3. go BACK to Q1 — is the comment still there?`)
    const back=r.page.getByRole('button',{name:'Tilbake'})
    if(await back.count()){ await back.first().click(); await r.page.waitForTimeout(1200)
      const tas=r.page.locator('textarea'); const n=await tas.count()
      L(`   textareas on Q1 now: ${n}`)
      if(n) L(`   value: "${await tas.first().inputValue()}"   preserved: ${(await tas.first().inputValue())===MARK}`)
      else L(`   the comment box is CLOSED again — typed text ${'' === '' ? 'not visible' : ''}`)
    }
    L(`\n4. forward again and submit`)
    await r.page.getByRole('button',{name:'Neste'}).click().catch(()=>{}); await r.page.waitForTimeout(1200)
    const sub=r.page.getByRole('button',{name:'Send inn svar'})
    L(`   submit present: ${await sub.count()}`)
    if(await sub.count()){ await sub.first().click(); await r.page.waitForTimeout(6000) }
    const t=(await r.page.locator('body').innerText()).replace(/\s+/g,' ')
    L(`   thank-you: ${/Takk/.test(t)}`)
    L(`   survey_comments ${before} -> ${one('select count(*) from survey_comments')}`)
    const rows=psql(`select id, coalesce(question_id::text,'(none)'), is_anonymous, left(body,30) from survey_comments where body like '%${q(MARK)}%'`)
    L(`   my comment: ${rows.length?rows[0]!.join(' | '):'(NOT WRITTEN)'}`)
    report('comment submit', r.obs)
  } finally { await r.browser.close(); if(srv.started)srv.stop() }
}
main().catch(e=>{console.error('FAILED:',e);process.exit(1)})
