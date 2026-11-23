// Beschriftungen und Meldungen (Deutsch). Gehört zur Oberfläche; später String Catalog in Swift.

export const LABELS = {
  motif: { wort: 'Wort / Freitext', adresse: 'Adresse', logo: 'Logo / eigene Zeichnung', siegel: 'Rund- / Siegelstempel' },
  shape: { rechteck: 'Rechteck', kreis: 'Kreis', oval: 'Oval', quadrat: 'Quadrat' },
  style: { klassisch: 'Klassisch', modern: 'Modern', eins_zu_eins: '1:1 (Vorlage pur)' },
  styleHint: {
    klassisch: 'Doppelrand, Serifenschrift',
    modern: 'Gerundete Ecken, serifenlose Schrift, viel Luft',
    eins_zu_eins: 'Vorlage möglichst originalgetreu, schlichter Rand',
  },
};

/** Meldungen aus Gestaltung und Prüfung. Jede hat eine Stufe für die Anzeige. */
export function noteText(n) {
  switch (n.code) {
    case 'schrift_klein': return { level: 'warn', cap: 'Schrift', text: `Die kleinste Schrift ist ${fmt(n.value)} pt. Unter 6 pt druckt sie oft nicht sauber. Weniger Text oder größeres Format wählen.` };
    case 'kein_platz': return { level: 'err', cap: 'Platz', text: 'Für die Mitte bleibt kein Platz. Größeres Format wählen oder Ringtext kürzen.' };
    case 'bild_leer': return { level: 'warn', cap: 'Bild', text: 'Im Bild ist bei dieser Schwelle nichts Dunkles zu sehen. Schwelle verschieben oder „Hell/Dunkel tauschen“ probieren.' };
    case 'linien_verstaerkt': return { level: 'info', cap: 'Bild', text: `${n.value} dünne Linie(n) lagen unter 0,2 mm und wurden auf 0,24 mm verstärkt.` };
    case 'luecken_geschlossen': return { level: 'info', cap: 'Bild', text: `${n.value} enge Lücke(n) unter 0,2 mm wurden geschlossen, weil sie im Druck zulaufen würden.` };
    case 'zeichen_fehlt': return { level: 'warn', cap: 'Schrift', text: `Diese Zeichen gibt es in der Schrift nicht: ${n.chars}. Sie erscheinen als Kästchen.` };
    case 'duenn': return { level: 'warn', cap: 'Prüfung', text: `${n.value} Stelle(n) dünner als 0,2 mm (rot markiert).` };
    case 'eng': return { level: 'warn', cap: 'Prüfung', text: `${n.value} Lücke(n) enger als 0,2 mm (rot markiert). Sie können im Druck zulaufen.` };
    case 'rand': return { level: 'err', cap: 'Prüfung', text: `${n.value} Stelle(n) liegen näher als 1 mm am Rand (rot markiert).` };
    case 'masse_ok': return { level: 'ok', cap: 'Maße', text: `Druckdatei nachgemessen: ${fmt(n.w)} × ${fmt(n.h)} mm, 1:1. Nur 100 % Schwarz, Schriften in Pfade gewandelt.` };
    case 'masse_falsch': return { level: 'err', cap: 'Maße', text: `Druckdatei misst ${fmt(n.w)} × ${fmt(n.h)} mm statt der gewählten Größe.` };
    case 'alles_ok': return { level: 'ok', cap: 'Prüfung', text: 'Keine Linie unter 0,2 mm, keine engen Lücken, nichts im 1-mm-Rand.' };
    default: return { level: 'info', cap: 'Hinweis', text: n.code };
  }
}

export const IMPORT_ERRORS = {
  kein_json: 'Die Datei ist keine Stempel-Studio-Entwurfsdatei (kein JSON).',
  falsche_app: 'Die Datei stammt nicht aus Stempel-Studio.',
  zu_neu: 'Die Datei stammt aus einer neueren Version von Stempel-Studio. Bitte die App aktualisieren.',
  kaputt: 'Die Datei ist beschädigt oder unvollständig.',
};

export const fmt = v => String(Math.round(v * 10) / 10).replace('.', ',');

/** Kurze Infozeile für den Stempelhersteller. */
export function infoLine(design) {
  const { shape, widthMm: w, heightMm: h } = design;
  const size = shape === 'kreis' ? `Ø ${fmt(w)} mm` : `${fmt(w)} × ${fmt(h)} mm`;
  const color = design.inkColor === '#000000' ? 'Schwarz' : `nach Wunsch (Vorschau ${design.inkColor})`;
  return `${LABELS.shape[shape]}, ${size} (Innenmaß Stempelplatte), Stempelfarbe: ${color}. ` +
    `Druckdatei als PDF und SVG, Vektor, Maßstab 1:1, 100 % Schwarz, Schriften in Pfade gewandelt, ` +
    `${design.mirror ? 'bereits gespiegelt' : 'nicht gespiegelt'}.`;
}
