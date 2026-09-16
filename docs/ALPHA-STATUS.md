# Vier-Team-Alpha: Arbeitsstand vom 16.09.2026

Die vier Teams sind integriert. Die Alpha ist noch nicht freigegeben; reale Touch-Prüfungen und menschliche Testpartien fehlen.

## Eingebaut

- Vier feste Starterdecks mit 80 Figuren und 32 Aktionen, jeweils 40 Karten. Vier Superkräfte je aktivem Champ bleiben zusätzlich erhalten. Drei ausdrücklich definierte Beschwörungs-Tokens: Pteranodon, Wall-Bewohner und SilverCop.
- 51 zugeordnete bestehende Figurenmodelle; übrige Figuren verwenden benannte Platzhalter. Serienzugehörigkeit und Wolf-/Katzenmerkmale stehen in den Kartendaten.
- Explizite Aktionsregeln, stabile Handkarteninstanzen, individuelle Rabatte, Friedhof, frische Wiederbelebung, Abwerfen und temporäre Zustände. Alle freigegebenen Aktionen und Superkräfte verwenden parametrisierte Effekte.
- Engine-Zielangebote für Oberfläche und Bot, einschließlich beider Team-Up-Plätze und mehrstufiger Auswahlen. Auswahlen lassen sich abbrechen; widersprüchliches Passen und doppelte Serveraktionen sind gesperrt.
- Farbige Aktionsereignisse an tatsächlichen Empfängern, mit geheilter/veränderter Menge und Zwischenständen. Reine Karteneffekte werden als Kartenwirkung statt als Kampf angekündigt.
- Revisionsprüfung, Aufgeben, Wiederverbindung, Persistenzversion 5, Raumfristen und `/health`. Inkompatible Spielstände werden von unbekannten Räumen unterschieden. Tests benutzen eigene Speicherdateien.
- Vier Teams und optionales Profil im Einstieg; fester Deckpool, Passen-Anzeige, Kartenbeschreibung bei Antippen und vergrößerte Ansicht.

## Prüfnachweise

- Vollständiger letzter Testlauf: **341 bestanden** (287 Engine, 34 Server, 20 Client), **114 historische Tests übersprungen**. Einordnung: [TEST-ARCHIV.md](TEST-ARCHIV.md).
- Typecheck über alle drei Pakete erfolgreich. Produktionsbuild erfolgreich; der separat geladene 3D-Chunk erzeugt weiterhin einen Größenhinweis.
- Identitätsaudit erfolgreich: keine harten Datenfehler oder semantischen Konflikte. Kartennamen bleiben innerhalb des Alpha-Pools eindeutig; archivierte Vorgängerkarten dürfen dieselbe Figur separat führen.
- Einzelprüfungen für alle 112 Teamkarten, Tokens und 15 unterschiedliche aktive Superkräfte (eine Kraft wird von zwei Champs verwendet). Gezielte Regressionen prüfen unter anderem volle Hand/Feld, hintere Ziele, Schutzübernahme, Wiederbelebung, Ablaufzeiten, doppelte Karten mit Rabatt, Bewegung/Bonusangriff, Pupa und Spielende während einer Effektfolge.
- 16 deterministische Referenzpartien: sechs Team-Paarungen in beiden Sitzordnungen und vier Spiegelpartien. Zustandsfingerabdrücke umfassen Team-Up, Handinstanzen und offene Auswahlen.
- **160 vollständige Botpartien**, beide Startseiten und Sitzordnungen, ohne technisches Rundenlimit. Ergebnisse: [ALPHA-SIMULATION.md](ALPHA-SIMULATION.md).
- Browserprüfung am 15.09.: Desktop (1280 × 720) und Hochformat-Inhalt (390 × 844 in einer lokalen iframe-Prüfansicht), 3D und 2D. Geprüft: Raumstart, Beitritt, Mulligan, Antippen/Platzieren, direkte Verstärkung mit sichtbarer Wertänderung, Passen/Kampf, zweistufige Wiederbelebung, Aufgeben und Rückspiel auf beiden Seiten. Reload stellte eine laufende Partie wieder her. Dies war keine echte Touch-Prüfung.
- Replay-Test mit Engine-Daten: Heilung erscheint vor anschließendem Buff; der Endzustand wird erst nach der Ereignisfolge übernommen.

## Noch vor Freigabe

1. Echte Touch-Bedienung auf Android und iPhone prüfen, einschließlich Ziehen, langer Texte, Mehrfachauswahl und Verbindungsunterbrechung.
2. Zwölf vollständige menschliche Partien durchführen: jede der sechs Paarungen zweimal mit gewechselter Startseite, jeweils bis zur Revanche.
3. Spielgefühl und Balance anhand dieser Partien abstimmen. Im kleinen Botlauf ist das Tier-Rudel auffällig stark (15:5 gegen Solar Opposites); daraus allein folgt noch keine belastbare Balanceänderung.
4. Erweiterte Browser-Stichproben für Abwerfen, Handrabatte und sämtliche Effektarten einschließlich beider Team-Up-Plätze. Engine-/Clienttests decken diese bereits teilweise ab; eine vollständige visuelle Einzelabnahme aller Karten steht aus.

Zum Festhalten dieser Ergebnisse dient [ALPHA-ABNAHME.md](ALPHA-ABNAHME.md).

## Fortsetzen und reproduzieren

- `npm test`, `npm run typecheck`, `npm run build`.
- `node --import tsx scripts/alpha/check-matchups.ts` erzeugt den Paarungsbericht.
- `node --import tsx scripts/alpha/preview.ts` startet die lokale Vorschau auf Port 3105 ohne private Partienspeicherung. Nach einem Neubau neu starten.
- `node scripts/alpha/portrait.mjs` öffnet auf Port 3106 eine feste Hochformat-Prüfansicht der Vorschau. Sie simuliert keine Touch-Hardware.
- `scripts/alpha/generate.mjs` ist die Quelle des [Kartenkatalogs](ALPHA-KARTEN.md), der Kartendaten und der vier Starterdecks. Das einmalige Integrationsskript wurde entfernt.

Nicht veröffentlicht oder deployed. Keine neuen hochwertigen Figurenmodelle erstellt.
