<!--
Kopfregeln:
- Bestehende Angaben aktualisieren statt fortlaufend anzuhängen.
- Kein Chatverlauf und keine Sitzungschronik.
- Abgeschlossene Arbeit gehört in Git; abgeschlossene Tasks werden gelöscht.
- Nicht verifizierte Annahmen ausdrücklich als Annahmen kennzeichnen.
- Status: planned | in_progress | awaiting_review | changes_requested | ready_to_complete | blocked
-->

# TASK-001: Fünf weitere Figuren erstellen

## Metadaten

- Task-ID: TASK-001
- Status: in_progress
- Implementierer: Codex / Figuren-Werkstatt
- handoff_required: true
- review_required: false
- adr_required: false

## Übergabe

- Vorheriger Operator: – (Neuanlage)
- Nächster Operator: Figuren-Designer der Figuren-Werkstatt
- Handoff-Basis-Commit: 0640212399db785952558e8acfba51c83a62a931
- Aktueller Übergabe-Commit: ausstehend

## Kontext

Der Figurenbestand soll nach den vorhandenen Daten- und Gestaltungs­konventionen um fünf heute erstellte Kartenfiguren erweitert werden. Die Umsetzung folgt der lokalen Figuren-Werkstatt einschließlich Designer-/Kritiker-Schleife und visueller Abnahme.

Ausgewählte Zielkarten: `alphawolf`, `streunerkatze`, `schwarze_katze`, `katzenmutter` und `luchs`.

## Ziel

Fünf bislang nicht als Figuren-JSON vorhandene Karten erhalten jeweils eine validierte, im Viewer gerenderte und visuell geprüfte 3D-Figur.

## Nicht-Ziele

- Keine Änderungen an Kartenwerten, Regeln, Netzwerkverhalten oder Client-Rendering.
- Keine Änderung der Figuren-Werkstatt oder ihrer Lektionen ohne gesonderte Nutzerfreigabe.
- Kein Commit oder Push ohne Nutzerentscheidung.

## Akzeptanzkriterien

- Genau fünf neue Dateien unter `packages/engine/src/data/figures/` folgen den bestehenden Schemas und Konventionen.
- Für jede Figur liegt eine finale Montage mit Rundumansichten und Angriffsphasen vor.
- Jede Figur durchläuft die Designer-/Kritiker-Schleife der Figuren-Werkstatt; verbleibende Kritik oder Restrisiken sind dokumentiert.
- Relevante Tests und abschließend `npm run check` sind erfolgreich oder Abweichungen sind mit Ursache, Ersatzprüfung und Restrisiko dokumentiert.
- Die Task-Datei bildet Auswahl, Änderungen, Prüfungen, Risiken und nächsten Schritt aktuell ab.

## Relevante Bereiche

- `.ai/tasks/TASK-001-fuenf-weitere-figuren.md`
- `packages/engine/src/data/cards/`
- `packages/engine/src/data/factions.json`
- `packages/engine/src/data/figures/`
- `.agents/skills/figuren-werkstatt/`

## Risiken und Annahmen

- Annahme: Ohne abweichende Nutzerpriorisierung gilt die Reihenfolge der Kartendaten. Gewählt wurden die ersten fünf Kreaturen ohne vorhandene Figuren-Datei; Aktionskarten wurden ausgeschlossen.
- Der Server muss nach jeder Figurenänderung neu gestartet werden, damit Montagen den aktuellen Datenstand zeigen.
- Visuelle Qualität kann automatische Tests bestehen und dennoch eine Überarbeitungsrunde benötigen.

## Aktueller Stand

- Sauberer Ausgangsstand auf `master` bei Handoff-Basis-Commit `0640212399db785952558e8acfba51c83a62a931` festgestellt.
- Werkstatt-Anweisungen und `LESSONS.md` vollständig gelesen.
- Zielkarten festgelegt: `alphawolf`, `streunerkatze`, `schwarze_katze`, `katzenmutter`, `luchs`.
- Kartendaten und Fraktionsfarben (`animals` #4a7c59, `katzen` #d98a2b) für die Designer-Briefs verifiziert.

## Entscheidungen

- Die Aufgabe nutzt das bestehende Figuren-JSON-System und die Figuren-Werkstatt ohne neue Abstraktion.
- Die vom Nutzer gesetzten Trigger gelten: Handoff erforderlich, kein gesondertes Review und keine ADR.
- Auswahl nach Kartenreihenfolge: zuerst `alphawolf`, anschließend die vier ersten noch fehlenden Katzen-Kreaturen.

## Verworfene Alternativen

- Keine automatische Laufzeitgenerierung; Figuren bleiben versionierte Spieldaten.

## Geänderte Dateien

- `.ai/tasks/TASK-001-fuenf-weitere-figuren.md` (Task-Zustand angelegt)

## Review-Findings

- Kein Review erforderlich; noch keine Findings.

## Verifikation

- Ausgangsstatus: `git status --short --branch` war vor Task-Anlage sauber (`master...origin/master`).
- Weitere Prüfungen stehen aus.

## Offene Punkte

- Die Task-Datei muss vor dem ersten Operatorwechsel gemäß Repository-Regel in einem gemeinsamen Commit sichtbar sein; Commit-Freigabe steht aus.

## Nächster konkreter Schritt

Zielkarten bestimmen, Task-Datei entsprechend aktualisieren und die Nutzerentscheidung zum Task-Handoff-Commit einholen, bevor der Figuren-Designer übernimmt.
