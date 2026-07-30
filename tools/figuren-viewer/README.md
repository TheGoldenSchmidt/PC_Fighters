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

Alle vorhandenen Figuren-Dateien werden automatisch eingelesen – neue Figuren
erscheinen nach dem nächsten Build ohne Skript-Änderung im Dropdown.

Die versionierte Ausgabe wird ohne Änderung des Arbeitsbaums geprüft mit:

```bash
node tools/figuren-viewer/build-viewer.mjs --check
```

Dieser Check ist Bestandteil von `npm run check`. Ist die Ausgabe veraltet, wird
sie getrennt mit `npm run generate:viewer` neu erzeugt.

## Bedienung

- **Figur wählen:** Dropdown oben.
- **Inspizieren:** ziehen zum Drehen, Mausrad / Pinch zum Zoomen, Doppelklick setzt
  die Ansicht zurück.
- **Klips:** Idle / Einzug / Angriff / Treffer / Tod.
- **Feedback:** je Figur eine Notiz eintragen, „Feedback für Chat sammeln" bündelt
  alle Notizen zu einem Block. Diesen Block der Figuren-Werkstatt geben – sie
  überarbeitet die Figur(en) und lässt Designer/Kritiker daraus lernen
  (`docs/figure-generation/PLAYBOOK.md`, Schritt 8).

## Aufbau

- `viewer-template.html` – Markup, Styles und portierte Render-/Animationslogik
  (Ports von `packages/client/src/figures/CardFigure.ts` und `AnimationPlayer.ts`);
  Platzhalter `__THREE_IIFE__`, `__FIGURES_JSON__`, `__DEFAULT_CLIPS_JSON__`.
- `build-viewer.mjs` – bündelt three.js (esbuild → IIFE) und füllt die Platzhalter.
