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

const outDir = path.join(__dirname, '..');
for (const size of [180, 192, 512]) {
  const png = makeIcon(size);
  fs.writeFileSync(path.join(outDir, `icon-${size}.png`), png);
  console.log(`wrote icon-${size}.png (${png.length} bytes)`);
}
