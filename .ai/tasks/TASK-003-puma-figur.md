# TASK-003: Puma-Figur vervollständigen

## Metadaten

- Task-ID: TASK-003
- Status: awaiting_review
- Implementierer: Codex
- review_required: true
- adr_required: false

## Übergabe

- Vorheriger Operator: unbekannt; unversionierter Entwurf vorgefunden
- Nächster Operator: Nutzerreview
- Handoff-Basis-Commit: a163921
- Aktueller Übergabe-Commit: keiner; Nutzer hat Commits ausdrücklich ausgeschlossen

## Kontext

Für `der_puma` liegt ein lokaler Entwurf mit 80 Bausteinen sowie individuellem
Idle und Angriff vor. Individueller Einzug, Tod, Verifikation und Abnahme fehlen.

## Ziel

Den vorhandenen Puma lokal zu einer vollständig individuell animierten Figur
vervollständigen und im Viewer zur Nutzerabnahme bereitstellen.

## Nicht-Ziele

- Kein Commit oder Push.
- Keine Änderung an der laufenden Agenten-Konsolidierung.
- Keine neue Dependency oder Architekturentscheidung.

## Akzeptanzkriterien

- Individuelle Klips für Idle, Einzug, Angriff und Tod.
- Bestehende 80-teilige Figur bleibt erhalten.
- `npm test` und `npm run check` sind erfolgreich.
- Puma ist im interaktiven Viewer prüfbar.

## Relevante Bereiche

- `packages/engine/src/data/figures/der_puma.json`
- generierter Standalone-Figurenviewer

## Risiken und Annahmen

- Ursprung und Begründung des unversionierten Entwurfs sind nicht belegbar.
- Qualitätsreview benötigt die visuelle Nutzerabnahme.
- Fremde Änderungen im Arbeitsbaum dürfen nicht dem Puma zugerechnet werden.

## Aktueller Stand

Der Entwurf wurde strukturell erfasst und um individuelle Klips `entrance` und
`death` ergänzt. Zwei visuelle Zwischenprüfungen zeigten beim Tod einen aus dem Bild
rutschenden Kopf; die liegende Endpose wurde deshalb schrittweise angehoben, ohne
den Kollapswinkel zu verändern.

## Entscheidungen

Bestehenden Entwurf weiterverwenden; Einzug als lautlose Pirsch mit kurzem
Ansprung, Tod als seitliches Einknicken und Ausrollen gestalten.

## Verworfene Alternativen

- Neuanlage: unnötige Kosten und Überschreibungsrisiko.
- Geerbte Standardklips: nicht individuell genug.

## Geänderte Dateien

- `.ai/tasks/TASK-003-puma-figur.md`
- `packages/engine/src/data/figures/der_puma.json`
- `tools/figuren-viewer/figuren-viewer.html` (generiert)

## Review-Findings

Noch keine; Nutzerreview steht aus.

## Verifikation

- `npm test`: 146 Tests erfolgreich.
- `npm run check`: Typen, 146 Tests, temporärer Produktionsbuild und
  Viewer-Aktualität erfolgreich.
- Interaktiver Viewer: 80 Bausteine; Idle, Einzug, Angriff und Tod als individuell
  erkannt.
- Korrigierter Todesklip: Kopf und Schnauze bleiben in der finalen Liegepose
  vollständig innerhalb der Bühne.
- `scripts/snap.mjs`: nicht ausführbar, weil das erwartete Playwright-Chromium lokal
  fehlt; Ersatzprüfung erfolgt im interaktiven In-App-Viewer.

## Offene Punkte

- Nutzerreview abwarten.

## Nächster konkreter Schritt

Nutzer entscheidet anhand des lokalen Live-Viewers über Freigabe oder Änderungen.
