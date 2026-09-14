# Branch-Konsolidierung vom 14.09.2026

Ausgangsbasis: `master` und `origin/master` auf `a7deaea`. Remote-Refs wurden
vor der Prüfung mit `git fetch origin --prune` aktualisiert. Es gab keine Stashes.
Der Hauptordner stand auf `codex/humanoid-card-art`; `master` war im sauberen
Worktree `tmp/login-fix-worktree` ausgecheckt.

## Übernommene Arbeit

| Branch / Quelle | Ergebnis |
| --- | --- |
| `codex/humanoid-card-art` | Bereits bis `bbaeb30` in master; zusätzlich lokale Viewer-Erweiterung und zehn Standalone-Figuren mit `166fc62` gesichert und übernommen. |
| `codex/golden-master-klaerung` und `claude/basis-schild-spielmechaniken-rvqbkc` | Bank ohne Lehne, größere Bankanker, sichtbare Wertänderungen, ruhigeres Replay und gemeinsames Timing übernommen. Aktuelle Reveal-Ereignisse bleiben erhalten. Acht Schildsegmente und fünf Bahnen waren bereits aktuell. |
| Golden-Master-Test / Generator | Die alten Alpha-Referenzen durch 30 deterministische Paarungen der sechs aktuellen Champs ersetzt; der bisher deaktivierte Test läuft wieder. |
| `codex/champ-cheerleader-superpowers` | Inhalt bereits vollständig durch Squash-Commit `a1366a4` (PR #21) übernommen: der Vergleich mit `548f24a` ist leer. Historie wird als integriert verknüpft. |
| `claude/expand-gameplay-tests-ea63w7` (PR #9) | Fixtures, Durchspiel-/Flugtests und die Bewegungsprüfung wurden seit `c279f0c`, `a1366a4` und `bbaeb30` weiterentwickelt. Die aktuelle Champ-Fassung bleibt maßgeblich; Tests für entfernte Legacy-Karten werden nicht zurückgespielt. |
| `claude/stahlgiesser-viewer-233rko` (PR #5) | Lektionen zum Nachweis des ausgelieferten Datenstands und zur Farberhaltung mit emissive sind bereits in der konsolidierten Werkstatt enthalten. Ergänzungen werden in deren heutiger Struktur bewahrt. |
| `codex/ux-gamification-overhaul` | Remote-Stand bereits über PR #20 enthalten. Der zusätzliche lokale Commit `43d576d` betrifft ersetzte Alpha-Decks, alte Referenzen, historische Berichte und eine inzwischen überholte Entscheidung, den Viewer nicht zu versionieren. Aktuelle Champ-Decks und direkt nutzbarer versionierter Viewer bleiben erhalten; der alte Commit bleibt über die Merge-Historie erreichbar. |

Der frühere StartScreen-Test der freien Cheerleader-Auswahl wurde an die aktuelle
Champ-Auswahl angepasst. Die aktuellen Login-/Champ-APIs und deren Dokumentation
bleiben erhalten; Server- und Typkonflikte betrafen nur alte Kommentarformulierungen.
Die in PR #9 ergänzte Unterscheidung ungültiger Bewegungsziele wird mit der
aktuellen Karte `smoke_bomb` aktiv geprüft; die alte Karte `hetzjagd` existiert
im aktuellen Set nicht mehr. Der damalige Test, der die Abwesenheit von
Cheerleader-Opferereignissen erwartete, ist durch die heutigen Regeln überholt.
Aus `43d576d` wird außerdem die direkte Entwicklungsabhängigkeit `esbuild`
übernommen, die der Viewer-Build verwendet. Die Version 0.28.1 war bereits im
Lockfile vorhanden; die übrigen Paketauflösungen bleiben unverändert.

## Bereits vollständig in master enthalten

`codex/figure-variants`, `codex/identity-catalog`, `codex/individual-humanoids`,
`codex/optional-user-login`, `codex/rename-themed-decks` sowie die Remote-Branches
`claude/arena-layout-cards-dnd-l0qt06`, `claude/aufraeumen-und-bundle`,
`claude/bot-sieht-schild`, `claude/gamification-ui-redesign-e4g9jw`,
`claude/lanes-und-zermuerbung` und `claude/schild-cheerleader-kopplung`.

## Bewusst erhaltene Archive und lokale Dateien

- `archiv/figuren-wissen-kanonisierung`, `archiv/wildkatze-und-task-001` und
  `backup/vor-ki-rollback-2026-07-29` bewahren zurückgestellte Arbeit. Der
  Archiv-Commit `7ba16e8` ist ausdrücklich als nicht für master bestimmt markiert.
  Diese Stände werden nicht als aktuelle Produktänderungen reaktiviert.
- `backup/master-vor-konsolidierung-2026-09-14` sichert den vorherigen master.
- `artifacts/` und `tmp/` bleiben lokal erhalten und werden jetzt ignoriert.
  Sie enthalten Vorschaubilder, Prüfskripte, temporäre Abhängigkeiten und den
  zusätzlichen Worktree. Es werden keine lokalen Dateien gelöscht.
- Bestehende Branch-Namen werden nicht gelöscht; integrierte Branches bleiben
  nachvollziehbar. Maßgeblich für neue Arbeit ist `master`.

## Prüfung

Die Zusammenführung wurde auf `codex/konsolidierung-2026-09-14` vorbereitet.
Alle geprüften Entwicklungsbranches sind im Ergebnis als Vorfahren enthalten;
ausgenommen bleiben ausschließlich die oben genannten Archive und das alte Backup.

- `npm run typecheck`: erfolgreich.
- `npm test`: 190 bestanden, 114 bestehende Legacy-Tests übersprungen.
- Anschließend ergänzte Bewegungsregression: alle 26 aktuellen Karteneffekt-Tests
  bestanden, darunter der neue Fall. Damit ist ein weiterer aktiver Test abgesichert.
- `npm run build`: erfolgreich; bestehender Hinweis auf den großen, separat
  geladenen Three.js-Chunk.
- `node tools/figuren-viewer/build-viewer.mjs`: erfolgreich und ohne inhaltlichen
  Unterschied zum gesicherten Viewer, einschließlich der zehn neuen Figuren.
- `git diff --check`: keine Fehler; Arbeitsverzeichnis sauber.

Es wurden keine alten Branches, Archivstände, Stashes oder lokalen Artefakte gelöscht.
