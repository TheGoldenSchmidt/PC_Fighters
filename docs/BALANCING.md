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

## Abgenommener Alpha-Stand vom 2. August 2026

Der finale Hauptlauf umfasst 6.000 fehlerfreie Partien mit 500 Partien je
Startseite und Paarung. Alle vereinbarten Zielkorridore werden eingehalten:

| Messung | Ergebnis | Ziel |
|---|---:|---:|
| Forschung und Muskelkraft | 48,4 % | 45–55 % |
| Rudeljäger | 49,1 % | 45–55 % |
| Solidarität und Überleben | 49,9 % | 45–55 % |
| Urzeitliche Kolosse | 52,6 % | 45–55 % |
| Menschen / Tiere in Kreuzpaarungen | 48,68 % / 51,32 % | je 47–53 % |
| Startspieler | 50,11 % | höchstens 54 % |
| Durchschnittliche Rundenzahl | 9,35 | 7–10 |
| Remis | 0,82 % | Beobachtungswert |
| Rundenlimit erreicht | 0,00 % | unter 10 % |
| Höchste Kartenausspielrate | 96,16 % | höchstens 100 % |

Die sechs Paarungen liegen zwischen 42,51 % und 53,90 % für die jeweils zuerst
genannte Seite. Eine zusätzliche technische Serie mit 8.000 Partien ergab ohne
Zufallsbot 49,01–52,69 % je Deck. Aggro gegen Standard lag bei 47,67 %,
Standard gegen Kontrolle bei 48,50 %. Beide Profile erzeugen damit keinen
verdeckten Strategievorteil.

PC Principal wurde separat mit 4.800 Partien geprüft. In den beiden
einseitigen Serien gewann die PC-Seite 57,19 % beziehungsweise 54,10 %; beide
Seiten bleiben unter der 60-%-Grenze. Pro Ausspielen wurden durchschnittlich
3,39 Ziele und 10,99 Boardwert erfasst. Seine Deckkarte kostet 6 Energie, ist
3/4 und deckelt bereits ausliegende Gegner dauerhaft auf 2 ATK / 3
Verteidigung. Die eigenständige Cheerleader-Kraft „Machtwort“ bleibt davon
unberührt.

Für diesen Stand wurden außerdem 10 Basisleben, fünf feste Lanes und fünf
Botaktionen pro Zug verwendet. Der Tyrannosaurus Rex kostet 8 Energie. Die
Kartenstatistik weist Buff-Kreaturenschaden (3.854), Buff-Basisschaden (1.108),
erzeugte Werte und Tokens der verursachenden Karte zu; keine Ausspielrate liegt
über 100 %.

## Grenzen der ersten Version

- Die Aktionssuche plant den eigenen Zug, aber noch keine vollständige beste
  Gegnerantwort (kein Zwei-Halbzüge-Minimax).
- Verhinderter Schaden ist nur dort exakt, wo die Engine ihn bereits als
  Telemetrie ausweist; hypothetisch vermiedener Schaden wird nicht geschätzt.
- PC-Principal-Serien entfernen ihn für `__ohne_pc` tatsächlich aus der
  regulären Liste und ersetzen ihn durch eine zulässige zweite normale Kopie.
