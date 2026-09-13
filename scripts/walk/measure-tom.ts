import { open, ensureServer, BASE_URL } from './drive'
async function main(){
  const srv=await ensureServer(); const L=console.log
  const {browser,page}=await open('administrator',{width:320,height:900})
  try{
    await page.goto(`${BASE_URL}/oppgaver?type=tilbakemeldinger`,{waitUntil:'networkidle'})
    await page.getByRole('button',{name:/^Lovpålagt$/}).click()
    await page.getByText(/^Ingenting i denne visningen$/).waitFor()
    await page.waitForTimeout(600)
    const doc=await page.evaluate(()=>({sw:document.documentElement.scrollWidth, cw:document.documentElement.clientWidth}))
    L(`document scrollWidth=${doc.sw} clientWidth=${doc.cw}  overflow=${doc.sw-doc.cw}`)
    const bad=await page.evaluate((limit)=>{
      const out:{tag:string;cls:string;text:string;right:number;w:number}[]=[]
      document.querySelectorAll('*').forEach((el)=>{
        const r=el.getBoundingClientRect()
        if(r.right>limit+0.5 && r.width>0){
          out.push({tag:el.tagName.toLowerCase(), cls:String((el as HTMLElement).className).slice(0,60),
                    text:(el.textContent||'').replace(/\s+/g,' ').trim().slice(0,34), right:Math.round(r.right), w:Math.round(r.width)})
        }
      })
      return out.sort((a,b)=>b.right-a.right).slice(0,10)
    },320)
    L(`\nelements past 320px (widest first):`)
    for(const b of bad) L(`  right=${String(b.right).padStart(4)} w=${String(b.w).padStart(4)} <${b.tag}> "${b.text}"  .${b.cls}`)
    const h1=await page.locator('h1').first().evaluate((e)=>{const r=e.getBoundingClientRect();return {t:e.textContent,w:Math.round(r.width),right:Math.round(r.right)}})
    L(`\nh1: "${h1.t}" width=${h1.w} right=${h1.right}`)

    L(`\nelements whose OWN scrollWidth exceeds their clientWidth:`)
    const scrollers=await page.evaluate(()=>{
      const out:{tag:string;cls:string;text:string;sw:number;cw:number}[]=[]
      document.querySelectorAll('*').forEach((el)=>{
        if(el.scrollWidth>el.clientWidth+0.5 && el.clientWidth>0)
          out.push({tag:el.tagName.toLowerCase(), cls:String((el as HTMLElement).className).slice(0,70),
                    text:(el.textContent||'').replace(/\s+/g,' ').trim().slice(0,40), sw:el.scrollWidth, cw:el.clientWidth})
      })
      return out.sort((a,b)=>(b.sw-b.cw)-(a.sw-a.cw)).slice(0,8)
    })
    for(const s2 of scrollers) L(`  sw=${s2.sw} cw=${s2.cw} (+${s2.sw-s2.cw}) <${s2.tag}> "${s2.text}"  .${s2.cls}`)

    L(`\npseudo-elements reaching past 320:`)
    const pseudo=await page.evaluate(()=>{
      const out:string[]=[]
      document.querySelectorAll('*').forEach((el)=>{
        for(const which of ['::after','::before']){
          const cs=getComputedStyle(el,which)
          if(cs.content==='none'||cs.content==='') continue
          const r=el.getBoundingClientRect()
          const inset=parseFloat(cs.insetInlineEnd||'0')
          const extend=isNaN(inset)?0:-inset
          if(r.right+extend>320.5) out.push(`${el.tagName.toLowerCase()}${which} "${(el.textContent||'').trim().slice(0,24)}" boxRight=${Math.round(r.right)} extend=${extend} -> ${Math.round(r.right+extend)}`)
        }
      })
      return out.slice(0,8)
    })
    for(const x of pseudo) L(`  ${x}`)
  } finally { await browser.close(); if(srv.started)srv.stop() }
}
main().catch(e=>{console.error('FAILED:',e);process.exit(1)})
