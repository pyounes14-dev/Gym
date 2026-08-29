// Generates app icons + iOS launch screens for the Slow Is the Point run app.
// Same zero-dependency PNG encoder as generate-icons.js, different mark and palette.
//
// The glyph is the plan itself: three interval ribbons stacked from sparse to
// solid — week 1's short run/long walk, the middle weeks' even split, and week
// 16's unbroken 30 minutes. It reads as progression rather than decoration.
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const RUN = [240, 128, 60];    // #F0803C
const WALK = [42, 69, 82];     // #2A4552 — the walk-dim token, lifted to read at 60px
const BG_TOP = [26, 32, 41];   // #1A2029
const BG_BOT = [15, 18, 23];   // #0F1217

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type RGBA
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// Each row is [runShare, walkShare, repeats]; a zero walk share means continuous.
const ROWS = [
  [1, 3, 4],
  [1, 1, 3],
  [1, 0, 1],
];
const ROW_Y = [0.185, 0.445, 0.705];   // top of each ribbon, as a share of the glyph box
const ROW_H = 0.11;
const X0 = 0.13, X1 = 0.87;

// Paints the three ribbons into a glyph box of side S with its top-left at (ox, oy).
function drawGlyph(set, ox, oy, S) {
  const fill = (x0, x1, y0, y1, c) => {
    for (let y = Math.round(oy + y0 * S); y < Math.round(oy + y1 * S); y++)
      for (let x = Math.round(ox + x0 * S); x < Math.round(ox + x1 * S); x++) set(x, y, c);
  };
  ROWS.forEach(([runShare, walkShare, repeats], i) => {
    const top = ROW_Y[i], bot = top + ROW_H;
    const units = repeats * (runShare + walkShare);
    const unit = (X1 - X0) / units;
    let x = X0;
    for (let r = 0; r < repeats; r++) {
      fill(x, x + unit * runShare, top, bot, RUN);
      x += unit * runShare;
      if (walkShare) {
        // leave a hairline gap so the segments stay countable at icon sizes
        fill(x + unit * 0.06, x + unit * walkShare, top, bot, WALK);
        x += unit * walkShare;
      }
    }
  });
}

function background(set, W, H) {
  for (let y = 0; y < H; y++) {
    const t = y / (H - 1);
    const c = [
      Math.round(BG_TOP[0] + (BG_BOT[0] - BG_TOP[0]) * t),
      Math.round(BG_TOP[1] + (BG_BOT[1] - BG_TOP[1]) * t),
      Math.round(BG_TOP[2] + (BG_BOT[2] - BG_TOP[2]) * t),
    ];
    for (let x = 0; x < W; x++) set(x, y, c);
  }
}

function makeIcon(N) {
  const buf = Buffer.alloc(N * N * 4);
  const set = (x, y, c) => {
    if (x < 0 || y < 0 || x >= N || y >= N) return;
    const i = (y * N + x) * 4;
    buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2]; buf[i + 3] = 255;
  };
  background(set, N, N);
  drawGlyph(set, 0, 0, N);
  return encodePNG(N, N, buf);
}

function makeSplash(W, H) {
  const buf = Buffer.alloc(W * H * 4);
  const set = (x, y, c) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 4;
    buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2]; buf[i + 3] = 255;
  };
  background(set, W, H);
  // soft warm glow behind the mark, matching the app's accent
  const cx = W / 2, cy = H * 0.46, R = Math.min(W, H) * 0.6;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const d = Math.hypot(x - cx, y - cy) / R;
    if (d < 1) {
      const a = (1 - d) * 0.13;
      const i = (y * W + x) * 4;
      buf[i] = Math.min(255, buf[i] + RUN[0] * a);
      buf[i + 1] = Math.min(255, buf[i + 1] + RUN[1] * a);
      buf[i + 2] = Math.min(255, buf[i + 2] + RUN[2] * a);
    }
  }
  const S = Math.min(W, H) * 0.42;
  drawGlyph(set, cx - S / 2, cy - S / 2, S);
  return encodePNG(W, H, buf);
}

const outDir = path.join(__dirname, '..');
for (const size of [180, 192, 512]) {
  fs.writeFileSync(path.join(outDir, `run-icon-${size}.png`), makeIcon(size));
}
console.log('wrote run-icon-180/192/512.png');

// Same device list as the lifting app's launch screens.
const DEVICES = [
  [1320, 2868, 3], // 16 Pro Max
  [1206, 2622, 3], // 16 Pro
  [1290, 2796, 3], // 15/16 Plus, 14/15 Pro Max
  [1179, 2556, 3], // 14/15/16, 14/15 Pro
  [1284, 2778, 3], // 12/13 Pro Max
  [1170, 2532, 3], // 12/13/14
  [1125, 2436, 3], // X/XS/11 Pro
  [1242, 2688, 3], // XS Max/11 Pro Max
  [828, 1792, 2],  // XR/11
  [1242, 2208, 3], // 8 Plus
  [750, 1334, 2],  // SE/8
];
const splashDir = path.join(outDir, 'run-splash');
if (!fs.existsSync(splashDir)) fs.mkdirSync(splashDir);
const links = [], cacheList = [];
for (const [w, h, dpr] of DEVICES) {
  const name = `splash-${w}x${h}.png`;
  fs.writeFileSync(path.join(splashDir, name), makeSplash(w, h));
  cacheList.push(`  './run-splash/${name}',`);
  const dw = Math.round(w / dpr), dh = Math.round(h / dpr);
  links.push(
    `<link rel="apple-touch-startup-image" media="(device-width:${dw}px) and (device-height:${dh}px) and (-webkit-device-pixel-ratio:${dpr}) and (orientation:portrait)" href="./run-splash/${name}" />`
  );
}
fs.writeFileSync(path.join(splashDir, '_links.html'), links.join('\n') + '\n');
fs.writeFileSync(path.join(splashDir, '_cache.txt'), cacheList.join('\n') + '\n');
console.log(`wrote ${DEVICES.length} launch screens + _links.html`);
