// End-to-end test for the Study Clock (study.html). Drives a real browser on a fake
// clock, so "study 25 minutes" takes a millisecond and the totals can be checked to the
// second: breaks excluded, the clock surviving the app being closed, and finish/undo.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import { extname, join } from 'path';

const ROOT = process.cwd();
const MIME = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json',
  '.webmanifest':'application/manifest+json', '.png':'image/png', '.woff2':'font/woff2' };
const server = createServer((req,res)=>{
  let p = decodeURIComponent(req.url.split('?')[0]);
  if(p==='/') p='/index.html';
  const f = join(ROOT, p);
  if(existsSync(f)){ res.writeHead(200,{'Content-Type':MIME[extname(f)]||'text/plain'}); res.end(readFileSync(f)); }
  else { res.writeHead(404); res.end('nf'); }
});
await new Promise(r=>server.listen(0,r));
const port = server.address().port;
const base = `http://127.0.0.1:${port}/study.html`;
const KEY = 'study-v1';
const MIN = 60_000;

function assert(c,m){ if(!c){ console.log('❌ FAIL:',m); process.exitCode=1; } else console.log('✅',m); }

// ---- every precached asset must exist, or the worker's install fails for all four apps ----
const sw = readFileSync(join(ROOT,'sw.js'),'utf8');
const assets = [...sw.matchAll(/'\.\/([^']*)'/g)].map(m=>m[1]).filter(Boolean);
const missing = assets.filter(a=>!existsSync(join(ROOT,a)));
assert(missing.length===0, `all ${assets.length} precached assets exist${missing.length?' — missing: '+missing.join(', '):''}`);
assert(assets.includes('study.html') && assets.includes('study.webmanifest'), 'study app is precached');

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }).catch(async()=>await chromium.launch());
const ctx = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:3, hasTouch:true });
// 10:00 on a Wednesday, so the session can't straddle midnight or a week boundary.
// The clock is frozen: time moves only when the test moves it, so totals are exact.
const T0 = new Date(2026, 9, 28, 10, 0, 0).getTime();
const page = await ctx.newPage();
await page.clock.install({ time: T0 - 1000 });
await page.clock.pauseAt(T0);
const errors = [];
page.on('response', r=>{ if(r.status()>=400) errors.push('http'+r.status()+': '+r.url()); });
page.on('console', m=>{ if(m.type()==='error') errors.push('console: '+m.text()); });
page.on('pageerror', e=>errors.push('pageerror: '+e.message));

const text = (sel)=>page.locator(sel).textContent().then(t=>t.trim());
const clock = async()=> (await text('#dHM'))+':'+(await text('#dSS'));
const lit = ()=>page.locator('#ticks .tick.on').count();
const saved = ()=>page.evaluate(k=>JSON.parse(localStorage.getItem(k)), KEY);
// Jump the fake clock forward — as when the phone sits locked — then let a frame paint.
async function pass(ms){ await page.clock.fastForward(ms); await page.waitForTimeout(30); }

await page.goto(base, { waitUntil:'networkidle' });

// ---- idle ----
assert(await text('#dState')==='Ready', 'opens ready');
assert(await clock()==='0:00:00', 'clock reads 0:00:00');
assert(await text('#goLabel')==='Start studying', 'one button: Start studying');
assert(await page.locator('#fin').isHidden(), 'no Finish button before a session');
assert(await page.locator('#empty').isVisible(), 'empty history says what goes there');

// ---- study 25 minutes ----
await page.locator('#go').click();
assert(await text('#dState')==='Studying', 'tap → studying');
assert(await text('#goLabel')==='Take a break', 'button now offers a break');
assert(await page.locator('#go').getAttribute('data-next')==='break', 'button wears the break colour');
await pass(25*MIN);
assert(await clock()==='0:25:00', `25 min studied reads 0:25:00 (got ${await clock()})`);
assert(await lit()===25, `25 minute ticks lit (got ${await lit()})`);
assert(await text('#tToday')==='25m', 'Today counts the running session');

// ---- a 5-minute break doesn't count ----
await page.locator('#go').click();
assert(await text('#dState')==='On break', 'tap → on break');
assert(await text('#goLabel')==='Back to studying', 'button offers to resume');
await pass(5*MIN);
assert(await clock()==='0:25:00', 'clock holds at 0:25:00 through the break');
assert(await text('#dSub')==='Break 5:00', `break has its own counter (got "${await text('#dSub')}")`);
assert(await text('#tToday')==='25m', 'break time is not added to Today');

// ---- double tap is one tap ----
await page.locator('#go').click();
await page.locator('#go').click();
assert(await text('#dState')==='Studying', 'a fumbled double-tap only resumes, it does not re-pause');

// ---- 10 more minutes ----
await pass(10*MIN);
assert(await clock()==='0:35:00', `resumed: 25 + 10 = 0:35:00 (got ${await clock()})`);
assert(/1 break/.test(await text('#dSub')), 'sub-line counts the break');

// ---- the app is closed for 20 minutes while the clock runs ----
await page.goto('about:blank');
await page.clock.fastForward(20*MIN);
await page.goto(base, { waitUntil:'networkidle' });
await page.waitForTimeout(30);
assert(await text('#dState')==='Studying', 'reopened: still studying');
assert(await clock()==='0:55:00', `closed app kept counting: 0:55:00 (got ${await clock()})`);

// ---- pause, walk away for an hour, finish: the trailing pause is not a break ----
await page.locator('#go').click();
await pass(60*MIN);
assert(await clock()==='0:55:00', 'an hour paused adds nothing');
await page.locator('#fin').click();
await page.waitForTimeout(30);
assert(await text('#dState')==='Ready', 'finish → ready for the next session');
assert(await clock()==='0:00:00', 'clock reset');
let st = await saved();
assert(st.sessions.length===1, 'one session saved');
const s0 = st.sessions[0];
assert(s0.study===55*MIN, `saved exactly 55 min of study (got ${s0.study/MIN})`);
assert(s0.brk===5*MIN && s0.breaks===1, 'saved one 5-minute break — the final pause is not counted');
assert(s0.end-s0.start===60*MIN, 'session ends when you stopped studying, not when you tapped Finish');
assert(await page.locator('.ses').count()===1, 'history shows the session');
assert(await text('.day-n')==='Today' && await text('.day-t')==='55m', 'grouped under Today with its total');
assert(await text('.ses-d')==='55m', 'row shows 55m');
assert(/1 break · 5m/.test(await text('.ses-b')), 'row shows 1 break · 5m');
assert(await text('#tToday')==='55m' && await text('#tWeek')==='55m' && await text('#tAll')==='55m', 'totals: 55m today, this week, all time');
assert(await page.locator('#toast.on').count()===1 && /Saved 55m/.test(await text('#toastT')), 'toast confirms the save');

// ---- undo the finish ----
await page.locator('#toastU').click();
await page.waitForTimeout(30);
assert(await text('#dState')==='On break', 'undo brings the session back as it was');
assert(await clock()==='0:55:00', 'with its time intact');
assert((await saved()).sessions.length===0, 'and takes it out of history');
await page.locator('#go').click();               // back to studying
await pass(5*MIN);
await page.locator('#fin').click();
await page.waitForTimeout(30);
st = await saved();
assert(st.sessions.length===1 && st.sessions[0].study===60*MIN, 'resumed and finished: 60 min saved');
assert(await text('.ses-d')==='1h', 'an exact hour reads 1h');

// ---- a second session the same day ----
await page.clock.fastForward(30*MIN);
await page.locator('#go').click();
await pass(45*MIN + 30_000);
assert(await clock()==='0:45:30', 'second session counts from zero');
assert(await text('#tToday')==='1h 45m', `Today adds both sessions (got ${await text('#tToday')})`);
await page.locator('#fin').click();
await page.waitForTimeout(30);
assert(await page.locator('.ses').count()===2, 'two sessions in history');
assert(await page.locator('.day').count()===1, 'both under one day');
assert(await page.locator('.ses-d').first().textContent()==='45m', 'newest first');

// ---- delete, then undo ----
await page.locator('.ses-x').first().click();
await page.waitForTimeout(30);
assert(await page.locator('.ses').count()===1, 'delete removes a session');
assert(await text('#tToday')==='1h', 'and its time');
await page.locator('#toastU').click();
await page.waitForTimeout(30);
assert(await page.locator('.ses').count()===2, 'undo puts it back');

// ---- tomorrow ----
await page.clock.fastForward(24*60*MIN);
await page.reload({ waitUntil:'networkidle' });
await page.waitForTimeout(30);
assert(await text('#tToday')==='0m', 'a new day starts Today at 0m');
assert(await text('#tWeek')==='1h 45m', 'this week keeps yesterday');
assert(await text('.day-n')==='Yesterday', 'history labels yesterday');

// ---- a tap under a second saves nothing ----
await page.locator('#go').click();
await pass(500);
await page.locator('#fin').click();
await page.waitForTimeout(30);
assert((await saved()).sessions.length===2 && /Nothing to save/.test(await text('#toastT')), 'a sub-second session is not saved');

// ---- export ----
const [dl] = await Promise.all([ page.waitForEvent('download'), page.locator('#exportBtn').click() ]);
assert(/^study-clock-\d{4}-\d\d-\d\d\.json$/.test(dl.suggestedFilename()), 'export downloads a dated JSON backup');

assert(errors.length===0, 'no console/page/http errors' + (errors.length?': '+errors.join(' | '):''));

await browser.close();
server.close();
