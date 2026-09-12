import { createHash } from 'node:crypto'
import { open, ensureServer, BASE_URL, report, psql, one } from './drive'
const Q='98a6cfe8-506e-41fe-970c-c170e9194363', R='61e2f468-a469-42be-90a9-f65204507b83'
const hash=(t:string)=>createHash('sha256').update(t).digest('hex')
async function main(){
  const srv=await ensureServer(); const L=console.log
  const RAW='walk-after-'+Date.now()
  const mem=one(`select id from org_members where org_id=(select org_id from surveys where id='${Q}') and role='leser' limit 1`)
  psql(`insert into survey_invitations (round_id,email,name,lang,channel,token_hash,expires_at,member_id,group_id)
        values ('${R}','walk4@nordiskstudio.test','Walk Fire','no','email','${hash(RAW)}',now()+interval '1 day','${mem}',(select group_id from org_members where id='${mem}'))`)
  const r=await open('anon',{width:400,height:860}); const p=await open('administrator')
  try{
    await r.page.goto(`${BASE_URL}/s/${RAW}`,{waitUntil:'domcontentloaded'}); await r.page.waitForLoadState('networkidle').catch(()=>{})
    await r.page.getByRole('button',{name:'Så lenge formålet varer'}).click(); await r.page.waitForTimeout(500)
    await r.page.getByRole('button',{name:'Neste'}).click(); await r.page.waitForTimeout(1200)
    await r.page.getByRole('button',{name:'Sender saken til personvernombudet'}).click(); await r.page.waitForTimeout(500)
    await r.page.getByRole('button',{name:'Send inn svar'}).click(); await r.page.waitForTimeout(6000)
    const t=(await r.page.locator('body').innerText()).replace(/\s+/g,' ')
    L(`1. the respondent's screen after a QUIZ submission:`)
    L(`   ${t.slice(0,420)}`)
    L(`   shows a score: ${/poeng|Poeng/.test(t)}   shows right/wrong: ${/riktig|Riktig|galt|feil svar/i.test(t)}`)
    L(`   responses now: ${one(`select count(*) from responses where round_id='${R}'`)}`)

    L(`\n2. the manager's quiz tiles and leaderboard on resultater`)
    await p.page.goto(`${BASE_URL}/undersokelser/${Q}/resultater`,{waitUntil:'domcontentloaded'}); await p.page.waitForLoadState('networkidle').catch(()=>{})
    const pt=(await p.page.locator('body').innerText()).replace(/\s+/g,' ')
    const blk=pt.match(/(Quiz|Lagtavle|Poeng)[\s\S]{0,400}/); L(`   ${blk?blk[0].replace(/\s+/g,' ').slice(0,420):'(no quiz block found)'}`)
    L(`\n3. quiz_leaderboard as the RPC sees it (through the app's own role)`)
    const lb=psql(`select jsonb_pretty(public.quiz_leaderboard('${Q}','${R}'))`).map(r=>r[0]).join(' ')
    L(`   ${lb.replace(/\s+/g,' ').slice(0,300)}`)
    report('quiz after', p.obs)
  } finally { await r.page.screenshot({path:'docs/walk/shots/w2e-quiz-thanks.png',fullPage:true}).catch(()=>{}); await p.page.screenshot({path:'docs/walk/shots/w2e-quiz-results.png',fullPage:true}).catch(()=>{}); await r.browser.close(); await p.browser.close(); if(srv.started)srv.stop() }
}
main().catch(e=>{console.error('FAILED:',e);process.exit(1)})
