// Builds the second copy of Gym Log — her.html + her.webmanifest — from index.html.
//
// index.html is the source of truth. This script re-derives the copy from it, so
// improving the main app and then running:
//
//   node tools/make-her-copy.js
//
// carries every change across. Only the copy's identity differs: its name, its
// accent, its icons and launch screens, and — the point of the whole exercise —
// its localStorage key, so the two logs never touch each other even on one phone.
//
// Every rule below states how many times it must match. If index.html changes in a
// way that breaks one (a renamed token, a reworded footer), the build fails loudly
// with the rule that missed rather than quietly shipping a half-converted copy.
const fs = require('fs');
const path = require('path');
const { resolve } = require('./her-theme.js');

const theme = resolve();
const root = path.join(__dirname, '..');
const srcPath = path.join(root, 'index.html');
const src = fs.readFileSync(srcPath, 'utf8');

const escHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// The footer sits inside a JS template literal, so it needs escaping twice over.
const escTemplate = (s) => escHtml(s).replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
const name = escHtml(theme.name);
const [r, g, b] = theme.accentRgb;

const RULES = [
  // ---- identity -------------------------------------------------------------
  ['<meta name="apple-mobile-web-app-title" content="Gym Log" />',
   `<meta name="apple-mobile-web-app-title" content="${name}" />`, 1],
  ['<title>Gym Log</title>', `<title>${name}</title>`, 1],
  ['Gym Log · offline · data stays on this device',
   `${escTemplate(theme.name)} · offline · data stays on this device`, 1],

  // ---- her own data store (the reason this copy exists) ----------------------
  ['const STORAGE_KEY = "gymlog.v1";', `const STORAGE_KEY = "${theme.storageKey}";`, 1],
  ['gymlog-backup-', `${theme.slug}-backup-`, 1],

  // ---- her own installable assets -------------------------------------------
  ['./manifest.webmanifest', './her.webmanifest', 1],
  ['./icon-180.png', './her-icon-180.png', 1],
  ['./icon-192.png', './her-icon-192.png', 1],
  ['./splash/splash-', './her-splash/splash-', 11],

  // ---- accent ----------------------------------------------------------------
  ['#7c5cff', theme.accent, 1],      // --accent
  ['#a892ff', theme.accent2, 2],     // --accent2 + the chart's accent text
  ['#8d70ff', theme.gradFrom, 1],    // --accent-grad from
  ['#6b46ff', theme.gradTo, 1],      // --accent-grad to
  ['#9d86ff', theme.chart, 1],       // progress chart stroke
  ['rgba(124,92,255', `rgba(${r},${g},${b}`, 9], // glows, chips, button shadows, chart fill
];

let out = src;
const misses = [];
for (const [find, replace, expected] of RULES) {
  const hits = out.split(find).length - 1;
  if (hits !== expected) {
    misses.push(`  ${hits}× (expected ${expected}×): ${find}`);
    continue;
  }
  out = out.split(find).join(replace);
}
if (misses.length) {
  console.error('index.html no longer matches the copy rules in tools/make-her-copy.js:\n' + misses.join('\n'));
  console.error('\nUpdate the rules to match the new index.html, then re-run.');
  process.exit(1);
}

const banner = `<!-- GENERATED FILE — do not edit.\n     Built from index.html by tools/make-her-copy.js. Edit index.html, then re-run it. -->`;
out = out.replace('<!DOCTYPE html>', `<!DOCTYPE html>\n${banner}`);
fs.writeFileSync(path.join(root, 'her.html'), out);

const manifest = {
  name: theme.name,
  short_name: theme.shortName,
  description: 'Personal hypertrophy gym logger — see last time, beat it.',
  start_url: './her.html',
  scope: './',
  display: 'standalone',
  orientation: 'portrait',
  background_color: '#0c0e1c',
  theme_color: '#0c0e1c',
  icons: [
    { src: './her-icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: './her-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: './her-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
};
fs.writeFileSync(path.join(root, 'her.webmanifest'), JSON.stringify(manifest, null, 2) + '\n');

console.log(`wrote her.html + her.webmanifest — "${theme.name}", accent ${theme.accent}, storage ${theme.storageKey}`);
