// Dateiformate: SVG und PDF der Druckdatei, PNG-Auflösung setzen, Daten für die Herstellerinfo.
// Reine Funktionen (Text bzw. Bytes rein und raus).
import { toPathData } from './geometry.js';

const MM_TO_PT = 72 / 25.4;
const f = v => +v.toFixed(4);

/**
 * Druckdatei als SVG: Zeichenfläche = Plattengröße in mm, nur Flächen, nur Farbe `color`.
 * @param {import('./layout.js').Stamp} stamp
 * @param {{color?:string, mirror?:boolean, title?:string}} [opt]
 */
export function toSvg(stamp, opt = {}) {
  const { widthMm: w, heightMm: h } = stamp;
  const color = opt.color || '#000000';
  const g = opt.mirror ? ` transform="matrix(-1 0 0 1 ${f(w)} 0)"` : '';
  const paths = stamp.items.map(it => `<path fill-rule="${it.rule}" d="${toPathData(it.cmds)}"/>`).join('\n  ');
  const title = opt.title ? `<title>${escapeXml(opt.title)}</title>\n` : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${f(w)}mm" height="${f(h)}mm" viewBox="0 0 ${f(w)} ${f(h)}">
${title}<g fill="${color}"${g}>
  ${paths}
</g>
</svg>
`;
}

function escapeXml(s) {
  return String(s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
}

/**
 * Druckdatei als PDF 1.4: eine Seite in Plattengröße, Flächen in CMYK 0/0/0/100.
 * @returns {Uint8Array}
 */
export function toPdf(stamp, opt = {}) {
  const W = stamp.widthMm, H = stamp.heightMm;
  const X = x => f((opt.mirror ? W - x : x) * MM_TO_PT), Y = y => f((H - y) * MM_TO_PT);
  const ops = ['0 0 0 1 k'];
  for (const it of stamp.items) {
    let cx = 0, cy = 0;
    for (const c of it.cmds) {
      const p = c.p;
      if (c.t === 'M') { ops.push(`${X(p[0])} ${Y(p[1])} m`); cx = p[0]; cy = p[1]; }
      else if (c.t === 'L') { ops.push(`${X(p[0])} ${Y(p[1])} l`); cx = p[0]; cy = p[1]; }
      else if (c.t === 'C') { ops.push(`${X(p[0])} ${Y(p[1])} ${X(p[2])} ${Y(p[3])} ${X(p[4])} ${Y(p[5])} c`); cx = p[4]; cy = p[5]; }
      else if (c.t === 'Q') {
        const c1x = cx + (2 / 3) * (p[0] - cx), c1y = cy + (2 / 3) * (p[1] - cy);
        const c2x = p[2] + (2 / 3) * (p[0] - p[2]), c2y = p[3] + (2 / 3) * (p[1] - p[3]);
        ops.push(`${X(c1x)} ${Y(c1y)} ${X(c2x)} ${Y(c2y)} ${X(p[2])} ${Y(p[3])} c`); cx = p[2]; cy = p[3];
      } else if (c.t === 'Z') ops.push('h');
    }
    ops.push(it.rule === 'evenodd' ? 'f*' : 'f');
  }
  const content = ops.join('\n');
  const wPt = f(W * MM_TO_PT), hPt = f(H * MM_TO_PT);
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${wPt} ${hPt}] /TrimBox [0 0 ${wPt} ${hPt}] /Contents 4 0 R /Resources << >> >>`,
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    `<< /Producer (Stempel-Studio) /Title (${pdfString(opt.title || 'Stempel')}) >>`,
  ];
  let out = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const offsets = [];
  objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) out += `${String(o).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
  return bytes;
}

function pdfString(s) {
  return String(s).replace(/[^\x20-\x7E]/g, '_').replace(/([()\\])/g, '\\$1');
}

/** Maße einer erzeugten SVG-Datei in mm auslesen (Prüfung „Maße nachmessen“). */
export function measureSvg(svg) {
  const m = /<svg[^>]*\swidth="([\d.]+)mm"\s+height="([\d.]+)mm"/.exec(svg);
  return m ? { w: +m[1], h: +m[2] } : null;
}

/** Maße einer erzeugten PDF-Datei in mm auslesen. */
export function measurePdf(bytes) {
  let s = '';
  for (let i = 0; i < Math.min(bytes.length, 4000); i++) s += String.fromCharCode(bytes[i]);
  const m = /\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/.exec(s);
  return m ? { w: +m[1] / MM_TO_PT, h: +m[2] / MM_TO_PT } : null;
}

// --- PNG: Auflösung (pHYs) eintragen ---
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** PNG-Bytes mit eingetragener Auflösung (dpi) zurückgeben; vorhandene pHYs-Angaben werden ersetzt. */
export function pngWithDpi(png, dpi) {
  const dv = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const chunks = [];
  let pos = 8;
  while (pos < png.length) {
    const len = dv.getUint32(pos), type = String.fromCharCode(...png.subarray(pos + 4, pos + 8));
    chunks.push({ type, bytes: png.subarray(pos, pos + 12 + len) });
    pos += 12 + len;
  }
  const ppm = Math.round(dpi / 0.0254);
  const phys = new Uint8Array(21);
  const pv = new DataView(phys.buffer);
  pv.setUint32(0, 9);
  phys.set([0x70, 0x48, 0x59, 0x73], 4); // "pHYs"
  pv.setUint32(8, ppm); pv.setUint32(12, ppm); phys[16] = 1;
  pv.setUint32(17, crc32(phys.subarray(4, 17)));
  const parts = [png.subarray(0, 8)];
  for (const c of chunks) {
    if (c.type === 'pHYs') continue;
    parts.push(c.bytes);
    if (c.type === 'IHDR') parts.push(phys);
  }
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

/** Auflösung einer PNG in dpi lesen (oder null). */
export function pngDpi(png) {
  const dv = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let pos = 8;
  while (pos < png.length) {
    const len = dv.getUint32(pos), type = String.fromCharCode(...png.subarray(pos + 4, pos + 8));
    if (type === 'pHYs') return Math.round(dv.getUint32(pos + 8) * 0.0254);
    pos += 12 + len;
  }
  return null;
}

/** Pixelmaße der PNG für 600 dpi. */
export function pngSize(stamp, dpi) {
  return { w: Math.round((stamp.widthMm / 25.4) * dpi), h: Math.round((stamp.heightMm / 25.4) * dpi) };
}
