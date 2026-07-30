# Arena_Cheerleader_Erweiterung

## Ziel

Die bestehende Cheerleader-Auswahl und die Arena-Teamzonen werden um die
eigentliche Engine-Logik für Cheerleader-Superkräfte erweitert. Die Engine
entscheidet regelkonform, wann eine Kraft angeboten wird, welcher belegte
Bankplatz geopfert werden darf und wie die Kraft auf den Spielzustand wirkt.

## Bereits umgesetzt

- Datengetriebener Kandidatenpool mit Auswahlgröße `3` und Deckgrenze `2`.
- Validierung von Auswahl, Duplikaten, Kandidaten-IDs und Deckausschluss.
- Drei öffentliche, stabile Slots vom Typ `cardId | null` je Spieler.
- Persistenz, Reconnect und Migration historischer Räume.
- `CheerleaderSacrificeEvent` als öffentlicher Replay-Vertrag.
- 3D-Teamzonen, 2D-Fallback sowie individuelle `cheer`- und `sacrifice`-Clips.

Stand: Commit `34cb6cf` auf `master`.

## Offene Engine-Arbeit

### 1. Superkräfte spezifizieren

- [ ] Effekt, Auslöser, Zielwahl und Einschränkungen für alle fünf Kandidaten festlegen.
- [ ] Entscheiden, ob Kräfte aktiv im eigenen Zug oder reaktiv während einer
      laufenden Auflösung eingesetzt werden.
- [ ] Datengetriebene Definitionen samt Schema-Validierung ergänzen.

### 2. Auslöse- und Auswahlzustand modellieren

- [ ] Falls eine Reaktion oder Auswahl nötig ist, einen persistierbaren
      `pendingCheerleaderChoice`-Zustand in `GameState` ergänzen.
- [ ] Besitzer, Auslöser, erlaubte Slots und fortzusetzende Auflösung eindeutig
      im Zustand abbilden.
- [ ] Den öffentlichen Teil dieses Zustands in `ClientView` aufnehmen.

### 3. Spieleraktion und Validierung ergänzen

- [ ] `PlayerAction` um `sacrificeCheerleader` mit einem Slot von `0 | 1 | 2`
      erweitern.
- [ ] In `applyAction` Phase, Priorität, Besitzer, belegten Slot und aktuellen
      Auslöser serverautoritativ validieren.
- [ ] Festlegen, ob die Aktivierung Zug, Energie oder Priorität verbraucht.

### 4. Opfer und Kraft atomar auflösen

- [ ] Den gewählten Slot stabil auf `null` setzen.
- [ ] Zuerst ein `CheerleaderSacrificeEvent` in das Log schreiben.
- [ ] Anschließend den zugehörigen Superkrafteffekt ausführen.
- [ ] Danach Todesfälle, Folgetrigger und zerstörte Basen prüfen.
- [ ] Die Ereignisreihenfolge für den Client-Replay deterministisch halten.

### 5. Effektprimitive erweitern

- [ ] Vorhandene Ability-/Effect-Primitive für die fünf Kräfte wiederverwenden.
- [ ] Nur fehlende Mechaniken als neue Union-Zweige, Schemata und Resolver
      ergänzen.
- [ ] Wechselwirkungen mit Tod, Rettung, Nachbar, Basisangriff und Flugphase
      ausdrücklich definieren.

### 6. Legale Aktionen, Bot und Simulation

- [ ] `legaleAktionen` um erlaubte Cheerleader-Opfer erweitern.
- [ ] Bot-Bewertung und Backtest-Simulation für die neue Aktion ergänzen.
- [ ] Optional Cheerleader-Nutzung und Wirkung in der Statistik erfassen.

### 7. Tests und Abnahme

- [ ] Engine-Tests für jede der fünf Superkräfte ergänzen.
- [ ] Ungültigen Besitzer, falsche Phase, leere Slots und Mehrfachopfer testen.
- [ ] Ereignisreihenfolge sowie Tod-, Kampf- und Basisschaden-Grenzfälle testen.
- [ ] Ausstehende Auswahl, Persistenz und Reconnect testen.
- [ ] Bot-/Legal-Action-Property-Test um die neue Aktion erweitern.
- [ ] Abschluss mit `npm test`, `npm run typecheck` und `npm run build`.

## Zentrale Designentscheidung

Reaktive Superkräfte sind technisch deutlich aufwendiger als aktive Kräfte:
Die Engine löst Kampf und Effekte derzeit vollständig innerhalb eines
`applyAction`-Aufrufs auf. Eine Reaktion auf tödlichen Schaden benötigt daher
einen pausierbaren Auflösungszustand, der nach der Cheerleader-Wahl exakt an der
unterbrochenen Stelle fortgesetzt werden kann.
