import { open, ensureServer, BASE_URL, report, psql, one } from './drive'
const S='27eafab6-f41f-4ef9-bc54-0315c27d9235'
async function main(){
  const srv=await ensureServer(); const L=console.log
  const p=await open('administrator'); const r=await open('anon',{width:400,height:860})
  try{
    psql(`update live_sessions set status='closed', closed_at=now() where survey_id='${S}' and status='open'`)
    await p.page.goto(`${BASE_URL}/undersokelser/${S}/live`,{waitUntil:'domcontentloaded'}); await p.page.waitForLoadState('networkidle').catch(()=>{})
    await p.page.getByRole('button',{name:/^Start live/}).first().click(); await p.page.waitForTimeout(3000)
    const s=psql(`select id,code from live_sessions where survey_id='${S}' and status='open' order by opened_at desc limit 1`)[0]!
    L(`session ${s[1]} open`)

    L(`\n1. mint a voucher token but DO NOT answer`)
    await r.page.goto(`${BASE_URL}/l/${s[1]}`,{waitUntil:'domcontentloaded'}); await r.page.waitForTimeout(1500)
    const tokenPath=new URL(r.page.url()).pathname
    L(`   token path: ${tokenPath.slice(0,30)}…   reached /s/: ${/^\/s\//.test(tokenPath)}`)
    L(`   invitation responded_at: ${one(`select coalesce(responded_at::text,'(null)') from survey_invitations where live_session_id='${s[0]}' order by created_at desc limit 1`)}`)

    L(`\n2. close the session`)
    await p.page.reload({waitUntil:'domcontentloaded'}); await p.page.waitForTimeout(1500)
    await p.page.getByRole('button',{name:/Avslutt live/}).first().click(); await p.page.waitForTimeout(1200)
    const yes=p.page.getByRole('button',{name:/Ja|Avslutt|Bekreft/}); if(await yes.count()){await yes.first().click(); await p.page.waitForTimeout(2500)}
    L(`   session: ${psql(`select status, expires_at<=now() as expired from live_sessions where id='${s[0]}'`)[0]?.join(' expired=')}`)

    L(`\n3. the UNSPENT token, used after the close`)
    const rb=await open('anon',{width:400,height:860})
    await rb.page.goto(`${BASE_URL}${tokenPath}`,{waitUntil:'domcontentloaded'}); await rb.page.waitForTimeout(2000)
    const t=(await rb.page.locator('body').innerText()).replace(/\s+/g,' ')
    L(`   page: ${t.slice(0,220)}`)
    const respBefore=one('select count(*) from responses')
    const btn=rb.page.getByRole('button',{name:/Send|Lever|Neste|Fullfør/i})
    L(`   answerable (submit controls present): ${await btn.count()}`)
    for(let i=0;i<4 && await btn.count();i++){ await btn.first().click().catch(()=>{}); await rb.page.waitForTimeout(1500)
      const ta=rb.page.locator('textarea'); if(await ta.count()) await ta.first().fill('after close') }
    L(`   responses ${respBefore} -> ${one('select count(*) from responses')}${respBefore===one('select count(*) from responses')?'   (refused — no new response)':'   !! ACCEPTED AFTER CLOSE'}`)
    report('after close', rb.obs); await rb.browser.close()

    L(`\n4. Q78 — a NAMED survey must not be runnable live`)
    const named=psql(`select id,title,anonymity,run_mode from surveys where anonymity='named' and org_id=(select org_id from surveys where id='${S}') limit 1`)[0]!
    L(`   named survey: "${named[1]}" anonymity=${named[2]} run_mode=${named[3]}`)
    // try it in SQL the way the UI would: switch run_mode to live on a named survey
    try{
      psql(`update surveys set run_mode='live' where id='${named[0]}'`)
      L(`   !! database ALLOWED run_mode=live on a named survey`)
      psql(`update surveys set run_mode='${named[3]}' where id='${named[0]}'`)
    }catch(e){ L(`   database refused it: ${String(e).split('\n').find(l=>/ERROR|guard|live_requires/.test(l))?.trim().slice(0,140)}`) }
  } finally { await p.browser.close(); await r.browser.close(); if(srv.started)srv.stop() }
}
main().catch(e=>{console.error('FAILED:',e);process.exit(1)})
