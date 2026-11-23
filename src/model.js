// Datenmodell von Stempel-Studio: Stammdaten, Standardwerte, Validierung, Export/Import.
// Keine Abhängigkeiten, keine Anzeigetexte (die stehen in texts.js).

export const APP_ID = 'stempel-studio';
export const SCHEMA_VERSION = 1;

/** Formen der Stempelplatte (stabile IDs, nie umbenennen). */
export const SHAPES = ['rechteck', 'kreis', 'oval', 'quadrat'];

/** Gängige Plattengrößen in mm (Breite, Höhe), Innenmaß der Stempelplatte. */
export const SIZES = {
  rechteck: [[38, 14], [47, 18], [58, 22], [70, 25]],
  kreis: [[20, 20], [30, 30], [40, 40], [50, 50]],
  oval: [[40, 24], [50, 30], [60, 40]],
  quadrat: [[20, 20], [30, 30], [40, 40]],
};

/** Motivtypen von Version 1. Sie legen nur Startwerte und sichtbare Felder fest. */
export const MOTIFS = ['wort', 'adresse', 'logo', 'siegel'];

/** Stile von Version 1. */
export const STYLES = ['klassisch', 'modern', 'eins_zu_eins'];

/** Schriften, die mitgeliefert werden (Dateien in fonts/). */
export const FONTS = {
  serif: { regular: 'fonts/roboto-slab-400.woff', bold: 'fonts/roboto-slab-700.woff' },
  sans: { regular: 'fonts/work-sans-400.woff', bold: 'fonts/work-sans-700.woff' },
};

/** Technische Druckregeln (aus der Stempel-Studio-Rollenbeschreibung). */
export const RULES = {
  minStrokeMm: 0.2,   // Mindeststrichstärke und Mindestabstand
  marginMm: 1,        // Sicherheitsabstand zum Plattenrand
  minTextPt: 6,       // Mindestschriftgröße
  thickenToMm: 0.24,  // dünne Linien im Bild auf diese Stärke bringen
  pngDpi: 600,
};

export const LIMITS = {
  minSizeMm: 10, maxSizeMm: 150,
  maxLines: 5, maxLineLength: 60, maxRingLength: 80,
};

/**
 * @typedef {Object} ImageSettings
 * @property {string} src        Bild als data:-URL (eigene Zeichnung oder Logo)
 * @property {string} name       Dateiname zur Anzeige
 * @property {number} threshold  Schwelle 1–254: heller als die Schwelle wird weiß
 * @property {boolean} invert    Hell und dunkel tauschen
 * @property {boolean} thicken   Dünne Linien auf RULES.thickenToMm verstärken und enge Lücken schließen
 * @property {number} scale      Anteil der verfügbaren Fläche, 0.3–1
 */

/**
 * @typedef {Object} Design
 * @property {number} schema
 * @property {string} name       Motivname für Dateinamen, z. B. "bloomnow-modern"
 * @property {string} motif      aus MOTIFS
 * @property {string} shape      aus SHAPES
 * @property {number} widthMm
 * @property {number} heightMm
 * @property {string} style      aus STYLES
 * @property {boolean} border    Rahmen zeichnen
 * @property {string[]} lines    Textzeilen in der Mitte (Adresse: erste Zeile fett)
 * @property {string} ringTop    Ringtext oben (nur Kreis/Oval)
 * @property {string} ringBottom Ringtext unten (nur Kreis/Oval)
 * @property {ImageSettings|null} image
 * @property {string} inkColor   Farbe der PNG, #RRGGBB (die Druckdatei bleibt immer 100 % Schwarz)
 * @property {boolean} mirror    Druckdatei spiegeln (Standard: nein, das macht der Hersteller)
 */

/** Startwerte je Motivtyp. @returns {Design} */
export function newDesign(motif = 'wort') {
  const base = {
    schema: SCHEMA_VERSION, name: '', motif, shape: 'rechteck', widthMm: 47, heightMm: 18,
    style: 'modern', border: true, lines: [''], ringTop: '', ringBottom: '',
    image: null, inkColor: '#000000', mirror: false,
  };
  if (motif === 'wort') return { ...base, lines: ['ERLEDIGT'], style: 'klassisch' };
  if (motif === 'adresse') return { ...base, widthMm: 58, heightMm: 22, border: false, lines: ['Vorname Nachname', 'Straße 1', '12345 Ort'] };
  if (motif === 'logo') return { ...base, shape: 'kreis', widthMm: 40, heightMm: 40, style: 'eins_zu_eins', border: false, lines: [] };
  if (motif === 'siegel') return { ...base, shape: 'kreis', widthMm: 40, heightMm: 40, style: 'klassisch', lines: ['Mitte'], ringTop: 'Ringtext oben', ringBottom: 'Ringtext unten' };
  return base;
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
const oneOf = (v, list, d) => (list.includes(v) ? v : d);

/** Macht aus beliebiger Eingabe ein gültiges Design. @returns {Design} */
export function sanitize(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const motif = oneOf(r.motif, MOTIFS, 'wort');
  const d = newDesign(motif);
  const shape = oneOf(r.shape, SHAPES, d.shape);
  let w = clamp(num(r.widthMm, d.widthMm), LIMITS.minSizeMm, LIMITS.maxSizeMm);
  let h = clamp(num(r.heightMm, d.heightMm), LIMITS.minSizeMm, LIMITS.maxSizeMm);
  if (shape === 'kreis' || shape === 'quadrat') h = w;
  const lines = Array.isArray(r.lines) ? r.lines.slice(0, LIMITS.maxLines).map(l => str(l, LIMITS.maxLineLength)) : d.lines;
  let image = null;
  if (r.image && typeof r.image === 'object' && typeof r.image.src === 'string' && r.image.src.startsWith('data:image/')) {
    image = {
      src: r.image.src,
      name: str(r.image.name, 120),
      threshold: clamp(Math.round(num(r.image.threshold, 128)), 1, 254),
      invert: r.image.invert === true,
      thicken: r.image.thicken !== false,
      scale: clamp(num(r.image.scale, 1), 0.3, 1),
    };
  }
  return {
    schema: SCHEMA_VERSION,
    name: str(r.name, 60),
    motif, shape, widthMm: w, heightMm: h,
    style: oneOf(r.style, STYLES, d.style),
    border: typeof r.border === 'boolean' ? r.border : d.border,
    lines,
    ringTop: str(r.ringTop, LIMITS.maxRingLength),
    ringBottom: str(r.ringBottom, LIMITS.maxRingLength),
    image,
    inkColor: /^#[0-9a-fA-F]{6}$/.test(r.inkColor) ? r.inkColor.toUpperCase() : '#000000',
    mirror: r.mirror === true,
  };
}

/** Kurzer Name für Dateinamen: Kleinbuchstaben, Ziffern, Bindestriche; Umlaute umschreiben. */
export function slug(text) {
  const map = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' };
  const s = String(text || '').toLowerCase().replace(/[äöüß]/g, c => map[c])
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return s || 'motiv';
}

/** Dateiname nach Schema stempel_[motiv]_[form]_[breite]x[höhe]mm.[endung] */
export function fileName(design, ext) {
  const motiv = slug(design.name || design.lines.find(l => l.trim()) || design.ringTop || design.motif);
  const mm = v => String(Math.round(v * 10) / 10).replace('.', ',');
  return `stempel_${motiv}_${design.shape}_${mm(design.widthMm)}x${mm(design.heightMm)}mm.${ext}`;
}

/** Entwurf als Austauschformat. `now` ist ein ISO-Zeitstempel (von der Oberfläche übergeben). */
export function buildExport(design, now) {
  return { app: APP_ID, version: SCHEMA_VERSION, exportedAt: now, design: sanitize(design) };
}

/** Hebt ältere Daten auf das aktuelle Schema (idempotent). Version 1 ist die erste. */
export function upgradeRaw(raw) {
  return raw;
}

/**
 * Prüft eine importierte Entwurfsdatei.
 * @returns {{ok:true, design:Design} | {ok:false, error:'kein_json'|'falsche_app'|'zu_neu'|'kaputt'}}
 */
export function parseImport(text) {
  let raw;
  try { raw = JSON.parse(text); } catch { return { ok: false, error: 'kein_json' }; }
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'kaputt' };
  if (raw.app !== APP_ID) return { ok: false, error: 'falsche_app' };
  if (typeof raw.version !== 'number') return { ok: false, error: 'kaputt' };
  if (raw.version > SCHEMA_VERSION) return { ok: false, error: 'zu_neu' };
  const up = upgradeRaw(raw);
  if (!up.design || typeof up.design !== 'object') return { ok: false, error: 'kaputt' };
  return { ok: true, design: sanitize(up.design) };
}
