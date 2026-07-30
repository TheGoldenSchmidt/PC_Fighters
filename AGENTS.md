# Project overview

PC Fighters ist ein deutsches, serverautoritäres 1-gegen-1-Kartenspiel in drei npm-Workspaces. Engine, Server und Client bleiben strikt geschichtet; der Server besitzt den vollständigen Spielzustand und sendet nur gefilterte `ClientView`s.

# Repository map

- `packages/engine`: Regeln, Typen, Datenladen/-validierung und Tests; ohne Netzwerk oder UI.
- `packages/server`: WebSocket-Räume, Persistenz und Weitergabe gefilterter Views.
- `packages/client`: React/Vite-Oberfläche und Wiedergabe der Engine-Ereignisse.
- `packages/engine/src/data`: Karten, Decks, Figuren, Animationen, Fraktionen, Themen und Konfiguration.
- `scripts`: read-only Prüf-/Briefingwerkzeuge sowie ausdrücklich mutierende Generatoren und Backtests.
- `tools/figuren-viewer`: eigenständiger Viewer samt Template, Builder und versionierter Ausgabe.
- `.ai/tasks`: versionierter Zustand ausschließlich aktiver, reviewpflichtiger Aufgaben.
- `agents`: kanonische, modellneutrale Rollendefinitionen. Nicht zu verwechseln mit `.agents/skills`, dem von Codex geladenen Skill-Verzeichnis.
- `.claude/agents` und `.codex/agents`: dünne produktspezifische Adapter auf `agents/`; `.claude/skills` und `.agents/skills`: produktspezifische Skill-Einstiegspunkte.
- `docs/figure-generation`: Playbook, Qualitätskriterien, Teile-Bibliothek und Experimentberichte der Figurenerstellung.
- `docs/adr`: langlebige Architekturentscheidungen; `docs/rfcs`: kontroverse größere Änderungen vor der Umsetzung; `docs/regelwerk-v2.md`: Balancing-Vorgaben.

# Commands

- `npm run server` / `npm run client`: lokale Entwicklung auf Port 3000 / 5173.
- `npm test`: Engine- und Server-Tests einschließlich strukturierter Spieldaten.
- `npm run typecheck`: `tsc --noEmit` in allen Workspaces.
- `npm run check`: kanonische, nicht mutierende Gesamtprüfung (Typen, Tests/Daten, temporärer Build, generierter Viewer).
- `npm run build`: produktiver Client-Build nach `packages/client/dist`.
- `npm start`: produktiver Server; serviert den gebauten Client und hält Spielverbindungen.
- `npm run generate:viewer`: mutierender Fix-Befehl für den generierten Figuren-Viewer.
- Einzeltest: `npx vitest run -t "<Name>" packages/engine/test/engine.test.ts`.
- Es gibt derzeit keinen Formatter- oder Linter-Befehl.

# Sources of truth

- Spielverhalten und öffentliche Typen: `packages/engine/src`; Datenformen immer gemeinsam in `types.ts` und `schema.ts` pflegen.
- Inhalte und Regeln: JSON unter `packages/engine/src/data`; 3D-Figuren primär in `data/figures`, Code-Rigs nur als Legacy-/Fallback-Pfad.
- Netzwerk-/Raumzustand: `packages/server`; UI und Combat-Replay: `packages/client`.
- `tools/figuren-viewer/figuren-viewer.html` ist generiert aus `viewer-template.html`, `build-viewer.mjs`, allen Figuren-JSONs und `animations.json`.
- Karten-PNGs sind entweder durch `render-card-art.mjs` verwaltet oder als `MANUAL_ART` selbst ihre Repo-Rohquelle.
- `package-lock.json` wird aus allen `package.json`-Dateien durch npm erzeugt.
- Agentenrollen: `agents/figure-designer.md` und `agents/figure-critic.md`. Adapter unter `.claude/agents` und `.codex/agents` enthalten nur Frontmatter, Berechtigungen und einen Verweis; fachliche Abläufe und Qualitätskriterien werden dort nicht dupliziert.
- Figurenerstellung: `docs/figure-generation/PLAYBOOK.md` (Ablauf), `QUALITY_CRITERIA.md` (Maßstab), `PARTS.md` (Rig-Fragmente), `experiments/` (belegte Versuche und offene Hypothesen).
- Git enthält abgeschlossene Arbeit; Task-Dateien enthalten nur aktuellen, unfertigen Übergabezustand; ADRs enthalten langlebige Entscheidungen.

Beförderungsweg für Erkenntnisse:

- aktive Arbeit → Task (`.ai/tasks`)
- abgeschlossener Versuch → Experiment (`docs/figure-generation/experiments`)
- wiederverwendbarer Prozess → Playbook
- Qualitätsmaßstab → Quality Criteria
- kontroverse größere Änderung → RFC (`docs/rfcs`)
- langlebige Architekturentscheidung → ADR (`docs/adr`)

Unbelegte Ideen bleiben als offene Hypothese im Experimentbericht und werden erst nach Beleg befördert.

# Verbindliche Regeln

- Fertig bedeutet: `npm run check` war erfolgreich oder jeder nicht ausführbare Teil ist mit Ursache, Ersatzprüfung und Restrisiko dokumentiert.
- Generierte Dateien nie direkt bearbeiten; die Rohquelle ändern und den dokumentierten Generator ausführen.
- Engine-interne relative Imports behalten `.js`-Endungen; Datenformänderungen aktualisieren Typen und Zod-Schema gemeinsam.
- Der Server sendet nie den vollständigen `GameState`; neue Kampfmechaniken emittieren passende Events, neue Eventarten werden im Client-Replay behandelt.
- Nutzertexte und Fehlermeldungen sind Deutsch. Konfigurierbare Lane-Zahlen werden nicht auf drei fest verdrahtet.
- Pro Checkout schreibt gleichzeitig genau ein Implementierer; parallele Ansätze verwenden getrennte Branches oder Worktrees.
- Ein Reviewer verändert im ersten Durchgang keinen Code. Nicht verifizierte Annahmen, bekannte Fehler, übersprungene Tests und ungeprüfte Bereiche werden ausdrücklich benannt.
- Neue oder wesentlich geänderte Dependencies brauchen Begründung und setzen `review_required: true`.
- Das Briefing wird nur auf Nutzeranforderung und für eine konkrete Task ausgeführt; vor einer Operator-Übernahme ist der unten definierte Plan Pflicht.
- `AGENTS.md` wird nur in einer ausdrücklich darauf gerichteten Aufgabe geändert; neue Regeln werden vorgeschlagen statt beiläufig eingeführt.
- Stoppen und Nutzerentscheidung einholen, wenn Prüfung, Source of Truth, Zustands-Backend oder notwendige Entscheidung nicht belegbar ist, Agent-Dateien widersprechen oder eine Änderung destruktiv wäre.

# Heuristiken

- Vor einer neuen Abstraktion prüfen, ob die bestehende Struktur die Aufgabe ausreichend trägt.
- Änderungsumfang nach möglichem Schaden einer unbemerkten Fehlfunktion beurteilen; die Dateianzahl ist nur ein Zusatzsignal.
- Kommentare, Bezeichner und Dokumentation bevorzugt in der bereits verwendeten Sprache und Begriffswelt halten.
- Wiederkehrendes maschinell prüfbares Problem zum Test/Script machen; langlebige Architekturentscheidung zur ADR; qualitativen Rat nur als Heuristik festhalten.

# Rollen und Trigger

- `review_required` und `adr_required` werden unabhängig als `true` oder `false` entschieden.
- `review_required: true`, wenn Regressionen relevant möglich sind, mehrere Fachbereiche betroffen sind, automatische Verifikation nicht genügt, kritischer Zustand betroffen ist oder Dependencies geändert werden.
- `adr_required: true`, wenn zwischen realistischen Alternativen eine langlebige Architektur- oder Grenzentscheidung getroffen wird.
- Sind beide `false`: relevante Dateien prüfen, direkt umsetzen, Teilprüfungen und `npm run check` ausführen; kein Task-Artefakt nötig.
- Bei Reviewpflicht: Task-Datei pflegen, Implementierer und Reviewer trennen, Nutzer startet das Review manuell; keine automatische Agentenschleife.
- Findings sind `accepted`, `rejected` oder `deferred`; die letzten beiden brauchen Begründung. Bestätigte Findings korrigieren und `npm run check` erneut ausführen.
- Review folgt `.ai/REVIEW_PROMPT.md`; ADRs folgen `docs/adr`.

# Zustands-Backend

- `STATE_BACKEND=repo`. Agents wechseln es nicht wegen momentaner Tool-Verfügbarkeit, Netzverbindung oder Authentifizierung.
- Task-Dateien heißen `.ai/tasks/TASK-<id>-<slug>.md` und werden versioniert; `_TEMPLATE.md` ist keine aktive Task.
- Die ID wird vor Beginn durch Nutzer, bestehende Issue-ID oder nächste freie Repo-ID festgelegt; Agents erzeugen nie getrennte IDs für dieselbe Aufgabe.
- Vor dem ersten Operatorwechsel muss die Task-Datei im gemeinsamen Branch sichtbar sein. Ein lokaler uncommitteter Stand ist kein Cloud-Handoff.
- Review beginnt erst, wenn beide denselben Task-Stand und denselben Implementierungs-Diff sehen können.
- Der Nutzer entscheidet über Commit und Push. Commit-Nachrichten aktiver Tasks nennen die Task-ID.
- Beim Abschluss wird die Task-Datei im Abschluss-Commit gelöscht; ohne Commit-Berechtigung löscht der Agent sie im Arbeitsbaum und nennt dies für den Nutzer-Commit. Es gibt kein Task-Archiv.

# Operator-Briefing und Übergabe

- Manueller Aufruf: `npm run agent:context -- TASK-<id>`; das Script versucht zuerst `git fetch --all --prune` und arbeitet bei Fehlern mit dem lokalen Stand weiter.
- Vor Änderungen liest der neue Operator `AGENTS.md`, modellspezifische Hinweise, Task-Datei, relevante ADRs/Findings und prüft Branch, HEAD, Status, Commits/Diff seit Handoff-Basis, staged/uncommitted Änderungen, genannte Dateien und Testresultate.
- Task-Datei ist Übergabehilfe, nicht automatisch Wahrheit. Widersprüche zu Git, Diff oder Code werden benannt; fehlende Gründe werden nicht aus dem Diff erfunden.
- Vor jeder Codeänderung einer übernommenen Task wird exakt dieser Operator-Plan ausgegeben:

```markdown
## Verstandener Ausgangsstand
## Änderungen seit dem letzten Übergabestand
## Dokumentierte Begründungen und verworfene Alternativen
## Übernommene Entscheidungen
## Vorgeschlagene Abweichungen
## Arbeitsplan
## Voraussichtlich betroffene Bereiche
## Geplante Verifikation
## Offene Unsicherheiten und Risiken
```

- Ohne Abweichung steht dort exakt: `Ich führe den bestehenden Ansatz ohne konzeptionelle Abweichung fort.`
- Bei verlangter Übergabe wird die Task-Datei aktualisiert statt chronologisch ergänzt; sie enthält Operatoren, Basis-/Übergabe-Commit, Status, tatsächliche Änderungen/Gründe/Alternativen, Planabweichungen, Prüfungen, Findings, Risiken und nächsten Schritt.

# Definition of done

- Akzeptanzkriterien erfüllt; relevante Tests plus `npm run check` belegt; keine unbemerkte Änderung am Git-Arbeitsbaum.
- Review-/ADR-Trigger korrekt behandelt; Findings und Restrisiken dokumentiert; generierte Artefakte aktuell.
- Bei Task-Artefakt: Status konsistent und Abschlusslöschung vorbereitet; keine Behauptung über nicht ausgeführte Prüfungen.

# Pflege dieser Datei

- Nur belegte, entscheidbare gemeinsame Regeln aufnehmen; qualitative Hinweise unter Heuristiken führen.
- Widersprechende Regeln ersetzen oder präzisieren, nicht nebeneinander ergänzen. Modellspezifisches gehört ausschließlich in die jeweilige Modelldatei.
