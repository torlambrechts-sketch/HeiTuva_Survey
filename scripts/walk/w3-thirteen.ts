import { createHash } from 'node:crypto'
import { open, ensureServer, BASE_URL, report, psql, one } from './drive'
import { QUESTION_TYPES } from '../../lib/questions/registry'
const hash=(t:string)=>createHash('sha256').update(t).digest('hex')
const J=(o:unknown)=>`'${JSON.stringify(o).replace(/'/g,"''")}'::jsonb`

async function main(){
  const srv=await ensureServer(); const L=console.log
  const types=Object.keys(QUESTION_TYPES)
  L(`building one survey with all ${types.length} types, from the registry's own defaultConfig`)
  const ORG=one(`select id from organizations where name='Nordisk Studio'`)
  // a fresh anonymous survey so every renderer is on the respondent surface
  const sid=one(`insert into surveys (org_id,title,status,anonymity,source_lang,langs,k_threshold)
                 values ('${ORG}','Walk — alle spørsmålstyper','aktiv','anonymous','no',array['no'],2) returning id`)
  let pos=0
  for(const t of types){
    const def=(QUESTION_TYPES as Record<string,{defaultConfig:unknown}>)[t]!.defaultConfig
    // options/statements the renderers need, taken from the registry's flags
    const f=(QUESTION_TYPES as Record<string,Record<string,unknown>>)[t]!
    const cfg:Record<string,unknown>={...(def as Record<string,unknown>)}
    if(f.optionList||f.choiceOptions) cfg.options ??= ['Alternativ A','Alternativ B','Alternativ C']
    if(f.statements) cfg.statements ??= ['Utsagn 1','Utsagn 2']
    if(f.imageOptions) cfg.options ??= [{label:'Bilde A'},{label:'Bilde B'}]
    if(f.formFields) cfg.fields ??= [{key:'navn',label:'Navn',type:'text'}]
    pos++
    psql(`insert into survey_questions (survey_id,position,type,text,required,config)
          values ('${sid}',${pos},'${t}','${pos}. ${t} — walk',false,${J(cfg)})`)
  }
  // question_snapshot is NOT NULL — the round FREEZES its questions (the same
  // shape tests/db/factories.ts createRound writes). Built from the rows just
  // inserted rather than from my own idea of the shape.
  const rid=one(`insert into survey_rounds (survey_id,round_no,status,question_snapshot)
                 select '${sid}',1,'open',
                        coalesce(jsonb_agg(jsonb_build_object('id',id,'type',type,'text',text,'config',config) order by position),'[]'::jsonb)
                 from survey_questions where survey_id='${sid}' returning id`)
  const RAW='walk-13-'+Date.now()
  psql(`insert into survey_invitations (round_id,email,name,lang,channel,token_hash,expires_at)
        values ('${rid}','walk13@nordiskstudio.test','Walk Tretten','no','email','${hash(RAW)}',now()+interval '1 day')`)
  L(`survey ${sid} with ${pos} questions, token minted`)

  const r=await open('anon',{width:400,height:860})
  try{
    await r.page.goto(`${BASE_URL}/s/${RAW}`,{waitUntil:'domcontentloaded'}); await r.page.waitForLoadState('networkidle').catch(()=>{})
    const seen:string[]=[]; const broken:string[]=[]
    for(let i=0;i<types.length+2;i++){
      const t=(await r.page.locator('body').innerText()).replace(/\s+/g,' ')
      if(/Takk/.test(t)) { L(`  reached the thank-you after ${i} screens`); break }
      const m=t.match(/(\d+)\. ([a-z_]+) — walk/)
      const label=m?`${m[1]}:${m[2]}`:'(no question heading)'
      // what controls does this renderer put on screen?
      const ctrls=await r.page.locator('main button, main input, main select, main textarea, main [role=radio], main [role=slider]').count()
      const appErr=/Application error|server-side exception/i.test(t)
      const rawKey=/\b(respondent|questions)\.[a-zA-Z]{3,}\b/.test(t)
      seen.push(`${label} controls=${ctrls}${appErr?' APPLICATION-ERROR':''}${rawKey?' RAW-KEY':''}`)
      if(appErr||rawKey||ctrls<=1) broken.push(label)
      if(appErr){ L(`  !! ${label}: ${t.slice(0,160)}`); break }
      const next=r.page.getByRole('button',{name:/^(Neste|Send inn svar)$/})
      if(!(await next.count())){ seen.push(`${label} NO FORWARD CONTROL`); broken.push(label); break }
      await next.first().click(); await r.page.waitForTimeout(1400)
    }
    L(`\nper-type result (400px):`); for(const s of seen) L(`   ${s}`)
    L(`\nsuspicious: ${broken.length?broken.join(', '):'none'}`)
    L(`responses for the walk survey: ${one(`select count(*) from responses where round_id='${rid}'`)}`)
    report('thirteen types', r.obs)
  } finally {
    await r.page.screenshot({path:'docs/walk/shots/w3-thirteen.png',fullPage:true}).catch(()=>{})
    await r.browser.close(); if(srv.started)srv.stop()
  }
}
main().catch(e=>{console.error('FAILED:',e);process.exit(1)})
