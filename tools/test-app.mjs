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

function assert(c,m){ if(!c){ console.log('❌ FAIL:',m); process.exitCode=1; } else console.log('✅',m); }

await page.goto(base, { waitUntil:'networkidle' });

// ---- Two tabs (Volume removed) ----
assert(await page.locator('nav.tabs button').count()===2, 'two tabs render (Log, Progress)');

// ---- First session ----
await page.locator('.ex-item', { hasText:'Lat Pulldown' }).first().click();
await page.waitForTimeout(100);
assert(await page.locator('.lasttime .lbl').textContent().then(t=>t.includes('First time')), 'first time shows baseline card');

await page.locator('#wIn').fill('120');
await page.locator('#rIn').fill('10');
await page.locator('[data-act=add-set]').click();
await page.waitForTimeout(100);
assert(await page.locator('.set-row').count()===1, 'set logged');
// no estimated 1RM anywhere on the logging screen
assert(!/1RM|e1RM/i.test(await page.locator('#view').textContent()), 'no estimated-1RM text on logging screen');
// rest timer auto-started
assert(await page.locator('#restTimer:not(.hidden)').count()===1, 'rest timer auto-starts after +Set');
await page.locator('button.rt-x').click();
await page.waitForTimeout(50);
assert(await page.locator('#restTimer.hidden').count()===1, 'rest timer can be skipped');

// ---- Back-date and reload (simulate next workout) ----
await page.evaluate(()=>{
  const KEY='gymlog.v1'; const d=JSON.parse(localStorage.getItem(KEY));
  const wk = Date.now()-7*86400000; const ds = new Date(wk).toISOString().slice(0,10);
  d.logs.forEach(l=>{ l.date=ds; l.ts=new Date(wk).toISOString(); });
  localStorage.setItem(KEY, JSON.stringify(d));
});
await page.reload({ waitUntil:'networkidle' });

// ---- Acceptance: last time within one tap, pre-filled, beat feedback ----
await page.locator('.ex-item', { hasText:'Lat Pulldown' }).first().click();
await page.waitForTimeout(120);
assert((await page.locator('.lasttime .sets').textContent()).includes('120×10'), 'last time shows prior session');
const prefW = await page.locator('#wIn').inputValue();
const prefR = await page.locator('#rIn').inputValue();
assert(prefW==='120' && prefR==='10', `next set pre-filled from last session (${prefW}x${prefR})`);
// beat line present, neutral while matching
assert((await page.locator('#beatLine').textContent()).includes('120×10'), 'beat-line shows the set to beat');
assert(await page.locator('#beatLine.win').count()===0, 'beat-line neutral when only matching');
// beat it -> turns green/win
await page.locator('[data-act=w-inc]').click();
await page.waitForTimeout(60);
assert(await page.locator('#beatLine.win').count()===1, 'beat-line turns to win when you beat last');
await page.locator('[data-act=add-set]').click();
await page.waitForTimeout(80);
assert(await page.locator('.set-row .win-badge').count()===1, 'logged set shows "beat last" badge');

// ---- Steppers ----
assert(await page.locator('#wIn').inputValue()==='125', '+5 weight stepper applied');
await page.locator('[data-act=r-dec]').click();
assert(await page.locator('#rIn').inputValue()==='9', '-1 reps stepper works');

// ---- Edit a logged set ----
await page.locator('.set-row').first().click();
await page.waitForTimeout(60);
assert(await page.locator('.set-row.editing').count()===1, 'tap-to-edit selects a set');
await page.locator('[data-act=done-edit]').click();

// ---- Progress: heaviest set + volume toggle ----
await page.locator('[data-tab=progress]').click();
await page.waitForTimeout(150);
assert(await page.locator('canvas#chart').count()===1, 'progress chart renders');
assert(await page.locator('.seg-toggle button').count()===2, 'chart has heaviest/volume toggle');
const prTxt = await page.locator('.pr-item').first().textContent();
assert(/heaviest set/i.test(prTxt) && /vol/i.test(prTxt), 'PR board shows heaviest set + session volume');
await page.locator('[data-act=metric][data-m=volume]').click();
await page.waitForTimeout(100);
assert(await page.locator('.seg-toggle button.active', { hasText:'volume' }).count()===1, 'volume metric selectable');

// ---- Add a custom exercise (no muscle prompt) ----
await page.locator('[data-tab=log]').click();
await page.locator('[data-act=back]').click().catch(()=>{});
await page.waitForTimeout(60);
await page.locator('[data-act=add-exercise]').click();
await page.waitForTimeout(60);
assert(await page.locator('#exName').count()===1, 'exercise editor opens');
assert(await page.locator('#exPrimary').count()===0, 'no muscle-group selector in editor');
await page.locator('#exName').fill('Cable Crossover');
await page.locator('[data-act=save-exercise]').click();
await page.waitForTimeout(80);
assert(await page.locator('.ex-item', { hasText:'Cable Crossover' }).count()>=1, 'custom exercise added');

// ---- kg toggle ----
await page.locator('[data-act=open-settings]').click();
await page.waitForTimeout(60);
await page.locator('[data-act=unit][data-u=kg]').click();
await page.waitForTimeout(60);
await page.locator('[data-act=rest-dur][data-s="90"]').click();
await page.waitForTimeout(40);
assert(await page.locator('[data-act=rest-dur][data-s="90"].active').count()===1, 'rest duration setting works');
await page.locator('[data-act=close-overlay]').click();
await page.locator('[data-tab=log]').click();
await page.locator('.ex-item', { hasText:'Lat Pulldown' }).first().click();
await page.waitForTimeout(80);
const lastKg = await page.locator('.lasttime .sets').textContent();
assert(/54(\.5)?×10/.test(lastKg) || /54×10/.test(lastKg) || /55×10/.test(lastKg), `kg conversion in last-time (${lastKg.trim()})`);

// ---- Export backup ----
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
