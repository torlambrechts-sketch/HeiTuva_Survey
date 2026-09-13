import { createHash } from 'node:crypto'
import { open, ensureServer, BASE_URL, psql, one } from './drive'
const hash=(t:string)=>createHash('sha256').update(t).digest('hex')
const q=(s:string)=>s.replace(/'/g,"''")
async function main(){
  const srv=await ensureServer(); const L=console.log
  const S=one(`select id from surveys where title='Arbeidsmiljø — månedlig'`)
  const R=one(`select id from survey_rounds where survey_id='${S}' order by round_no desc limit 1`)
  const RAW='fix2-'+Date.now()
  psql(`insert into survey_invitations (round_id,email,name,lang,channel,token_hash,expires_at)
        values ('${R}','fix2@nordiskstudio.test','Fix2','no','email','${hash(RAW)}',now()+interval '1 day')`)

  L('=== W-06 again, reading the textarea VALUE (innerText excludes it) ===')
  {
    const MARK='Draft'+Date.now()
    const r=await open('anon',{width:400,height:860})
    await r.page.goto(`${BASE_URL}/s/${RAW}`,{waitUntil:'domcontentloaded'}); await r.page.waitForLoadState('networkidle').catch(()=>{})
    await r.page.getByRole('button',{name:/Legg til en kommentar/}).first().click(); await r.page.waitForTimeout(600)
    const box=()=>r.page.getByRole('textbox',{name:'Legg til en kommentar til dette spørsmålet'})
    await box().fill(MARK)
    await r.page.getByRole('button',{name:/^[1-5]$/}).nth(3).click(); await r.page.waitForTimeout(400)
    await r.page.getByRole('button',{name:'Neste'}).click(); await r.page.waitForTimeout(1400)
    await r.page.getByRole('button',{name:'Tilbake'}).click(); await r.page.waitForTimeout(1600)
    const n=await box().count()
    L(`  comment box open again after Neste+Tilbake: ${n>0}`)
    if(n) L(`  its value: "${await box().first().inputValue()}"   preserved: ${(await box().first().inputValue())===MARK}`)
    await r.browser.close()
  }

  L('\n=== W-10: is RunModePanel rendered at all on these screens? ===')
  {
    const p=await open('administrator')
    for(const title of ['Utkast uten svar','Aktsomhetsvurdering leverandør','Arbeidsmiljø — månedlig']){
      const sid=one(`select id from surveys where title='${q(title)}'`)
      const st=one(`select status||' / '||run_mode||' / '||anonymity from surveys where id='${sid}'`)
      await p.page.goto(`${BASE_URL}/undersokelser/${sid}/bygg`,{waitUntil:'domcontentloaded'}); await p.page.waitForLoadState('networkidle').catch(()=>{})
      const tabs=[...new Set(await p.page.locator('button').allTextContents())].map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean)
      L(`  «${title}» (${st})`)
      L(`     tabs/buttons: ${tabs.join(' | ').slice(0,200)}`)
      // TWO «Innstillinger» buttons exist — the mobile tab row and the desktop
      // one — and the mobile copy is first in the DOM and hidden at 1440px.
      // «Kjøremodus» is on GENERELT, not Innstillinger (Builder.tsx:401) — the
      // walk looked in the wrong pane, which is the whole of W-10.
      const inn=p.page.locator('button:visible').filter({hasText:'Generelt'})
      L(`     «Generelt» visible: ${await inn.count()}`)
      if(await inn.count()){
        await inn.first().click(); await p.page.waitForTimeout(1500)
        const body=(await p.page.locator('body').innerText()).replace(/\s+/g,' ')
        L(`     «Kjøremodus» pane present: ${/Kjøremodus/.test(body)}`)
        const quiz=p.page.locator('button:visible').filter({hasText:'Quiz'})
        L(`     Quiz card present: ${await quiz.count()} -> ${(await quiz.first().textContent().catch(()=>''))?.replace(/\s+/g,' ').trim().slice(0,50)}`)
        L(`     Quiz card disabled: ${await quiz.count()? await quiz.first().isDisabled() : 'n/a'}`)
        if(await quiz.count()){
          const before=one(`select run_mode||'/'||anonymity from surveys where id='${sid}'`)
          await quiz.first().click(); await p.page.waitForTimeout(3500)
          const now=one(`select run_mode||'/'||anonymity from surveys where id='${sid}'`)
          const t2=(await p.page.locator('body').innerText()).replace(/\s+/g,' ')
          const note=t2.match(/(Malen låser[^.]*\.|Quiz gir poeng[^.]*\.|Undersøkelsen er satt[^.]*\.)/)
          L(`     run_mode/anonymity ${before} -> ${now}`)
          L(`     sentence shown: ${note?note[0]:'(NONE — silent)'}`)
          psql(`update surveys set run_mode=split_part('${before}','/',1), anonymity=split_part('${before}','/',2)::app.anonymity_mode where id='${sid}'`)
        }
      }
    }
    await p.browser.close()
  }
  if(srv.started) srv.stop()
}
main().catch(e=>{console.error('FAILED:',e);process.exit(1)})
