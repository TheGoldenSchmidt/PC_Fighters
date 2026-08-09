# Arena- und Cheerleader-Erweiterung

> Fortschritt und aktuelle Messwerte stehen in [STATUS.md](STATUS.md). Dieses
> Dokument beschreibt den implementierten Regel- und Technikvertrag.

## Regel

Die drei gewählten Cheerleader bilden zugleich die Basisverteidigung:

1. Eingehender Basisschaden lädt den Schild entsprechend der konfigurierten
   Ladungswerte.
2. Ist der Schild vollständig geladen und mindestens ein Bankplatz besetzt,
   blockt er den nächsten Basistreffer vollständig.
3. Der Block öffnet ein Reaktionsfenster. Der Besitzer muss einen belegten
   Bankplatz wählen; Verzicht ist nicht möglich.
4. Die Engine leert zuerst den Slot, loggt das Opfer, führt die zugehörige
   Superkraft aus und stabilisiert danach Tode und Folgewirkungen.
5. Ohne Cheerleader lädt beziehungsweise blockt der Schild nicht.

Das Opfer kostet weder Energie noch einen normalen Spielzug. Während das
Fenster offen ist, sind alle anderen Aktionen gesperrt. Es gibt keinen Timeout.

## Datenvertrag

`config.cheerleaders` enthält Kandidaten, Auswahlgröße, Deckgrenze und eine
Kraftdefinition für jeden Kandidaten. Jede Kraft besitzt einen deutschen Namen
und Erklärungstext, den Auslöser `schildBlock` sowie eine schema-validierte
Wirkung.

Aktuell implementiert:

- **PC Principal – Machtwort:** Alle gegnerischen Kreaturen werden gepeinigt
  (ATK höchstens 0, Verteidigung höchstens 1).
- **PC Babies – Sicherer Raum:** Die eigene Basis ist für den Rest der Runde
  gegen weiteren Schaden immun.
- **Alter Wissenschaftler – Feldforschung:** Wahl zwischen einer Karte plus
  einem Wissen oder zwei Schaden an jeder gegnerischen Kreatur.
- **Randy Marsh – Handgemenge:** Jede Kreatur auf dem Feld erleidet zwei
  Schaden.
- **Junger Neffe – Zweite Chance:** Alle eigenen Kreaturen werden vollständig
  geheilt und der Spieler zieht eine Karte.

## Engine- und Protokollvertrag

- `GameState.aufloesung` ist eine serialisierbare Schrittliste für Kampf,
  Todesstabilisierung, Schildfenster und Rundenabschluss.
- `GameState.reaktion` hält Reaktions-ID, Besitzer, gültige Slots und den danach
  wieder aktiven Spieler.
- `PlayerAction.cheerleaderReaction` enthält Reaktions-ID, gewählten Slot und
  bei Feldforschung die Wahl `A` oder `B`.
- Eine monotone Reaktions-ID verwirft doppelte oder verspätete Antworten nach
  Reconnect.
- `ClientView` zeigt Angebote nur dem Besitzer; der Gegner erhält lediglich den
  öffentlichen Wartezustand.
- Replay-Reihenfolge: `cheerleaderSacrifice` → `cheerleaderPower` → konkrete
  Wirkung → Todesereignisse → Fortsetzung der Auflösung.

## Persistenz und Simulation

- Räume werden als `{ version: 2, rooms: [...] }` atomar über eine temporäre
  Datei geschrieben.
- Das frühere unversionierte Array wird weiterhin migriert; fehlende
  Auflösungsfelder werden ergänzt.
- Legal Actions liefern bei offenem Fenster ausschließlich gültige Opfer- und
  Wahlaktionen.
- Bot und Backtest rotieren Bankkombinationen und erfassen Angebote, Opfer,
  Wahlquote, verursachten beziehungsweise verhinderten Schaden und Rettungen.

## Abnahme

Abgedeckt sind alle fünf Kräfte, ungültige Besitzer/Slots/Reaktions-IDs,
gesperrte Normalaktionen, A/B-Wahl, deterministische Replay-Reihenfolge,
Persistenz und Reconnect mitten im Fenster sowie Legal-Action-/Bot-Partien.
Clienttests prüfen Besitzer- und Gegneransicht in der echten Engine-Sicht.

Die technische Integration ist abgeschlossen. Die Kraftwerte brauchen weiterhin
menschliches Playtesting; der vollständige Bot-Backtest vom 2026-08-01 erfüllt
mit unveränderter Schildfrequenz alle automatischen Tempo- und Deckkorridore.
