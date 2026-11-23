// Gestaltung: aus einem Design den fertigen Stempel als Vektorflächen bauen.
// Reine Funktion. Schrift und Bild kommen über `deps` herein (Adapter), damit Tests ohne Browser laufen.
import { RULES } from './model.js';
import { ring, ellipse, transform, translate, arcInverse, halfArcLength, bounds } from './geometry.js';
import { prepareImage, imageAspect } from './prepress.js';

const PT = 25.4 / 72; // 1 pt in mm

/**
 * @typedef {Object} Shaped  Ergebnis von shapeText, alle Werte in mm, Grundlinie y = 0, y nach unten
 * @property {{cmds:import('./geometry.js').Cmd[], x:number, adv:number}[]} glyphs
 * @property {number} width
 * @property {number} ascent    Oberlänge (positiv)
 * @property {number} descent   Unterlänge (positiv)
 * @property {number} capHeight Versalhöhe (positiv)
 *
 * @typedef {Object} Deps
 * @property {(font:'serif'|'sans', weight:'regular'|'bold', text:string, emMm:number, trackingEm?:number)=>Shaped} shapeText
 * @property {{w:number,h:number,data:Uint8Array}|null} gray  Graubild des hochgeladenen Bildes
 *
 * @typedef {Object} Stamp
 * @property {number} widthMm
 * @property {number} heightMm
 * @property {import('./geometry.js').Item[]} items
 * @property {{code:string, value?:number}[]} notes  Hinweise für die Prüfung (z. B. Schrift zu klein)
 * @property {{min:number}|null} textPt  kleinste Schriftgröße in pt (Versalhöhe-unabhängig, Kegelgröße)
 */

/** Rahmenaufbau je Stil: Linien von außen nach innen als [Dicke, Abstand davor]. */
function frameSpec(style) {
  if (style === 'klassisch') return { lines: [[0.5, 0], [0.25, 0.45]], radius: 0, font: 'serif' };
  if (style === 'modern') return { lines: [[0.4, 0]], radius: 2.5, font: 'sans' };
  return { lines: [[0.35, 0]], radius: 0, font: 'sans' };
}

/** @param {import('./model.js').Design} design @param {Deps} deps @returns {Stamp} */
export function buildStamp(design, deps) {
  const W = design.widthMm, H = design.heightMm;
  const round = design.shape === 'kreis' || design.shape === 'oval';
  const spec = frameSpec(design.style);
  const items = [], notes = [], sizes = [];
  let inset = RULES.marginMm;

  // 1. Rahmen
  if (design.border) {
    for (const [t, gap] of spec.lines) {
      inset += gap;
      items.push(ring(design.shape, W, H, inset, t, spec.radius));
      inset += t;
    }
    inset += 0.7;
  } else {
    inset += 0.2;
  }

  // Höhe einer Zeile: Versalhöhe bzw. tatsächliche Oberkante (Oberlängen, Umlaute) und Unterlänge
  const ink = s => bounds(s.glyphs.flatMap(g => g.cmds)) || { y0: 0, y1: 0 };
  const top = s => Math.max(s.capHeight, -ink(s).y0);
  const bottom = s => Math.max(s.descent * 0.8, ink(s).y1);

  // 2. Ringtext (nur Kreis und Oval)
  const topText = design.ringTop.trim(), bottomText = design.ringBottom.trim();
  if (round && (topText || bottomText)) {
    const em = Math.min(Math.max(Math.min(W, H) * 0.1, 2.4), 6);
    const outerRx = W / 2 - inset, outerRy = H / 2 - inset;
    const shapeRing = (text, size) => deps.shapeText(spec.font, 'bold', text, size, 0.08);
    // Platz entlang des Bogens: höchstens 80 % eines Halbbogens je Text
    const fitEm = text => {
      const s = shapeRing(text, em);
      const avail = halfArcLength(outerRx - top(s), outerRy - top(s)) * 0.8;
      return s.width > avail ? (em * avail) / s.width : em;
    };
    let ringEm = em;
    if (topText) ringEm = Math.min(ringEm, fitEm(topText));
    if (bottomText) ringEm = Math.min(ringEm, fitEm(bottomText));
    sizes.push(ringEm / PT);
    const capR = shapeRing('H', ringEm).capHeight;
    let band = 0;
    if (topText) {
      // oben: Köpfe nach außen, Unterlängen nach innen
      const s = shapeRing(topText, ringEm), t = top(s);
      items.push({ cmds: ringText(s, W / 2, H / 2, outerRx - t, outerRy - t, true), rule: 'nonzero' });
      band = Math.max(band, t + bottom(s));
    }
    if (bottomText) {
      // unten: Köpfe zur Mitte, Unterlängen nach außen
      const s = shapeRing(bottomText, ringEm), b = bottom(s);
      items.push({ cmds: ringText(s, W / 2, H / 2, outerRx - b, outerRy - b, false), rule: 'nonzero' });
      band = Math.max(band, b + top(s));
    }
    // Trennpunkte links und rechts, wenn oben und unten Text steht
    const mid = inset + band / 2, dot = Math.max(0.5, capR * 0.3);
    if (topText && bottomText) {
      items.push({ cmds: [...ellipse(mid, H / 2, dot / 2, dot / 2), ...ellipse(W - mid, H / 2, dot / 2, dot / 2)], rule: 'nonzero' });
    }
    inset += band + 0.6;
    if (design.border && design.style === 'klassisch') {
      items.push(ring(design.shape, W, H, inset, 0.25, 0));
      inset += 0.25;
    }
    inset += 0.6;
  }

  // 3. Mittelfeld: Bild oben, Textzeilen darunter
  let box;
  if (round) {
    const rx = W / 2 - inset, ry = H / 2 - inset;
    box = { x: W / 2 - rx * Math.SQRT1_2, y: H / 2 - ry * Math.SQRT1_2, w: rx * Math.SQRT2, h: ry * Math.SQRT2 };
  } else {
    box = { x: inset, y: inset, w: W - 2 * inset, h: H - 2 * inset };
  }
  if (box.w <= 0 || box.h <= 0) {
    notes.push({ code: 'kein_platz' });
    return { widthMm: W, heightMm: H, items, notes, textPt: sizes.length ? { min: Math.min(...sizes) } : null };
  }

  const lines = design.lines.map(l => l.trim()).filter(Boolean);
  const hasImage = !!(design.image && deps.gray);
  const aspect = hasImage ? imageAspect(deps.gray, design.image) : null;
  if (hasImage && aspect === null) notes.push({ code: 'bild_leer' });

  const textShare = aspect ? (lines.length ? Math.min(0.45, 0.16 * lines.length + 0.08) : 0) : 1;
  const gap = aspect && lines.length ? 0.8 : 0;
  const textBox = { x: box.x, w: box.w, h: lines.length ? box.h * textShare : 0 };
  const imgBox = { x: box.x, y: box.y, w: box.w, h: box.h - textBox.h - gap };

  // Textblock
  let textH = 0, block = [];
  if (lines.length) {
    const weightOf = i => (design.motif === 'adresse' ? (i === 0 ? 'bold' : 'regular') : (i === 0 ? 'bold' : (design.motif === 'wort' ? 'bold' : 'regular')));
    const rel = i => (design.motif === 'adresse' && i === 0 && lines.length > 1 ? 1.15 : 1);
    const unit = lines.map((t, i) => deps.shapeText(spec.font, weightOf(i), t, rel(i)));
    const lineGap = 0.18;
    const unitH = unit.reduce((sum, u, i) => sum + top(u) + bottom(u) + (i ? lineGap * rel(i) : 0), 0);
    const unitW = Math.max(...unit.map(u => u.width));
    let em = Math.min(textBox.w / unitW, textBox.h / unitH);
    if (!aspect) em = Math.min(em, Math.max(textBox.h * 0.55, 2.2) * (lines.length === 1 ? 1.4 : 1)); // nicht übergroß
    let y = 0;
    block = lines.map((t, i) => {
      const s = deps.shapeText(spec.font, weightOf(i), t, em * rel(i));
      if (i) y += lineGap * em * rel(i);
      y += top(s);
      const line = { s, baseline: y };
      y += bottom(s);
      sizes.push((em * rel(i)) / PT);
      return line;
    });
    textH = y;
  }

  // Bild in Endgröße
  let imgH = 0, imgCmds = null;
  if (aspect) {
    const availH = lines.length ? imgBox.h : box.h;
    const s = design.image.scale;
    let iw = imgBox.w * s, ih = iw / aspect;
    if (ih > availH * s) { ih = availH * s; iw = ih * aspect; }
    const prepared = prepareImage(deps.gray, design.image, iw, ih);
    if (prepared) {
      imgH = ih;
      imgCmds = { cmds: prepared.cmds, w: iw };
      if (prepared.thickened) notes.push({ code: 'linien_verstaerkt', value: prepared.thickened });
      if (prepared.gapsClosed) notes.push({ code: 'luecken_geschlossen', value: prepared.gapsClosed });
    }
  }

  // senkrecht zentrieren
  const total = imgH + (imgH && textH ? gap : 0) + textH;
  let y0 = box.y + (box.h - total) / 2;
  if (imgCmds) {
    items.push({ cmds: translate(imgCmds.cmds, box.x + (box.w - imgCmds.w) / 2, y0), rule: 'evenodd' });
    y0 += imgH + (textH ? gap : 0);
  }
  for (const line of block) {
    const x = box.x + (box.w - line.s.width) / 2;
    items.push({ cmds: line.s.glyphs.flatMap(g => translate(g.cmds, x, y0 + line.baseline)), rule: 'nonzero' });
  }

  const minPt = sizes.length ? Math.min(...sizes) : null;
  if (minPt !== null && minPt < RULES.minTextPt) notes.push({ code: 'schrift_klein', value: Math.round(minPt * 10) / 10 });
  return { widthMm: W, heightMm: H, items, notes, textPt: minPt === null ? null : { min: minPt } };
}

/**
 * Text entlang einer Ellipse setzen.
 * @param {boolean} upper oben (Leserichtung im Uhrzeigersinn, Köpfe nach außen) oder unten (Köpfe zur Mitte)
 */
function ringText(shaped, cx, cy, rx, ry, upper) {
  const theta0 = upper ? -Math.PI / 2 : Math.PI / 2;
  const inv = arcInverse(rx, ry, theta0);
  const out = [];
  for (const g of shaped.glyphs) {
    const s = g.x + g.adv / 2 - shaped.width / 2;
    const th = upper ? theta0 + inv(s) : theta0 - inv(s);
    const px = cx + rx * Math.cos(th), py = cy + ry * Math.sin(th);
    let tx = -rx * Math.sin(th), ty = ry * Math.cos(th);
    let nx = Math.cos(th) / rx, ny = Math.sin(th) / ry;
    const tl = Math.hypot(tx, ty), nl = Math.hypot(nx, ny);
    tx /= tl; ty /= tl; nx /= nl; ny /= nl;
    if (!upper) { tx = -tx; ty = -ty; }
    // lokales y (nach unten) zeigt oben nach innen (-n), unten nach außen (+n)
    const dx = upper ? -nx : nx, dy = upper ? -ny : ny;
    const local = translate(g.cmds, -(g.x + g.adv / 2), 0);
    out.push(...transform(local, [tx, ty, dx, dy, px, py]));
  }
  return out;
}

