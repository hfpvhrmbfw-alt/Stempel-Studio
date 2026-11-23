// Vektorflächen in ein Raster füllen (ohne Canvas), für Prüfung und PNG in Node.
// Reine Funktionen.

/** Kurven in Polygone zerlegen. @returns {number[][]} Liste von Konturen [x0,y0,x1,y1,…] */
export function flatten(cmds, tol = 0.01) {
  const out = [];
  let cur = null, sx = 0, sy = 0, x = 0, y = 0;
  const seg = (dist) => Math.max(2, Math.min(64, Math.ceil(Math.sqrt(dist / tol))));
  for (const c of cmds) {
    const p = c.p;
    if (c.t === 'M') { if (cur && cur.length > 4) out.push(cur); cur = [p[0], p[1]]; sx = x = p[0]; sy = y = p[1]; }
    else if (c.t === 'L') { cur.push(p[0], p[1]); x = p[0]; y = p[1]; }
    else if (c.t === 'C') {
      const n = seg(Math.hypot(p[0] - x, p[1] - y) + Math.hypot(p[2] - p[0], p[3] - p[1]) + Math.hypot(p[4] - p[2], p[5] - p[3]));
      for (let i = 1; i <= n; i++) {
        const t = i / n, u = 1 - t;
        cur.push(u * u * u * x + 3 * u * u * t * p[0] + 3 * u * t * t * p[2] + t * t * t * p[4],
          u * u * u * y + 3 * u * u * t * p[1] + 3 * u * t * t * p[3] + t * t * t * p[5]);
      }
      x = p[4]; y = p[5];
    } else if (c.t === 'Q') {
      const n = seg(Math.hypot(p[0] - x, p[1] - y) + Math.hypot(p[2] - p[0], p[3] - p[1]));
      for (let i = 1; i <= n; i++) {
        const t = i / n, u = 1 - t;
        cur.push(u * u * x + 2 * u * t * p[0] + t * t * p[2], u * u * y + 2 * u * t * p[1] + t * t * p[3]);
      }
      x = p[2]; y = p[3];
    } else if (c.t === 'Z') { if (cur) cur.push(sx, sy); x = sx; y = sy; }
  }
  if (cur && cur.length > 4) out.push(cur);
  return out;
}

/**
 * Flächen füllen. `ss` = Unterabtastung je Achse (1 = harte Kante).
 * @returns {{w:number,h:number,data:Float32Array}} Deckung 0..1 je Pixel
 */
export function coverageRaster(items, widthMm, heightMm, ppm, ss = 1) {
  const w = Math.round(widthMm * ppm), h = Math.round(heightMm * ppm);
  const cov = new Float32Array(w * h);
  const W = w * ss, k = ppm * ss;
  const row = new Uint8Array(W);
  const edgesOf = it => {
    const e = [];
    for (const poly of flatten(it.cmds, 0.25 / k)) {
      for (let i = 0; i + 3 < poly.length; i += 2) {
        const x0 = poly[i] * k, y0 = poly[i + 1] * k, x1 = poly[i + 2] * k, y1 = poly[i + 3] * k;
        if (y0 !== y1) e.push(y0 < y1 ? [x0, y0, x1, y1, 1] : [x1, y1, x0, y0, -1]);
      }
    }
    return e;
  };
  const all = items.map(it => ({ edges: edgesOf(it), evenodd: it.rule === 'evenodd' }));
  for (let sy = 0; sy < h * ss; sy++) {
    const yc = sy + 0.5;
    row.fill(0);
    for (const { edges, evenodd } of all) {
      const xs = [];
      for (const [x0, y0, x1, y1, d] of edges) if (yc >= y0 && yc < y1) xs.push([x0 + ((yc - y0) / (y1 - y0)) * (x1 - x0), d]);
      xs.sort((a, b) => a[0] - b[0]);
      let wind = 0;
      for (let i = 0; i < xs.length - 1; i++) {
        wind += evenodd ? 1 : xs[i][1];
        const inside = evenodd ? wind % 2 === 1 : wind !== 0;
        if (!inside) continue;
        const a = Math.max(0, Math.ceil(xs[i][0] - 0.5)), b = Math.min(W - 1, Math.floor(xs[i + 1][0] - 0.5));
        for (let x = a; x <= b; x++) row[x] = 1;
      }
    }
    const py = Math.floor(sy / ss), f = 1 / (ss * ss);
    for (let x = 0; x < W; x++) if (row[x]) cov[py * w + Math.floor(x / ss)] += f;
  }
  return { w, h, data: cov };
}

/** Deckung → 1-Bit-Maske (ab 50 %). */
export function toMask(r) {
  const data = new Uint8Array(r.w * r.h);
  for (let i = 0; i < data.length; i++) data[i] = r.data[i] >= 0.5 ? 1 : 0;
  return { w: r.w, h: r.h, data };
}
