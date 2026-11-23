import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitize, newDesign, fileName, buildExport, parseImport, slug, SCHEMA_VERSION, MOTIFS } from '../src/model.js';

test('sanitize: Kreis und Quadrat sind immer gleich hoch wie breit, Größen begrenzt', () => {
  assert.equal(sanitize({ shape: 'kreis', widthMm: 40, heightMm: 20 }).heightMm, 40);
  assert.equal(sanitize({ shape: 'rechteck', widthMm: 5000 }).widthMm, 150);
  assert.equal(sanitize({ shape: 'quatsch' }).shape, 'rechteck');
});

test('sanitize: höchstens 5 Zeilen, Bild nur als data:image', () => {
  const d = sanitize({ lines: ['1', '2', '3', '4', '5', '6'], image: { src: 'https://example.org/x.png' } });
  assert.equal(d.lines.length, 5);
  assert.equal(d.image, null);
});

test('sanitize ist idempotent und Startwerte sind gültig', () => {
  for (const m of MOTIFS) {
    const once = sanitize(newDesign(m));
    assert.deepEqual(sanitize(once), once);
    assert.deepEqual(once, newDesign(m));
  }
});

test('Dateiname nach Schema', () => {
  assert.equal(fileName(sanitize({ name: 'Bloom Now', shape: 'oval', widthMm: 40, heightMm: 60 }), 'pdf'), 'stempel_bloom-now_oval_40x60mm.pdf');
  assert.equal(fileName(sanitize({ lines: ['Größe ändern'], shape: 'rechteck', widthMm: 47.5, heightMm: 18 }), 'svg'), 'stempel_groesse-aendern_rechteck_47,5x18mm.svg');
  assert.equal(slug(''), 'motiv');
});

test('Import: Rundreise, kaputte, fremde und neuere Dateien', () => {
  const d = newDesign('siegel');
  const json = JSON.stringify(buildExport(d, '2026-11-23T12:00:00Z'));
  assert.deepEqual(parseImport(json), { ok: true, design: d });
  assert.deepEqual(parseImport('nicht json'), { ok: false, error: 'kein_json' });
  assert.deepEqual(parseImport('{"app":"anders","version":1}'), { ok: false, error: 'falsche_app' });
  assert.deepEqual(parseImport(JSON.stringify({ app: 'stempel-studio', version: SCHEMA_VERSION + 1, design: d })), { ok: false, error: 'zu_neu' });
  assert.deepEqual(parseImport('{"app":"stempel-studio","version":1}'), { ok: false, error: 'kaputt' });
});
