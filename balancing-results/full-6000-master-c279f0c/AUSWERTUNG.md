# Auswertung des 6.000-Spiele-Laufs

Basis: `master`-Commit `c279f0c`, Saat `20260802`, fünf Lanes, vier aktive
Decks, sechs Nicht-Spiegel-Matchups, beide Startpositionen, je 500 Partien.

## Technische Abnahme

- 6.000 von 6.000 Partien beendet, 0 Simulationsfehler.
- Alle Decks: exakt 20 Karten, zwei Heroes und ein PC Principal.
- Durchschnitt: 12,00 Runden; 295 Unentschieden (4,92 %).
- Startspieler-Winrate unter entschiedenen Partien: 52,29 %.
- Höchste Ausspielrate: 99,41 % (`generalstreik`); keine Rate über 100 %.
- `firstHero` wurde in 5.728 Partien erfasst.

## Decks

| Deck | Winrate | 95-%-Intervall | Unentschieden |
|---|---:|---:|---:|
| Urzeitliche Kolosse | 69,69 % | 68,03–71,36 % | 2,00 % |
| Forschung & Muskelkraft | 58,54 % | 56,73–60,35 % | 5,53 % |
| Rudeljäger | 55,29 % | 53,47–57,11 % | 4,87 % |
| Solidarität & Überleben | 15,06 % | 13,73–16,39 % | 7,27 % |

Kombinierte Sitzordnungen:

| Matchup | Winrate des erstgenannten Decks | Ø Runden |
|---|---:|---:|
| Forschung vs. Rudeljäger | 53,28 % | 11,33 |
| Forschung vs. Solidarität | 88,96 % | 14,95 |
| Forschung vs. Kolosse | 35,54 % | 10,33 |
| Rudeljäger vs. Solidarität | 74,15 % | 13,88 |
| Rudeljäger vs. Kolosse | 46,13 % | 9,07 |
| Solidarität vs. Kolosse | 8,62 % | 12,43 |

Partien mit Solidarität dauern 13,75 Runden und enden zu 7,27 % unentschieden.
Ohne Solidarität sind es 10,24 Runden und 2,57 % Unentschieden. Das langsame
Gesamttempo ist deshalb überwiegend ein Deckproblem, kein Anlass für eine
globale Änderung an fünf Lanes, Basisleben oder Zermürbung.

## Diagnose

`Solidarität & Überleben` belegt sogar mehr Lanes als jedes andere Deck
(rund 56 %), verursacht aber nur 5,33 Basisschaden pro Partie und lässt im
Mittel 50,26 Energie ungenutzt. Es produziert viele widerstandsfähige, schwach
angreifende Körper und kann den gewonnenen Zeitvorteil nicht in einen Sieg
umwandeln. `Generalstreik` wird zu 99,41 % ausgespielt und entfernt im Mittel
etwa 7,22 ATK; noch mehr Kontrolle ist daher nicht die fehlende Komponente.

`Urzeitliche Kolosse` nutzt 70,8 % seiner Energie und verursacht 11,06
Basisschaden pro Partie. Gegen die beiden anderen konkurrenzfähigen Decks liegt
es kombiniert bei ungefähr 59,1 %, nicht bei 69,7 %. Es ist also zu stark,
aber der extreme Gesamtwert wird durch das einseitige Solidaritäts-Matchup
verstärkt. Besonders effizient sind die drei Sieben-Kosten-Finisher und die
Kombination aus `wilder_instinkt` und Wucht.

`Forschung & Muskelkraft` und `Rudeljäger` sollten vorerst nicht geschwächt
werden. Ohne das schwache Solidaritäts-Matchup liegen sie gegen das übrige Feld
nur bei ungefähr 44,2 % beziehungsweise 46,4 %.

## PC Principal

Im Hauptlauf wurde PC Principal 8.086-mal ausgespielt. Pro Ausspielen traf er
im Mittel 3,51 Ziele, entfernte 8,79 ATK und rund 17,9 Brettwert. 1.081 Siege
folgten innerhalb von höchstens zwei Runden. Die frühere kontrollierte
Mit-/Ohne-PC-Serie ergab für die einzige Seite mit PC Principal etwa 65,4 %
Siege. Dieser Vergleich ist leicht durch die jeweilige Ersatzkarte
mitbeeinflusst, der Ausschlag ist aber groß genug für eine eigene Nachprüfung.

Da alle vier veröffentlichten Decks PC Principal enthalten, erklärt er nicht
die relative Deckspreizung. Er ist dennoch sehr spielentscheidend.

## Empfohlene Reihenfolge

1. Vor Kartenänderungen einen kleinen Sensitivitätslauf mit größerer
   Aktionssuch-Tiefe (zum Beispiel 5 statt 3) ausführen. Das billige
   Solidaritätsdeck könnte durch die aktuelle Dreier-Suchtiefe stärker
   benachteiligt sein als die teuren Kolosse.
2. Bleibt Solidarität deutlich unter 40 %, zwei Kontroll-/Defensivplätze in
   echte Siegbedingungen umwandeln. Erster, gut isolierbarer Decklistenversuch:
   `generalstreik` 2→1 und `pfandsammler` 1→0; dafür `ritter` 1→2 und
   `kommandantin` 1→2. Dadurch bleiben Thema, Kartenzahl, Heroes und Principal
   erhalten, während Kurve und Abschlussdruck steigen.
3. Kolosse zunächst nur leicht über die Deckliste dämpfen:
   `wilder_instinkt` 2→1 und `pteranodon` 1→2. Erst wenn das Deck nach dem
   Solidaritätsumbau weiterhin über 60 % liegt, einen Finisher ändern – als
   kleinster Eingriff zunächst T-Rex von Kosten 7 auf 8 testen.
4. PC Principal separat testen, nicht zusammen mit den Deckumbauten. Erster
   Versuch: Kosten 6→7 bei unverändertem Effekt. Bleibt die alleinige
   PC-Seite deutlich über 58 %, anschließend entweder den Deckel von 0/1 auf
   1/2 abschwächen oder höchstens drei Ziele treffen lassen, aber nicht beide
   Änderungen gleichzeitig.
5. Jede Stufe zunächst wieder mit 100 Partien je Konfiguration prüfen. Erst
   nach einem stabilen Korridor folgt der nächste 6.000er-Lauf.

## Infrastrukturhinweis

Die Profile `standard`, `aggressive` und `control` funktionieren; die frühere
4.800-Partien-Validierung bestätigt dieselbe Deckreihenfolge auch mit Aggro-
und Kontrollbot. Mehrere Felder unter `bots` sowie `maxSimulationDepth` und
`decisionTimeoutMs` in `balancing.config.json` werden vom Runner derzeit jedoch
nicht ausgewertet. Diese scheinbaren Stellschrauben sollten entweder verbunden
oder entfernt werden, bevor darüber Botverhalten kalibriert wird.
