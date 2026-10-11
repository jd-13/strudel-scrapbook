// Draws the app icon (a small drum grid) as SVG and PNGs into public/.
// Uses only Node built-ins: `node scripts/make-icons.mjs`.
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

// White Elephant Audio palette: ultra-violet ground, white marks, pink accent.
const BG = [100, 94, 157];
const HIT = [255, 255, 255];
const ACCENT = [242, 141, 191];
const LINE = [138, 132, 190];

// Rows of a 4-row, 8-step grid: 1 = white hit, 2 = pink accent.
const GRID = [
  [0, 0, 1, 0, 0, 0, 1, 0],
  [1, 1, 1, 1, 1, 1, 1, 2],
  [0, 0, 1, 0, 0, 0, 1, 0],
  [1, 0, 0, 1, 0, 2, 1, 0],
];

/** Cells as [x, y, w, h, color] in a 0..1 box with the given inner padding. */
function shapes(pad) {
  const out = [];
  const inner = 1 - 2 * pad;
  const cw = inner / 8, rh = inner / 4;
  for (let c = 0; c <= 8; c += 4) out.push([pad + c * cw - 0.004, pad, 0.008, inner, LINE]);
  GRID.forEach((row, r) =>
    row.forEach((v, c) => {
      if (v) out.push([pad + c * cw + cw * 0.12, pad + r * rh + rh * 0.18, cw * 0.76, rh * 0.64, v === 1 ? HIT : ACCENT]);
    }),
  );
  return out;
}

const hex = ([r, g, b]) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');

function svg() {
  const S = 512;
  const cells = shapes(0.16)
    .map(([x, y, w, h, col]) => `<rect x="${(x * S).toFixed(1)}" y="${(y * S).toFixed(1)}" width="${(w * S).toFixed(1)}" height="${(h * S).toFixed(1)}" rx="${col === LINE ? 0 : 6}" fill="${hex(col)}"/>`)
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}"><rect width="${S}" height="${S}" rx="96" fill="${hex(BG)}"/>${cells}</svg>\n`;
}

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (const b of buf) {
    c = (crc ^ b) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(size, { pad, rounded }) {
  const px = Buffer.alloc(size * size * 4);
  const radius = rounded ? size * 0.1875 : 0;
  const inRounded = (x, y) => {
    if (!radius) return true;
    const cx = Math.min(Math.max(x, radius), size - radius), cy = Math.min(Math.max(y, radius), size - radius);
    return (x - cx) ** 2 + (y - cy) ** 2 <= radius * radius;
  };
  const list = shapes(pad);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      if (!inRounded(x + 0.5, y + 0.5)) continue; // transparent corner
      let col = BG;
      const u = (x + 0.5) / size, v = (y + 0.5) / size;
      for (const [sx, sy, w, h, c] of list) if (u >= sx && u < sx + w && v >= sy && v < sy + h) col = c;
      px[i] = col[0]; px[i + 1] = col[1]; px[i + 2] = col[2]; px[i + 3] = 255;
    }
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

writeFileSync('public/icon.svg', svg());
writeFileSync('public/icon-192.png', png(192, { pad: 0.16, rounded: true }));
writeFileSync('public/icon-512.png', png(512, { pad: 0.16, rounded: true }));
// Maskable: full-bleed background, content inside the 80% safe zone.
writeFileSync('public/icon-maskable-512.png', png(512, { pad: 0.24, rounded: false }));
console.log('icons written to public/');
