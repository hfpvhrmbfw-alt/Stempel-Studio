// Start, Zustand, Ereignisse. Einzige Stelle mit Uhr, Dateien, Canvas und Downloads.
import { MOTIFS, SHAPES, STYLES, SIZES, FONTS, RULES, newDesign, sanitize, fileName, buildExport, parseImport } from './model.js';
import { buildStamp } from './layout.js';
import { checkRaster, PPM } from './prepress.js';
import { toSvg, toPdf, measureSvg, measurePdf, pngWithDpi, pngSize } from './export.js';
import { makeShaper } from './services/fonts.js';
import { getMeta, setMeta } from './storage.js';
import { LABELS, IMPORT_ERRORS, infoLine } from './texts.js';
import { $, renderChoices, renderPreview, renderNotes } from './ui.js';

let design = newDesign('wort');
let shaper = null;
let gray = null, graySrc = null;
let stamp = null;
let timer = 0, checkRun = 0;

// ---------- Start ----------
async function start() {
  const load = async url => (await fetch(url)).arrayBuffer();
  const buffers = {};
  for (const [family, files] of Object.entries(FONTS)) {
    buffers[family] = { regular: await load(files.regular), bold: await load(files.bold) };
  }
  shaper = makeShaper(buffers);
  const saved = await getMeta('draft');
  if (saved) design = sanitize(saved);
  await loadGray();
  fillForm();
  bind();
  update(true);
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
}

// ---------- Formular ----------
function fillForm() {
  renderChoices($('motif'), MOTIFS, LABELS.motif, design.motif);
  renderChoices($('shape'), SHAPES, LABELS.shape, design.shape);
  renderChoices($('style'), STYLES, LABELS.style, design.style, LABELS.styleHint);
  const presets = SIZES[design.shape];
  const sel = $('preset');
  sel.replaceChildren(...presets.map(([w, h]) => new Option(design.shape === 'kreis' ? `Ø ${w} mm` : `${w} × ${h} mm`, `${w}x${h}`)), new Option('Eigene Größe', 'frei'));
  const match = presets.find(([w, h]) => w === design.widthMm && h === design.heightMm);
  sel.value = match ? `${match[0]}x${match[1]}` : 'frei';
  $('name').value = design.name;
  $('width').value = design.widthMm;
  $('height').value = design.heightMm;
  const square = design.shape === 'kreis' || design.shape === 'quadrat';
  $('heightField').hidden = square;
  $('width').previousElementSibling.textContent = design.shape === 'kreis' ? 'Durchmesser in mm' : 'Breite in mm';
  const round = design.shape === 'kreis' || design.shape === 'oval';
  $('ringFields').hidden = !round;
  $('ringTop').value = design.ringTop;
  $('ringBottom').value = design.ringBottom;
  $('lines').value = design.lines.join('\n');
  $('linesLabel').textContent = design.motif === 'adresse' ? 'Adresse (erste Zeile wird fett, höchstens 5 Zeilen)' : round ? 'Text in der Mitte (eine Zeile pro Zeile, höchstens 5)' : 'Zeilen (eine pro Zeile, höchstens 5)';
  const img = design.image;
  $('imageControls').hidden = !img;
  if (img) {
    $('imageName').textContent = img.name || 'Bild';
    $('threshold').value = img.threshold; $('thresholdValue').textContent = img.threshold;
    $('imgScale').value = Math.round(img.scale * 100); $('imgScaleValue').textContent = `${Math.round(img.scale * 100)} %`;
    $('invert').checked = img.invert; $('thicken').checked = img.thicken;
  }
  $('border').checked = design.border;
  $('ink').value = design.inkColor;
  $('mirror').checked = design.mirror;
}

function readForm() {
  const preset = $('preset').value;
  let w = parseFloat($('width').value), h = parseFloat($('height').value);
  if (preset !== 'frei') [w, h] = preset.split('x').map(Number);
  const img = design.image && {
    ...design.image,
    threshold: +$('threshold').value, scale: +$('imgScale').value / 100,
    invert: $('invert').checked, thicken: $('thicken').checked,
  };
  design = sanitize({
    ...design,
    name: $('name').value, widthMm: w, heightMm: h,
    lines: $('lines').value.split('\n'),
    ringTop: $('ringTop').value, ringBottom: $('ringBottom').value,
    image: img, border: $('border').checked, inkColor: $('ink').value, mirror: $('mirror').checked,
  });
}

function bind() {
  const choice = (el, apply) => el.addEventListener('click', e => {
    const b = e.target.closest('button[data-id]');
    if (!b) return;
    apply(b.dataset.id);
    fillForm(); update();
  });
  choice($('motif'), id => {
    const keep = { name: design.name, image: design.image, inkColor: design.inkColor };
    design = sanitize({ ...newDesign(id), ...keep });
  });
  choice($('shape'), id => {
    const [w, h] = SIZES[id][Math.min(2, SIZES[id].length - 1)];
    design = sanitize({ ...design, shape: id, widthMm: w, heightMm: h });
  });
  choice($('style'), id => { design = sanitize({ ...design, style: id, border: id === 'eins_zu_eins' ? design.border : true }); });
  for (const el of $('motif').parentElement.parentElement.querySelectorAll('.choices')) {
    el.addEventListener('keydown', e => {
      if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(e.key)) return;
      const btns = [...el.querySelectorAll('button')], i = btns.indexOf(document.activeElement);
      if (i < 0) return;
      e.preventDefault();
      const next = btns[(i + (e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : btns.length - 1)) % btns.length];
      next.focus(); next.click();
      el.querySelector(`[data-id="${next.dataset.id}"]`)?.focus();
    });
  }
  $('form').addEventListener('input', e => {
    if (e.target.id === 'file') return;
    if (e.target.id === 'width' || e.target.id === 'height') $('preset').value = 'frei';
    readForm();
    if (e.target.id === 'preset') fillForm();
    if (e.target.id === 'threshold') $('thresholdValue').textContent = e.target.value;
    if (e.target.id === 'imgScale') $('imgScaleValue').textContent = `${e.target.value} %`;
    update();
  });
  $('file').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    const src = await shrinkImage(file);
    design = sanitize({ ...design, image: { src, name: file.name, threshold: 128, invert: false, thicken: true, scale: 1 } });
    await loadGray();
    e.target.value = '';
    fillForm(); update();
  });
  $('removeImage').addEventListener('click', () => { design = sanitize({ ...design, image: null }); gray = null; graySrc = null; fillForm(); update(); });
  $('rights').addEventListener('change', updateButtons);
  $('dlSvg').addEventListener('click', () => download(new Blob([toSvg(stamp, { mirror: design.mirror, title: fileName(design, 'svg') })], { type: 'image/svg+xml' }), fileName(design, 'svg')));
  $('dlPdf').addEventListener('click', () => download(new Blob([toPdf(stamp, { mirror: design.mirror, title: fileName(design, 'pdf') })], { type: 'application/pdf' }), fileName(design, 'pdf')));
  $('dlPng').addEventListener('click', downloadPng);
  $('dlInfo').addEventListener('click', () => download(new Blob([`${fileName(design, 'pdf')}\n${infoLine(design)}\n`], { type: 'text/plain;charset=utf-8' }), 'infozeile_hersteller.txt'));
  $('saveDraft').addEventListener('click', () => download(new Blob([JSON.stringify(buildExport(design, new Date().toISOString()), null, 1)], { type: 'application/json' }), fileName(design, 'json').replace(/^stempel_/, 'entwurf_')));
  $('loadDraft').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    const res = parseImport(await file.text());
    e.target.value = '';
    if (!res.ok) { alert(IMPORT_ERRORS[res.error]); return; }
    design = res.design;
    await loadGray();
    fillForm(); update();
  });
  $('reset').addEventListener('click', () => {
    if (!confirm('Aktuellen Entwurf verwerfen und neu anfangen?')) return;
    design = newDesign('wort'); gray = null; graySrc = null; fillForm(); update();
  });
}

// ---------- Gestalten und prüfen ----------
function update(now = false) {
  clearTimeout(timer);
  timer = setTimeout(run, now ? 0 : 200);
}

function run() {
  shaper.missing.clear();
  stamp = buildStamp(design, { shapeText: shaper.shapeText, gray });
  const notes = [...stamp.notes];
  if (shaper.missing.size) notes.push({ code: 'zeichen_fehlt', chars: [...shaper.missing].join(' ') });
  renderPreview($('stage'), stamp, design);
  renderNotes($('notes'), notes);
  const { shape, widthMm: w, heightMm: h } = design;
  $('caption').textContent = `${LABELS.shape[shape]} · ${shape === 'kreis' ? `Ø ${w}` : `${w} × ${h}`} mm · Platte gestrichelt, 1-mm-Rand gepunktet`;
  $('info').textContent = infoLine(design);
  setMeta('draft', design);
  updateButtons();
  check(stamp, notes);
}

/** Druckprüfung im Hintergrund: Datei rastern, Strichstärke, Lücken und Rand prüfen, Maße nachmessen. */
async function check(current, baseNotes) {
  const id = ++checkRun;
  const svg = toSvg(current);
  const mask = await rasterize(svg, current.widthMm * PPM, current.heightMm * PPM, 'mask');
  if (id !== checkRun) return;
  const res = checkRaster(mask, design.shape, PPM);
  const notes = [...baseNotes];
  if (res.thin.length) notes.push({ code: 'duenn', value: res.thin.length });
  if (res.gaps.length) notes.push({ code: 'eng', value: res.gaps.length });
  if (res.margin.length) notes.push({ code: 'rand', value: res.margin.length });
  if (!res.thin.length && !res.gaps.length && !res.margin.length) notes.push({ code: 'alles_ok' });
  const ms = measureSvg(svg), mp = measurePdf(toPdf(current));
  const same = m => m && Math.abs(m.w - current.widthMm) < 0.01 && Math.abs(m.h - current.heightMm) < 0.01;
  notes.push(same(ms) && same(mp) ? { code: 'masse_ok', w: ms.w, h: ms.h } : { code: 'masse_falsch', w: ms?.w ?? 0, h: ms?.h ?? 0 });
  renderNotes($('notes'), notes);
  renderPreview($('stage'), current, design, [...res.thin, ...res.gaps, ...res.margin]);
  $('status').textContent = res.thin.length || res.gaps.length || res.margin.length ? 'Prüfung: Hinweise' : 'Prüfung: in Ordnung';
}

function updateButtons() {
  const ok = $('rights').checked && stamp && stamp.items.length > 0;
  for (const id of ['dlPdf', 'dlSvg', 'dlPng', 'dlInfo']) $(id).disabled = !ok;
}

// ---------- Canvas, Bilder, Downloads ----------
/** SVG rastern. mode 'mask' → 1-Bit-Maske; 'png' → PNG-Bytes. */
async function rasterize(svg, wPx, hPx, mode) {
  const w = Math.round(wPx), h = Math.round(hPx);
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    if (mode === 'png') {
      const blob = await new Promise(r => c.toBlob(r, 'image/png'));
      return new Uint8Array(await blob.arrayBuffer());
    }
    const px = ctx.getImageData(0, 0, w, h).data, data = new Uint8Array(w * h);
    for (let i = 0; i < data.length; i++) data[i] = px[i * 4 + 3] >= 128 ? 1 : 0;
    return { w, h, data };
  } finally { URL.revokeObjectURL(url); }
}

async function downloadPng() {
  const { w, h } = pngSize(stamp, RULES.pngDpi);
  const png = await rasterize(toSvg(stamp, { color: design.inkColor }), w, h, 'png');
  download(new Blob([pngWithDpi(png, RULES.pngDpi)], { type: 'image/png' }), fileName(design, 'png'));
}

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Großes Bild auf höchstens 2400 Pixel Kantenlänge bringen (als PNG-data:-URL). */
async function shrinkImage(file) {
  const img = new Image();
  img.src = URL.createObjectURL(file);
  await img.decode();
  const k = Math.min(1, 2400 / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  URL.revokeObjectURL(img.src);
  return c.toDataURL('image/png');
}

/** Graubild zum aktuellen Bild laden (zwischengespeichert). */
async function loadGray() {
  if (!design.image) { gray = null; graySrc = null; return; }
  if (graySrc === design.image.src) return;
  const img = new Image();
  img.src = design.image.src;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0);
  const px = ctx.getImageData(0, 0, c.width, c.height).data, data = new Uint8Array(c.width * c.height);
  for (let i = 0; i < data.length; i++) data[i] = Math.round(0.2126 * px[i * 4] + 0.7152 * px[i * 4 + 1] + 0.0722 * px[i * 4 + 2]);
  gray = { w: c.width, h: c.height, data };
  graySrc = design.image.src;
}

start();
