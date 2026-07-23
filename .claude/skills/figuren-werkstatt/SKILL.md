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

Die Werkstatt lernt: Sie **liest zu Beginn** das gesammelte Wissen (`LESSONS.md`) und
**schlägt am Ende** neue Lektionen zur Freigabe vor. So werden Fehler nicht wiederholt
und Best Practices weitergegeben.

## Ablauf (du orchestrierst, im Chat sichtbar)

### 0. Werkstatt-Wissen laden
Lies `.claude/skills/figuren-werkstatt/LESSONS.md` (Fallstricke & Best Practices).
Die relevanten Punkte fließen unten in die Designer-/Spezialisten-/Kritiker-Briefs ein,
damit niemand einen bekannten Fehler wiederholt.

### 1. Brief zusammenstellen
- Kartendaten lesen: `packages/engine/src/data/cards/*.json` nach `<cardId>` durchsuchen
  (Name, `text`, Stats, `faction`, `projectile`).
- Fraktionsfarbe: `packages/engine/src/data/factions.json` → `theme.color` (bzw. Oberfraktion).
- Vorhandene Figur (falls Überarbeitung): `data/figures/<cardId>.json`.
- Daraus einen kurzen **Design-Brief** bauen (cardId, Name, Text, Fraktion+Farbe,
  Projektil-Emoji, Nutzer-Prompt) **plus die passenden LESSONS.md-Punkte**.

### 2. Dev-Umgebung sicherstellen
- Snap-Ordner wählen, z. B. `<scratchpad>/snaps`, und anlegen.
- **Port 3000 vorher prüfen.** Ein Rest-Prozess aus einer früheren Sitzung (ohne
  `PCF_SNAP`) blockiert sonst den Start mit `EADDRINUSE`, und `/snap` bleibt inaktiv.
  Prüfen (`ss -ltnp | grep :3000` bzw. `netstat -ano | grep :3000`), den Rest-Prozess
  beenden, **bevor** der eigene Server gestartet wird.
- **Server mit Snap-Endpunkt** starten (nur so ist `/snap` aktiv), entkoppelt im
  Hintergrund (ein Vordergrund-Start kann mit Exit-Code 143/144 „scheitern", obwohl der
  Server läuft – Signal an die Shell). Erfolg per `curl` prüfen, nicht am Exit-Code:
  ```bash
  setsid env PCF_SNAP="<snaps-ordner>" PORT=3000 npx tsx packages/server/src/index.ts \
    > <scratchpad>/server.log 2>&1 < /dev/null &
  sleep 3 && curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/   # erwartet 200
  ```
  (bewusst `tsx` ohne `watch` – Datenänderungen brauchen ohnehin einen Neustart, siehe Schritt 4.)
- **Client** (Vite) starten, falls nicht schon offen, ebenfalls entkoppelt:
  `cd packages/client && setsid npx vite --port 5173 --strictPort > <scratchpad>/client.log 2>&1 < /dev/null &`
  Ist 5173 belegt, freien Port wählen. (Der Client holt den Katalog von `:3000`.)

### 3. Designer beauftragen
Spawne **figuren-designer** mit dem Brief (inkl. LESSONS.md-Punkten; bei Runde >1 der
Kritiker-Änderungsliste). Er schreibt `data/figures/<cardId>.json` und validiert mit
`npm test`. Für die **Erstanlage** immer der Basis-Designer; Spezialisten kommen erst
in Überarbeitungsrunden (Schritt 6).

### 4. Server neu starten, dann Screenshots erzeugen
**Vor jeder Aufnahme den Server neu starten** (Prozess auf Port 3000 beenden, dann den
Startbefehl aus Schritt 2 erneut ausführen) – auch nach Überarbeitungsrunden.
`loadGameData` liest `data/figures/*.json` per `readFileSync` nur **einmal beim Start**;
weder `tsx watch` noch Vite-HMR bemerken die Änderung (kein Modul-Import). Ohne Neustart
zeigt die Vorschau den alten Stand und der Kritiker bewertet ein veraltetes Bild – eine
ganze Runde ist verschwendet.

Danach die Montage per committetem Helferskript erzeugen (rendert 6 Kacheln – vorne /
seite / hinten + Angriff in 3 Phasen – und postet sie an `/snap`):
```bash
node .claude/skills/figuren-werkstatt/scripts/snap.mjs <cardId> [clientPort] [serverPort]
```
Ausgabe-PNG: `<snaps-ordner>/<cardId>.png`. Das Skript loggt die **Bausteinzahl** –
ist sie `0` (oder unverändert zur Vorrunde), wurde der Server nicht neu gestartet:
erst beheben, dann den Kritiker beauftragen.

Das Skript nutzt Playwright (Chromium unter `/opt/pw-browsers/chromium`) – der zuvor
genutzte `mcp__Claude_Browser` ist nicht in jeder Umgebung vorhanden. Ist Browser-MCP
verfügbar, geht derselbe Ablauf (freeze → yaw/clip → drawImage → `fetch /snap`) auch
dort; das Skript ist aber der robuste Standardweg (direkte WebGL-Canvas-Screenshots
timeouten).

### 5. Kritiker beauftragen (drei Linsen)
Spawne **figuren-kritiker** mit dem PNG-Pfad + Brief. Er liest das Bild und liefert:
- ein **Gesamturteil** (`GUT`/`ÜBERARBEITEN`),
- **Teil-Urteile je Linse**: `A` Körper·Proportion·Größe, `B` Gesicht·Kopf,
  `C` Animation,
- eine **nach Linse gelabelte** Änderungsliste (`[A]`/`[B]`/`[C]`).

### 6. Iterieren – Hybrid-Routing an Spezialisten
Bei `ÜBERARBEITEN` und < 3 Runden die gelabelten Punkte an den jeweils passenden
Handler geben. Läuft mehr als eine Linse, die Handler **nacheinander** ausführen
(Scopes sind disjunkt: Gesicht = Kopf-Teilbaum in `visual.parts`, Animation =
`animations`), **jeder liest die Datei zuerst**; danach **ein** Server-Neustart:

- **`[A]` Körper/Proportion/Größe →** zurück an den **Basis-Designer** per `SendMessage`
  an dessen bestehende Agent-ID (Kontext bleibt; Statur ist das Skelett = ein Autor).
- **`[B]` Gesicht →** Spezialist **figuren-gesicht** (nur wenn Linse B `ÜBERARBEITEN`).
  Beim ersten Mal per `Agent` spawnen, danach per `SendMessage` an dieselbe ID.
- **`[C]` Animation →** Spezialist **figuren-animation** (nur wenn Linse C `ÜBERARBEITEN`).
  Ebenso: erst spawnen, dann per `SendMessage` fortführen.

**Niemals `isolation: "worktree"`** und **niemals** einen frischen `Agent`-Aufruf für
eine Fortsetzung: ein Worktree-Agent schreibt in eine Repo-Kopie, die der Dev-Server nie
liest; ein frischer Agent verliert den Kontext. Nach den Änderungen zurück zu Schritt 4
(Server neu starten!). Bei `GUT` oder nach 3 Runden: Schleife beenden.

### 7. Abnahme
- Dem Nutzer das **finale Montage-PNG** zeigen und die Kritiker-Teil-Urteile zusammenfassen.
- **Auf Freigabe warten.**

### 8. Lektionen vorschlagen, dann committen
Nach dem OK des Nutzers:
- **Reflektieren:** Was hat diesmal gut funktioniert (→ *Best Practice*)? Ging etwas
  schief oder brauchte mehrere Runden für dieselbe Ursache (→ *Fallstrick*)? Formuliere
  je Fund einen knappen Eintrag (*Symptom → Ursache → Regel*).
- **Vorschlagen:** Zeige die vorgeschlagenen LESSONS.md-Ergänzungen dem Nutzer und
  **warte auf dessen Freigabe** (Lektionen werden nie automatisch festgeschrieben).
  Gibt es nichts Neues, sag das und überspring den Eintrag.
- **Committen:** Nach Freigabe `packages/engine/src/data/figures/<cardId>.json`
  committen, **zusammen mit** den freigegebenen `LESSONS.md`-Änderungen (falls
  vorhanden). Commit-Message z. B. „Figur <cardId>: <Kurzbeschreibung>".
- Danach im Testmodus prüfbar (die Figur erscheint im Spiel).

## Wichtig
- Nur Figur-Datei(en) + ggf. `LESSONS.md` werden geändert; Karten-/Gameplay-Daten und
  Engine-/Render-Code bleiben unangetastet.
- Server-`/snap` ist dev-only (nur bei gesetztem `PCF_SNAP`), also kein Produktionsrisiko.
- Hintergrund-Server/-Client am Ende nicht vergessen (laufen lassen für weitere Läufe
  oder sauber stoppen).

## Wissensspeicher & Selbst-Optimierung
Das gesammelte Wissen steht in **`LESSONS.md`** (Fallstricke aus Fehlern, Best Practices
aus Erfolgen). Schritt 0 liest es, Schritt 8 erweitert es nach Freigabe. So verbessert
sich die Werkstatt mit jedem Lauf, statt dieselben Fehler zu wiederholen. Wächst der
Figuren-Bestand, dient `LESSONS.md` auch als Kurator guter Referenz-Figuren.

Widerspricht ein neuer Lauf einem bestehenden Eintrag, den Eintrag **korrigieren**
(nicht einen zweiten anlegen). Ändert sich der Ablauf grundlegend, auch diese SKILL.md
im selben Schritt anpassen.
