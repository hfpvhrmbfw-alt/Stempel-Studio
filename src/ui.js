// Darstellung: Auswahlknöpfe, Vorschau mit Plattenumriss und Prüfmarken, Hinweise.
import { toPathData, plateOutline } from './geometry.js';
import { RULES } from './model.js';
import { noteText, fmt, LABELS } from './texts.js';

const $ = id => document.getElementById(id);
export { $ };

/** Knöpfe einer Auswahlgruppe (role=radiogroup) zeichnen. */
export function renderChoices(el, ids, labels, current, hints) {
  el.replaceChildren(...ids.map(id => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(id === current));
    b.dataset.id = id;
    b.textContent = labels[id];
    if (hints && hints[id]) { const s = document.createElement('small'); s.textContent = hints[id]; b.append(s); }
    return b;
  }));
}

/**
 * Vorschau: weiße Platte mit gestricheltem Umriss, 1-mm-Sicherheitslinie, Stempel in Farbe, rote Prüfmarken.
 * @param {HTMLElement} stage
 * @param {import('./layout.js').Stamp} stamp
 */
export function renderPreview(stage, stamp, design, marks = []) {
  const { widthMm: w, heightMm: h } = stamp;
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `-1 -1 ${w + 2} ${h + 2}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `Vorschau ${LABELS.shape[design.shape]} ${fmt(w)} × ${fmt(h)} mm`);
  const path = (d, cls, extra = {}) => {
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('d', d);
    if (cls) p.setAttribute('class', cls);
    for (const [k, v] of Object.entries(extra)) p.setAttribute(k, v);
    svg.append(p);
  };
  const radius = design.style === 'modern' ? 2.5 : 0;
  path(toPathData(plateOutline(design.shape, w, h, 0, radius + 0)), 'plate');
  path(toPathData(plateOutline(design.shape, w, h, RULES.marginMm, radius)), 'safe');
  const g = document.createElementNS(ns, 'g');
  g.setAttribute('fill', design.inkColor);
  for (const it of stamp.items) {
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('d', toPathData(it.cmds));
    p.setAttribute('fill-rule', it.rule);
    g.append(p);
  }
  svg.append(g);
  for (const m of marks) {
    const pad = 0.4;
    path(`M${m.x - pad} ${m.y - pad}h${m.w + 2 * pad}v${m.h + 2 * pad}h${-(m.w + 2 * pad)}Z`, 'mark');
  }
  stage.replaceChildren(svg);
}

/** Hinweise als Status-Notizen (immer mit Stichwort, nie nur Farbe). */
export function renderNotes(el, notes) {
  el.replaceChildren(...notes.map(n => {
    const t = noteText(n);
    const div = document.createElement('div');
    div.className = `note ${t.level === 'ok' ? 'ok' : t.level}`;
    const cap = document.createElement('span');
    cap.className = 'cap';
    cap.textContent = t.cap;
    div.append(cap, document.createTextNode(t.text));
    return div;
  }));
}
