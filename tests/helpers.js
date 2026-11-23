import { readFileSync } from 'node:fs';
import { makeShaper } from '../src/services/fonts.js';
import { FONTS } from '../src/model.js';

const root = new URL('../', import.meta.url);
const buf = p => { const b = readFileSync(new URL(p, root)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.length); };

export function realShaper() {
  const buffers = {};
  for (const [family, files] of Object.entries(FONTS)) buffers[family] = { regular: buf(files.regular), bold: buf(files.bold) };
  return makeShaper(buffers);
}

export const fixture = name => JSON.parse(readFileSync(new URL(`tests/fixtures/${name}`, root), 'utf8'));

/** Graubild mit Rechtecken (schwarz auf weiß). rects: [x, y, w, h] in Pixeln */
export function grayWith(w, h, rects) {
  const data = new Uint8Array(w * h).fill(255);
  for (const [x0, y0, rw, rh] of rects) for (let y = y0; y < y0 + rh; y++) for (let x = x0; x < x0 + rw; x++) data[y * w + x] = 0;
  return { w, h, data };
}

/** 1-Bit-Maske mit Rechtecken. */
export function maskWith(w, h, rects) {
  const g = grayWith(w, h, rects);
  return { w, h, data: g.data.map(v => (v === 0 ? 1 : 0)) };
}
