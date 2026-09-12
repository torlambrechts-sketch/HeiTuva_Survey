import { open, ensureServer, BASE_URL, report, one } from './drive'
async function main(){
  const srv=await ensureServer(); const L=console.log
  const {browser,page,obs}=await open('administrator')
  const ORG=one(`select id from organizations where name='Nordisk Studio'`)
  const col=(c:string)=>one(`select ${c}::text from organizations where id='${ORG}'`)
  try{
    await page.goto(`${BASE_URL}/administrasjon`,{waitUntil:'domcontentloaded'}); await page.waitForLoadState('networkidle').catch(()=>{}); obs.length=0
    const sel=page.locator('select[name=worklist_view]')
    let b=col('worklist_view')
    L(`worklist_view in the database: ${b}`)
    L('\nA. focus the select explicitly, change it with the keyboard, then Tab away')
    await sel.focus()
    L(`   document.activeElement is the select: ${await page.evaluate(()=>document.activeElement?.getAttribute('name'))}`)
    await sel.selectOption(b==='list'?'board':'list')
    L(`   select value now: ${await sel.inputValue()}`)
    await page.keyboard.press('Tab'); await page.waitForTimeout(1200)
    L(`   activeElement after Tab: ${await page.evaluate(()=>document.activeElement?.getAttribute('name')||document.activeElement?.tagName)}`)
    await page.waitForTimeout(3000)
    L(`   worklist_view -> ${col('worklist_view')}${b===col('worklist_view')?'   <-- NO WRITE':'   <-- wrote'}`)
    L(`   «Lagret»: ${/Lagret/.test(await page.locator('body').innerText())}`)
    report('tab away', obs); obs.length=0

    L('\nB. same, but Tab all the way OUT of the card (past the last field)')
    b=col('worklist_view')
    await sel.focus(); await sel.selectOption(b==='list'?'board':'list')
    for(let i=0;i<6;i++){ await page.keyboard.press('Tab'); await page.waitForTimeout(200) }
    await page.waitForTimeout(3500)
    L(`   worklist_view ${b} -> ${col('worklist_view')}${b===col('worklist_view')?'   <-- NO WRITE':'   <-- wrote'}`)
    L(`   «Lagret»: ${/Lagret/.test(await page.locator('body').innerText())}`)
    report('tab out', obs); obs.length=0

    L('\nC. does the form see a change event from a select at all?')
    const fired=await page.evaluate(()=>{
      const f=document.querySelector('form'); const s=document.querySelector('select[name=worklist_view]') as HTMLSelectElement
      if(!f||!s) return 'no form/select'
      let n=0; const h=()=>{n++}; f.addEventListener('change',h); f.addEventListener('focusout',()=>{n+=100})
      s.focus(); s.value = s.value==='list'?'board':'list'; s.dispatchEvent(new Event('change',{bubbles:true}))
      ;(document.querySelector('h2') as HTMLElement)?.focus?.()
      s.blur()
      return 'change+focusout score='+n
    })
    L(`   ${fired}  (1 = change bubbled, 100+ = focusout bubbled)`)
    await page.waitForTimeout(3000)
    L(`   worklist_view after the synthetic events: ${col('worklist_view')}`)
  } finally { await browser.close(); if(srv.started)srv.stop() }
}
main().catch(e=>{console.error('FAILED:',e);process.exit(1)})
