import { createHash } from 'node:crypto'
import { open, ensureServer, BASE_URL, psql, one } from './drive'
const S='27eafab6-f41f-4ef9-bc54-0315c27d9235'
const hash=(t:string)=>createHash('sha256').update(t).digest('hex')
async function main(){
  const srv=await ensureServer(); const L=console.log
  const R=one(`select id from survey_rounds where survey_id='${S}' order by round_no desc limit 1`)
  const RAW='walk-promise-'+Date.now()
  psql(`insert into survey_invitations (round_id,email,name,lang,channel,token_hash,expires_at)
        values ('${R}','walk-p@nordiskstudio.test','Walk P','no','email','${hash(RAW)}',now()+interval '1 day')`)
  for(const [label,path] of [['SHARE LINK','/s/demo-share-link-token-for-local-verification'],['INVITATION','/s/'+RAW]] as const){
    const r=await open('anon',{width:400,height:860})
    await r.page.goto(`${BASE_URL}${path}`,{waitUntil:'domcontentloaded'}); await r.page.waitForLoadState('networkidle').catch(()=>{})
    await r.page.getByRole('button',{name:/Legg til en kommentar/}).first().click(); await r.page.waitForTimeout(700)
    const card=(await r.page.locator('body').innerText()).replace(/\s+/g,' ')
    L(`\n${label} (${path.slice(0,14)}…)`)
    for(const s of ['Lederen kan svare uten å se hvem som skrev','Navnet ditt følger kommentaren, og lederen svarer til deg','Kommentaren leses som den står'])
      L(`   «${s.slice(0,46)}…»: ${card.includes(s)}`)
    await r.browser.close()
  }
  L(`\nthe manager's side, for the share-link comment:`)
  L(`   fbReplyNoThread copy: «Denne kommentaren kom fra en delt lenke, så det finnes ingen tråd å svare i.»`)
  if(srv.started) srv.stop()
}
main().catch(e=>{console.error('FAILED:',e);process.exit(1)})
