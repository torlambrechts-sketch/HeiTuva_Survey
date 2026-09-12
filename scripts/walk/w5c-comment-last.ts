import { open, ensureServer, BASE_URL, report, psql, one } from './drive'
const TOKEN='demo-share-link-token-for-local-verification'
const q=(s:string)=>s.replace(/'/g,"''")
async function main(){
  const srv=await ensureServer(); const L=console.log
  const r=await open('anon',{width:400,height:860})
  try{
    const MARK='WalkLast'+Date.now()
    const before=one('select count(*) from survey_comments')
    await r.page.goto(`${BASE_URL}/s/${TOKEN}`,{waitUntil:'domcontentloaded'}); await r.page.waitForLoadState('networkidle').catch(()=>{}); r.obs.length=0
    L(`A. answer Q1, go to Q2, comment THERE, submit without navigating (before: ${before})`)
    await r.page.getByRole('button',{name:/^[1-5]$/}).nth(3).click(); await r.page.waitForTimeout(400)
    await r.page.getByRole('button',{name:'Neste'}).click(); await r.page.waitForTimeout(1500)
    const add=r.page.getByRole('button',{name:/Legg til en kommentar/})
    L(`   «Legg til en kommentar» on Q2: ${await add.count()}`)
    if(await add.count()){ await add.first().click(); await r.page.waitForTimeout(700) }
    const tas=r.page.locator('textarea'); L(`   textareas: ${await tas.count()}`)
    // Q2 is a free-text question, so there are two boxes: the answer and the comment.
    for(let i=0;i<await tas.count();i++){
      const ph=await tas.nth(i).getAttribute('placeholder'); const al=await tas.nth(i).getAttribute('aria-label')
      L(`     textarea ${i}: placeholder=${JSON.stringify(ph)} aria-label=${JSON.stringify(al)}`)
    }
    const n=await tas.count()
    // the PER-QUESTION comment is the one whose aria-label is the comment label
    const perQ = r.page.getByRole('textbox',{name:'Legg til en kommentar til dette spørsmålet'})
    L(`   per-question comment box found: ${await perQ.count()}`)
    await perQ.first().fill(MARK)
    if(n>=1) await tas.nth(0).fill('Walk fritekstsvar')
    L(`   values: ${JSON.stringify(await Promise.all(Array.from({length:n},(_,i)=>tas.nth(i).inputValue())))}`)
    await r.page.getByRole('button',{name:'Send inn svar'}).click(); await r.page.waitForTimeout(6000)
    L(`   thank-you: ${/Takk/.test((await r.page.locator('body').innerText()))}`)
    L(`   survey_comments ${before} -> ${one('select count(*) from survey_comments')}`)
    const rows=psql(`select id, coalesce(question_id::text,'(none)') , is_anonymous, left(body,26) from survey_comments where body like '%${q(MARK)}%'`)
    L(`   my comment: ${rows.length?rows[0]!.join(' | '):'(NOT WRITTEN)'}`)
    report('comment on last question', r.obs)
  } finally { await r.browser.close(); if(srv.started)srv.stop() }
}
main().catch(e=>{console.error('FAILED:',e);process.exit(1)})
