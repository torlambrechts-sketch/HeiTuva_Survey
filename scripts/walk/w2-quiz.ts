import { open, ensureServer, BASE_URL, report, psql, one } from './drive'
const Q='98a6cfe8-506e-41fe-970c-c170e9194363'
async function main(){
  const srv=await ensureServer(); const L=console.log
  const p=await open('administrator')
  try{
    L('=== A. set run_mode=quiz through the UI on a survey that is not one ===')
    const cand=psql(`select id,title,anonymity,run_mode,template_pack_key from surveys where run_mode='standard' and anonymity='named' limit 1`)[0]
    L(`  candidate: ${cand?.join(' | ')}`)
    if(cand){
      await p.page.goto(`${BASE_URL}/undersokelser/${cand[0]}/bygg`,{waitUntil:'domcontentloaded'}); await p.page.waitForLoadState('networkidle').catch(()=>{}); p.obs.length=0
      const inn=p.page.getByRole('button',{name:/^Innstillinger$/}); if(await inn.count()){await inn.first().click(); await p.page.waitForTimeout(1500)}
      const quizBtn=p.page.getByRole('button',{name:/^Quiz$/})
      L(`  «Quiz» mode control: ${await quizBtn.count()}`)
      if(await quizBtn.count()){await quizBtn.first().click(); await p.page.waitForTimeout(3000)}
      const rm=one(`select run_mode from surveys where id='${cand[0]}'`)
      L(`  run_mode ${cand[3]} -> ${rm}${cand[3]===rm?'   <-- NO WRITE':'   <-- wrote'}`)
      const t=(await p.page.locator('body').innerText()).replace(/\s+/g,' ')
      const msg=t.match(/[^.]*(statutor|lovpålagt|navngitt|quiz)[^.]*\./i); if(msg) L(`  copy: ${msg[0].trim().slice(0,150)}`)
      report('setRunMode quiz', p.obs); p.obs.length=0
      psql(`update surveys set run_mode='${cand[3]}' where id='${cand[0]}'`)
    }

    L('\n=== B. GUARD 1 — quiz on an ANONYMOUS survey must be refused ===')
    const anon=psql(`select id,title,anonymity,run_mode from surveys where anonymity='anonymous' and run_mode='standard' limit 1`)[0]!
    L(`  survey "${anon[1]}" anonymity=${anon[2]}`)
    await p.page.goto(`${BASE_URL}/undersokelser/${anon[0]}/bygg`,{waitUntil:'domcontentloaded'}); await p.page.waitForLoadState('networkidle').catch(()=>{})
    const inn2=p.page.getByRole('button',{name:/^Innstillinger$/}); if(await inn2.count()){await inn2.first().click(); await p.page.waitForTimeout(1500)}
    const qb=p.page.getByRole('button',{name:/^Quiz$/})
    const n=await qb.count(); L(`  «Quiz» control present: ${n}  disabled: ${n?await qb.first().isDisabled():'n/a'}`)
    if(n && !(await qb.first().isDisabled())){ await qb.first().click(); await p.page.waitForTimeout(2500)
      L(`  run_mode now: ${one(`select run_mode from surveys where id='${anon[0]}'`)}`)
      const t=(await p.page.locator('body').innerText()).replace(/\s+/g,' ')
      const m=t.match(/[^.]*navngitt[^.]*\./i); L(`  refusal copy: ${m?m[0].trim():'(none shown)'}`)
    }
    report('guard quiz/anonymous', p.obs); p.obs.length=0

    L('\n=== C. the quiz builder — designate a correct answer ===')
    await p.page.goto(`${BASE_URL}/undersokelser/${Q}/bygg`,{waitUntil:'domcontentloaded'}); await p.page.waitForLoadState('networkidle').catch(()=>{})
    const before=psql(`select position, answer_index, points from survey_questions where survey_id='${Q}' order by position`)
    L(`  answer_index/points before: ${before.map(r=>r.join(':')).join('  ')}`)
    const body=(await p.page.locator('body').innerText()).replace(/\s+/g,' ')
    L(`  quiz controls on the builder: ${/Riktig svar|riktig|poeng|Poeng/.test(body)}`)
    const corr=p.page.getByRole('button',{name:/Riktig/i}).or(p.page.getByLabel(/Riktig/i))
    L(`  «Riktig …» controls: ${await corr.count()}`)
    if(await corr.count()){
      const dis=await corr.first().isDisabled()
      L(`  first «Riktig svar» control disabled: ${dis}${dis?'   (builder frozen — this survey already has an open round with responses)':''}`)
      if(!dis){ await corr.first().click(); await p.page.waitForTimeout(2500) }
    }
    const after=psql(`select position, answer_index, points from survey_questions where survey_id='${Q}' order by position`)
    L(`  after: ${after.map(r=>r.join(':')).join('  ')}${JSON.stringify(before)===JSON.stringify(after)?'   (unchanged)':'   <-- wrote'}`)
    report('quiz builder', p.obs); p.obs.length=0

    L('\n=== D. the leaderboard, and a team below k ===')
    L(`  teams and their member counts:`)
    for(const r of psql(`select g.name, count(m.id) from groups g left join org_members m on m.group_id=g.id where g.org_id=(select org_id from surveys where id='${Q}') group by g.name order by g.name`)) L(`    ${r.join(': ')}`)
    L(`  responses in the quiz round: ${one(`select count(*) from responses where round_id='61e2f468-a469-42be-90a9-f65204507b83'`)}`)
    await p.page.goto(`${BASE_URL}/undersokelser/${Q}/resultater`,{waitUntil:'domcontentloaded'}); await p.page.waitForLoadState('networkidle').catch(()=>{})
    const rt=(await p.page.locator('body').innerText()).replace(/\s+/g,' ')
    L(`  results page mentions a leaderboard: ${/ledertavle|Ledertavle|poeng|Poeng|lag/i.test(rt)}`)
    const seg=rt.match(/(Ledertavle|Lagtavle)[^|]{0,320}/i); L(`  leaderboard block: ${seg?seg[0].trim():'(not on this page)'}`)
    L(`  any zero scores drawn: ${/\b0 poeng\b/.test(rt)}`)
    report('resultater (quiz)', p.obs)
  } finally { await p.page.screenshot({path:'docs/walk/shots/w2-quiz.png',fullPage:true}).catch(()=>{}); await p.browser.close(); if(srv.started)srv.stop() }
}
main().catch(e=>{console.error('FAILED:',e);process.exit(1)})
