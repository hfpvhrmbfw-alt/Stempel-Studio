// Reine Geometrie: Pfade als Befehlslisten in mm, Transformation, Grundformen.
// Ein Pfad ist ein Array von Befehlen {t:'M'|'L'|'C'|'Q'|'Z', p:number[]} (absolute Koordinaten, y nach unten).

/** @typedef {{t:'M'|'L'|'C'|'Q'|'Z', p:number[]}} Cmd */
/** @typedef {{cmds:Cmd[], rule:'nonzero'|'evenodd'}} Item */

const K = 0.5522847498; // Kreisnäherung mit kubischen Bézierkurven

/** Affine Transformation [a,b,c,d,e,f]: x' = a*x + c*y + e, y' = b*x + d*y + f */
export function transform(cmds, m) {
  const [a, b, c, d, e, f] = m;
  return cmds.map(cmd => {
    const p = [];
    for (let i = 0; i < cmd.p.length; i += 2) {
      const x = cmd.p[i], y = cmd.p[i + 1];
      p.push(a * x + c * y + e, b * x + d * y + f);
    }
    return { t: cmd.t, p };
  });
}

export const translate = (cmds, dx, dy) => transform(cmds, [1, 0, 0, 1, dx, dy]);
export const scale = (cmds, s, dx = 0, dy = 0) => transform(cmds, [s, 0, 0, s, dx, dy]);

/** Ellipse als geschlossener Pfad (Mittelpunkt, Halbachsen). */
export function ellipse(cx, cy, rx, ry) {
  const kx = rx * K, ky = ry * K;
  return [
    { t: 'M', p: [cx + rx, cy] },
    { t: 'C', p: [cx + rx, cy + ky, cx + kx, cy + ry, cx, cy + ry] },
    { t: 'C', p: [cx - kx, cy + ry, cx - rx, cy + ky, cx - rx, cy] },
    { t: 'C', p: [cx - rx, cy - ky, cx - kx, cy - ry, cx, cy - ry] },
    { t: 'C', p: [cx + kx, cy - ry, cx + rx, cy - ky, cx + rx, cy] },
    { t: 'Z', p: [] },
  ];
}

/** Rechteck mit optional gerundeten Ecken. */
export function roundRect(x, y, w, h, r = 0) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  if (r === 0) {
    return [{ t: 'M', p: [x, y] }, { t: 'L', p: [x + w, y] }, { t: 'L', p: [x + w, y + h] }, { t: 'L', p: [x, y + h] }, { t: 'Z', p: [] }];
  }
  const k = r * K;
  return [
    { t: 'M', p: [x + r, y] },
    { t: 'L', p: [x + w - r, y] },
    { t: 'C', p: [x + w - r + k, y, x + w, y + r - k, x + w, y + r] },
    { t: 'L', p: [x + w, y + h - r] },
    { t: 'C', p: [x + w, y + h - r + k, x + w - r + k, y + h, x + w - r, y + h] },
    { t: 'L', p: [x + r, y + h] },
    { t: 'C', p: [x + r - k, y + h, x, y + h - r + k, x, y + h - r] },
    { t: 'L', p: [x, y + r] },
    { t: 'C', p: [x, y + r - k, x + r - k, y, x + r, y] },
    { t: 'Z', p: [] },
  ];
}

/**
 * Umriss einer Platte, um `inset` mm nach innen versetzt.
 * Bei Ellipsen werden beide Halbachsen um `inset` verkürzt (Näherung des Parallelversatzes).
 */
export function plateOutline(shape, w, h, inset, radius = 0) {
  if (shape === 'kreis' || shape === 'oval') return ellipse(w / 2, h / 2, w / 2 - inset, h / 2 - inset);
  return roundRect(inset, inset, w - 2 * inset, h - 2 * inset, Math.max(0, radius - inset));
}

/** Ring (Linie als Fläche) zwischen zwei Umrissen: von `inset` bis `inset + thickness`. */
export function ring(shape, w, h, inset, thickness, radius = 0) {
  return {
    cmds: [...plateOutline(shape, w, h, inset, radius), ...plateOutline(shape, w, h, inset + thickness, radius)],
    rule: 'evenodd',
  };
}

/** Begrenzungsrahmen eines Pfads. @returns {{x0:number,y0:number,x1:number,y1:number}|null} */
export function bounds(cmds) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const c of cmds) {
    for (let i = 0; i < c.p.length; i += 2) {
      x0 = Math.min(x0, c.p[i]); x1 = Math.max(x1, c.p[i]);
      y0 = Math.min(y0, c.p[i + 1]); y1 = Math.max(y1, c.p[i + 1]);
    }
  }
  return x0 === Infinity ? null : { x0, y0, x1, y1 };
}

/** Pfad als SVG-`d`-Text (Koordinaten in mm). */
export function toPathData(cmds, digits = 4) {
  const f = v => +v.toFixed(digits);
  return cmds.map(c => c.t + c.p.map(f).join(' ')).join('');
}

/**
 * Tabelle für Bogenlänge auf einer Ellipse ab Winkel `theta0` in Richtung wachsender Winkel.
 * @returns {(s:number)=>number} Winkelabstand δ zur Bogenlänge s (s darf negativ sein)
 */
export function arcInverse(rx, ry, theta0, steps = 1440) {
  const ts = [0], ss = [0];
  let s = 0, px = rx * Math.cos(theta0), py = ry * Math.sin(theta0);
  for (let i = 1; i <= steps; i++) {
    const th = theta0 + (Math.PI * i) / steps;
    const x = rx * Math.cos(th), y = ry * Math.sin(th);
    s += Math.hypot(x - px, y - py);
    ts.push((Math.PI * i) / steps); ss.push(s);
    px = x; py = y;
  }
  return target => {
    const sign = target < 0 ? -1 : 1, t = Math.abs(target);
    let lo = 0, hi = ss.length - 1;
    if (t >= ss[hi]) return sign * ts[hi];
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (ss[mid] <= t) lo = mid; else hi = mid; }
    const r = (t - ss[lo]) / (ss[hi] - ss[lo] || 1);
    return sign * (ts[lo] + r * (ts[hi] - ts[lo]));
  };
}

/** Halbe Bogenlänge einer Ellipse (oben oder unten). */
export function halfArcLength(rx, ry) {
  const h = ((rx - ry) ** 2) / ((rx + ry) ** 2);
  return (Math.PI * (rx + ry) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)))) / 2; // Ramanujan
}
