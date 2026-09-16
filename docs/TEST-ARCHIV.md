# Einordnung historischer Tests

Stand: 16.09.2026. Die 114 bereits übersprungenen Tests werden nicht als bestandene Alpha-Prüfungen gezählt. Ihre `skip`-Markierungen bleiben zur Dokumentation der früheren Spielmodelle erhalten.

| Bestand | Grund für Archivierung | Aktuelle Prüfung |
|---|---|---|
| Engine: 105 übersprungene Tests | Frühere Ein-Fraktions-Decks, freie Cheerleader-Wahl, ersetzte Kartenwerte und alte Balance-/Replay-Artefakte | `alpha.test.ts`, `champions.test.ts`, `card-effects.test.ts`, `flugphase.test.ts`, `regression.test.ts` und 160 Alpha-Simulationen |
| Server: 3 übersprungene Tests | Altes Cheerleader-Auswahlprotokoll und frühere Persistenzversionen | `server.test.ts` und `alpha-online.test.ts`: Revisionen, Wiederverbindung, neue Speicherfelder, inkompatible Version und Aufgeben |
| Client: 6 übersprungene Tests | Historischer Cheerleader-Reaktionsdialog | Aktiver Champ-Superblock-Test sowie `alpha-actions.test.tsx`, `alpha-replay.test.tsx` und Arena-Tests |

Mechaniken der aktuellen Alpha werden mit ihren heutigen Karten und Verträgen geprüft. Die Zuordnung ist kein Anspruch, dass jeder historische Sonderfall eins zu eins ersetzt wurde. Legacy-Karten bleiben als Datenbestand vorhanden, sind aber weder in den vier Starterdecks noch im freigegebenen Zufallspool.

Neue Fehler werden durch einen aktiven Regressionstest festgehalten; bestehende aktuelle Fehler dürfen nicht durch zusätzliche `skip`-Markierungen verborgen werden.
