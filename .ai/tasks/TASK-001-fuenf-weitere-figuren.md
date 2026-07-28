<!--
Kopfregeln:
- Bestehende Angaben aktualisieren statt fortlaufend anzuhängen.
- Kein Chatverlauf und keine Sitzungschronik.
- Abgeschlossene Arbeit gehört in Git; abgeschlossene Tasks werden gelöscht.
- Nicht verifizierte Annahmen ausdrücklich als Annahmen kennzeichnen.
- Status: planned | in_progress | awaiting_review | changes_requested | ready_to_complete | blocked
-->

# TASK-001: Fünf weitere Figuren – Übergabe an Claude

## Metadaten

- Task-ID: TASK-001
- Status: in_progress
- Implementierer: Codex (Übergabevorbereitung) → Claude Code
- handoff_required: true
- review_required: false
- adr_required: false

## Übergabe

- Vorheriger Operator: Codex / Figuren-Werkstatt
- Nächster Operator: Claude Code
- Handoff-Basis-Commit: 016f9b2ba64586e41980949f6810cda5c5b4b074
- Aktueller Übergabe-Commit: 016f9b2ba64586e41980949f6810cda5c5b4b074 (Implementierungsstand; der reine Task-Übergabe-Commit folgt)

## Kontext

TASK-001 wurde im Commit `016f9b2` vollständig umgesetzt, geprüft, abgeschlossen und gemäß Repository-Regel gelöscht. Auf ausdrücklichen Nutzerwunsch wird die Task-Datei für die Übergabe an Claude als aktive Übergabehilfe neu angelegt. Diese Reaktivierung dokumentiert den belegten Abschlussstand und ist kein Archiv sowie keine erneute Figurenimplementierung.

Die ursprüngliche Aufgabe erweiterte den Figurenbestand um die ersten fünf Kreaturen in Kartendaten-Reihenfolge, für die noch keine Figuren-JSON vorhanden war: `alphawolf`, `streunerkatze`, `schwarze_katze`, `katzenmutter` und `luchs`.

## Ziel

Claude erhält einen konsistenten, Git-belegten Übergabestand mit den erstellten Figuren, Entscheidungen, verworfenen Ansätzen, Planabweichungen, Prüfungen, Restrisiken und einem eindeutigen Einstiegsschritt. Die bereits freigegebenen Figuren werden durch diese Übergabe nicht verändert.

## Nicht-Ziele

- Keine erneute Überarbeitung der fünf abgeschlossenen Figuren ohne neues Finding oder Nutzerauftrag.
- Keine Änderung an Kartenwerten, Regeln, Netzwerkverhalten oder Client-Rendering.
- Keine neue Dependency und keine ADR.
- Kein Push des Übergabe-Commits vor ausdrücklicher Nutzerfreigabe.

## Akzeptanzkriterien

- Die Übergabedatei enthält alle vom Nutzer verlangten Zustandsangaben.
- Der belegte Implementierungsstand bleibt unverändert.
- `npm run check` ist nach Neuanlage der Übergabedatei erfolgreich.
- Der Übergabe-Commit enthält ausschließlich diese Task-Datei.
- Claude kann mit `npm run agent:context -- TASK-001` in den belegten Stand einsteigen.

## Relevante Bereiche

- `.ai/tasks/TASK-001-fuenf-weitere-figuren.md`
- `CLAUDE.md`
- `.agents/skills/figuren-werkstatt/LESSONS.md`
- `packages/engine/src/data/figures/`
- `tools/figuren-viewer/figuren-viewer.html`

## Risiken und Annahmen

- Die Standardmontagen zeigen Rundumansichten und drei Angriffsschlüsselbilder, aber nicht lückenlos die Interpolation oder vollständige Idle-, Einzugs-, Treffer- und Todesklips.
- Die tatsächliche Lesbarkeit unter allen Schlachtfeld-Effekten und Beleuchtungen wurde nicht für jede Figur in einem vollständigen Match erneut geprüft.
- Der Vite-Produktionsbuild meldet weiterhin nur die nicht blockierende Warnung für einen Chunk über 500 kB; dies wurde durch TASK-001 weder verursacht noch behoben.
- Ein lokaler Live-Viewer-Prozess ist sitzungsabhängig und darf von Claude nicht als dauerhafter Übergabestand angenommen werden.
- Annahme: Claude soll den abgeschlossenen Stand übernehmen und auf die nächste konkrete Nutzeranweisung aufbauen, nicht die bereits freigegebene Werkstatt-Schleife wiederholen.

## Aktueller Stand

- `master`, `HEAD` und `origin/master` zeigen vor der Übergabevorbereitung auf `016f9b2ba64586e41980949f6810cda5c5b4b074`.
- `alphawolf`: 80 Bausteine, `visual.height: 0.66`, lebendiger Idle und seitlich lesbarer Biss-Sprung; nach drei Werkstattrunden A/B/C `GUT`.
- `streunerkatze`: 78 Bausteine, `visual.height: 0.5`, struppige Straßenkatzen-Silhouette und anatomisch verbundener Pfotenhieb; nach zwei Runden A/B/C `GUT`.
- `schwarze_katze`: 80 Bausteine, `visual.height: 0.54`, dunkle Albedo-Staffelung, glatter Schweif und asymmetrischer Krallensprung; nach zwei Runden A/B/C `GUT`.
- `katzenmutter`: 80 Bausteine, `visual.height: 0.6`, klar getrenntes Kätzchen, schützender Schweifbogen und defensiver Pfotenhieb; nach einer Runde A/B/C `GUT`.
- `luchs`: 80 Bausteine, `visual.height: 0.70`, Wildkatzenproportion, Ohrpinsel, Backenbart, kompakte Stummelrute und flacher Krallensprung; nach zwei Runden A/B/C `GUT`.
- Der generierte Figuren-Viewer enthält alle fünf Figuren und war beim Abschlusscheck aktuell.
- Drei vom Nutzer freigegebene Werkstatt-Lektionen wurden zu anatomisch verankerten Angriffsgliedern, Albedo-Kontrast dunkler Figuren und lesbaren Begleitfiguren ergänzt.

## Entscheidungen

- Die fünf Zielkarten wurden nach der bestehenden Kartendaten-Reihenfolge ausgewählt. Grund: nachvollziehbare Fortsetzung des Figurenbestands ohne neue Priorisierungslogik; Aktionskarten wurden ausgeschlossen, weil sie keine Kreaturen-Rigs benötigen.
- Figuren bleiben versionierte JSON-Dateien im vorhandenen Datenmodell. Grund: bestehende Source of Truth und keine Laufzeitgenerierung.
- Pro Checkout arbeitete jeweils genau ein schreibender Implementierer; Designer, Gesichts-/Animationsspezialisten und Kritiker wurden nacheinander geroutet. Grund: Repository-Regel und konfliktfreier gemeinsamer Arbeitsbaum.
- `visual.height` und schlanke bzw. bewusst kräftige Proportionen steuern die wahrgenommene Größe. Grund: der Auto-Fit orientiert sich an Bounding-Box-Höhe und kann breite, flache Figuren übergroß skalieren.
- Angriffe wurden körperlich über Pose und Gelenke statt Root-Emissive umgesetzt. Grund: Ganzkörper-Glow zerstört Farbidentität und kaschiert keine unklare Silhouette.
- Dunkle Lesbarkeit der Schwarzen Katze wurde über Albedo-Abstände und violette Kanten statt Glow gelöst. Grund: stabile Lesbarkeit aus mehreren Ansichten.
- Das Kätzchen der Katzenmutter blieb als deutlich kleinere Begleitfigur an der Flanke. Grund: Fähigkeit lesbar machen, ohne den Auto-Fit durch eine gleichrangige Doppelsilhouette zu überladen.
- Der Figuren-Viewer wurde ausschließlich über `npm run generate:viewer` aktualisiert. Grund: `tools/figuren-viewer/figuren-viewer.html` ist generiert.
- Die Werkstatt-Lektionen wurden erst nach ausdrücklicher Nutzerfreigabe geändert. Grund: verbindlicher Werkstatt-Ablauf.

## Verworfene Alternativen

- Aktionskarten als Figuren behandeln: verworfen, weil nur Kreaturen ein 3D-Rig benötigen.
- Laufzeitgenerierung oder neue Figurenabstraktion: verworfen, weil das vorhandene JSON-System ausreichend ist.
- Parallele Schreibagenten im gemeinsamen Checkout: verworfen wegen Konfliktrisiko und Repository-Regel.
- Direkte Bearbeitung des generierten Viewers: verworfen zugunsten des kanonischen Generators.
- Root-Emissive oder Ganzkörperglow für Signatur-/Fluchwirkung: verworfen wegen Farb-Wash und schlechter Silhouettenlesbarkeit.
- Perlenartige bzw. hell gekappte Schweife: nach visueller Kritik verworfen zugunsten überlappender anatomischer Konturen.
- Frontal aufgerichtete oder humanoide Kontaktposen: nach visueller Kritik verworfen zugunsten seitlicher, gelenkverbundener Sprünge und Pfotenbögen.
- Gleich große Mutter-/Kätzchen-Silhouetten: verworfen zugunsten klarer Haupt-/Begleitfiguren-Hierarchie.

## Abweichungen vom ursprünglichen Plan

- Der ursprüngliche Plan sah die Task-Löschung nach Abschluss vor; dies wurde in `016f9b2` korrekt ausgeführt. Die vorliegende Neuanlage ist eine ausdrückliche spätere Nutzeranforderung für die Claude-Übergabe.
- `LESSONS.md` war zunächst ein Nicht-Ziel ohne gesonderte Freigabe. Nach Figurenabnahme schlug die Werkstatt drei neue Lektionen vor; der Nutzer gab sie ausdrücklich frei, daher wurden sie im Abschluss-Commit aufgenommen.
- Mehrere Figuren benötigten zusätzliche Werkstattrunden: Alphawolf drei, Streunerkatze zwei, Schwarze Katze zwei und Luchs zwei; Katzenmutter bestand in der ersten Runde. Das blieb innerhalb der vorgesehenen maximal drei Runden.
- Der erste kanonische Check erkannte erwartungsgemäß den durch neue Figuren veralteten generierten Viewer. Dieser wurde über den Generator aktualisiert und der Check anschließend erfolgreich wiederholt.
- Check- und Generatorläufe mussten unter Windows außerhalb der Dateisystem-Sandbox wiederholt werden, weil ihre temporären AppData-Ziele dort zunächst nicht lesbar waren; die erfolgreichen Wiederholungen nutzten unveränderte Befehle.

## Geänderte Dateien

Implementierungs- und Abschluss-Commit `016f9b2`:

- `.agents/skills/figuren-werkstatt/LESSONS.md`
- `.ai/tasks/TASK-001-fuenf-weitere-figuren.md` (im Abschluss-Commit gelöscht)
- `packages/engine/src/data/figures/alphawolf.json`
- `packages/engine/src/data/figures/streunerkatze.json`
- `packages/engine/src/data/figures/schwarze_katze.json`
- `packages/engine/src/data/figures/katzenmutter.json`
- `packages/engine/src/data/figures/luchs.json`
- `tools/figuren-viewer/figuren-viewer.html`

Aktuelle Übergabevorbereitung:

- `.ai/tasks/TASK-001-fuenf-weitere-figuren.md` (als aktive Claude-Übergabe neu angelegt)

## Review-Findings

- `review_required: false`; es gab kein separates formales Code-Review.
- Alle visuellen Werkstatt-Findings wurden innerhalb der dokumentierten Runden behoben und abschließend je Figur mit A/B/C `GUT` bewertet.
- Verbleibende Hinweise betreffen nur die oben genannten Grenzen eingefrorener Montagebilder; es gibt kein offenes konkretes Figuren-Finding.

## Verifikation

- Nach jeder Designer-/Spezialistenrunde: `npm.cmd test`, jeweils 134 Engine- und 12 Server-Tests bestanden.
- Nach jeder Datenänderung: Server mit aktuellem Datenstand neu gestartet; Montage-Snapshot meldete die erwartete Bausteinzahl und HTTP 200.
- Finale Werkstatturteile: alle fünf Figuren mit Gesamturteil sowie Linsen A/B/C `GUT`.
- `npm.cmd run generate:viewer`: erfolgreich; alle fünf neuen Figuren im generierten Viewer enthalten.
- `npm.cmd run check` vor Abschluss-Commit: erfolgreich; TypeScript in allen Workspaces, 146 Tests, temporärer Produktionsbuild und Viewer-Aktualitätsprüfung bestanden.
- `npm.cmd run check` nach freigegebenen Lektionen und Task-Löschung: erneut vollständig erfolgreich.
- Git-Abschlussstand: Commit `016f9b2`; anschließend sauberer Arbeitsbaum und identische Hashes für `HEAD` und `origin/master`.
- `npm.cmd run check` nach Neuanlage dieser Übergabedatei: erster Lauf mit transientem Vitest-Fehler `Worker exited unexpectedly` im Server-Workspace abgebrochen; TypeScript und alle 134 Engine-Tests waren dabei erfolgreich.
- Unveränderte Wiederholung von `npm.cmd run check`: vollständig erfolgreich; TypeScript in allen Workspaces, 146 Tests, temporärer Produktionsbuild und Viewer-Aktualitätsprüfung bestanden.

## Bekannte Probleme und Risiken

- Keine bekannten offenen Schema-, Test-, Build- oder Viewer-Aktualitätsfehler.
- Bewegungsinterpolation und nicht in der Standardmontage gezeigte Klips bleiben visuelle Restrisiken ohne konkretes beobachtetes Fehlverhalten.
- Sehr dunkle Figuren können unter anderer Beleuchtung schwächer lesbar werden; die Schwarze Katze nutzt deshalb bereits gestaffelte Albedo-Kontraste.
- Die Task-Datei beschreibt abgeschlossene Implementierung als aktive Übergabe. Claude soll sie nach Übernahme aktualisieren und bei erneutem Abschluss wieder löschen, nicht dauerhaft als Archiv behalten.

## Offene Punkte

- Übergabe-Commit erstellen; Push erst nach ausdrücklicher Nutzerfreigabe.
- Claude übernimmt den Branch nach Push und prüft Task, Git-Stand und Nutzerauftrag vor weiteren Änderungen.

## Nächster konkreter Schritt

Claude führt `npm run agent:context -- TASK-001` aus, liest `AGENTS.md`, `CLAUDE.md` und diese Task-Datei, vergleicht den aktuellen Branch-HEAD mit dem Implementierungsstand `016f9b2` und übernimmt danach die nächste konkrete Nutzeranweisung, ohne die fünf bereits freigegebenen Figuren ohne neues Finding erneut zu bearbeiten.
