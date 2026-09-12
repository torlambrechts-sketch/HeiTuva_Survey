import { createHash } from 'node:crypto'
import { open, ensureServer, BASE_URL, report, psql, one } from './drive'
const S='27eafab6-f41f-4ef9-bc54-0315c27d9235'
const hash=(t:string)=>createHash('sha256').update(t).digest('hex')
const q=(s:string)=>s.replace(/'/g,"''")
async function main(){
  const srv=await ensureServer(); const L=console.log
  const R=one(`select id from survey_rounds where survey_id='${S}' order by round_no desc limit 1`)
  const RAW='walk-thread-'+Date.now()
  psql(`insert into survey_invitations (round_id,email,name,lang,channel,token_hash,expires_at)
        values ('${R}','walk-thread@nordiskstudio.test','Walk Tråd','no','email','${hash(RAW)}',now()+interval '1 day')`)
  const r=await open('anon',{width:400,height:860}); const p=await open('administrator')
  try{
    const MARK='WalkTraad'+Date.now()
    L(`1. comment through an INVITATION token (so a thread exists)`)
    await r.page.goto(`${BASE_URL}/s/${RAW}`,{waitUntil:'domcontentloaded'}); await r.page.waitForLoadState('networkidle').catch(()=>{}); r.obs.length=0
    await r.page.getByRole('button',{name:/Legg til en kommentar/}).first().click(); await r.page.waitForTimeout(600)
    await r.page.getByRole('textbox',{name:'Legg til en kommentar til dette spørsmålet'}).fill(MARK)
    await r.page.getByRole('button',{name:/^Lagre/}).first().click(); await r.page.waitForTimeout(700)
    await r.page.getByRole('button',{name:/^[1-5]$/}).nth(3).click(); await r.page.waitForTimeout(400)
    await r.page.getByRole('button',{name:'Neste'}).click(); await r.page.waitForTimeout(1200)
    await r.page.getByRole('button',{name:'Send inn svar'}).click(); await r.page.waitForTimeout(6000)
    const mine=psql(`select id, coalesce(invitation_id::text,'(null)'), is_anonymous from survey_comments where body like '%${q(MARK)}%'`)
    L(`   comment: ${mine.length?mine[0]!.join(' | '):'(NOT WRITTEN)'}`)
    if(!mine.length) return
    const cid=mine[0]![0]!
    L(`   invitation_id set (a thread exists): ${mine[0]![1]!=='(null)'}`)
    report('comment via invitation', r.obs)

    L(`\n2. the manager replies from the Arbeidsliste`)
    await p.page.goto(`${BASE_URL}/oppgaver`,{waitUntil:'domcontentloaded'}); await p.page.waitForLoadState('networkidle').catch(()=>{}); p.obs.length=0
    const row=p.page.locator('button[aria-expanded]').filter({hasText:MARK})
    L(`   its row: ${await row.count()}`)
    const REPLY='WalkSvar'+Date.now()
    if(await row.count()){
      await row.first().click(); await p.page.waitForTimeout(1500)
      const tas=await p.page.locator('textarea').evaluateAll(e=>e.map(x=>x.getAttribute('aria-label')))
      L(`   textareas now: ${JSON.stringify(tas)}`)
      const box=p.page.locator('textarea').first()
      if(await box.count()){
        await box.fill(REPLY)
        const btns=[...new Set(await p.page.locator('button').allTextContents())].map(x=>x.trim()).filter(x=>/svar|Svar|Send/.test(x))
        L(`   reply-ish buttons: ${btns.join(' | ')}`)
        const send=p.page.getByRole('button',{name:/Send svar/})
        L(`   «Send svar»: ${await send.count()}`)
        if(await send.count()){ await send.first().click(); await p.page.waitForTimeout(4000) }
      }
    }
    L(`   survey_comment_replies for it: ${one(`select count(*) from survey_comment_replies where comment_id='${cid}'`)}`)
    report('reply', p.obs)

    L(`\n3. the respondent reads it back through the SAME token`)
    await r.page.goto(`${BASE_URL}/s/${RAW}`,{waitUntil:'domcontentloaded'}); await r.page.waitForTimeout(2500)
    const rt=(await r.page.locator('body').innerText()).replace(/\s+/g,' ')
    L(`   reply visible to the respondent: ${rt.includes(REPLY)}`)
    L(`   screen: ${rt.slice(0,380)}`)
    report('read back', r.obs)
  } finally { await r.browser.close(); await p.browser.close(); if(srv.started)srv.stop() }
}
main().catch(e=>{console.error('FAILED:',e);process.exit(1)})
