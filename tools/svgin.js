// Einfache SVG-Datei (eigene Gestaltung) einlesen: <path>, <rect>, <circle>, <ellipse>, <polygon>.
// Erwartet Maße in mm am <svg>-Element. Striche, Text, Bilder und transform werden abgelehnt,
// weil die Druckdatei nur aus Flächen bestehen darf.
import { ellipse, roundRect, scale } from '../src/geometry.js';

const num = s => (s == null ? NaN : parseFloat(s));
const attrs = tag => Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)].map(m => [m[1], m[2]]));

/** Pfaddaten (absolut und relativ, ohne Bögen) → Befehle. */
export function parsePathData(d) {
  const toks = d.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?/g) || [];
  const out = [];
  let i = 0, cmd = '', x = 0, y = 0, sx = 0, sy = 0, lcx = 0, lcy = 0, lq = null;
  const n = () => parseFloat(toks[i++]);
  while (i < toks.length) {
    if (/[a-zA-Z]/.test(toks[i])) cmd = toks[i++];
    const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase();
    const ox = rel ? x : 0, oy = rel ? y : 0;
    if (C === 'Z') { out.push({ t: 'Z', p: [] }); x = sx; y = sy; lq = null; lcx = x; lcy = y; continue; }
    if (C === 'A') throw new Error('Bögen (A) im Pfad bitte in Kurven umwandeln.');
    if (C === 'M') { x = ox + n(); y = oy + n(); sx = x; sy = y; out.push({ t: 'M', p: [x, y] }); cmd = rel ? 'l' : 'L'; }
    else if (C === 'L') { x = ox + n(); y = oy + n(); out.push({ t: 'L', p: [x, y] }); }
    else if (C === 'H') { x = ox + n(); out.push({ t: 'L', p: [x, y] }); }
    else if (C === 'V') { y = oy + n(); out.push({ t: 'L', p: [x, y] }); }
    else if (C === 'C' || C === 'S') {
      let x1, y1;
      if (C === 'C') { x1 = ox + n(); y1 = oy + n(); } else { x1 = 2 * x - lcx; y1 = 2 * y - lcy; }
      const x2 = ox + n(), y2 = oy + n(), ex = ox + n(), ey = oy + n();
      out.push({ t: 'C', p: [x1, y1, x2, y2, ex, ey] }); lcx = x2; lcy = y2; x = ex; y = ey; lq = null; continue;
    } else if (C === 'Q' || C === 'T') {
      let qx, qy;
      if (C === 'Q') { qx = ox + n(); qy = oy + n(); } else { qx = lq ? 2 * x - lq[0] : x; qy = lq ? 2 * y - lq[1] : y; }
      const ex = ox + n(), ey = oy + n();
      out.push({ t: 'Q', p: [qx, qy, ex, ey] }); lq = [qx, qy]; x = ex; y = ey; lcx = x; lcy = y; continue;
    } else throw new Error(`Unbekannter Pfadbefehl ${cmd}`);
    lcx = x; lcy = y; lq = null;
  }
  return out;
}

/** @returns {{widthMm:number, heightMm:number, items:import('../src/geometry.js').Item[], notes:[]}} */
export function parseSvg(text) {
  const svgTag = /<svg\b[^>]*>/.exec(text);
  if (!svgTag) throw new Error('Kein <svg>-Element gefunden.');
  const sa = attrs(svgTag[0]);
  const wm = /^([\d.]+)mm$/.exec(sa.width || ''), hm = /^([\d.]+)mm$/.exec(sa.height || '');
  if (!wm || !hm) throw new Error('width und height am <svg> müssen in mm angegeben sein, z. B. width="40mm".');
  const W = +wm[1], H = +hm[1];
  const vb = (sa.viewBox || `0 0 ${W} ${H}`).split(/[\s,]+/).map(Number);
  const k = W / vb[2];
  if (Math.abs(H / vb[3] - k) > 1e-6) throw new Error('viewBox und Maße haben unterschiedliche Seitenverhältnisse.');
  if (/<(text|image|use|tspan)\b/.test(text)) throw new Error('Text, Bilder und <use> bitte vorher in Pfade umwandeln.');
  if (/\btransform\s*=/.test(text)) throw new Error('transform-Angaben bitte vorher auf die Pfade anwenden.');
  if (/\bstroke\s*=\s*"(?!none)/.test(text) || /stroke\s*:\s*(?!none)/.test(text)) throw new Error('Striche (stroke) bitte in Flächen umwandeln.');
  for (const f of text.matchAll(/fill\s*[=:]\s*"?\s*([^";\s>]+)/g)) {
    if (!/^(none|black|#000|#000000|currentColor)$/i.test(f[1])) throw new Error(`Nur schwarze Flächen erlaubt (gefunden: fill ${f[1]}). Aussparungen über fill-rule="evenodd" lösen.`);
  }
  const items = [];
  for (const m of text.matchAll(/<(path|rect|circle|ellipse|polygon)\b[^>]*>/g)) {
    const a = attrs(m[0]), rule = a['fill-rule'] === 'evenodd' ? 'evenodd' : 'nonzero';
    if (a.fill === 'none') continue;
    let cmds;
    if (m[1] === 'path') cmds = parsePathData(a.d || '');
    else if (m[1] === 'rect') cmds = roundRect(num(a.x) || 0, num(a.y) || 0, num(a.width), num(a.height), num(a.rx) || 0);
    else if (m[1] === 'circle') cmds = ellipse(num(a.cx) || 0, num(a.cy) || 0, num(a.r), num(a.r));
    else if (m[1] === 'ellipse') cmds = ellipse(num(a.cx) || 0, num(a.cy) || 0, num(a.rx), num(a.ry));
    else {
      const p = (a.points || '').trim().split(/[\s,]+/).map(Number);
      cmds = [{ t: 'M', p: [p[0], p[1]] }];
      for (let i = 2; i + 1 < p.length; i += 2) cmds.push({ t: 'L', p: [p[i], p[i + 1]] });
      cmds.push({ t: 'Z', p: [] });
    }
    const shifted = cmds.map(c => ({ t: c.t, p: c.p.map((v, i) => v - vb[i % 2]) }));
    items.push({ cmds: scale(shifted, k), rule });
  }
  return { widthMm: W, heightMm: H, items, notes: [], textPt: null };
}
