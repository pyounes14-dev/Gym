// Generates app icons (PNG) for the PWA without any third-party deps.
// Uses Node's built-in zlib to encode a minimal RGBA PNG.
// Draws a simple dumbbell glyph on a dark gradient background.
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const ACCENT = [124, 92, 255];   // #7c5cff
const BG_TOP = [27, 31, 59];     // #1b1f3b
const BG_BOT = [12, 14, 28];     // #0c0e1c
const GLYPH = [237, 233, 255];   // near-white with violet tint

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
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
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
  // 10,11,12 default 0
  // add filter byte (0) at start of each row
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function makeIcon(N) {
  const buf = Buffer.alloc(N * N * 4);
  const set = (x, y, c) => {
    if (x < 0 || y < 0 || x >= N || y >= N) return;
    const i = (y * N + x) * 4;
    buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2]; buf[i + 3] = 255;
  };
  // background vertical gradient
  for (let y = 0; y < N; y++) {
    const t = y / (N - 1);
    const c = [
      Math.round(BG_TOP[0] + (BG_BOT[0] - BG_TOP[0]) * t),
      Math.round(BG_TOP[1] + (BG_BOT[1] - BG_TOP[1]) * t),
      Math.round(BG_TOP[2] + (BG_BOT[2] - BG_TOP[2]) * t),
    ];
    for (let x = 0; x < N; x++) set(x, y, c);
  }
  // helper to fill a rectangle (normalized coords 0..1)
  const rect = (x0, x1, y0, y1, c) => {
    for (let y = Math.round(y0 * N); y < Math.round(y1 * N); y++)
      for (let x = Math.round(x0 * N); x < Math.round(x1 * N); x++) set(x, y, c);
  };
  // dumbbell: handle bar
  rect(0.30, 0.70, 0.47, 0.53, GLYPH);
  // inner plates
  rect(0.28, 0.34, 0.39, 0.61, ACCENT);
  rect(0.66, 0.72, 0.39, 0.61, ACCENT);
  // outer plates
  rect(0.22, 0.28, 0.33, 0.67, GLYPH);
  rect(0.72, 0.78, 0.33, 0.67, GLYPH);
  return encodePNG(N, N, buf);
}

// iOS launch screen: centered dumbbell + glow on the app's dark gradient.
function makeSplash(W, H) {
  const buf = Buffer.alloc(W * H * 4);
  const set = (x, y, c) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 4;
    buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2]; buf[i + 3] = 255;
  };
  // vertical gradient background
  for (let y = 0; y < H; y++) {
    const t = y / (H - 1);
    const bg = [
      Math.round(BG_TOP[0] + (BG_BOT[0] - BG_TOP[0]) * t),
      Math.round(BG_TOP[1] + (BG_BOT[1] - BG_TOP[1]) * t),
      Math.round(BG_TOP[2] + (BG_BOT[2] - BG_TOP[2]) * t),
    ];
    for (let x = 0; x < W; x++) set(x, y, bg);
  }
  // soft radial accent glow centered slightly above middle
  const cx = W / 2, cy = H * 0.46, R = Math.min(W, H) * 0.55;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const d = Math.hypot(x - cx, y - cy) / R;
    if (d < 1) {
      const a = (1 - d) * 0.20;
      const i = (y * W + x) * 4;
      buf[i] = Math.min(255, buf[i] + ACCENT[0] * a);
      buf[i + 1] = Math.min(255, buf[i + 1] + ACCENT[1] * a);
      buf[i + 2] = Math.min(255, buf[i + 2] + ACCENT[2] * a);
    }
  }
  // dumbbell centered, sized to ~26% of the short edge
  const S = Math.min(W, H) * 0.26;
  const ox = cx - S / 2, oy = cy - S / 2;
  const rect = (x0, x1, y0, y1, c) => {
    for (let y = Math.round(oy + y0 * S); y < Math.round(oy + y1 * S); y++)
      for (let x = Math.round(ox + x0 * S); x < Math.round(ox + x1 * S); x++) set(x, y, c);
  };
  rect(0.30, 0.70, 0.47, 0.53, GLYPH);
  rect(0.28, 0.34, 0.39, 0.61, ACCENT);
  rect(0.66, 0.72, 0.39, 0.61, ACCENT);
  rect(0.22, 0.28, 0.33, 0.67, GLYPH);
  rect(0.72, 0.78, 0.33, 0.67, GLYPH);
  return encodePNG(W, H, buf);
}

const outDir = path.join(__dirname, '..');
for (const size of [180, 192, 512]) {
  const png = makeIcon(size);
  fs.writeFileSync(path.join(outDir, `icon-${size}.png`), png);
  console.log(`wrote icon-${size}.png (${png.length} bytes)`);
}

// Apple launch images for current iPhones: [physicalW, physicalH, dpr]
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
const splashDir = path.join(outDir, 'splash');
if (!fs.existsSync(splashDir)) fs.mkdirSync(splashDir);
const links = [];
const cacheList = [];
for (const [w, h, dpr] of DEVICES) {
  const png = makeSplash(w, h);
  const name = `splash-${w}x${h}.png`;
  fs.writeFileSync(path.join(splashDir, name), png);
  cacheList.push(`  './splash/${name}',`);
  const dw = Math.round(w / dpr), dh = Math.round(h / dpr);
  links.push(
    `<link rel="apple-touch-startup-image" media="(device-width:${dw}px) and (device-height:${dh}px) and (-webkit-device-pixel-ratio:${dpr}) and (orientation:portrait)" href="./splash/${name}" />`
  );
}
fs.writeFileSync(path.join(splashDir, '_links.html'), links.join('\n') + '\n');
fs.writeFileSync(path.join(splashDir, '_cache.txt'), cacheList.join('\n') + '\n');
console.log(`wrote ${DEVICES.length} splash images + _links.html`);
