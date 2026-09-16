import { build } from 'vite';
import { deflateSync } from 'node:zlib';
import { mkdirSync, copyFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const outDir = resolve(root, 'dist-extension');
const iconsDir = resolve(outDir, 'icons');

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(size, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = deflateSync(raw);
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const CORAL = [0xff, 0x7a, 0x59];
const PINK = [0xff, 0x4d, 0x8d];
const lerp = (a, b, t) => Math.round(a + (b - a) * t);

function drawIcon(size) {
  const buf = Buffer.alloc(size * size * 4);
  const radius = size * 0.22;
  const cy = size * 0.5;
  const amp = size * 0.16;
  const stroke = Math.max(1.5, size * 0.12);
  const period = size * 0.62;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const rx = Math.min(x, size - 1 - x);
      const ry = Math.min(y, size - 1 - y);
      if (rx < radius && ry < radius) {
        const dx = radius - rx;
        const dy = radius - ry;
        if (dx * dx + dy * dy > radius * radius) {
          buf[i + 3] = 0;
          continue;
        }
      }
      const t = (x + y) / (2 * (size - 1));
      let r = lerp(CORAL[0], PINK[0], t);
      let g = lerp(CORAL[1], PINK[1], t);
      let b = lerp(CORAL[2], PINK[2], t);
      const yc = cy + amp * Math.sin(((x - size * 0.5) / period) * Math.PI * 2);
      if (Math.abs(y - yc) <= stroke / 2 && x > size * 0.18 && x < size * 0.82) {
        r = 255;
        g = 255;
        b = 255;
      }
      buf[i] = r;
      buf[i + 1] = g;
      buf[i + 2] = b;
      buf[i + 3] = 255;
    }
  }
  return encodePng(size, buf);
}

await build({ configFile: 'vite.config.extension.ts' });

mkdirSync(iconsDir, { recursive: true });
for (const size of [16, 32, 48, 128]) {
  writeFileSync(resolve(iconsDir, `icon-${size}.png`), drawIcon(size));
}
copyFileSync(resolve(root, 'extension/manifest.json'), resolve(outDir, 'manifest.json'));
copyFileSync(resolve(root, 'extension/background.js'), resolve(outDir, 'background.js'));

console.log('✓ Extension đã build vào dist-extension/ — load unpacked trong chrome://extensions');
