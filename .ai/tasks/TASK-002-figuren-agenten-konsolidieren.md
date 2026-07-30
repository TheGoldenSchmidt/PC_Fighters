<!--
Kopfregeln:
- Bestehende Angaben aktualisieren statt fortlaufend anzuhängen.
- Kein Chatverlauf und keine Sitzungschronik.
- Abgeschlossene Arbeit gehört in Git; abgeschlossene Tasks werden gelöscht.
- Nicht verifizierte Annahmen ausdrücklich als Annahmen kennzeichnen.
- Status: planned | in_progress | awaiting_review | changes_requested | ready_to_complete | blocked
-->

# TASK-002: Figuren-Agentenstruktur konsolidieren

## Metadaten

- Task-ID: TASK-002
- Status: changes_requested
- Implementierer: Claude Code
- review_required: true
- adr_required: false

## Übergabe

- Vorheriger Operator: Claude Code (Implementierung)
- Nächster Operator: Claude Code (gezielte Korrektur des bestätigten Review-Findings)
- Handoff-Basis-Commit: a163921 (`master`)
- Aktueller Übergabe-Commit: keiner – uncommitteter Arbeitsbaum auf Branch
  `task-002-figuren-agenten-konsolidieren`. Beide Operatoren arbeiten auf demselben
  lokalen Checkout, sehen also denselben Task-Stand und denselben Diff ohne Commit.

## Kontext

Die Figuren-Rollen waren doppelt definiert: `.claude/agents/*.md` (von Claude Code
geladen) und `.codex/agents/*.toml` (von Codex geladen). Beide Sätze waren
auseinandergelaufen. Zusätzlich existierten zwei Werkstatt-Skills mit je eigener
`LESSONS.md`, die ebenfalls in beide Richtungen gedriftet waren: die Claude-Seite
trug die vollständigeren Rig-Regeln, die Codex-Seite die neueren Erkenntnisse aus
Figurenwelle 2 und TASK-001. Keine Seite war Obermenge der anderen.

Analyse und Migrationsplan wurden zwischen Claude Code und Codex gegengeprüft und
vom Nutzer freigegeben.

## Ziel

Genau eine modellneutrale Quelle je Rolle unter `agents/`, dünne produktspezifische
Adapter unter `.claude/agents/` und `.codex/agents/`, und eine klare Ablage des
Fachwissens nach Zweck (Ablauf, Qualitätsmaßstab, Rig-Fragmente, Versuchsergebnisse,
offene Hypothesen).

## Nicht-Ziele

- Keine Änderung an fachlicher Figurenlogik, Engine, Server, Client.
- Keine Änderung an bestehenden Figurenergebnissen unter
  `packages/engine/src/data/figures/`.
- Keine ADR (siehe `docs/adr/README.md`: Agenten-Governance gehört in `AGENTS.md`).
- Kein Commit; der Nutzer entscheidet über Merge nach `master` oder Verwerfen.

## Akzeptanzkriterien

- `agents/figure-designer.md` und `agents/figure-critic.md` existieren als kanonische,
  modellneutrale Rollendefinitionen.
- `.claude/agents/*.md` und `.codex/agents/*.toml` enthalten nur noch produktspezifisches
  Frontmatter/TOML, Berechtigungen und einen ausdrücklichen Leseverweis auf die
  kanonische Rolle – keine fachlichen Arbeitsabläufe oder Qualitätskriterien.
- `docs/figure-generation/{PLAYBOOK,QUALITY_CRITERIA,PARTS}.md`,
  `docs/figure-generation/experiments/_TEMPLATE.md` und `docs/rfcs/_TEMPLATE.md`
  existieren.
- Belegte Erkenntnisse aus **beiden** `LESSONS.md` sind zusammengeführt; nichts erfunden.
- Offene Hypothesen stehen im Welle-2-Experiment, nicht im Playbook.
- Beide Werkstatt-Skills bleiben ladbar und beziehen den fachlichen Ablauf aus dem
  Playbook; Schritt 8 schreibt in einen Experimentbericht statt in `LESSONS.md`.
- `npm run check` erfolgreich; keine Änderung an Figuren-JSONs.

## Relevante Bereiche

- `agents/`, `.claude/agents/`, `.codex/agents/`
- `docs/figure-generation/`, `docs/rfcs/`, `docs/figuren-welle-2-effizienz.md`
- `.claude/skills/figuren-werkstatt/`, `.agents/skills/figuren-werkstatt/`
- `scripts/snap.mjs`, `AGENTS.md`, `tools/figuren-viewer/README.md`

## Risiken und Annahmen

- **Belegt:** Claude Code lädt `.claude/agents/*.md` – die vier Agenten sind in der
  Implementierungssitzung mit den Frontmatter-Toolrechten registriert.
- **Belegt (durch Codex):** Codex lädt `.codex/agents/*.toml` und den Skill aus
  `.agents/skills/figuren-werkstatt/`. Beide Verzeichnisse bleiben deshalb erhalten.
- **Nicht verifiziert (Annahme):** dass die *ausgedünnten* Adapter weiterhin erkannt
  werden. Muss je Produkt in einer frischen Sitzung geprüft werden; der Implementierer
  konnte nur die Claude-Seite prüfen.
- **Nicht verifiziert (Annahme):** dass Codex `sandbox_mode = "read-only"` in
  `.codex/agents/*.toml` akzeptiert. Von Codex im Konsens vorgeschlagen, vom
  Implementierer nicht testbar.
- **Restrisiko:** `scripts/snap.mjs` wurde verschoben und die Chromium-Auflösung
  portabel gemacht. Das Skript ist von keinem Test abgedeckt und wurde in dieser
  Umgebung nicht ausgeführt (kein laufender Dev-Server, kein Playwright-Chromium).
  Nur statisch geprüft.

## Aktueller Stand

Der erste Review-Durchgang durch Codex ist abgeschlossen. Die Rollen- und
Wissenskonsolidierung ist schlüssig; vor Abschluss ist ein reproduziertes
Windows-Problem in der globalen Playwright-Auflösung zu korrigieren.

## Entscheidungen

- Kanonische Rollen liegen unter `agents/` (modellneutral). `.agents/` bleibt davon
  getrennt das von Codex geladene Skill-Verzeichnis; die Abgrenzung steht in `AGENTS.md`.
- Keine eigenen kanonischen Rollen für Gesicht und Animation. Beide bleiben als
  Laufzeitnamen erhalten und sind Adapter auf die Betriebsmodi 2 und 3 des kanonischen
  Designers. Grund: die drei Scope-Verträge sind der eigentliche Schutz gegen
  Lost-Updates, nicht die Dateitrennung.
- `PARTS.md` bleibt eine eigene Datei (`docs/figure-generation/PARTS.md`), weil
  kopierfertige Rig-Fragmente weder Rolle noch Ablauf sind und laut belegter Lektion
  bei einem Fehler sofort korrigiert werden müssen.
- Offene Hypothesen bleiben im Experiment, aus dem sie stammen, und werden erst nach
  Beleg ins Playbook oder in die Quality Criteria befördert.
- `snap.mjs` wurde nach `scripts/snap.mjs` zentralisiert. Beide Kopien waren
  byte-identisch, und beide `LESSONS.md` nannten bereits fälschlich diesen Pfad.
- Der fest verdrahtete Chromium-Pfad `/opt/pw-browsers/chromium` wurde durch eine
  umgebungsneutrale Auflösung ersetzt (Umgebungsvariable hat Vorrang, sonst
  Playwright-Standardauflösung). Er war auf der Windows-Entwicklungsmaschine ungültig.

## Verworfene Alternativen

- **Vier kanonische Rollen** (zusätzlich `figure-face.md`, `figure-animation.md`):
  widerspricht der Zielvorgabe des Nutzers; die Scope-Trennung wird stattdessen durch
  drei wörtlich getrennte Betriebsmodi erreicht.
- **`PARTS.md` ins Playbook einfalten:** 146 Zeilen JSON-Fragmente hätten das
  Ablaufdokument unlesbar gemacht und den geforderten Korrekturort verwischt.
- **`LESSONS.md`-Umstellung auf einen späteren Task verschieben:** hätte zwei
  konkurrierende Wissenssysteme hinterlassen und die Beförderungslogik unwirksam
  gelassen.
- **`.agents/skills/` oder `.codex/agents/` auflösen:** beide werden von Codex
  tatsächlich geladen.
- **ADR anlegen:** `docs/adr/README.md` schließt Agenten-Governance ausdrücklich aus.

## Geänderte Dateien

Neu:
- `agents/figure-designer.md`, `agents/figure-critic.md`
- `docs/figure-generation/PLAYBOOK.md`, `QUALITY_CRITERIA.md`, `PARTS.md`
- `docs/figure-generation/experiments/_TEMPLATE.md`
- `docs/figure-generation/experiments/2026-07-28-figurenwelle-2-effizienz.md`
- `docs/rfcs/_TEMPLATE.md`
- `.ai/tasks/TASK-002-figuren-agenten-konsolidieren.md`

Verschoben:
- `.claude/skills/figuren-werkstatt/scripts/snap.mjs` → `scripts/snap.mjs`
  (inhaltlich angepasst: portable Chromium-Auflösung, Pfadkommentar)
- `.agents/skills/figuren-werkstatt/scripts/snap.mjs` → entfällt (war byte-identisch)

Ausgedünnt / zu Verweisen gemacht:
- `.claude/agents/figuren-{designer,kritiker,gesicht,animation}.md`
- `.codex/agents/figuren-{designer,kritiker,gesicht,animation}.toml`
- `.claude/skills/figuren-werkstatt/{SKILL,LESSONS,PARTS}.md`
- `.agents/skills/figuren-werkstatt/{SKILL,LESSONS}.md`
- `docs/figuren-welle-2-effizienz.md`

Ergänzt:
- `AGENTS.md` (Sources of Truth, Beförderungsweg, Abgrenzung `agents/` vs `.agents/`)
- `tools/figuren-viewer/README.md`, `scripts/render-card-art.mjs` (Altverweise)

## Review-Findings

### [MEDIUM] Globaler Playwright-Fallback ist unter Windows kein gültiger Import-Specifier

- Datei und Stelle: `scripts/snap.mjs`, `loadChromium()`, Aufbau des globalen
  Kandidaten `${globalRoot}/playwright/index.mjs`.
- Problem: `npm root -g` liefert unter Windows einen absoluten Pfad mit
  Laufwerksbuchstaben. Diesen Pfad direkt an `import()` zu übergeben bricht mit
  `ERR_UNSUPPORTED_ESM_URL_SCHEME` ab; der ESM-Loader verlangt dort eine
  `file://`-URL. Der im Skript dokumentierte globale Fallback ist damit entgegen
  der neuen Plattformzusage nicht Windows-tauglich.
- Auswirkung: Ist Playwright nicht lokal, sondern wie ausdrücklich unterstützt nur
  global installiert, kann das zentrale Montage-Skript unter Windows Chromium
  nicht laden und keine Figurenmontage erzeugen.
- Empfohlene Korrektur: Den absoluten globalen Dateipfad vor `import()` mit
  `pathToFileURL(...).href` aus `node:url` in eine gültige Datei-URL umwandeln und
  den lokalen sowie globalen Auflösungsweg gezielt prüfen. Die gleiche bestehende
  Auflösungslogik in `scripts/render-card-art.mjs` sollte dabei konsistent behandelt
  oder ihre bewusste Abweichung dokumentiert werden.
- Sicherheit der Einschätzung: hoch

## Verifikation

Ausgeführt:

- `npm run check` – erfolgreich (Typen, Tests, Produktionsbuild, Aktualität des
  Figuren-Viewers). Meldung: „Alle Prüfungen erfolgreich; der Git-Arbeitsbaum blieb
  unverändert."
- `node --check scripts/snap.mjs` – Syntax in Ordnung.
- `git diff --check` und `git diff --cached --check` – keine Whitespace-Fehler.
  Git meldet erwartungsgemäß LF→CRLF für neu geschriebene Textdateien.
- Strukturprüfung aller acht Adapter: Claude-Frontmatter vollständig (`name` gleich
  Dateiname, `description`, `tools`, `model`), Codex-TOML mit balancierten
  `"""`-Blöcken, ohne Backslash-Escapes, `sandbox_mode = "read-only"` beim Kritiker
  gesetzt; jeder Adapter verweist auf seine kanonische Rolle und bleibt unter
  40 Zeilen Body.
- Beide `SKILL.md` mit gültigem Frontmatter und Playbook-Verweis.
- Referenzsuche: keine `.Codex/`-Pfade mehr, kein Verweis auf den alten
  `skills/.../scripts/snap.mjs`-Pfad, `LESSONS.md` nur noch in den
  Kompatibilitätszeigern selbst und in den Task-Dateien.
- `git status --porcelain | grep packages/` leer – keine Figuren-JSONs, keine
  Engine-, Server- oder Client-Datei berührt.

Zusätzlich im Review durch Codex ausgeführt:

- Frische Codex-Sitzung: alle vier ausgedünnten Adapter wurden registriert; der
  `figuren-kritiker` wurde mit read-only-Rolle angeboten. Damit sind Adaptererkennung
  und Akzeptanz von `sandbox_mode = "read-only"` für Codex praktisch bestätigt.
- `npm.cmd run check`: innerhalb der Dateisystem-Sandbox nur am erwartbaren Zugriff
  des temporären AppData-Buildziels gescheitert; unveränderte Wiederholung außerhalb
  dieser Begrenzung vollständig erfolgreich (Typen, 146 Tests, temporärer
  Produktionsbuild, Viewer-Aktualität; Arbeitsbaum unverändert).
- Windows-Reproduktion des globalen Importpfads: direkter dynamischer Import von
  `C:\\...\\playwright\\index.mjs` endet mit
  `ERR_UNSUPPORTED_ESM_URL_SCHEME`; `node --check scripts/snap.mjs` bleibt grün.

Nicht ausgeführt, mit Begründung:

- **Erkennung der ausgedünnten Claude-Adapter in einer frischen Claude-Sitzung.** Die
  Implementierungssitzung hatte die *alten* Definitionen bereits geladen; eine
  Neuregistrierung findet innerhalb einer laufenden Sitzung nicht statt. Die
  Codex-Seite ist im Review inzwischen praktisch bestätigt. Ersatzprüfung für die
  Claude-Seite: die oben genannte Strukturprüfung. Restrisiko: ein Claude-seitiger
  Formatfehler, den die Strukturprüfung nicht kennt.
- **`scripts/snap.mjs` real ausgeführt.** Erfordert laufenden Dev-Server, Vite-Client
  und ein installiertes Chromium; keines davon war in dieser Umgebung verfügbar.
  Ersatzprüfung: Syntaxprüfung und statischer Vergleich mit der bisherigen Fassung –
  geändert wurden nur Kopfkommentar und Chromium-Auflösung, die Rendering- und
  Montagelogik ist unverändert. Restrisiko: die neue Auflösung ist ungetestet.

## Offene Punkte

- Globalen Playwright-Fallback unter Windows auf eine gültige `file://`-URL
  umstellen und gezielt prüfen.
- `scripts/snap.mjs` bei nächster Gelegenheit einmal real ausführen.

## Nächster konkreter Schritt

Claude Code korrigiert ausschließlich den bestätigten Playwright-Fallback, führt die
gezielten Importprüfungen sowie `npm run check` erneut aus und übergibt denselben Diff
danach zur kurzen Nachprüfung an Codex.
