# Übertragung nach Swift

| Datei | Schicht | In Swift |
|---|---|---|
| `src/model.js` | Modell | 1:1 als `struct Design: Codable`, Enums für Form, Motiv, Stil; `sanitize`, `fileName`, Import/Export |
| `src/geometry.js`, `src/layout.js` | Logik | 1:1 (oder `CGPath`); Ergebnis `Stamp` mit Flächen in mm |
| `src/bitmap.js`, `src/prepress.js` | Logik | 1:1 (oder vImage für Morphologie) |
| `src/vectorize.js` | Adapter | Potrace (C) direkt einbinden, GPL beachten |
| `src/export.js` | Logik | 1:1 für SVG; PDF alternativ über Core Graphics |
| `src/services/fonts.js` | Adapter | Core Text (`CTFontCreatePathForGlyph`) |
| `src/storage.js` | Speicher | neu: Datei im App-Container oder SwiftData |
| `src/texts.js` | Oberfläche | String Catalog |
| `src/ui.js`, `src/main.js` | Oberfläche | neu in SwiftUI |
| `tests/fixtures/*.json` | Tests | als Testdaten für XCTest wiederverwenden |

## Datentypen (Skizze)

```swift
enum Shape: String, Codable { case rechteck, kreis, oval, quadrat }
enum Motif: String, Codable { case wort, adresse, logo, siegel }
enum Style: String, Codable { case klassisch, modern, eins_zu_eins }

struct ImageSettings: Codable { var src: String; var name: String; var threshold: Int; var invert: Bool; var thicken: Bool; var scale: Double }
struct Design: Codable {
  var schema: Int; var name: String; var motif: Motif; var shape: Shape
  var widthMm: Double; var heightMm: Double; var style: Style; var border: Bool
  var lines: [String]; var ringTop: String; var ringBottom: String
  var image: ImageSettings?; var inkColor: String; var mirror: Bool
}
```

## Austauschformat

`{ "app": "stempel-studio", "version": 1, "exportedAt": "<ISO-Zeit>", "design": Design }`. Neuere Versionen werden abgelehnt, ältere über `upgradeRaw` angehoben.

Keine Datumsrechnung in der Logik; der Exportzeitpunkt wird von der Oberfläche übergeben.
