# Stempel-Studio

Gestalte einen Stempel aus Text oder eigener Zeichnung und lade eine druckfertige Datei für deinen Stempelhersteller herunter. Die App läuft im Browser (auch offline als installierbare Web-App), alles bleibt auf deinem Gerät.

## Was Version 1 kann

- **Motive:** Wort/Freitext, Adresse (erste Zeile fett), Logo/eigene Zeichnung, Rund-/Siegelstempel mit Ringtext oben und unten
- **Formen:** Rechteck, Kreis, Oval, Quadrat in gängigen Selbstfärber-Größen oder frei in mm
- **Stile:** Klassisch (Doppelrand, Serifenschrift), Modern (gerundete Ecken, serifenlos), 1:1 (Vorlage pur)
- **Bild:** Graustufen → Schwelle → 1 Bit → Vektor (Potrace). Das Bild wird in Endgröße aufgebaut; Linien unter 0,2 mm werden auf 0,24 mm verstärkt, enge Lücken geschlossen, und die App meldet das.
- **Druckprüfung:** Linien und Lücken unter 0,2 mm, Farbe im 1-mm-Sicherheitsrand, Schrift unter 6 pt, Maße der Datei nachgemessen. Fundstellen werden in der Vorschau rot markiert.
- **Ausgabe:** PDF und SVG (Vektor, 1:1 in mm, Zeichenfläche = Plattengröße, nur 100 % Schwarz, Schriften in Pfade gewandelt, nicht gespiegelt), PNG mit 600 dpi und transparentem Hintergrund, Infozeile für den Hersteller. Dateinamen: `stempel_[motiv]_[form]_[breite]x[höhe]mm.[endung]`
- **Entwurf** speichern und laden (JSON)

Bitte die Maße immer mit deinem Hersteller bzw. Stempelmodell abgleichen. Nutze nur Bilder und Logos, an denen du die Rechte hast. Amtliche Siegel und Behördenstempel sind nicht erlaubt.

## Starten

Die App braucht keinen Build-Schritt, aber einen kleinen Webserver (ES-Module funktionieren nicht über `file://`):

```sh
npx serve .        # oder: python3 -m http.server
```

Veröffentlicht wird sie über GitHub Pages (Branch `main`, Ordner `/`).

## Kommandozeile und Claude-Skill

`tools/stempel.mjs` nutzt denselben Kern ohne Browser (nur Node ≥ 18):

```sh
node tools/stempel.mjs build design.json --image zeichnung.png --out ausgabe/   # Stempel bauen, prüfen, exportieren
node tools/stempel.mjs check eigen.svg --shape kreis                             # eigene SVG prüfen
node tools/stempel.mjs export eigen.svg --shape kreis --name motiv --out ausgabe/
node tools/stempel.mjs text --font schrift.ttf --size 4 --x 20 --y 10 --anchor middle "Text"
```

`skill/SKILL.md` macht daraus einen Claude-Skill: Claude gestaltet den Stempel (auch Sonderfälle wie Hanko oder eigene Anordnungen) und nutzt die Kommandozeile für Vektorisierung, Prüfung und Export. `sh tools/skill-paket.sh` baut `stempel-studio-skill.zip` (SKILL.md plus Engine) zum Hochladen in ein beliebiges Claude-Konto.

## Tests

```sh
npm test           # node --test, ohne Abhängigkeiten
```

Die Tests prüfen Datenmodell, Import, Geometrie, Layout mit den echten Schriften (alles innerhalb des 1-mm-Rands, Schrift ab 6 pt), Bildaufbereitung, Druckprüfung und die Dateiformate (SVG-Maße, PDF-Querverweise, PNG-dpi).

## Aufbau

| Datei | Schicht | Aufgabe |
|---|---|---|
| `src/model.js` | Modell | Stammdaten (Formen, Größen, Motive, Stile, Druckregeln), `sanitize`, Dateiname, Export/Import |
| `src/geometry.js` | Logik | Pfade in mm, Transformation, Ellipse, Rahmen, Bogenlänge |
| `src/layout.js` | Logik | `buildStamp`: Rahmen, Ringtext, Textblock, Bild → Vektorflächen |
| `src/bitmap.js` | Logik | Raster: Skalieren, Schwelle, Öffnen/Schließen, Skelett, Flächen |
| `src/prepress.js` | Logik | Bild für den Druck aufbereiten, fertigen Stempel prüfen |
| `src/vectorize.js` | Adapter | Vektorisierung, austauschbar (heute Potrace) |
| `src/export.js` | Logik | SVG, PDF (CMYK 0/0/0/100), PNG-dpi, Maße nachmessen |
| `src/services/fonts.js` | Adapter | Schriften laden (opentype.js), Text → Pfade |
| `src/storage.js` | Speicher | aktueller Entwurf in IndexedDB (Rückfall localStorage) |
| `src/texts.js` | Oberfläche | Beschriftungen, Meldungen, Infozeile |
| `src/ui.js`, `src/main.js` | Oberfläche | Formular, Vorschau, Canvas, Downloads |

Modell und Logik greifen nicht auf DOM, Speicher, Netz oder Uhr zu und laufen deshalb auch in Node. Siehe `docs/SWIFT.md`.

Nach jeder Änderung an App-Dateien `VERSION` in `sw.js` hochzählen, sonst laden installierte Apps die neuen Dateien nicht.

## Später geplant

Hanko (mit Katakana-Umschrift), Comic, Vintage (Körnung nur in der PNG), Datumsstempel-Vorlage, Foto → Strichgrafik, optionale KI-Vorschläge (eigener API-Schlüssel; Vorschläge im selben Format wie das Formular, geprüft mit denselben Druckregeln), Englisch, Desktop-Hülle, EPS.

## Lizenz

Stempel-Studio ist freie Software unter der **GNU General Public License v3.0 oder später** (`LICENSE`).

Enthaltene Fremdbestandteile:

- `src/vendor/potrace.js`: JavaScript-Port von [Potrace](https://potrace.sourceforge.net) (© Peter Selinger, GPL), Port von [kilobtye/potrace](https://github.com/kilobtye/potrace) (GPL), für Stempel-Studio als ES-Modul angepasst
- `src/vendor/opentype.module.js`: [opentype.js](https://github.com/opentypejs/opentype.js) 1.3.4, MIT (`src/vendor/LICENSE-opentype.txt`)
- `fonts/work-sans-*.woff`: Work Sans, SIL Open Font License 1.1 (`fonts/LICENSE-work-sans.txt`)
- `fonts/roboto-slab-*.woff`: Roboto Slab, Apache License 2.0 (`fonts/LICENSE-roboto-slab.txt`)

Schriften werden in der Druckdatei in Pfade gewandelt; die Schriftdateien selbst werden nicht weitergegeben.
