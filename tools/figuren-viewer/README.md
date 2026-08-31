# Figuren-Viewer

Eigenständiger 3D-Viewer zur **menschlichen Validierung** der Kartenfiguren
(`packages/engine/src/data/figures/*.json`) – zum Drehen, Zoomen, Abspielen der
Animationsklips und zum Sammeln von Feedback. Läuft ohne Dev-Server: three.js und
alle Figurdaten werden in eine einzelne HTML-Datei eingebettet.

## Bauen

```bash
npm install                      # einmalig (liefert three.js + esbuild)
node tools/figuren-viewer/build-viewer.mjs
```

Erzeugt:

- `figuren-viewer.html` – im Browser öffnen (Handy oder PC), kein Server nötig.
  **Wird versioniert** und nach jeder Figur-Änderung neu gebaut + mitcommittet, damit
  man den Viewer nach `git pull` direkt öffnen kann, ohne selbst zu bauen.
- `figuren-viewer.artifact.html` – Body-only-Variante zum Veröffentlichen als Artifact
  (nicht versioniert).

Alle vorhandenen Kartenfiguren und alle Dateien aus `standalone-figures/` werden
automatisch eingelesen. Dadurch können neue Figuren schon vor ihrer Karte im
Viewer geprüft werden. Nach dem nächsten Build erscheinen sie ohne weitere
Skript-Änderung im Dropdown.

Eine Standalone-Datei hat dieselbe vollständige Struktur wie eine normale
Figur (`cardId`, `visual`, optional `animations`) und darf zusätzlich einen
lesbaren `displayName` für das Dropdown enthalten. Sobald eine Karte existiert,
wird die Datei in `packages/engine/src/data/figures/` verschoben; doppelte IDs
bricht der Viewer-Build bewusst mit einer Fehlermeldung ab.

## Bedienung

- **Figur wählen:** Dropdown oben.
- **Inspizieren:** ziehen zum Drehen, Mausrad / Pinch zum Zoomen, Doppelklick setzt
  die Ansicht zurück.
- **Klips:** Idle / Einzug / Angriff / Treffer / Tod.
- **Feedback:** je Figur eine Notiz eintragen, „Feedback für Chat sammeln" bündelt
  alle Notizen zu einem Block. Diesen Block der Figuren-Werkstatt geben – sie
  überarbeitet die Figur(en) und lässt Designer/Kritiker daraus lernen
  (`.claude/skills/figuren-werkstatt/LESSONS.md`).

## Aufbau

- `viewer-template.html` – Markup, Styles und portierte Render-/Animationslogik
  (Ports von `packages/client/src/figures/CardFigure.ts` und `AnimationPlayer.ts`);
  Platzhalter `__THREE_IIFE__`, `__FIGURES_JSON__`, `__DEFAULT_CLIPS_JSON__`.
- `build-viewer.mjs` – bündelt three.js (esbuild → IIFE) und füllt die Platzhalter.
