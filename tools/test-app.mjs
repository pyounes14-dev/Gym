import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import { extname, join } from 'path';

const ROOT = process.cwd();
const MIME = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json',
  '.webmanifest':'application/manifest+json', '.png':'image/png' };
const server = createServer((req,res)=>{
  let p = decodeURIComponent(req.url.split('?')[0]);
  if(p==='/') p='/index.html';
  const f = join(ROOT, p);
  if(existsSync(f)){ res.writeHead(200,{'Content-Type':MIME[extname(f)]||'text/plain'}); res.end(readFileSync(f)); }
  else { res.writeHead(404); res.end('nf'); }
});
await new Promise(r=>server.listen(0,r));
const port = server.address().port;
const base = `http://127.0.0.1:${port}/index.html`;

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }).catch(async()=>await chromium.launch());
const ctx = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:3 });
const page = await ctx.newPage();
const errors = [];
page.on('response', r=>{ if(r.status()>=400) errors.push('http'+r.status()+': '+r.url()); });
page.on('console', m=>{ if(m.type()==='error') errors.push('console: '+m.text()); });
page.on('pageerror', e=>errors.push('pageerror: '+e.message));

const log = (...a)=>console.log(...a);
function assert(c,m){ if(!c){ console.log('❌ FAIL:',m); process.exitCode=1; } else console.log('✅',m); }

await page.goto(base, { waitUntil:'networkidle' });

// ---- Tab bar present ----
assert(await page.locator('nav.tabs button').count()===3, 'three tabs render');

// ---- Pick an exercise (first session) ----
await page.locator('.search').fill('Lat');
await page.waitForTimeout(250);
await page.locator('.ex-item', { hasText:'Lat Pulldown' }).first().click();
await page.waitForTimeout(100);
assert(await page.locator('.lasttime .lbl').textContent().then(t=>t.includes('First time')), 'first time shows baseline card');

// Set weight 155, reps 8, log 2 sets
await page.locator('#wIn').fill('155');
await page.locator('#rIn').fill('8');
await page.locator('#rirIn').fill('2');
await page.locator('[data-act=add-set]').click();
await page.waitForTimeout(60);
await page.locator('[data-act=add-set]').click(); // repeat (zero typing)
await page.waitForTimeout(60);
let todayCount = await page.locator('.set-row').count();
assert(todayCount===2, `two sets logged today (got ${todayCount})`);
// e1RM 155*(1+8/30)=196.3
const rowTxt = await page.locator('.set-row').first().textContent();
assert(/e1RM 19[0-9]/.test(rowTxt), `e1RM computed (${rowTxt.replace(/\s+/g,' ').trim()})`);

// ---- Simulate "next workout" by back-dating these logs one week, then reload ----
await page.evaluate(()=>{
  const KEY='gymlog.v1'; const d=JSON.parse(localStorage.getItem(KEY));
  const wk = Date.now()-7*86400000; const ds = new Date(wk).toISOString().slice(0,10);
  d.logs.forEach(l=>{ l.date=ds; l.ts=new Date(wk).toISOString(); });
  localStorage.setItem(KEY, JSON.stringify(d));
});
await page.reload({ waitUntil:'networkidle' });

// ---- Acceptance test: pick same exercise, see last time within one tap, log with zero typing ----
await page.locator('.ex-item', { hasText:'Lat Pulldown' }).first().click();
await page.waitForTimeout(120);
const last = await page.locator('.lasttime .sets').textContent();
assert(last.includes('155×8'), `last time shows prior session (${last.trim()})`);
// prefilled weight should equal 155 with no typing
const prefW = await page.locator('#wIn').inputValue();
const prefR = await page.locator('#rIn').inputValue();
assert(prefW==='155' && prefR==='8', `next set pre-filled from last session (${prefW}x${prefR})`);
// log 3 sets with zero typing — just taps
await page.locator('[data-act=add-set]').click();
await page.locator('[data-act=add-set]').click();
await page.locator('[data-act=add-set]').click();
await page.waitForTimeout(80);
assert(await page.locator('.set-row').count()===3, 'logged 3 sets today with zero typing');

// ---- Steppers ----
await page.locator('[data-act=w-inc]').click();
assert(await page.locator('#wIn').inputValue()==='160', '+5 weight stepper works');
await page.locator('[data-act=r-dec]').click();
assert(await page.locator('#rIn').inputValue()==='7', '-1 reps stepper works');

// ---- Edit a logged set ----
await page.locator('.set-row').first().click();
await page.waitForTimeout(60);
assert(await page.locator('.set-row.editing').count()===1, 'tap-to-edit selects a set');
await page.locator('[data-act=done-edit]').click();

// ---- Volume tab ----
await page.locator('[data-tab=volume]').click();
await page.waitForTimeout(80);
const volTxt = await page.locator('#view').textContent();
assert(/Back/.test(volTxt) && /sets/.test(volTxt), 'volume tab shows Back sets');

// ---- Progress tab + chart ----
await page.locator('[data-tab=progress]').click();
await page.waitForTimeout(120);
assert(await page.locator('canvas#chart').count()===1, 'progress chart canvas renders');
assert(await page.locator('.pr-item').count()>=1, 'PR board lists trained exercise');
const prTxt = await page.locator('.pr-item').first().textContent();
assert(/e1RM/.test(prTxt), 'PR board shows best e1RM');

// ---- kg toggle ----
await page.locator('[data-act=open-settings]').click();
await page.waitForTimeout(60);
await page.locator('[data-act=unit][data-u=kg]').click();
await page.waitForTimeout(60);
await page.locator('[data-act=close-overlay]').click();
await page.locator('[data-tab=log]').click();
await page.waitForTimeout(80);
// app stays on the bench exercise view; last-time card now shows kg
const lastKg = await page.locator('.lasttime .sets').textContent();
// 155 lb -> ~70.5 kg
assert(/70\.5×8/.test(lastKg) || /70×8/.test(lastKg), `kg conversion in last-time (${lastKg.trim()})`);

// ---- Export backup produces valid JSON ----
const dl = await Promise.all([
  page.waitForEvent('download'),
  page.locator('[data-act=open-settings]').click().then(()=>page.locator('[data-act=export]').click()),
]).then(([d])=>d).catch(()=>null);
assert(dl!==null, 'export triggers a download');

assert(errors.length===0, 'no console/page errors' + (errors.length?': '+errors.join(' | '):''));

await page.screenshot({ path:'tools/screenshot-log.png' });
await browser.close();
server.close();
console.log('\nDONE. exitCode=', process.exitCode||0);
