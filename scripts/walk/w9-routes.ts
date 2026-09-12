import { open, ensureServer, BASE_URL, one } from './drive'
import type { PersonaName } from '../../tests/db/personas'

// Derived from tests/routes.manifest.ts (route + persona), plus the routes the
// manifest reaches only by navigation: live, test, the voucher and the report share.
const ROUTES: [PersonaName|'anon', string][] = [
  ['anon','/'],['anon','/personvern'],['anon','/databehandleravtale'],['anon','/logg-inn'],['anon','/bruksomrader'],
  ['administrator','/oversikt'],['administrator','/oppgaver'],['administrator','/undersokelser'],
  ['administrator','/hjelp'],['administrator','/profil'],['administrator','/dashboard'],['administrator','/rapporter'],
  ['administrator','/bibliotek'],['administrator','/undersokelser/ny'],
  ['administrator','/administrasjon'],['administrator','/administrasjon/profil'],['administrator','/administrasjon/brukere'],
  ['administrator','/administrasjon/grupper'],['administrator','/administrasjon/integrasjoner'],
  ['administrator','/administrasjon/integrasjoner/entra'],['administrator','/administrasjon/malgrupper'],
  ['administrator','/administrasjon/personvern'],['administrator','/administrasjon/valg'],['administrator','/administrasjon/sprak'],
  ['redaktor','/administrasjon'],['redaktor','/rapporter'],
  ['leser','/profil'],['leser','/oversikt'],['leser','/undersokelser'],['leser','/bibliotek'],['leser','/rapporter'],
  ['anon','/s/ugyldig-token-finnes-ikke'],['anon','/l/IKKEFINNES'],
]
async function main(){
  const srv=await ensureServer(); const L=console.log
  const sid=one(`select id from surveys where title='Arbeidsmiljø — månedlig'`)
  const per: Record<string,[PersonaName|'anon',string][]> = {}
  for(const [as,r] of ROUTES) (per[as] ??= []).push([as,r])
  // survey sub-routes, as administrator
  for(const sub of ['bygg','send','resultater','live','test']) per['administrator']!.push(['administrator',`/undersokelser/${sid}/${sub}`])
  let bad=0, total=0
  for(const as of Object.keys(per)){
    const {browser,page,obs}=await open(as as PersonaName|'anon')
    for(const [,route] of per[as]!){
      obs.length=0; total++
      let status=0
      try{
        const res=await page.goto(`${BASE_URL}${route}`,{waitUntil:'domcontentloaded',timeout:30000})
        status=res?.status()??0
        await page.waitForLoadState('networkidle',{timeout:8000}).catch(()=>{})
      }catch(e){ obs.push({kind:'pageerror',text:'navigation: '+String(e).split('\n')[0]}) }
      const txt=(await page.locator('body').innerText().catch(()=>''))?.replace(/\s+/g,' ')??''
      const appErr=/Application error|server-side exception/i.test(txt)
      const rawKey=/\b(nav|admin|tasks|dash|send|wl|fb|legal|help)\.[a-zA-Z]{3,}\b/.test(txt)
      const real=obs.filter(o=>!(o.kind==='requestfailed'&&/_rsc=/.test(o.text)))
      const flag = appErr||rawKey||real.length
      if(flag) bad++
      L(`${flag?'!!':'ok'} ${as.padEnd(13)} ${route.padEnd(50)} http=${status} final=${new URL(page.url()).pathname.slice(0,34)}`)
      if(appErr) L(`     APPLICATION ERROR: ${txt.slice(0,140)}`)
      if(rawKey) L(`     RAW MESSAGE KEY: ${(txt.match(/\b(nav|admin|tasks|dash|send|wl|fb|legal|help)\.[a-zA-Z]{3,}\b/)||[])[0]}`)
      for(const o of real) L(`     ${o.kind}: ${o.text.slice(0,160)}`)
    }
    await browser.close()
  }
  L(`\n${total} routes driven, ${bad} with something to look at`)
  if(srv.started) srv.stop()
}
main().catch(e=>{console.error('FAILED:',e);process.exit(1)})
