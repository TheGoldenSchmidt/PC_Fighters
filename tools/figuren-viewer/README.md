# Figuren-Viewer

Eigenständiger 3D-Viewer zur **menschlichen Validierung** der Kartenfiguren
(`packages/engine/src/data/figures/*.json`) – zum Drehen, Zoomen, Abspielen der
Animationsklips und zum Sammeln von Feedback. Er läuft ohne Dev-Server: three.js
und alle Figurdaten werden in eine einzelne HTML-Datei eingebettet.

## Bauen

```bash
npm install
node tools/figuren-viewer/build-viewer.mjs
```

Erzeugt zwei nicht versionierte Dateien:

- `figuren-viewer.html` – eigenständig im Browser öffnen.
- `figuren-viewer.artifact.html` – Body-only-Variante zum Veröffentlichen als Artifact.

Alle vorhandenen Figuren-Dateien werden automatisch eingelesen. Neue Figuren
erscheinen nach dem nächsten Build ohne Skriptänderung im Dropdown.

## Bedienung

- **Figur wählen:** Dropdown oben.
- **Inspizieren:** ziehen zum Drehen, Mausrad oder Pinch zum Zoomen; Doppelklick
  setzt die Ansicht zurück.
- **Klips:** Idle, Einzug, Angriff, Treffer und Tod.
- **Feedback:** je Figur eine Notiz eintragen; „Feedback für Chat sammeln“ bündelt
  die Notizen zu einem Block für die Figuren-Werkstatt.

## Aufbau

- `viewer-template.html` – Markup, Styles sowie Render- und Animationslogik;
  enthält die Platzhalter `__THREE_IIFE__`, `__FIGURES_JSON__` und
  `__DEFAULT_CLIPS_JSON__`.
- `build-viewer.mjs` – bündelt three.js per esbuild und füllt die Platzhalter.
