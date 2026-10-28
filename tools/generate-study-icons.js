// Generates app icons + iOS launch screens for the Study Clock app.
// Same zero-dependency PNG encoder as generate-run-icons.js, different mark and palette.
//
// The glyph is a stopwatch whose ring is part-lit: the lit arc is time studied, the
// dim remainder is the clock waiting. It is round, so unlike the other two marks it is
// drawn with 4×4 supersampling — hard pixel edges read as jagged on a circle.
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const STUDY = [94, 211, 154];  // #5ED39A — the study token
const TRACK = [36, 62, 52];    // #243E34 — unlit ring, lifted to read at 60px
const INK = [236, 239, 238];   // #ECEFEE
const CROWN = [167, 178, 175]; // #A7B2AF — the ink2 token
const BG_TOP = [24, 31, 30];   // #181F1E
const BG_BOT = [12, 16, 15];   // #0C100F

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

// Glyph geometry, as shares of the glyph box.
const CX = 0.5, CY = 0.545;
const R_OUT = 0.30, R_IN = 0.236;
const ARC = 0.7;          // share of the ring that is lit
const SEAM = 0.05;        // radians of gap either side of the lit arc, so it stays countable
const HAND_W = 0.016;     // half-width of the hand
const TAU = Math.PI * 2;

function segDist(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy)));
  return Math.hypot(px - (ax + vx * t), py - (ay + vy * t));
}

// The colour of the glyph at (u, v) in glyph space, or null where it is see-through.
function glyphAt(u, v) {
  const dx = u - CX, dy = v - CY, r = Math.hypot(dx, dy);
  // hand: centre to the head of the lit arc
  const head = ARC * TAU;
  const hx = CX + Math.sin(head) * (R_IN - 0.05), hy = CY - Math.cos(head) * (R_IN - 0.05);
  if (r <= 0.034) return INK;
  if (segDist(u, v, CX, CY, hx, hy) <= HAND_W) return INK;
  if (r >= R_IN && r <= R_OUT) {
    let a = Math.atan2(dx, -dy);   // 0 at twelve o'clock, clockwise
    if (a < 0) a += TAU;
    if (a < SEAM / 2 || Math.abs(a - head) < SEAM / 2 || a > TAU - SEAM / 2) return null;
    return a < head ? STUDY : TRACK;
  }
  // crown and stem above twelve o'clock
  const top = CY - R_OUT;
  if (Math.abs(dx) <= 0.06 && v >= top - 0.095 && v <= top - 0.05) return CROWN;
  if (Math.abs(dx) <= 0.024 && v >= top - 0.055 && v <= top + 0.01) return CROWN;
  return null;
}

// Paints the glyph into a box of side S with its top-left at (ox, oy), blending each
// pixel by how many of its 16 subsamples land on the mark.
function drawGlyph(get, set, ox, oy, S) {
  const x0 = Math.floor(ox), y0 = Math.floor(oy);
  for (let y = y0; y < Math.ceil(oy + S); y++) {
    for (let x = x0; x < Math.ceil(ox + S); x++) {
      let r = 0, g = 0, b = 0, n = 0;
      for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) {
        const c = glyphAt((x + (sx + 0.5) / 4 - ox) / S, (y + (sy + 0.5) / 4 - oy) / S);
        if (c) { r += c[0]; g += c[1]; b += c[2]; n++; }
      }
      if (!n) continue;
      const bg = get(x, y);
      if (!bg) continue;
      const a = n / 16;
      set(x, y, [
        Math.round(r / n * a + bg[0] * (1 - a)),
        Math.round(g / n * a + bg[1] * (1 - a)),
        Math.round(b / n * a + bg[2] * (1 - a)),
      ]);
    }
  }
}

function canvas(W, H) {
  const buf = Buffer.alloc(W * H * 4);
  const inside = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
  const set = (x, y, c) => {
    if (!inside(x, y)) return;
    const i = (y * W + x) * 4;
    buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2]; buf[i + 3] = 255;
  };
  const get = (x, y) => {
    if (!inside(x, y)) return null;
    const i = (y * W + x) * 4;
    return [buf[i], buf[i + 1], buf[i + 2]];
  };
  for (let y = 0; y < H; y++) {
    const t = y / (H - 1);
    const c = BG_TOP.map((v, k) => Math.round(v + (BG_BOT[k] - v) * t));
    for (let x = 0; x < W; x++) set(x, y, c);
  }
  return { buf, get, set };
}

function makeIcon(N) {
  const c = canvas(N, N);
  drawGlyph(c.get, c.set, 0, 0, N);
  return encodePNG(N, N, c.buf);
}

function makeSplash(W, H) {
  const c = canvas(W, H);
  // soft green glow behind the mark, matching the app's accent
  const cx = W / 2, cy = H * 0.46, R = Math.min(W, H) * 0.6;
  for (let y = Math.max(0, Math.floor(cy - R)); y < Math.min(H, Math.ceil(cy + R)); y++) {
    for (let x = 0; x < W; x++) {
      const d = Math.hypot(x - cx, y - cy) / R;
      if (d >= 1) continue;
      const a = (1 - d) * 0.11;
      const i = (y * W + x) * 4;
      c.buf[i] = Math.min(255, c.buf[i] + STUDY[0] * a);
      c.buf[i + 1] = Math.min(255, c.buf[i + 1] + STUDY[1] * a);
      c.buf[i + 2] = Math.min(255, c.buf[i + 2] + STUDY[2] * a);
    }
  }
  const S = Math.min(W, H) * 0.42;
  drawGlyph(c.get, c.set, cx - S / 2, cy - S / 2, S);
  return encodePNG(W, H, c.buf);
}

const outDir = path.join(__dirname, '..');
for (const size of [180, 192, 512]) {
  fs.writeFileSync(path.join(outDir, `study-icon-${size}.png`), makeIcon(size));
}
console.log('wrote study-icon-180/192/512.png');

// Same device list as the other apps' launch screens.
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
const splashDir = path.join(outDir, 'study-splash');
if (!fs.existsSync(splashDir)) fs.mkdirSync(splashDir);
const links = [], cacheList = [];
for (const [w, h, dpr] of DEVICES) {
  const name = `splash-${w}x${h}.png`;
  fs.writeFileSync(path.join(splashDir, name), makeSplash(w, h));
  cacheList.push(`  './study-splash/${name}',`);
  const dw = Math.round(w / dpr), dh = Math.round(h / dpr);
  links.push(
    `<link rel="apple-touch-startup-image" media="(device-width:${dw}px) and (device-height:${dh}px) and (-webkit-device-pixel-ratio:${dpr}) and (orientation:portrait)" href="./study-splash/${name}" />`
  );
}
fs.writeFileSync(path.join(splashDir, '_links.html'), links.join('\n') + '\n');
fs.writeFileSync(path.join(splashDir, '_cache.txt'), cacheList.join('\n') + '\n');
console.log(`wrote ${DEVICES.length} launch screens + _links.html`);
