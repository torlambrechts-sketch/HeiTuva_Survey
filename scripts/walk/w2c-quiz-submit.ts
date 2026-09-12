import { createHash } from 'node:crypto'
import { open, ensureServer, BASE_URL, report, psql, one } from './drive'
const Q='98a6cfe8-506e-41fe-970c-c170e9194363', R='61e2f468-a469-42be-90a9-f65204507b83'
const hash=(t:string)=>createHash('sha256').update(t).digest('hex')
async function main(){
  const srv=await ensureServer(); const L=console.log
  const RAW='walk-q-'+Date.now()
  const mem=one(`select id from org_members where org_id=(select org_id from surveys where id='${Q}') and role='leser' limit 1`)
  psql(`insert into survey_invitations (round_id,email,name,lang,channel,token_hash,expires_at,member_id,group_id)
        values ('${R}','walk2@nordiskstudio.test','Walk To','no','email','${hash(RAW)}',now()+interval '1 day','${mem}',(select group_id from org_members where id='${mem}'))`)
  const r=await open('anon',{width:400,height:860})
  try{
    await r.page.goto(`${BASE_URL}/s/${RAW}`,{waitUntil:'domcontentloaded'}); await r.page.waitForLoadState('networkidle').catch(()=>{})
    L('Q1 — click an option, then Neste')
    await r.page.getByRole('button',{name:'Så lenge formålet varer'}).click(); await r.page.waitForTimeout(600)
    L(`   Q1 option aria-pressed/checked: ${await r.page.getByRole('button',{name:'Så lenge formålet varer'}).getAttribute('aria-pressed')}`)
    await r.page.getByRole('button',{name:'Neste'}).click(); await r.page.waitForTimeout(1500)
    L('Q2 — click an option')
    await r.page.getByRole('button',{name:'Sender saken til personvernombudet'}).click(); await r.page.waitForTimeout(800)
    const sub=r.page.getByRole('button',{name:'Send inn svar'})
    L(`   «Send inn svar» count=${await sub.count()} disabled=${await sub.first().isDisabled()}`)
    r.obs.length=0
    const before=one(`select count(*) from responses where round_id='${R}'`)
    const txtBefore=(await r.page.locator('body').innerText()).replace(/\s+/g,' ')
    L('\nCLICK «Send inn svar» ONCE')
    await sub.first().click()
    await r.page.waitForTimeout(6000)
    const txtAfter=(await r.page.locator('body').innerText()).replace(/\s+/g,' ')
    L(`   url: ${new URL(r.page.url()).pathname.slice(0,24)}…`)
    L(`   page changed: ${txtBefore!==txtAfter}`)
    L(`   responses ${before} -> ${one(`select count(*) from responses where round_id='${R}'`)}`)
    L(`   responded_at: ${one(`select responded_at is not null from survey_invitations where token_hash='${hash(RAW)}'`)}`)
    const al=await r.page.locator('[role=alert], [aria-live], .text-red-600, [data-error]').allTextContents()
    L(`   alert/aria-live regions: ${al.map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean).join(' || ')||'(none)'}`)
    L(`   required markers on screen: ${/påkrevd|obligatorisk|må svare|Du må/i.test(txtAfter)}`)
    const m=txtAfter.match(/[^.]*(må|påkrevd|obligatorisk|feil)[^.]*\./i); if(m) L(`   copy: ${m[0].trim().slice(0,200)}`)
    L(`   still on Q2: ${/Spørsmål 2 av 2/.test(txtAfter)}`)
    report('submit', r.obs)
  } finally { await r.page.screenshot({path:'docs/walk/shots/w2c-submit.png',fullPage:true}).catch(()=>{}); await r.browser.close(); if(srv.started)srv.stop() }
}
main().catch(e=>{console.error('FAILED:',e);process.exit(1)})
