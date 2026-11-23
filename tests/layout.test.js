import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildStamp } from '../src/layout.js';
import { sanitize, RULES } from '../src/model.js';
import { bounds } from '../src/geometry.js';
import { realShaper, fixture, grayWith } from './helpers.js';

const { shapeText } = realShaper();

for (const { name, design, expectNote } of fixture('designs.json')) {
  test(`Layout ${name}: alles innerhalb des 1-mm-Rands, Schrift ab 6 pt`, () => {
    const d = sanitize(design);
    const s = buildStamp(d, { shapeText, gray: null });
    assert.equal(s.widthMm, d.widthMm);
    assert.ok(s.items.length > 0);
    const m = RULES.marginMm - 1e-6;
    for (const it of s.items) {
      const b = bounds(it.cmds);
      assert.ok(b.x0 >= m && b.y0 >= m && b.x1 <= d.widthMm - m && b.y1 <= d.heightMm - m, `${name}: ${JSON.stringify(b)}`);
    }
    if (d.shape === 'kreis' || d.shape === 'oval') {
      // jeder Kurvenendpunkt innerhalb der um 1 mm verkleinerten Ellipse
      const rx = d.widthMm / 2 - RULES.marginMm, ry = d.heightMm / 2 - RULES.marginMm;
      for (const it of s.items) for (const c of it.cmds) if (c.p.length) {
        const [x, y] = c.p.slice(-2);
        const v = ((x - d.widthMm / 2) / rx) ** 2 + ((y - d.heightMm / 2) / ry) ** 2;
        assert.ok(v <= 1.0005, `${name}: Punkt außerhalb (${v})`);
      }
    }
    if (expectNote) assert.ok(s.notes.some(n => n.code === expectNote), `${name}: Hinweis ${expectNote} fehlt`);
    else assert.ok(s.textPt.min >= RULES.minTextPt, `${name}: ${s.textPt.min} pt`);
  });
}

test('Zu viel Text auf kleiner Platte meldet „schrift_klein“', () => {
  const d = sanitize({ motif: 'adresse', shape: 'rechteck', widthMm: 20, heightMm: 10, lines: ['Sehr lange erste Zeile', 'zwei', 'drei', 'vier', 'fünf'] });
  const s = buildStamp(d, { shapeText, gray: null });
  assert.ok(s.notes.some(n => n.code === 'schrift_klein'));
});

test('Logo mit Bild: Bild landet in der Mitte und im Rand', () => {
  const d = sanitize({ motif: 'logo', shape: 'kreis', widthMm: 30, border: false, lines: [], image: { src: 'data:image/png;base64,AA', threshold: 128 } });
  const gray = grayWith(200, 100, [[0, 0, 200, 10], [0, 90, 200, 10], [95, 0, 10, 100]]);
  const s = buildStamp(d, { shapeText, gray });
  assert.equal(s.items.length, 1);
  const b = bounds(s.items[0].cmds);
  assert.ok(Math.abs((b.x0 + b.x1) / 2 - 15) < 0.1 && Math.abs((b.y0 + b.y1) / 2 - 15) < 0.1);
  assert.ok(Math.abs((b.x1 - b.x0) / (b.y1 - b.y0) - 2) < 0.05);
});
