// PNG lesen und schreiben in Node (zlib), ohne Abhängigkeiten.
import { inflateSync, deflateSync } from 'node:zlib';

const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = b => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

/** PNG → Graubild {w,h,data} (0 = schwarz, 255 = weiß), Transparenz wird auf Weiß gelegt. */
export function decodePngGray(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('Keine PNG-Datei. Bitte vorher in PNG umwandeln.');
  let pos = 8, w, h, depth, type, interlace, palette = null, trns = null;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos), t = buf.toString('latin1', pos + 4, pos + 8), d = buf.subarray(pos + 8, pos + 8 + len);
    if (t === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); depth = d[8]; type = d[9]; interlace = d[12]; }
    else if (t === 'PLTE') palette = d;
    else if (t === 'tRNS') trns = d;
    else if (t === 'IDAT') idat.push(d);
    pos += 12 + len;
  }
  if (depth !== 8 || interlace) throw new Error('Nur 8-Bit-PNG ohne Interlacing. Bitte z. B. mit einem Bildprogramm neu speichern.');
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type];
  const raw = inflateSync(Buffer.concat(idat)), stride = w * ch, px = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? px[y * stride + x - ch] : 0, b = y ? px[(y - 1) * stride + x] : 0, c = x >= ch && y ? px[(y - 1) * stride + x - ch] : 0;
      let v = src[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      px[y * stride + x] = v & 0xff;
    }
  }
  const data = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    let r, g, bl, al = 255;
    if (type === 0) { r = g = bl = px[i]; }
    else if (type === 4) { r = g = bl = px[i * 2]; al = px[i * 2 + 1]; }
    else if (type === 2) { r = px[i * 3]; g = px[i * 3 + 1]; bl = px[i * 3 + 2]; }
    else if (type === 6) { r = px[i * 4]; g = px[i * 4 + 1]; bl = px[i * 4 + 2]; al = px[i * 4 + 3]; }
    else { const k = px[i]; r = palette[k * 3]; g = palette[k * 3 + 1]; bl = palette[k * 3 + 2]; al = trns && k < trns.length ? trns[k] : 255; }
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * bl;
    data[i] = Math.round(lum * (al / 255) + 255 * (1 - al / 255));
  }
  return { w, h, data };
}

/** Deckungsraster → PNG mit transparentem Hintergrund in Farbe `hex`. */
export function encodePngAlpha(r, hex) {
  const [R, G, B] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  const raw = Buffer.alloc(r.h * (r.w * 4 + 1));
  for (let y = 0; y < r.h; y++) {
    const o = y * (r.w * 4 + 1);
    for (let x = 0; x < r.w; x++) {
      const a = Math.round(Math.min(1, r.data[y * r.w + x]) * 255), p = o + 1 + x * 4;
      raw[p] = R; raw[p + 1] = G; raw[p + 2] = B; raw[p + 3] = a;
    }
  }
  const chunk = (t, d) => { const b = Buffer.alloc(12 + d.length); b.writeUInt32BE(d.length, 0); b.write(t, 4, 'latin1'); d.copy(b, 8); b.writeUInt32BE(crc32(b.subarray(4, 8 + d.length)), 8 + d.length); return b; };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(r.w, 0); ihdr.writeUInt32BE(r.h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
