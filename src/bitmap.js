// Reine Rasterfunktionen: Graustufenbild zuschneiden, skalieren, auf 1 Bit bringen,
// Morphologie (Öffnen/Schließen), Skelett, Zusammenhangskomponenten.
// Ein Graubild ist {w, h, data: Uint8Array} mit 0 = schwarz, 255 = weiß.
// Eine 1-Bit-Maske ist {w, h, data: Uint8Array} mit 1 = Farbe, 0 = leer.

/** @typedef {{w:number, h:number, data:Uint8Array}} Raster */

/** Bereich mit Farbe (dunkler als die Schwelle) finden. @returns {{x0,y0,x1,y1}|null} x1/y1 exklusiv */
export function inkBounds(gray, threshold, invert = false) {
  const { w, h, data } = gray;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = data[y * w + x];
      if (invert ? v >= threshold : v < threshold) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x0, y0, x1: x1 + 1, y1: y1 + 1 };
}

/**
 * Ausschnitt eines Graubilds auf neue Größe bringen.
 * Verkleinern: Flächenmittel (dünne Linien bleiben als Grauwert erhalten); Vergrößern: bilinear.
 */
export function resample(gray, box, outW, outH) {
  const out = new Uint8Array(outW * outH);
  const bw = box.x1 - box.x0, bh = box.y1 - box.y0;
  const sx = bw / outW, sy = bh / outH;
  const { w, data } = gray;
  if (sx >= 1 && sy >= 1) {
    for (let oy = 0; oy < outH; oy++) {
      const fy0 = box.y0 + oy * sy, fy1 = fy0 + sy;
      for (let ox = 0; ox < outW; ox++) {
        const fx0 = box.x0 + ox * sx, fx1 = fx0 + sx;
        let sum = 0, area = 0;
        for (let y = Math.floor(fy0); y < Math.ceil(fy1); y++) {
          const wy = Math.min(fy1, y + 1) - Math.max(fy0, y);
          for (let x = Math.floor(fx0); x < Math.ceil(fx1); x++) {
            const wx = Math.min(fx1, x + 1) - Math.max(fx0, x);
            sum += data[y * w + x] * wx * wy; area += wx * wy;
          }
        }
        out[oy * outW + ox] = Math.round(sum / area);
      }
    }
    return { w: outW, h: outH, data: out };
  }
  const at = (x, y) => data[Math.min(box.y1 - 1, Math.max(box.y0, y)) * w + Math.min(box.x1 - 1, Math.max(box.x0, x))];
  for (let oy = 0; oy < outH; oy++) {
    const fy = box.y0 + (oy + 0.5) * sy - 0.5, y = Math.floor(fy), ty = fy - y;
    for (let ox = 0; ox < outW; ox++) {
      const fx = box.x0 + (ox + 0.5) * sx - 0.5, x = Math.floor(fx), tx = fx - x;
      const v = (at(x, y) * (1 - tx) + at(x + 1, y) * tx) * (1 - ty) + (at(x, y + 1) * (1 - tx) + at(x + 1, y + 1) * tx) * ty;
      out[oy * outW + ox] = Math.round(v);
    }
  }
  return { w: outW, h: outH, data: out };
}

/** Graubild → 1-Bit-Maske. */
export function binarize(gray, threshold, invert = false) {
  const out = new Uint8Array(gray.w * gray.h);
  for (let i = 0; i < out.length; i++) out[i] = (invert ? gray.data[i] >= threshold : gray.data[i] < threshold) ? 1 : 0;
  return { w: gray.w, h: gray.h, data: out };
}

/** Versatzliste einer Kreisscheibe mit Durchmesser `diam` Pixel (gerade Durchmesser zentriert auf halbe Pixel). */
export function disk(diam) {
  const r = diam / 2, c = (diam - 1) / 2, list = [];
  for (let y = 0; y < diam; y++) for (let x = 0; x < diam; x++) {
    if ((x - c) ** 2 + (y - c) ** 2 <= r * r + 0.01) list.push([x - Math.floor(c), y - Math.floor(c)]);
  }
  return list;
}

function morph(mask, se, erodeMode, reflect) {
  const { w, h, data } = mask, out = new Uint8Array(w * h);
  const offs = reflect ? se.map(([x, y]) => [-x, -y]) : se;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = erodeMode ? 1 : 0;
      for (let k = 0; k < offs.length; k++) {
        const xx = x + offs[k][0], yy = y + offs[k][1];
        const on = xx >= 0 && yy >= 0 && xx < w && yy < h && data[yy * w + xx] === 1;
        if (erodeMode && !on) { v = 0; break; }
        if (!erodeMode && on) { v = 1; break; }
      }
      out[y * w + x] = v;
    }
  }
  return { w, h, data: out };
}

export const erode = (m, se) => morph(m, se, true, false);
export const dilate = (m, se) => morph(m, se, false, true);
/** Öffnen: entfernt alles, worin die Scheibe nicht ganz hineinpasst. */
export const open = (m, se) => dilate(erode(m, se), se);
/** Schließen: füllt Lücken, in die die Scheibe nicht hineinpasst. */
export const close = (m, se) => erode(dilate(m, se), se);

export function andNot(a, b) {
  const out = new Uint8Array(a.data.length);
  for (let i = 0; i < out.length; i++) out[i] = a.data[i] && !b.data[i] ? 1 : 0;
  return { w: a.w, h: a.h, data: out };
}

export function or(a, b) {
  const out = new Uint8Array(a.data.length);
  for (let i = 0; i < out.length; i++) out[i] = a.data[i] || b.data[i] ? 1 : 0;
  return { w: a.w, h: a.h, data: out };
}

/** Skelett nach Zhang-Suen (1 Pixel breite Mittellinien). */
export function skeleton(mask) {
  const { w, h } = mask, d = mask.data.slice();
  const g = (x, y) => (x >= 0 && y >= 0 && x < w && y < h ? d[y * w + x] : 0);
  let changed = true;
  while (changed) {
    changed = false;
    for (let pass = 0; pass < 2; pass++) {
      const del = [];
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (!d[y * w + x]) continue;
        const p = [g(x, y - 1), g(x + 1, y - 1), g(x + 1, y), g(x + 1, y + 1), g(x, y + 1), g(x - 1, y + 1), g(x - 1, y), g(x - 1, y - 1)];
        const b = p.reduce((s, v) => s + v, 0);
        if (b < 2 || b > 6) continue;
        let a = 0;
        for (let i = 0; i < 8; i++) if (!p[i] && p[(i + 1) % 8]) a++;
        if (a !== 1) continue;
        if (pass === 0 ? p[0] * p[2] * p[4] || p[2] * p[4] * p[6] : p[0] * p[2] * p[6] || p[0] * p[4] * p[6]) continue;
        del.push(y * w + x);
      }
      for (const i of del) d[i] = 0;
      if (del.length) changed = true;
    }
  }
  return { w, h, data: d };
}

/**
 * Zusammenhängende Flächen (8er-Nachbarschaft).
 * @returns {{count:number, x0:number, y0:number, x1:number, y1:number, pixels:number[]}[]}
 */
export function components(mask) {
  const { w, h, data } = mask, seen = new Uint8Array(w * h), out = [];
  for (let i = 0; i < w * h; i++) {
    if (!data[i] || seen[i]) continue;
    const stack = [i], pixels = [];
    seen[i] = 1;
    let x0 = w, y0 = h, x1 = 0, y1 = 0;
    while (stack.length) {
      const j = stack.pop(), x = j % w, y = (j - x) / w;
      pixels.push(j);
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const k = yy * w + xx;
        if (data[k] && !seen[k]) { seen[k] = 1; stack.push(k); }
      }
    }
    out.push({ count: pixels.length, x0, y0, x1: x1 + 1, y1: y1 + 1, pixels });
  }
  return out;
}

/** Flächen, deren Ausdehnung mindestens `minExtent` Pixel beträgt (kleine Eckenreste fallen weg). */
export function significant(comps, minExtent) {
  return comps.filter(c => Math.max(c.x1 - c.x0, c.y1 - c.y0) >= minExtent);
}

/** Maske nur mit den Pixeln der angegebenen Flächen. */
export function maskOf(w, h, comps) {
  const data = new Uint8Array(w * h);
  for (const c of comps) for (const i of c.pixels) data[i] = 1;
  return { w, h, data };
}

/** Anteil gesetzter Pixel. */
export function coverage(mask) {
  let n = 0;
  for (let i = 0; i < mask.data.length; i++) n += mask.data[i];
  return n / mask.data.length;
}
