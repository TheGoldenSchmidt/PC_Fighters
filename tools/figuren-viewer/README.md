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

Erzeugt (nicht versioniert):

- `figuren-viewer.html` – im Browser öffnen (Handy oder PC), kein Server nötig.
- `figuren-viewer.artifact.html` – Body-only-Variante zum Veröffentlichen als Artifact.

Alle vorhandenen Figuren-Dateien werden automatisch eingelesen – neue Figuren
erscheinen nach dem nächsten Build ohne Skript-Änderung im Dropdown.

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
