import { createHash } from 'node:crypto'
import { open, ensureServer, BASE_URL, psql, one } from './drive'
const hash=(t:string)=>createHash('sha256').update(t).digest('hex')
const q=(s:string)=>s.replace(/'/g,"''")
const SHARE='demo-share-link-token-for-local-verification'

async function main(){
  const srv=await ensureServer(); const L=console.log
  const S=one(`select id from surveys where title='Arbeidsmiljø — månedlig'`)
  const R=one(`select id from survey_rounds where survey_id='${S}' order by round_no desc limit 1`)
  const RAW='fix-'+Date.now()
  psql(`insert into survey_invitations (round_id,email,name,lang,channel,token_hash,expires_at)
        values ('${R}','fix@nordiskstudio.test','Fix','no','email','${hash(RAW)}',now()+interval '1 day')`)

  L('=== W-03: the reply promise, both token kinds ===')
  for(const [label,path,expect] of [
    ['SHARE LINK', `/s/${SHARE}`, 'no-reply'],
    ['INVITATION', `/s/${RAW}`,  'reply'],
  ] as const){
    const r=await open('anon',{width:400,height:860})
    await r.page.goto(`${BASE_URL}${path}`,{waitUntil:'domcontentloaded'}); await r.page.waitForLoadState('networkidle').catch(()=>{})
    await r.page.getByRole('button',{name:/Legg til en kommentar/}).first().click(); await r.page.waitForTimeout(700)
    const t=(await r.page.locator('body').innerText()).replace(/\s+/g,' ')
    const promises={
      'Lederen kan svare uten å se hvem som skrev.': t.includes('Lederen kan svare uten å se hvem som skrev.'),
      'Kommentaren leses, men du kan ikke få svar på denne lenken.': t.includes('Kommentaren leses, men du kan ikke få svar på denne lenken.'),
    }
    L(`  ${label} (expect ${expect}):`)
    for(const [k,v] of Object.entries(promises)) L(`     «${k.slice(0,44)}…» ${v}`)
    const ok = expect==='no-reply' ? (!promises['Lederen kan svare uten å se hvem som skrev.'] && promises['Kommentaren leses, men du kan ikke få svar på denne lenken.'])
                                   : (promises['Lederen kan svare uten å se hvem som skrev.'] && !promises['Kommentaren leses, men du kan ikke få svar på denne lenken.'])
    L(`     ${ok?'CORRECT':'!! WRONG'}`)
    await r.browser.close()
  }

  L('\n=== W-06: a typed-but-unsaved comment survives navigation AND submits ===')
  {
    const MARK='FixDraft'+Date.now()
    const before=Number(one('select count(*) from survey_comments'))
    const r=await open('anon',{width:400,height:860})
    await r.page.goto(`${BASE_URL}/s/${RAW}`,{waitUntil:'domcontentloaded'}); await r.page.waitForLoadState('networkidle').catch(()=>{})
    await r.page.getByRole('button',{name:/Legg til en kommentar/}).first().click(); await r.page.waitForTimeout(600)
    await r.page.getByRole('textbox',{name:'Legg til en kommentar til dette spørsmålet'}).fill(MARK)
    L(`  typed on Q1, NOT pressing «Lagre»`)
    await r.page.getByRole('button',{name:/^[1-5]$/}).nth(3).click(); await r.page.waitForTimeout(400)
    await r.page.getByRole('button',{name:'Neste'}).click(); await r.page.waitForTimeout(1400)
    await r.page.getByRole('button',{name:'Tilbake'}).click(); await r.page.waitForTimeout(1400)
    const back=(await r.page.locator('body').innerText()).replace(/\s+/g,' ')
    L(`  after Neste + Tilbake, the text is still on screen: ${back.includes(MARK)}`)
    await r.page.getByRole('button',{name:'Neste'}).click(); await r.page.waitForTimeout(1200)
    await r.page.getByRole('button',{name:'Send inn svar'}).click(); await r.page.waitForTimeout(6000)
    const after=Number(one('select count(*) from survey_comments'))
    const row=psql(`select coalesce(question_id::text,'(survey-level)') from survey_comments where body like '%${q(MARK)}%'`)
    L(`  survey_comments ${before} -> ${after};  written: ${row.length?row[0]![0]:'(NOT WRITTEN)'}`)
    await r.browser.close()
  }

  L('\n=== W-10 RE-MEASURED: is the Quiz card really absent? ===')
  {
    const p=await open('administrator')
    for(const title of ['Utkast uten svar','Aktsomhetsvurdering leverandør']){
      const sid=one(`select id from surveys where title='${q(title)}'`)
      const anon=one(`select anonymity from surveys where id='${sid}'`)
      const pack=one(`select coalesce(template_pack_key,'(none)') from surveys where id='${sid}'`)
      await p.page.goto(`${BASE_URL}/undersokelser/${sid}/bygg`,{waitUntil:'domcontentloaded'}); await p.page.waitForLoadState('networkidle').catch(()=>{})
      const inn=p.page.getByRole('button',{name:/^Innstillinger$/}); if(await inn.count()){await inn.first().click(); await p.page.waitForTimeout(1200)}
      const exact=p.page.getByRole('button',{name:/^Quiz$/})
      const real=p.page.getByRole('button',{name:/Quiz/})
      L(`  «${title}» (anonymity=${anon}, pack=${pack})`)
      L(`     /^Quiz$/ matches: ${await exact.count()}   (the walk's locator)`)
      L(`     /Quiz/  matches: ${await real.count()}   -> ${(await real.first().textContent().catch(()=>''))?.replace(/\s+/g,' ').trim().slice(0,44)}`)
      if(await real.count()){
        const before=one(`select run_mode||'/'||anonymity from surveys where id='${sid}'`)
        await real.first().click(); await p.page.waitForTimeout(3500)
        const after=one(`select run_mode||'/'||anonymity from surveys where id='${sid}'`)
        const t=(await p.page.locator('body').innerText()).replace(/\s+/g,' ')
        const note=t.match(/(Malen låser[^.]*\.|Quiz gir poeng[^.]*\.|Undersøkelsen er satt[^.]*\.)/)
        L(`     run_mode/anonymity ${before} -> ${after}`)
        L(`     note on screen: ${note?note[0]:'(none)'}`)
        psql(`update surveys set run_mode=split_part('${before}','/',1), anonymity=split_part('${before}','/',2) where id='${sid}'`)
      }
    }
    await p.browser.close()
  }
  if(srv.started) srv.stop()
}
main().catch(e=>{console.error('FAILED:',e);process.exit(1)})
