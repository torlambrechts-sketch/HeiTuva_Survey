import { createHash } from 'node:crypto'
import { open, ensureServer, BASE_URL, report, psql, one } from './drive'
const Q='98a6cfe8-506e-41fe-970c-c170e9194363', R='61e2f468-a469-42be-90a9-f65204507b83'
const hash=(t:string)=>createHash('sha256').update(t).digest('hex')
async function main(){
  const srv=await ensureServer(); const L=console.log
  const RAW='walk-quiz-token-'+Date.now()
  // A fixture invitation: the seed mints no unspent quiz token whose plaintext is
  // knowable (tokens are stored hashed), so the respondent half of a quiz cannot
  // be driven from a bare seed at all. Recorded in 00-method as a reachability gap.
  const mem=one(`select id from org_members where org_id=(select org_id from surveys where id='${Q}') and role='leser' limit 1`)
  psql(`insert into survey_invitations (round_id, email, name, lang, channel, token_hash, expires_at, member_id, group_id)
        values ('${R}','walk@nordiskstudio.test','Walk Deltaker','no','email','${hash(RAW)}', now()+interval '1 day', '${mem}',
               (select group_id from org_members where id='${mem}'))`)
  L(`minted a fixture invitation for the quiz round (token plaintext known only to this script)`)
  const r=await open('anon',{width:400,height:860})
  try{
    const before=one(`select count(*) from responses where round_id='${R}'`)
    await r.page.goto(`${BASE_URL}/s/${RAW}`,{waitUntil:'domcontentloaded'}); await r.page.waitForLoadState('networkidle').catch(()=>{})
    let t=(await r.page.locator('body').innerText()).replace(/\s+/g,' ')
    L(`\n1. the quiz respondent screen (400px):`)
    L(`   ${t.slice(0,300)}`)
    L(`   mentions points/quiz: ${/poeng|Poeng|quiz|Quiz|riktig/i.test(t)}`)
    L(`   anonymity promise shown: ${/anonym/i.test(t)}   (quiz is NAMED, so it must NOT promise anonymity)`)
    report('quiz respondent load', r.obs); r.obs.length=0

    L(`\n2. answer both questions`)
    for(let i=0;i<8;i++){
      const btns=[...new Set(await r.page.locator('button').allTextContents())].map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean)
      L(`   step ${i}: buttons = ${btns.join(' | ').slice(0,200)}`)
      const pick=r.page.getByRole('button',{name:/Så lenge formålet varer|Sender saken til personvernombudet/})
      if(await pick.count()){ await pick.first().click(); await r.page.waitForTimeout(700) }
      const next=r.page.getByRole('button',{name:/^(Neste|Send|Lever|Fullfør|Send inn)/})
      if(!(await next.count())){ L(`   step ${i}: no forward control — stopping`); break }
      await next.first().click(); await r.page.waitForTimeout(2000)
      t=(await r.page.locator('body').innerText()).replace(/\s+/g,' ')
      if(/Takk!/.test(t)){ L(`   step ${i}: reached the thank-you screen`); break }
    }
    L(`   final screen: ${t.slice(0,400)}`)
    L(`   responses in round ${before} -> ${one(`select count(*) from responses where round_id='${R}'`)}`)
    L(`   invitation responded_at set: ${one(`select responded_at is not null from survey_invitations where token_hash='${hash(RAW)}'`)}`)
    L(`\n3. did the respondent see a score / tiles?`)
    L(`   «poeng» on the thank-you screen: ${/poeng/i.test(t)}`)
    const m=t.match(/[^.]*poeng[^.]*\./i); if(m) L(`   ${m[0].trim().slice(0,200)}`)
    report('quiz answer', r.obs)
  } finally { await r.page.screenshot({path:'docs/walk/shots/w2b-quiz-respondent.png',fullPage:true}).catch(()=>{}); await r.browser.close(); if(srv.started)srv.stop() }
}
main().catch(e=>{console.error('FAILED:',e);process.exit(1)})
