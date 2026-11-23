// Schrift-Adapter: lädt die mitgelieferten Schriften (opentype.js) und wandelt Text in Pfade (mm).
// Läuft im Browser und in Node; das Laden der Bytes übernimmt der Aufrufer.
import { parse } from '../vendor/opentype.module.js';

/**
 * @param {Record<string, Record<string, ArrayBuffer>>} buffers z. B. { serif: { regular, bold }, sans: {…} }
 * @returns {{shapeText: import('../layout.js').Deps['shapeText'], missing: Set<string>}}
 *   `missing` sammelt Zeichen, die in der Schrift fehlen (werden als leeres Kästchen gesetzt).
 */
export function makeShaper(buffers) {
  const fonts = {};
  for (const [family, weights] of Object.entries(buffers)) {
    fonts[family] = {};
    for (const [w, buf] of Object.entries(weights)) fonts[family][w] = parse(buf);
  }
  const missing = new Set();
  function shapeText(family, weight, text, emMm, trackingEm = 0) {
    const font = fonts[family][weight];
    const k = emMm / font.unitsPerEm;
    const glyphs = font.stringToGlyphs(text);
    const chars = Array.from(text);
    const out = [];
    let x = 0;
    glyphs.forEach((g, i) => {
      if (g.index === 0 && chars[i] && chars[i].trim()) missing.add(chars[i]);
      const cmds = g.getPath(x, 0, emMm).commands.map(c => {
        if (c.type === 'M' || c.type === 'L') return { t: c.type, p: [c.x, c.y] };
        if (c.type === 'C') return { t: 'C', p: [c.x1, c.y1, c.x2, c.y2, c.x, c.y] };
        if (c.type === 'Q') return { t: 'Q', p: [c.x1, c.y1, c.x, c.y] };
        return { t: 'Z', p: [] };
      });
      const adv = g.advanceWidth * k;
      out.push({ cmds, x, adv });
      x += adv;
      if (i < glyphs.length - 1) x += trackingEm * emMm + font.getKerningValue(g, glyphs[i + 1]) * k;
    });
    const os2 = font.tables.os2 || {};
    return {
      glyphs: out,
      width: x,
      ascent: font.ascender * k,
      descent: -font.descender * k,
      capHeight: (os2.sCapHeight || font.unitsPerEm * 0.7) * k,
    };
  }
  return { shapeText, missing };
}
