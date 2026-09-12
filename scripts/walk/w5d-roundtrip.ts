import { open, ensureServer, BASE_URL, report, psql, one } from './drive'
const TOKEN='demo-share-link-token-for-local-verification'
const q=(s:string)=>s.replace(/'/g,"''")
async function main(){
  const srv=await ensureServer(); const L=console.log
  const r=await open('anon',{width:400,height:860}); const p=await open('administrator')
  try{
    const MARK='WalkRT'+Date.now()
    const before=one('select count(*) from survey_comments')
    await r.page.goto(`${BASE_URL}/s/${TOKEN}`,{waitUntil:'domcontentloaded'}); await r.page.waitForLoadState('networkidle').catch(()=>{}); r.obs.length=0
    L(`1. per-question comment, typed AND saved with «Lagre» (before: ${before})`)
    await r.page.getByRole('button',{name:/Legg til en kommentar/}).first().click(); await r.page.waitForTimeout(600)
    await r.page.getByRole('textbox',{name:'Legg til en kommentar til dette spørsmålet'}).fill(MARK)
    const save=r.page.getByRole('button',{name:/^Lagre/})
    L(`   «Lagre» inside the comment card: ${await save.count()}`)
    await save.first().click(); await r.page.waitForTimeout(800)
    const pill=(await r.page.locator('body').innerText()).replace(/\s+/g,' ')
    L(`   saved-pill shown: ${/Endre/.test(pill)}`)
    await r.page.getByRole('button',{name:/^[1-5]$/}).nth(3).click(); await r.page.waitForTimeout(400)
    await r.page.getByRole('button',{name:'Neste'}).click(); await r.page.waitForTimeout(1500)
    L(`2. go back — is the SAVED comment still there?`)
    const back=r.page.getByRole('button',{name:'Tilbake'}); await back.first().click(); await r.page.waitForTimeout(1200)
    const b=(await r.page.locator('body').innerText()).replace(/\s+/g,' ')
    L(`   saved pill survived navigation: ${/Endre/.test(b)}`)
    await r.page.getByRole('button',{name:'Neste'}).click(); await r.page.waitForTimeout(1200)
    await r.page.getByRole('button',{name:'Send inn svar'}).click(); await r.page.waitForTimeout(6000)
    L(`   survey_comments ${before} -> ${one('select count(*) from survey_comments')}`)
    const mine=psql(`select id, coalesce(question_id::text,'(survey-level)'), is_anonymous from survey_comments where body like '%${q(MARK)}%'`)
    L(`   row: ${mine.length?mine[0]!.join(' | '):'(NOT WRITTEN)'}`)
    report('saved comment', r.obs)
    if(!mine.length) return
    const cid=mine[0]![0]!

    L(`\n3. the manager sees it and replies`)
    await p.page.goto(`${BASE_URL}/oppgaver`,{waitUntil:'domcontentloaded'}); await p.page.waitForLoadState('networkidle').catch(()=>{}); p.obs.length=0
    const pt=(await p.page.locator('body').innerText()).replace(/\s+/g,' ')
    L(`   comment visible in the Arbeidsliste: ${pt.includes(MARK)}`)
    const row=p.page.locator('button[aria-expanded]').filter({hasText:MARK})
    L(`   its row: ${await row.count()}`)
    const REPLY='WalkSvar'+Date.now()
    if(await row.count()){
      await row.first().click(); await p.page.waitForTimeout(1500)
      const box=p.page.getByRole('textbox',{name:/Skriv et svar|svar/i})
      L(`   reply boxes: ${await box.count()}`)
      const all=await p.page.locator('textarea').evaluateAll(e=>e.map(x=>x.getAttribute('aria-label')||x.getAttribute('placeholder')))
      L(`   textareas: ${JSON.stringify(all)}`)
      if(await box.count()){
        await box.first().fill(REPLY)
        const send=p.page.getByRole('button',{name:/Send svar|^Svar$/})
        L(`   send controls: ${await send.count()}`)
        if(await send.count()){ await send.first().click(); await p.page.waitForTimeout(3500) }
      }
    }
    const rep=psql(`select count(*) from comment_replies where comment_id='${cid}'`).map(x=>x[0]).join('')
    L(`   comment_replies for it: ${rep}`)
    report('reply', p.obs)

    L(`\n4. the respondent reads the reply back through the SAME token`)
    await r.page.goto(`${BASE_URL}/s/${TOKEN}`,{waitUntil:'domcontentloaded'}); await r.page.waitForTimeout(2500)
    const rt=(await r.page.locator('body').innerText()).replace(/\s+/g,' ')
    L(`   reply text visible: ${rt.includes(REPLY)}`)
    L(`   thread section present: ${/Svar fra|Tilbakemelding|svar på kommentaren/i.test(rt)}`)
    L(`   screen: ${rt.slice(0,340)}`)
    report('read back', r.obs)
  } finally { await r.browser.close(); await p.browser.close(); if(srv.started)srv.stop() }
}
main().catch(e=>{console.error('FAILED:',e);process.exit(1)})
