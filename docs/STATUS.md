# Projektstatus

Zentrale Übersicht über den aktuellen Arbeitsstand. Detaildokumente beschreiben
das Verhalten; diese Datei hält fest, was fertig ist und was als Nächstes folgt.

Stand: **2026-08-01** · Ausgangsbasis: `master` @ `09501de`

## Erledigt

### Spiel, Arena und Cheerleader

- Der Cheerleader-Meilenstein ist vollständig integriert. Die Bank ist zugleich
  der Basis-Schild; ein Block verlangt genau ein Opfer und kann nicht abgelehnt
  werden.
- Alle fünf Kräfte sind datengetrieben. Engine, Client, Replay, Bot, Statistik,
  Reconnect und versionierte Raumpersistenz unterstützen den gesamten Ablauf.
- Das Spielfeld verwendet standardmäßig fünf Bahnen; pro Raum sind drei bis
  sechs Bahnen wählbar. Zermürbung beginnt ab Runde 15.
- Die Arena ist bildschirmfüllend und unterstützt Drag-and-drop. Three.js und
  das 3D-Schlachtfeld werden erst bei Bedarf geladen.

### Konsolidierung vom 1. August

- Die wertvollen Änderungen aus `origin/claude/expand-gameplay-tests-ea63w7`
  wurden selektiv auf den heutigen Regelstand übertragen: neun Flugphasen-Tests,
  ein vollständiger Bot-Durchlauf mit Sicht-/Replay-Prüfung und der präzisere
  Fehlerpfad für `moveCreature`.
- Gemeinsame Engine-Testhelfer liegen in `packages/engine/test/helpers.ts`.
- Der generierte Standalone-Figurenviewer wird nicht mehr versioniert. Er lässt
  sich jederzeit mit `node tools/figuren-viewer/build-viewer.mjs` erzeugen.
- Status und Cheerleader-Detaildokument entsprechen wieder der tatsächlich
  implementierten Schild-Regel.

## Qualität

| Prüfung | Stand 2026-08-01 |
|---|---|
| Engine-Tests | 188 grün |
| Server-Tests | 19 grün |
| Client-Tests | 12 grün |
| Gesamt | 219 Tests grün |
| `npm run typecheck` | alle Workspaces fehlerfrei |
| `npm run build` | grün; großer 3D-Chunk wird nur bei Bedarf geladen |
| CI | Tests, Typecheck, Build und deterministischer Backtest-Smoke |

## Balancing – abgenommener Stand

Vollständiger sitzplatzgespiegelter Lauf am 2026-08-01: **4.200 Partien** über
21 Matchups, 100 Partien je Sitzordnung, Saat `20260801`, Botprofil
`ausgewogen`. Der strenge Lauf erfüllt sämtliche automatischen Zielkorridore.

Reproduzierbar mit:

```text
npm run backtest -- --spiele=100 --zufalls-basis=30 --saat=20260801 --streng --out=backtest-results/mein-lauf
```

| Kennzahl | Ergebnis | Ziel |
|---|---:|---:|
| Durchschnittliche Spieldauer | 9,92 Runden | 7–10 |
| Zermürbung erreicht | 9,0 % | höchstens 10 % |
| Startspieler-Siege | 49,7 % | höchstens 54 % |
| Technische Notbremse | 0,0 % | 0 % |
| Animals | 51,4 % | 47–53 % |
| Humans | 48,6 % | 47–53 % |

Deckwerte gegen das gesamte Feld:

| Deck | Winrate | 95-%-Konfidenzintervall |
|---|---:|---:|
| `a1_rudeljaeger` | 52,5 % | 49,7–55,4 % |
| `a2_luftangriff` | 56,5 % | 53,7–59,3 % |
| `a3_gift_urgewalt` | 46,2 % | 43,3–49,0 % |
| `a4_urzeitliches_rudel` | 47,6 % | 44,8–50,4 % |
| `h1_solidaritaet` | 46,4 % | 43,6–49,2 % |
| `h2_schicht` | 53,1 % | 50,3–55,9 % |
| `h3_campus` | 47,6 % | 44,8–50,5 % |

Die automatischen Deckkorridore bewerten das Konfidenzintervall, nicht nur den
Punktschätzer. `a2_luftangriff` bleibt deshalb der wichtigste Kandidat fürs
menschliche Playtesting. Botwerte sind eine Regressionshilfe und ersetzen keine
taktischen Partien mit Menschen.

Umgesetzt wurden 12 statt 15 Basisleben sowie behutsame Anpassungen der sieben
Preset-Decklisten. Kartenregeln und individuelle Kartenwerte blieben dabei
unverändert.

## Noch offen

- Cheerleader-Kräfte mit Menschen testen. Der Bot bevorzugt PC Principal und
  Alter Wissenschaftler deutlich; PC Babies, Randy Marsh und Junger Neffe sind
  im Botmodell seltener die beste Wahl.
- Große Module weiter zerlegen: Auflösungslogik aus `game.ts`, Raum/Persistenz
  aus `server.ts`, Welt/Teamzonen/Effekte aus `Battlefield3D.tsx`.
- Figurenwissen aus `archiv/figuren-wissen-kanonisierung` später selektiv in
  neutrale Dokumente und dünne Werkzeugadapter überführen.
- Figuren und Kartenbilder separat vervollständigen; sie blockieren die
  Regel-/Technikarbeit nicht.

## Assets

| Inhalt | Stand |
|---|---|
| Karten | 87 (81 Kreaturen, 6 Aktionen) |
| Kreaturen mit individueller 3D-Figur | 46 / 81 |
| Karten mit 2D-Artwork | 18 / 87 |

Fehlende Figuren verwenden den Golem-, fehlende Bilder den Emoji-Fallback. Die
geprüfte Wildkatze liegt in `origin/archiv/wildkatze-und-task-001`, nicht in
`master`.

## Branch- und Archivstatus

- `origin/claude/expand-gameplay-tests-ea63w7`: relevante Teile sind jetzt
  selektiv übernommen; der alte Branch ist kein Mergeziel.
- `archiv/figuren-wissen-kanonisierung`: aufbewahrte Vorarbeit, kein Mergeziel.
- `origin/archiv/wildkatze-und-task-001`: später nur die Figur selektiv
  übernehmen.
- `origin/claude/stahlgiesser-viewer-233rko`: ältere, wahrscheinlich überholte
  Lektionen; nicht pauschal mergen.
- Bereits gemergte Remote-Feature-Branches enthalten keine Änderungen, die
  `master` fehlen.
