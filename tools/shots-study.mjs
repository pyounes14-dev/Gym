// README screenshots for the Study Clock: studying, on a break, and the history.
// LIGHT=1 shoots the light theme into the scratch path given by OUT instead.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import { extname, join } from 'path';
const MIME={'.html':'text/html','.js':'text/javascript','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.woff2':'font/woff2'};
const srv=createServer((req,res)=>{let p=req.url.split('?')[0];if(p==='/')p='/index.html';const f=join(process.cwd(),p);if(existsSync(f)){res.writeHead(200,{'Content-Type':MIME[extname(f)]||'text/plain'});res.end(readFileSync(f));}else{res.writeHead(404);res.end('nf');}});
await new Promise(r=>srv.listen(0,r));const port=srv.address().port;
const base=`http://127.0.0.1:${port}/study.html`;
const LIGHT=!!process.env.LIGHT, OUT=process.env.OUT||'docs';
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,colorScheme:LIGHT?'light':'dark',reducedMotion:'reduce'});
const pg=await ctx.newPage();
const errs=[];pg.on('pageerror',e=>errs.push(e.message));pg.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
// Thursday 4:12 pm, frozen, with a few days of sessions behind it.
const NOW=new Date(2026,9,29,16,12,0).getTime(), H=36e5, M=6e4;
await pg.clock.install({time:NOW-1000});await pg.clock.pauseAt(NOW);
await pg.goto(base,{waitUntil:'networkidle'});
await pg.evaluate(({NOW,H,M})=>{
  const at=(daysAgo,h,m)=>{const d=new Date(NOW);d.setDate(d.getDate()-daysAgo);d.setHours(h,m,0,0);return d.getTime();};
  const ses=(daysAgo,h,m,study,brk,breaks)=>{const s=at(daysAgo,h,m);return {start:s,end:s+study+brk,study,brk,breaks};};
  const sessions=[
    ses(0,9,40,1*H+22*M+14e3,11*M,2),
    ses(1,19,5,2*H+4*M,18*M,3), ses(1,14,30,48*M,0,0),
    ses(2,20,15,1*H+35*M,9*M,1),
  ];
  // the one running now: started 2:31 pm, one 12-minute break
  const start=at(0,14,31);
  const acc=52*M+8e3, brkAcc=12*M;
  const cur={start,acc,runAt:start+acc+brkAcc,brkAcc,pauseAt:null,breaks:1};
  localStorage.setItem('study-v1',JSON.stringify({v:1,updated:NOW,sessions,cur}));
},{NOW,H,M});
await pg.reload({waitUntil:'networkidle'});await pg.waitForTimeout(400);
await pg.screenshot({path:`${OUT}/screenshot-study-${LIGHT?'light-':''}running.png`});
await pg.locator('#go').click();await pg.clock.fastForward(4*M+37e3);await pg.waitForTimeout(100);
await pg.screenshot({path:`${OUT}/screenshot-study-${LIGHT?'light-':''}break.png`});
await pg.evaluate(()=>window.scrollTo(0,document.querySelector('.mini').getBoundingClientRect().top+window.scrollY-70));
await pg.waitForTimeout(100);
await pg.screenshot({path:`${OUT}/screenshot-study-${LIGHT?'light-':''}history.png`});
console.log('errors:',errs.length?errs.join('|'):'none');
await b.close();srv.close();console.log('shots done');
