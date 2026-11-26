import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { coverageRaster, toMask } from '../tools/raster.js';
import { decodePngGray, encodePngAlpha } from '../tools/png.js';
import { parsePathData, parseSvg } from '../tools/svgin.js';
import { ring, roundRect } from '../src/geometry.js';
import { pngDpi } from '../src/export.js';

const CLI = new URL('../tools/stempel.mjs', import.meta.url).pathname;

test('Raster: Rechteck 2 × 1 mm bei 10 px/mm deckt 200 Pixel, Ring mit evenodd hat ein Loch', () => {
  const r = toMask(coverageRaster([{ cmds: roundRect(1, 1, 2, 1), rule: 'nonzero' }], 5, 5, 10));
  assert.equal(r.data.reduce((s, v) => s + v, 0), 200);
  const ringMask = toMask(coverageRaster([ring('kreis', 10, 10, 1, 0.5)], 10, 10, 10));
  assert.equal(ringMask.data[50 * 100 + 50], 0);
  assert.equal(ringMask.data[50 * 100 + 12], 1);
});

test('PNG: schreiben und wieder lesen', () => {
  const r = { w: 3, h: 2, data: new Float32Array([1, 0, 1, 0, 1, 0]) };
  const g = decodePngGray(encodePngAlpha(r, '#000000'));
  assert.deepEqual([...g.data], [0, 255, 0, 255, 0, 255]);
});

test('SVG lesen: relative Befehle, viewBox-Maßstab, verbotene Striche', () => {
  assert.deepEqual(parsePathData('m1 1 h2 v2 z').map(c => c.p), [[1, 1], [3, 1], [3, 3], []]);
  const s = parseSvg('<svg xmlns="http://www.w3.org/2000/svg" width="20mm" height="10mm" viewBox="0 0 200 100"><path d="M10 10H30V30Z"/></svg>');
  assert.deepEqual(s.items[0].cmds[1].p, [3, 1]);
  assert.throws(() => parseSvg('<svg width="20mm" height="10mm"><path stroke="#000" d="M0 0L1 1"/></svg>'), /Striche/);
  assert.throws(() => parseSvg('<svg width="20mm" height="10mm"><rect fill="#fff" width="1" height="1"/></svg>'), /schwarze/);
});

test('Kommandozeile: build schreibt PDF, SVG, PNG 600 dpi und Infozeile, Prüfung in Ordnung', () => {
  const dir = mkdtempSync(join(tmpdir(), 'stempel-'));
  writeFileSync(join(dir, 'd.json'), JSON.stringify({ motif: 'siegel', shape: 'kreis', widthMm: 40, lines: ['Mitte'], ringTop: 'OBEN', ringBottom: 'UNTEN', name: 'test' }));
  const rep = JSON.parse(execFileSync('node', [CLI, 'build', join(dir, 'd.json'), '--out', dir], { encoding: 'utf8' }));
  assert.equal(rep.pruefung.in_ordnung, true);
  assert.deepEqual(readdirSync(dir).sort(), ['d.json', 'infozeile_hersteller.txt', 'stempel_test_kreis_40x40mm.pdf', 'stempel_test_kreis_40x40mm.png', 'stempel_test_kreis_40x40mm.svg']);
  assert.equal(pngDpi(new Uint8Array(readFileSync(join(dir, 'stempel_test_kreis_40x40mm.png')))), 600);
  const chk = JSON.parse(execFileSync('node', [CLI, 'check', join(dir, 'stempel_test_kreis_40x40mm.svg'), '--shape', 'kreis'], { encoding: 'utf8' }));
  assert.equal(chk.in_ordnung, true);
});
