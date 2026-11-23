import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkRaster, prepareImage, PPM } from '../src/prepress.js';
import { bounds } from '../src/geometry.js';
import { maskWith, grayWith } from './helpers.js';

const S = 20 * PPM; // 20 mm Platte

test('Prüfung: dicke Linie in Ordnung, dünne Linie wird gefunden', () => {
  const ok = checkRaster(maskWith(S, S, [[100, 100, 10, 200]]), 'quadrat');
  assert.deepEqual([ok.thin.length, ok.gaps.length, ok.margin.length], [0, 0, 0]);
  const thin = checkRaster(maskWith(S, S, [[100, 100, 3, 200]]), 'quadrat'); // 0,12 mm
  assert.equal(thin.thin.length, 1);
  assert.ok(Math.abs(thin.thin[0].h - 8) < 0.5);
});

test('Prüfung: enge Lücke zwischen zwei Flächen', () => {
  const r = checkRaster(maskWith(S, S, [[100, 100, 40, 200], [143, 100, 40, 200]]), 'quadrat'); // 3 px = 0,12 mm
  assert.equal(r.gaps.length, 1);
});

test('Prüfung: Farbe im 1-mm-Rand, auch beim Kreis', () => {
  assert.equal(checkRaster(maskWith(S, S, [[10, 100, 20, 50]]), 'quadrat').margin.length, 1);
  // Ecke des Quadrats liegt beim Kreis außerhalb, beim Quadrat innerhalb
  const corner = maskWith(S, S, [[40, 40, 20, 20]]);
  assert.equal(checkRaster(corner, 'quadrat').margin.length, 0);
  assert.equal(checkRaster(corner, 'kreis').margin.length, 1);
});

test('Bild: in Endgröße vektorisiert, dünne Linie verstärkt', () => {
  const gray = grayWith(400, 400, [[50, 50, 30, 300], [200, 50, 1, 300]]);
  const r = prepareImage(gray, { threshold: 128, invert: false, thicken: true }, 15, 15);
  assert.equal(r.thickened, 1);
  const b = bounds(r.cmds);
  assert.ok(b.x0 >= -0.05 && b.y0 >= -0.05 && b.x1 <= 15.05 && b.y1 <= 15.05, JSON.stringify(b));
  const off = prepareImage(gray, { threshold: 128, invert: false, thicken: false }, 15, 15);
  assert.equal(off.thickened, 0);
});

test('Bild: leeres Bild ergibt null', () => {
  assert.equal(prepareImage(grayWith(50, 50, []), { threshold: 128, invert: false, thicken: true }, 10, 10), null);
});
