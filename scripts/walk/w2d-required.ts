import { createHash } from 'node:crypto'
import { open, ensureServer, BASE_URL, report, psql, one } from './drive'
const Q='98a6cfe8-506e-41fe-970c-c170e9194363', R='61e2f468-a469-42be-90a9-f65204507b83'
const hash=(t:string)=>createHash('sha256').update(t).digest('hex')
async function main(){
  const srv=await ensureServer(); const L=console.log
  L(`required flags: ${psql(`select position||'=' ||required from survey_questions where survey_id='${Q}' order by position`).map(r=>r[0]).join(' ')}`)
  const RAW='walk-req-'+Date.now()
  const mem=one(`select id from org_members where org_id=(select org_id from surveys where id='${Q}') and role='leser' limit 1`)
  psql(`insert into survey_invitations (round_id,email,name,lang,channel,token_hash,expires_at,member_id,group_id)
        values ('${R}','walk3@nordiskstudio.test','Walk Tre','no','email','${hash(RAW)}',now()+interval '1 day','${mem}',(select group_id from org_members where id='${mem}'))`)
  const r=await open('anon',{width:400,height:860})
  try{
    await r.page.goto(`${BASE_URL}/s/${RAW}`,{waitUntil:'domcontentloaded'}); await r.page.waitForLoadState('networkidle').catch(()=>{})
    L(`\nA. answer Q1, Neste, leave Q2 UNANSWERED, press «Send inn svar»`)
    await r.page.getByRole('button',{name:'Så lenge formålet varer'}).click(); await r.page.waitForTimeout(500)
    await r.page.getByRole('button',{name:'Neste'}).click(); await r.page.waitForTimeout(1500)
    const sub=r.page.getByRole('button',{name:'Send inn svar'})
    L(`   submit disabled with Q2 unanswered: ${await sub.first().isDisabled()}`)
    const before=one(`select count(*) from responses where round_id='${R}'`); r.obs.length=0
    const t0=(await r.page.locator('body').innerText()).replace(/\s+/g,' ')
    await sub.first().click({force:true}); await r.page.waitForTimeout(4000)
    const t1=(await r.page.locator('body').innerText()).replace(/\s+/g,' ')
    L(`   responses ${before} -> ${one(`select count(*) from responses where round_id='${R}'`)}`)
    L(`   page text changed: ${t0!==t1}`)
    L(`   alerts: ${(await r.page.locator('[role=alert],[aria-live]').allTextContents()).map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean).join(' || ')||'(none)'}`)
    L(`   any «må svare»/required copy: ${/må svare|påkrevd|obligatorisk|Du må|mangler/i.test(t1)}`)
    const m=t1.match(/[^.]*(må svare|påkrevd|obligatorisk|mangler)[^.]*/i); if(m) L(`   copy: ${m[0].trim().slice(0,180)}`)
    L(`   still on Q2: ${/Spørsmål 2 av 2/.test(t1)}`)
    report('required refusal', r.obs)

    L(`\nB. now answer Q2 and submit — the same token must still work`)
    await r.page.getByRole('button',{name:'Sender saken til personvernombudet'}).click(); await r.page.waitForTimeout(600)
    await r.page.getByRole('button',{name:'Send inn svar'}).click(); await r.page.waitForTimeout(5000)
    L(`   responses now: ${one(`select count(*) from responses where round_id='${R}'`)}`)
    L(`   responded_at: ${one(`select responded_at is not null from survey_invitations where token_hash='${hash(RAW)}'`)}`)
    const t2=(await r.page.locator('body').innerText()).replace(/\s+/g,' ')
    L(`   thank-you reached: ${/Takk/.test(t2)}`)
    L(`   does the respondent see a SCORE: ${/poeng|riktig|Riktig/i.test(t2)}`)
    L(`   screen: ${t2.slice(0,260)}`)
    report('submit after answering', r.obs)
  } finally { await r.browser.close(); if(srv.started)srv.stop() }
}
main().catch(e=>{console.error('FAILED:',e);process.exit(1)})
