import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { toSvg, toPdf, measureSvg, measurePdf, pngWithDpi, pngDpi, pngSize } from '../src/export.js';
import { ring } from '../src/geometry.js';

const stamp = { widthMm: 40, heightMm: 24, items: [ring('oval', 40, 24, 1, 0.5)], notes: [] };

test('SVG: Zeichenfläche = Platte in mm, nur Schwarz', () => {
  const svg = toSvg(stamp);
  assert.deepEqual(measureSvg(svg), { w: 40, h: 24 });
  assert.match(svg, /fill="#000000"/);
  assert.doesNotMatch(svg, /stroke|opacity|gradient|<text/i);
});

test('PDF: Seitengröße 1:1, CMYK-Schwarz, gültige Querverweise', () => {
  const pdf = toPdf(stamp);
  const m = measurePdf(pdf);
  assert.ok(Math.abs(m.w - 40) < 0.001 && Math.abs(m.h - 24) < 0.001);
  const s = Buffer.from(pdf).toString('latin1');
  assert.match(s, /0 0 0 1 k/);
  const xref = +/startxref\n(\d+)/.exec(s)[1];
  assert.ok(s.startsWith('xref', xref));
  const offsets = [...s.slice(xref).matchAll(/(\d{10}) 00000 n/g)].map(x => +x[1]);
  offsets.forEach((o, i) => assert.ok(s.startsWith(`${i + 1} 0 obj`, o)));
});

test('PNG: 600 dpi werden eingetragen, Pixelmaße passen', () => {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(1, 0); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 0;
  const chunk = (type, data) => { const b = Buffer.alloc(12 + data.length); b.writeUInt32BE(data.length, 0); b.write(type, 4, 'latin1'); data.copy(b, 8); return b; };
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.from([0, 0]))), chunk('IEND', Buffer.alloc(0))]);
  const out = pngWithDpi(new Uint8Array(png), 600);
  assert.equal(pngDpi(out), 600);
  assert.equal(pngDpi(pngWithDpi(out, 300)), 300);
  assert.deepEqual(pngSize(stamp, 600), { w: 945, h: 567 });
});
