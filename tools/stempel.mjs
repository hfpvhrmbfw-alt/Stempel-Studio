#!/usr/bin/env node
// Stempel-Studio Kommandozeile: Stempel bauen, eigene SVG prüfen, Druckdateien exportieren.
// Nur Node ≥ 18, keine Abhängigkeiten. Aufruf ohne Argumente zeigt die Hilfe.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sanitize, fileName, FONTS, RULES } from '../src/model.js';
import { buildStamp } from '../src/layout.js';
import { checkRaster, PPM } from '../src/prepress.js';
import { toSvg, toPdf, measureSvg, measurePdf, pngWithDpi } from '../src/export.js';
import { bounds, toPathData, translate } from '../src/geometry.js';
import { makeShaper } from '../src/services/fonts.js';
import { infoLine } from '../src/texts.js';
import { coverageRaster, toMask } from './raster.js';
import { decodePngGray, encodePngAlpha } from './png.js';
import { parseSvg } from './svgin.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HELP = `Stempel-Studio Kommandozeile

  node stempel.mjs build  <design.json> [--image bild.png] [--out ordner]
      Stempel aus einem Design bauen (Felder siehe SKILL.md), prüfen und exportieren.
  node stempel.mjs check  <stempel.svg> --shape <rechteck|kreis|oval|quadrat>
      Eigene SVG (Maße in mm, nur schwarze Flächen) auf Druckregeln prüfen.
  node stempel.mjs export <stempel.svg> --shape <form> --name <motiv> [--out ordner] [--color #C8102E] [--mirror]
      Eigene SVG prüfen und als PDF, SVG, PNG 600 dpi und Infozeile ausgeben.
  node stempel.mjs text   --font <datei.ttf|otf|woff> --size <mm> [--x mm] [--y mm] [--anchor start|middle|end] [--tracking <em>] "Text"
      Text in Pfade wandeln (JSON mit Pfaddaten in mm; --y ist die Grundlinie, --x der Ankerpunkt).

Ausgabe: JSON-Bericht auf stdout. Exitcode 1 bei Fehlern, 0 sonst (Hinweise stehen im Bericht).`;

const args = process.argv.slice(2);
const opt = name => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const flag = name => args.includes(`--${name}`);
const positional = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--') && !['--mirror'].includes(args[i - 1])));
const buf = p => { const b = readFileSync(p); return b.buffer.slice(b.byteOffset, b.byteOffset + b.length); };

function shaper() {
  const buffers = {};
  for (const [family, f] of Object.entries(FONTS)) buffers[family] = { regular: buf(join(ROOT, f.regular)), bold: buf(join(ROOT, f.bold)) };
  return makeShaper(buffers);
}

/** Druckprüfung wie in der App: Raster in 25 px/mm, Strich/Lücke/Rand, Maße der Dateien. */
function check(stamp, shape, svg, pdf) {
  const mask = toMask(coverageRaster(stamp.items, stamp.widthMm, stamp.heightMm, PPM, 2));
  const r = checkRaster(mask, shape, PPM);
  const round = b => ({ x: +b.x.toFixed(2), y: +b.y.toFixed(2), w: +b.w.toFixed(2), h: +b.h.toFixed(2) });
  const ms = measureSvg(svg), mp = measurePdf(pdf);
  const ok = m => m && Math.abs(m.w - stamp.widthMm) < 0.01 && Math.abs(m.h - stamp.heightMm) < 0.01;
  const b = stamp.items.length ? bounds(stamp.items.flatMap(i => i.cmds)) : null;
  return {
    duenn_unter_0_2mm: r.thin.map(round),
    luecken_unter_0_2mm: r.gaps.map(round),
    im_1mm_rand: r.margin.map(round),
    masse: { svg: ms, pdf: mp && { w: +mp.w.toFixed(3), h: +mp.h.toFixed(3) }, ok: ok(ms) && ok(mp) },
    motiv_rahmen_mm: b && { x0: +b.x0.toFixed(2), y0: +b.y0.toFixed(2), x1: +b.x1.toFixed(2), y1: +b.y1.toFixed(2) },
    in_ordnung: !r.thin.length && !r.gaps.length && !r.margin.length && ok(ms) && ok(mp),
  };
}

function writeAll(stamp, design, out) {
  mkdirSync(out, { recursive: true });
  const svg = toSvg(stamp, { mirror: design.mirror, title: fileName(design, 'svg') });
  const pdf = toPdf(stamp, { mirror: design.mirror, title: fileName(design, 'pdf') });
  const dpm = RULES.pngDpi / 25.4;
  const png = pngWithDpi(new Uint8Array(encodePngAlpha(coverageRaster(stamp.items, stamp.widthMm, stamp.heightMm, dpm, 3), design.inkColor)), RULES.pngDpi);
  const files = { svg: fileName(design, 'svg'), pdf: fileName(design, 'pdf'), png: fileName(design, 'png') };
  writeFileSync(join(out, files.svg), svg);
  writeFileSync(join(out, files.pdf), pdf);
  writeFileSync(join(out, files.png), png);
  writeFileSync(join(out, 'infozeile_hersteller.txt'), `${files.pdf} / ${files.svg}\n${infoLine(design)}\n`);
  return { files: Object.values(files).map(f => join(out, f)).concat(join(out, 'infozeile_hersteller.txt')), pruefung: check(stamp, design.shape, svg, pdf) };
}

function main() {
  const [cmd, file] = positional;
  if (!cmd) { console.log(HELP); return 0; }
  if (cmd === 'build') {
    const design = sanitize({ ...JSON.parse(readFileSync(file, 'utf8')), image: undefined });
    const img = opt('image');
    const raw = JSON.parse(readFileSync(file, 'utf8')).image || {};
    if (img) design.image = { src: 'data:image/png;base64,', name: img, threshold: raw.threshold ?? 128, invert: !!raw.invert, thicken: raw.thicken !== false, scale: raw.scale ?? 1 };
    const s = shaper();
    const stamp = buildStamp(design, { shapeText: s.shapeText, gray: img ? decodePngGray(readFileSync(img)) : null });
    const res = writeAll(stamp, design, opt('out') || '.');
    console.log(JSON.stringify({ design, hinweise: stamp.notes, fehlende_zeichen: [...s.missing], kleinste_schrift_pt: stamp.textPt && +stamp.textPt.min.toFixed(1), ...res }, null, 1));
    return 0;
  }
  if (cmd === 'check' || cmd === 'export') {
    const stamp = parseSvg(readFileSync(file, 'utf8'));
    const shape = opt('shape');
    if (!['rechteck', 'kreis', 'oval', 'quadrat'].includes(shape)) throw new Error('--shape fehlt oder ist ungültig.');
    const design = sanitize({ name: opt('name') || 'motiv', shape, widthMm: stamp.widthMm, heightMm: stamp.heightMm, inkColor: opt('color') || '#000000', mirror: flag('mirror') });
    if (design.widthMm !== stamp.widthMm || design.heightMm !== stamp.heightMm) throw new Error('Maße außerhalb von 10–150 mm oder Kreis/Quadrat nicht gleich breit wie hoch.');
    if (cmd === 'check') { console.log(JSON.stringify(check(stamp, shape, toSvg(stamp), toPdf(stamp)), null, 1)); return 0; }
    console.log(JSON.stringify(writeAll(stamp, design, opt('out') || '.'), null, 1));
    return 0;
  }
  if (cmd === 'text') {
    const s = makeShaper({ f: { regular: buf(opt('font')) } });
    const size = +opt('size'), text = positional[1];
    const r = s.shapeText('f', 'regular', text, size, +(opt('tracking') || 0));
    const dx = +(opt('x') || 0) - (opt('anchor') === 'middle' ? r.width / 2 : opt('anchor') === 'end' ? r.width : 0), dy = +(opt('y') || 0);
    console.log(JSON.stringify({ d: toPathData(translate(r.glyphs.flatMap(g => g.cmds), dx, dy)), width: r.width, ascent: r.ascent, descent: r.descent, capHeight: r.capHeight, fehlende_zeichen: [...s.missing], glyphen: r.glyphs.map(g => ({ x: g.x, adv: g.adv })) }, null, 1));
    return 0;
  }
  console.log(HELP);
  return 1;
}

try { process.exitCode = main(); } catch (e) { console.error(`Fehler: ${e.message}`); process.exitCode = 1; }
