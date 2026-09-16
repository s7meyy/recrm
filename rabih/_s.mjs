import { chromium } from 'playwright-core';
const S='/tmp/claude-0/-home-user-recrm/97884244-959e-5ac4-8483-994a54dcc586/scratchpad';
const b=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox']});
const p=await b.newPage({viewport:{width:880,height:1100}});
await p.goto('file://'+S+'/report.html'); await p.waitForTimeout(350);
for(const sel of (process.env.SEL||'').split(',')){
  const el=p.locator(sel).first();
  if(await el.count()) await el.screenshot({path:`${S}/${sel.replace(/[^a-z]/gi,'')}.png`}); else console.log('missing',sel);
}
await b.close();
