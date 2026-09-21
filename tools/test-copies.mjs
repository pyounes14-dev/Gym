// Guards the one property the second copy exists for: the two gym logs share an
// origin (same GitHub Pages site, so the same localStorage), and must still never
// see each other's data. Also checks that every asset each copy points at — its
// manifest, icons, launch screens — is actually on disk and precached.
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
const origin = `http://127.0.0.1:${port}`;

function assert(c,m){ if(!c){ console.log('❌ FAIL:',m); process.exitCode=1; } else console.log('✅',m); }

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }).catch(async()=>await chromium.launch());
const ctx = await browser.newContext({ viewport:{width:390,height:844}, hasTouch:true });
const page = await ctx.newPage();
const errors = [];
page.on('response', r=>{ if(r.status()>=400) errors.push('http'+r.status()+': '+r.url()); });
page.on('pageerror', e=>errors.push('pageerror: '+e.message));

// ---- Both copies declare their own identity ----
const ids = {};
for (const app of ['index.html','her.html']) {
  await page.goto(`${origin}/${app}`, { waitUntil:'networkidle' });
  ids[app] = await page.evaluate(()=>({
    title: document.title,
    appleTitle: document.querySelector('meta[name=apple-mobile-web-app-title]').content,
    manifest: document.querySelector('link[rel=manifest]').getAttribute('href'),
    icon: document.querySelector('link[rel=apple-touch-icon]').getAttribute('href'),
    splash: document.querySelector('link[rel=apple-touch-startup-image]').getAttribute('href'),
    accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
  }));
}
assert(ids['index.html'].manifest !== ids['her.html'].manifest, 'each copy links its own manifest');
assert(ids['index.html'].icon !== ids['her.html'].icon, 'each copy links its own home-screen icon');
assert(ids['index.html'].splash !== ids['her.html'].splash, 'each copy links its own launch screens');
assert(ids['index.html'].appleTitle !== ids['her.html'].appleTitle, 'each copy installs under its own name');
assert(ids['index.html'].accent !== ids['her.html'].accent, `each copy has its own accent (${ids['index.html'].accent} vs ${ids['her.html'].accent})`);

// ---- Log a session in the main app ----
await page.goto(`${origin}/index.html`, { waitUntil:'networkidle' });
await page.locator('.ex-item', { hasText:'Lat Pulldown' }).first().click();
await page.waitForTimeout(120);
await page.locator('[data-act=add-set]').click();
await page.waitForTimeout(120);
assert(await page.locator('.set-row').count()===1, 'set logged in the main app');

// ---- Her copy, same origin, same browser: starts empty ----
await page.goto(`${origin}/her.html`, { waitUntil:'networkidle' });
await page.locator('.ex-item', { hasText:'Lat Pulldown' }).first().click();
await page.waitForTimeout(120);
const herFirst = await page.locator('.lasttime .lbl').textContent();
assert(herFirst.includes('First time'), `her copy starts with no history of his (saw "${herFirst.trim()}")`);
await page.locator('[data-act=add-set]').click();
await page.waitForTimeout(120);

// ---- Two stores, neither touching the other ----
const stores = await page.evaluate(()=>({
  his: localStorage.getItem('gymlog.v1'),
  hers: localStorage.getItem('gymlog.her.v1'),
  keys: Object.keys(localStorage).filter(k=>k.startsWith('gymlog')).sort(),
}));
assert(stores.his && stores.hers, 'both logs have their own localStorage entry');
assert(stores.his !== stores.hers, 'the two stores hold different data');
assert(JSON.parse(stores.his).logs.length===1 && JSON.parse(stores.hers).logs.length===1,
  'each store holds exactly its own session');
assert(stores.keys.join(',')==='gymlog.her.v1,gymlog.v1', `only the two expected keys exist (${stores.keys.join(', ')})`);

// ---- His copy is unchanged by hers ----
await page.goto(`${origin}/index.html`, { waitUntil:'networkidle' });
await page.locator('.ex-item', { hasText:'Lat Pulldown' }).first().click();
await page.waitForTimeout(120);
assert(await page.locator('.set-row').count()===1, 'main app still shows only its own set');

// ---- Every precached asset resolves ----
const sw = readFileSync('sw.js','utf8');
const assets = [...sw.matchAll(/'\.\/([^']*)'/g)].map(m=>m[1]).filter(Boolean);
assert(assets.includes('her.html') && assets.includes('her.webmanifest'), 'service worker precaches the copy');
const missing = [];
for (const a of assets) {
  const r = await page.request.get(`${origin}/${a}`);
  if (!r.ok()) missing.push(a);
}
assert(missing.length===0, `all ${assets.length} precached assets load` + (missing.length?`: missing ${missing.join(', ')}`:''));

// ---- Her manifest points at her app ----
const manifest = await (await page.request.get(`${origin}/her.webmanifest`)).json();
assert(manifest.start_url==='./her.html', 'her manifest starts at her.html');
assert(manifest.icons.every(i=>i.src.startsWith('./her-icon-')), 'her manifest uses her icons');

assert(errors.length===0, 'no page errors' + (errors.length?': '+errors.join(' | '):''));

await browser.close();
server.close();
console.log('\nDONE. exitCode=', process.exitCode||0);
