// Austauschbare Vektorisierung: 1-Bit-Maske → Pfad in Pixelkoordinaten.
// Heute: Potrace (GPL). Wer die App geschlossen weitergeben will, ersetzt nur diese Datei (z. B. durch vtracer, MIT).
import { trace } from './vendor/potrace.js';

/**
 * @param {{w:number,h:number,data:Uint8Array}} mask 1 = Farbe
 * @param {{turdsize?:number}} [opts] turdsize: Flecken bis zu dieser Fläche (Pixel) weglassen
 * @returns {import('./geometry.js').Cmd[]} alle Konturen hintereinander, Füllregel evenodd
 */
export function vectorize(mask, opts = {}) {
  const contours = trace(mask.data, mask.w, mask.h, { turdsize: opts.turdsize ?? 2 });
  return contours.flatMap(c => [...c, { t: 'Z', p: [] }]);
}
