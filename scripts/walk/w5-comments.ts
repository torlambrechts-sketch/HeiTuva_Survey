import { open, ensureServer, BASE_URL, report, psql, one } from './drive'
const TOKEN='demo-share-link-token-for-local-verification'
const q=(s:string)=>s.replace(/'/g,"''")
async function main(){
  const srv=await ensureServer(); const L=console.log
  const r=await open('anon',{width:400,height:860}); const p=await open('administrator')
  try{
    L('=== 1. a respondent writes a comment from /s/<token> ===')
    const cBefore=one('select count(*) from survey_comments')
    await r.page.goto(`${BASE_URL}/s/${TOKEN}`,{waitUntil:'domcontentloaded'}); await r.page.waitForLoadState('networkidle').catch(()=>{}); r.obs.length=0
    let t=(await r.page.locator('body').innerText()).replace(/\s+/g,' ')
    L(`   screen: ${t.slice(0,200)}`)
    const add=r.page.getByRole('button',{name:/Legg til en kommentar/})
    L(`   «Legg til en kommentar» controls: ${await add.count()}`)
    const MARK='Walk-kommentar-'+Date.now()
    if(await add.count()){
      await add.first().click(); await r.page.waitForTimeout(800)
      const ta=r.page.locator('textarea'); L(`   textareas after opening: ${await ta.count()}`)
      if(await ta.count()){ await ta.first().fill(MARK); await r.page.waitForTimeout(400) }
    }
    // walk the survey to the end and submit
    for(let i=0;i<8;i++){
      const next=r.page.getByRole('button',{name:/^(Neste|Send inn svar)$/})
      if(!(await next.count())) break
      const label=(await next.first().textContent())?.trim()
      await next.first().click(); await r.page.waitForTimeout(2000)
      t=(await r.page.locator('body').innerText()).replace(/\s+/g,' ')
      if(label==='Send inn svar'||/Takk/.test(t)) break
    }
    L(`   thank-you reached: ${/Takk/.test(t)}`)
    L(`   survey_comments ${cBefore} -> ${one('select count(*) from survey_comments')}`)
    const mine=psql(`select id, status, left(body,40) from survey_comments where body like '%${q(MARK)}%'`)
    L(`   my comment row: ${mine.length?mine[0]!.join(' | '):'(NOT WRITTEN)'}`)
    report('respondent comment', r.obs); r.obs.length=0
    if(!mine.length){ L('   stopping: nothing to reply to'); return }
    const cid=mine[0]![0]!

    L('\n=== 2. a manager replies to it from the Arbeidsliste ===')
    await p.page.goto(`${BASE_URL}/oppgaver`,{waitUntil:'domcontentloaded'}); await p.page.waitForLoadState('networkidle').catch(()=>{}); p.obs.length=0
    const pt=(await p.page.locator('body').innerText()).replace(/\s+/g,' ')
    L(`   the comment appears in the worklist: ${pt.includes(MARK.slice(0,18))}`)
    const row=p.page.locator('button[aria-expanded]').filter({hasText:MARK.slice(0,18)})
    L(`   its row: ${await row.count()}`)
    const REPLY='Walk-svar-'+Date.now()
    if(await row.count()){
      await row.first().click(); await p.page.waitForTimeout(1500)
      const rta=p.page.getByRole('textbox',{name:/svar|Svar/}).or(p.page.locator('textarea'))
      L(`   reply boxes: ${await rta.count()}`)
      if(await rta.count()){
        await rta.first().fill(REPLY)
        const send=p.page.getByRole('button',{name:/Send svar|Svar|Lagre/})
        L(`   send controls: ${await send.count()} -> ${[...new Set(await send.allTextContents())].join(' | ').slice(0,80)}`)
        if(await send.count()){ await send.first().click(); await p.page.waitForTimeout(3000) }
      }
    }
    const replies=psql(`select id, left(body,30), status from survey_comments where parent_id='${cid}' or body like '%${q(REPLY)}%'`)
    L(`   reply row: ${replies.length?replies[0]!.join(' | '):'(NOT WRITTEN)'}`)
    report('manager reply', p.obs); p.obs.length=0

    L('\n=== 3. the respondent reads the reply back through the SAME token ===')
    await r.page.goto(`${BASE_URL}/s/${TOKEN}`,{waitUntil:'domcontentloaded'}); await r.page.waitForLoadState('networkidle').catch(()=>{})
    await r.page.waitForTimeout(1500)
    const rt=(await r.page.locator('body').innerText()).replace(/\s+/g,' ')
    L(`   reply visible to the respondent: ${rt.includes(REPLY.slice(0,14))}`)
    L(`   own comment visible: ${rt.includes(MARK.slice(0,18))}`)
    L(`   screen: ${rt.slice(0,320)}`)
    report('round trip', r.obs)
  } finally { await r.page.screenshot({path:'docs/walk/shots/w5-respondent.png',fullPage:true}).catch(()=>{}); await p.browser.close(); await r.browser.close(); if(srv.started)srv.stop() }
}
main().catch(e=>{console.error('FAILED:',e);process.exit(1)})
