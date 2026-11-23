#!/bin/sh
# Baut stempel-studio-skill.zip: SKILL.md plus Engine (Kern, Kommandozeile, Schriften, Lizenz).
# Aufruf aus dem Repo-Ordner: sh tools/skill-paket.sh [zielordner]
set -e
OUT="${1:-.}"
TMP="$(mktemp -d)"
mkdir -p "$TMP/stempel-studio/engine"
cp skill/SKILL.md "$TMP/stempel-studio/"
cp -r src tools fonts LICENSE package.json "$TMP/stempel-studio/engine/"
rm -f "$TMP/stempel-studio/engine/tools/skill-paket.sh"
(cd "$TMP" && zip -qr stempel-studio-skill.zip stempel-studio)
mv "$TMP/stempel-studio-skill.zip" "$OUT/"
rm -rf "$TMP"
echo "$OUT/stempel-studio-skill.zip"
