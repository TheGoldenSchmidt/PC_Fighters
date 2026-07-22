---
name: figuren-werkstatt
description: Baut oder überarbeitet eine 3D-Figur für eine PC-Fighters-Karte per Designer-/Kritiker-Agenten-Schleife. Aufruf durch den Nutzer, z. B. "/figuren-werkstatt wolf buschigerer Schwanz". Nutze dies, wenn eine Karte ein besseres/neues 3D-Modell bekommen soll.
---

# Figuren-Werkstatt

Ein **händisch bedientes** Werkzeug: Eingabe = Karte + optionaler Stil-/Detail-Prompt,
Ausgabe = eine Figur-Datei `packages/engine/src/data/figures/<cardId>.json`. Das Spiel
lädt nur vorhandene Dateien – **keine Laufzeit-Generierung**. Jeder Lauf ist transparent
und endet mit **Freigabe durch den Nutzer** vor dem Commit.

Aufruf: `/figuren-werkstatt <cardId> [freier Prompt]`

## Ablauf (du orchestrierst, im Chat sichtbar)

### 1. Brief zusammenstellen
- Kartendaten lesen: `packages/engine/src/data/cards/*.json` nach `<cardId>` durchsuchen
  (Name, `text`, Stats, `faction`, `projectile`).
- Fraktionsfarbe: `packages/engine/src/data/factions.json` → `theme.color` (bzw. Oberfraktion).
- Vorhandene Figur (falls Überarbeitung): `data/figures/<cardId>.json`.
- Daraus einen kurzen **Design-Brief** bauen (cardId, Name, Text, Fraktion+Farbe,
  Projektil-Emoji, Nutzer-Prompt).

### 2. Dev-Umgebung sicherstellen
- Snap-Ordner wählen, z. B. `<scratchpad>/snaps`, und anlegen.
- **Server mit Snap-Endpunkt** starten (nur so ist `/snap` aktiv), im Hintergrund:
  `PCF_SNAP="<snaps-ordner>" PORT=3000 npx tsx packages/server/src/index.ts`
- **Client** (Vite) starten, falls nicht schon offen. Standard-Port 5173; ist er belegt,
  einen freien Port wählen: `cd packages/client && npx vite --port <p> --strictPort`.
  (Der Client holt den Katalog von `:3000`, der Port ist also egal.)
- Im Browser (mcp__Claude_Browser) `http://localhost:<clientport>/?figure=<cardId>` öffnen.

### 3. Designer beauftragen
Spawne den Agenten **figuren-designer** mit dem Brief (und bei Runde >1 der
Kritiker-Änderungsliste). Er schreibt `data/figures/<cardId>.json` und validiert mit `npm test`.

### 4. Screenshots erzeugen
Nach jedem Designer-Durchlauf **neu laden** (`navigate` auf die Vorschau-URL, ~600 ms warten),
dann per `javascript_tool` diese Montage aufnehmen und an den Server posten:
```js
(async () => {
  await new Promise(r => setTimeout(r, 600));
  const h = window.__figure, cv = document.querySelector('canvas');
  if (!h || !cv) return 'NO HANDLE';
  h.freeze();
  const tw = 300, th = 340;
  const m = document.createElement('canvas'); m.width = tw*2; m.height = th*2;
  const ctx = m.getContext('2d'); ctx.fillStyle = '#141a1f'; ctx.fillRect(0,0,m.width,m.height);
  const shots = [
    ['vorne',   () => h.yaw(0.35)],
    ['seite',   () => h.yaw(1.7)],
    ['hinten',  () => h.yaw(3.2)],
    ['angriff', () => { h.yaw(0.35); h.clip('attack', 260); }]
  ];
  shots.forEach((s,i) => { s[1](); const x=(i%2)*tw, y=((i/2)|0)*th;
    ctx.drawImage(cv,0,0,cv.width,cv.height,x,y,tw,th);
    ctx.fillStyle='#8fe6b0'; ctx.font='bold 15px sans-serif'; ctx.fillText(s[0], x+8, y+20); });
  h.live();
  const r = await fetch('http://localhost:3000/snap?name=<cardId>', {
    method:'POST', headers:{'content-type':'text/plain'}, body: m.toDataURL('image/png') });
  return 'snap '+r.status;
})()
```
Die Datei liegt dann als `<snaps-ordner>/<cardId>.png`. (Direkte Screenshots des
Live-WebGL-Canvas per Screenshot-Tool **timeouten** – deshalb dieser Weg über `/snap`.)

### 5. Kritiker beauftragen
Spawne **figuren-kritiker** mit dem PNG-Pfad + Brief. Er liest das Bild und liefert
Urteil (`GUT`/`ÜBERARBEITEN`) + konkrete Änderungsliste.

### 6. Iterieren
Bei `ÜBERARBEITEN` und < 3 Runden: die Änderungsliste an denselben Designer zurückgeben
(SendMessage an den Designer-Agenten, Kontext bleibt), zurück zu Schritt 4.
Bei `GUT` oder nach 3 Runden: Schleife beenden.

### 7. Abnahme & Commit
- Dem Nutzer die **finalen Screenshots** (das PNG) zeigen und den Kritiker-Bericht zusammenfassen.
- **Auf Freigabe warten.** Erst nach explizitem OK committen:
  nur `packages/engine/src/data/figures/<cardId>.json`,
  Commit-Message z. B. „Figur <cardId>: <Kurzbeschreibung>".
- Danach im Testmodus prüfbar (die Figur erscheint im Spiel).

## Wichtig
- Nur die Figur-Datei wird geändert; Karten-/Gameplay-Daten bleiben unangetastet.
- Server-`/snap` ist dev-only (nur bei gesetztem `PCF_SNAP`), also kein Produktionsrisiko.
- Hintergrund-Server/-Client am Ende nicht vergessen (laufen lassen für weitere Läufe
  oder sauber stoppen).
