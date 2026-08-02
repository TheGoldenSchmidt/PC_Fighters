# Automatisiertes Balancing

Das Balancing-System spielt echte PC-Fighters-Partien ohne Client oder
WebSocket-Server. Es lädt bei jedem Lauf die validierten Karten, Decks und die
aktuelle Konfiguration aus `packages/engine/src/data/`. Kartenwerte und Effekte
werden nicht im Simulator nachgebaut.

## Aktive Alpha-Decks

`packages/engine/src/data/deck-status.json` ist die einzige Freischaltliste.
Aktuell aktiv sind:

- `rudeljaeger`
- `urzeitliche_kolosse`
- `solidaritaet_ueberleben`
- `forschung_muskelkraft`

Alle anderen Dateien unter `data/decks/` bleiben erhalten, werden aber weder vom
Serverkatalog noch im Startbildschirm als Auswahl angeboten. Der Server lehnt
eine manipulierte Preset-Auswahl ebenfalls ab. Zur späteren Freischaltung genügt
eine Änderung in `deck-status.json`.
Eigene/importierte Decks bleiben im Browser gespeichert, sind während dieser
Phase aber ebenfalls ausgegraut. `allowCustomDecks: true` schaltet sie später
wieder frei.

Die vier Deckdateien selbst sind absichtlich nicht in einer zweiten
Simulator-Konfiguration dupliziert. Laufendes Rebalancing an diesen Dateien
fließt dadurch automatisch in den nächsten Lauf ein.

## Verbindlicher Alpha-Vertrag

Die vier aktiven Dateien entsprechen den vereinbarten Listen. Beim Laden wird
zusätzlich geprüft: 20 Karten, höchstens zwei normale beziehungsweise eine
Signaturkarte, exakt zwei Heroes und exakt ein PC Principal.

Für diese Alpha ist `allowDeckOverlap: true` gesetzt: Eine Sonderfigur darf
gleichzeitig als Kartenkopie im Deck und als Figur auf der Cheerleader-Bank
vorkommen. Räume und Balancing-Läufe verwenden dauerhaft genau fünf Lanes;
`--lanes=5` bleibt lediglich für bestehende Aufrufe kompatibel.

Die Kartenstatistik ordnet Aktionskarten gewährte/entfernte ATK und HP,
erzeugte Tokens und Bewegungen sowie tatsächlich entstandenen Buff-Zusatzschaden
zu. `firstHero` speichert Spieler, Hero-ID und Runde. Ein Lauf wird als kritisch
markiert, sobald mehr Ausspielvorgänge als physische Ziehinstanzen auftreten.

## Architektur

1. `getLegalActions` liefert die vollständige Menge legaler Aktionen.
2. Der Bot wählt nur daraus und führt nie direkte Zustandsänderungen aus.
3. `applyAction` validiert und berechnet jeden einzelnen Schritt mit der echten
   Engine.
4. Die One-Turn-Beam-Search kann mehrere Karten bis zum Zugende kombinieren.
5. Ein expliziter Seed steuert Mischen, Ziehen, Engine-Zufall und Bot-Auswahl.
6. Jeder Aktionsschritt erhält einen Zustands-Fingerabdruck. Replays werden aus
   Seed und Aktionen neu ausgeführt und an jedem Fingerabdruck geprüft.
7. Match-Tasks teilen keinen Zustand. Ihre Seeds hängen nicht von Workerzahl
   oder Fertigstellungsreihenfolge ab; bis zu vier Worker laufen parallel.

Die Botbewertung ist kartenblind: Sie bewertet öffentliche Basis-, Schild-,
Bank-, Board-, Energie- und Handgrößenwerte. Gegnerische Handkarten und
Deckreihenfolgen werden nicht gelesen oder bewertet. Die eigene Hand wird nur
über die legalen Aktionen der Engine verwendet.

## Botprofile

- `standard`: ausgeglichen, Board und Basisschaden
- `aggressive`: Basisschaden, Tempo und offene Lanes
- `control`: Überleben, Boardkontrolle und Kartenvorteil
- `random`: zufällige Kontrollgruppe, ausschließlich legale Aktionen

Die historischen IDs `ausgewogen`, `aggro`, `kontrolle` und `zufall` bleiben
für bestehende Backtests verfügbar.

## Befehle

Technischer Lauf mit 100 Partien je Startseite, Matchup und Botkonfiguration:

```bash
npm run balance:technical
```

Hauptlauf mit sechs Matchups, beiden Startseiten und 500 Partien (6.000):

```bash
npm run balance:full
```

Gezielter Lauf:

```bash
npm run balance -- --mode=full --deck-a=rudeljaeger --deck-b=solidaritaet_ueberleben --bot-a=aggressive --bot-b=control --games=100 --lanes=5
```

PC-Principal-Serien ohne/mit/beidseitig/einseitig erzeugten Varianten:

```bash
npm run balance:pc
```

Replay prüfen:

```bash
npm run balance:replay -- balancing-results/<lauf>/replays/<match>.json
```

CLI-Optionen sind unter anderem `--seed`, `--games`, `--workers`, `--out`, `--lanes`,
`--mirrors`, `--no-mirrors`, `--bot-a` und `--bot-b`. Die zentralen Defaults
und Warnschwellen stehen in `scripts/balancing/balancing.config.json`.

## Ausgabe

Jeder Lauf erzeugt:

- `summary.json`
- `matches.jsonl`
- `deck_matchups.csv`
- `card_statistics.csv`
- `round_statistics.csv`
- `match_statistics.csv`
- `pc_principal_statistics.csv`
- `lane_statistics.csv`
- `anomalies.json`
- `report.md`
- `replays/*.json` für automatisch markierte Partien

Erfasst werden Matchup-, Startspieler-, Deck-, Karten-, Runden-, Lane-,
Energie-, Basis-, Board- und PC-Principal-Kennzahlen. Abstürze, Rundenlimit,
frühe Siege, hoher Rundenschaden und auffällige PC-Principal-Einsätze werden
markiert.

## Grenzen der ersten Version

- Die Aktionssuche plant den eigenen Zug, aber noch keine vollständige beste
  Gegnerantwort (kein Zwei-Halbzüge-Minimax).
- Verhinderter Schaden ist nur dort exakt, wo die Engine ihn bereits als
  Telemetrie ausweist; hypothetisch vermiedener Schaden wird nicht geschätzt.
- PC-Principal-Serien entfernen ihn für `__ohne_pc` tatsächlich aus der
  regulären Liste und ersetzen ihn durch eine zulässige zweite normale Kopie.
