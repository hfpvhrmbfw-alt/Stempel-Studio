// Druckvorstufe: Bild für die Druckdatei aufbereiten und fertige Stempel auf Druckregeln prüfen.
// Reine Funktionen; das Graubild liefert die Oberfläche.
import { inkBounds, resample, binarize, disk, open, close, andNot, or, dilate, skeleton, components, significant, maskOf } from './bitmap.js';
import { vectorize } from './vectorize.js';
import { scale } from './geometry.js';
import { RULES } from './model.js';

/** Pixel pro mm für Bildaufbereitung und Prüfung (0,2 mm = 5 Pixel). */
export const PPM = 25;

/** Seitenverhältnis (Breite/Höhe) des Bildinhalts oder null, wenn das Bild leer ist. */
export function imageAspect(gray, settings) {
  const b = inkBounds(gray, settings.threshold, settings.invert);
  return b ? (b.x1 - b.x0) / (b.y1 - b.y0) : null;
}

/**
 * Bild in Endgröße aufbauen (nicht nachträglich skalieren), dünne Linien verstärken, enge Lücken schließen, vektorisieren.
 * @param {{w:number,h:number,data:Uint8Array}} gray
 * @param {import('./model.js').ImageSettings} settings
 * @param {number} wMm Zielbreite
 * @param {number} hMm Zielhöhe
 * @returns {{cmds:import('./geometry.js').Cmd[], thickened:number, gapsClosed:number} | null}
 */
export function prepareImage(gray, settings, wMm, hMm, ppm = PPM) {
  const b = inkBounds(gray, settings.threshold, settings.invert);
  if (!b) return null;
  const outW = Math.max(1, Math.round(wMm * ppm)), outH = Math.max(1, Math.round(hMm * ppm));
  let mask = binarize(resample(gray, b, outW, outH), settings.threshold, settings.invert);
  let thickened = 0, gapsClosed = 0;
  if (settings.thicken) {
    const minPx = Math.round(RULES.minStrokeMm * ppm);
    const se = disk(minPx);
    const minExtent = 3 * minPx;
    // dünne Linien: was beim Öffnen verschwindet; Skelett davon mit 0,24 mm neu ziehen
    const thin = significant(components(andNot(mask, open(mask, se))), minExtent);
    if (thin.length) {
      const thinMask = maskOf(mask.w, mask.h, thin);
      const spine = { w: mask.w, h: mask.h, data: skeleton(mask).data.map((v, i) => v & thinMask.data[i]) };
      mask = or(mask, dilate(spine, disk(Math.round(RULES.thickenToMm * ppm))));
      thickened = thin.length;
    }
    // enge weiße Lücken: was beim Schließen dazukommt
    const gaps = significant(components(andNot(close(mask, se), mask)), minExtent);
    if (gaps.length) { mask = or(mask, maskOf(mask.w, mask.h, gaps)); gapsClosed = gaps.length; }
  }
  const minPx = RULES.minStrokeMm * ppm;
  const cmds = scale(vectorize(mask, { turdsize: Math.round(minPx * minPx) }), 1 / ppm);
  return { cmds, thickened, gapsClosed };
}

/**
 * Fertigen Stempel als Raster prüfen.
 * @param {{w:number,h:number,data:Uint8Array}} mask Stempel in Endgröße, 1 = Farbe, `ppm` Pixel pro mm
 * @returns {{thin:Box[], gaps:Box[], margin:Box[]}} Fundstellen in mm
 * @typedef {{x:number,y:number,w:number,h:number}} Box
 */
export function checkRaster(mask, shape, ppm = PPM) {
  const minPx = Math.round(RULES.minStrokeMm * ppm), se = disk(minPx), minExtent = 3 * minPx;
  const toBox = c => ({ x: c.x0 / ppm, y: c.y0 / ppm, w: (c.x1 - c.x0) / ppm, h: (c.y1 - c.y0) / ppm });
  const thin = significant(components(andNot(mask, open(mask, se))), minExtent).map(toBox);
  const gaps = significant(components(andNot(close(mask, se), mask)), minExtent).map(toBox);
  // Randzone: alles außerhalb des um 1 mm verkleinerten Umrisses
  const { w, h } = mask, m = RULES.marginMm * ppm, zone = new Uint8Array(w * h);
  const round = shape === 'kreis' || shape === 'oval';
  // halbes Pixel Spielraum: Kantenglättung an der Grenze ist kein Verstoß
  const rx = w / 2 - m + 0.5, ry = h / 2 - m + 0.5, tol = 0.5;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (!mask.data[i]) continue;
    const px = x + 0.5, py = y + 0.5;
    const outside = round
      ? ((px - w / 2) / rx) ** 2 + ((py - h / 2) / ry) ** 2 > 1
      : px < m - tol || py < m - tol || px > w - m + tol || py > h - m + tol;
    if (outside) zone[i] = 1;
  }
  const margin = components({ w, h, data: zone }).filter(c => c.count > 2).map(toBox);
  return { thin, gaps, margin };
}
