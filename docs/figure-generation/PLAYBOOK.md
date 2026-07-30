# Playbook: Figurenerstellung

Der belegte Arbeitsablauf der Figuren-Werkstatt, produktneutral. Die Werkstatt-Skills
unter `.claude/skills/figuren-werkstatt/` und `.agents/skills/figuren-werkstatt/` sind
nur noch produktspezifische Einstiegspunkte und beziehen den fachlichen Ablauf von
hier.

Zugehörige Dokumente:

- `QUALITY_CRITERIA.md` – woran das Ergebnis gemessen wird
- `PARTS.md` – kopierfertige Rig-Fragmente
- `agents/figure-designer.md`, `agents/figure-critic.md` – die Rollen
- `experiments/` – abgeschlossene Versuche samt offener Hypothesen

Eingabe ist eine Karte plus optionaler Stil- oder Detailwunsch, Ausgabe genau eine
Datei `packages/engine/src/data/figures/<cardId>.json`. Das Spiel lädt nur vorhandene
Dateien; es gibt **keine Laufzeit-Generierung**. Jeder Lauf endet mit einer Freigabe
durch den Nutzer.

---

## 0. Wissen laden

`QUALITY_CRITERIA.md` und die einschlägigen Abschnitte dieses Playbooks lesen. Die
relevanten Punkte fließen in die Briefs ein, damit niemand einen bekannten Fehler
wiederholt.

## 1. Brief zusammenstellen

- Kartendaten lesen: `packages/engine/src/data/cards/*.json` nach `<cardId>`
  durchsuchen (Name, `text`, Stats, `faction`, `projectile`).
- Fraktionsfarbe: `packages/engine/src/data/factions.json` → `theme.color`
  beziehungsweise die der Oberfraktion.
- Bei einer Überarbeitung die vorhandene `data/figures/<cardId>.json` lesen.
- Daraus einen kurzen **Design-Brief** bauen: cardId, Name, Text, Fraktion samt Farbe,
  Projektil-Emoji, Nutzer-Wunsch.
- **Passende Fragmente aus `PARTS.md` benennen** (etwa „Vierbeiner-Grundgerüst plus
  Schwanzkette plus Gesichts-Kit"), damit der Designer sie kopiert statt neu
  herzuleiten.

### 1b. Referenz-Steckbrief, wenn eine Vorlage vorliegt

Liegt eine visuelle Vorlage vor – Nutzer-Upload oder eine recherchierte Silhouette –
prüft **der bildfähige Orchestrator sie selbst** und destilliert sie in **Zahlen**.
Der Designer ist text-only und kann kein Bild sehen; er bekommt fertige Werte, keine
Bilddatei. Format des Steckbriefs steht in `PARTS.md`. Ohne Vorlage entfällt der
Schritt.

Proportion ist die häufigste Kritik-Ursache. Wer den Steckbrief trifft, spart die
„zu groß / falsche Proportion"-Runde.

Gelieferte Fremd-Assets (Meshes, Texturen) werden nur als Referenz abgelesen und
**nicht ins Repo committet** (Lizenz); das Ergebnis sind eigene Primitive.

## 2. Dev-Umgebung sicherstellen

- Snap-Ordner wählen und anlegen.
- **Port 3000 vorher prüfen.** Ein Rest-Prozess aus einer früheren Sitzung – meist
  ohne `PCF_SNAP` gestartet, dann fehlt `/snap` – blockiert den Start mit
  `EADDRINUSE`. Rest-Prozess beenden, **bevor** der eigene Server startet.
- **Server mit Snap-Endpunkt starten**, entkoppelt im Hintergrund. Ein
  Vordergrund-Start kann mit Exit-Code 143/144 „scheitern", obwohl der Server läuft
  (Signal-Zustellung an die Shell). Erfolg per HTTP-Abfrage prüfen, nicht am
  Exit-Code.

  ```bash
  setsid env PCF_SNAP="<snaps-ordner>" PORT=3000 npx tsx packages/server/src/index.ts > <log> 2>&1 < /dev/null &
  ```

  Bewusst `tsx` ohne `watch` – Datenänderungen brauchen ohnehin einen Neustart.
- **Client (Vite) starten**, falls nicht offen, ebenfalls entkoppelt. Ist 5173 belegt,
  einen freien Port wählen; der Client holt den Katalog von `:3000`.
- **Der Client kann zwischen zwei Snap-Runden sterben.** Symptom: der Snapshot bricht
  mit `net::ERR_CONNECTION_REFUSED` ab. Vor jeder Aufnahme den Client-Port prüfen und
  bei Bedarf neu starten – nicht nur den Server.

## 3. Designer beauftragen

Den Brief an den Designer geben (Betriebsmodus 1). Er schreibt
`data/figures/<cardId>.json` und validiert mit `npm test`. Für die Erstanlage immer
Modus 1; die Spezialmodi kommen erst in Überarbeitungsrunden.

## 4. Server neu starten, dann Montage erzeugen

**Vor jeder Aufnahme den Server neu starten.** `loadGameData` liest alle
`data/*.json` einschließlich `figures/` per `readFileSync` nur **einmal beim
Prozessstart**; weder `tsx watch` noch Vite-HMR bemerken die Änderung, weil kein
Modul-Import stattfindet. Ohne Neustart zeigt die Vorschau den alten Stand und der
Kritiker bewertet ein veraltetes Bild – eine ganze Runde ist verschwendet. Symptom
ist eine „leere" Montage: nur Hintergrund und Label, `0 Bausteine` oder eine zur
Vorrunde unveränderte Bausteinzahl.

```bash
node scripts/snap.mjs <cardId> [clientPort] [serverPort]
```

Das Skript rendert sechs Kacheln – `vorne`, `seite`, `hinten` plus den Angriff in
drei Phasen (Ausholen, Kontakt, Rückkehr) – und postet die Montage an `/snap`.
Ausgabe ist `<snaps-ordner>/<cardId>.png`. Es loggt die Bausteinzahl; ist sie `0`
oder unverändert, wurde der Server nicht neu gestartet: erst beheben, dann den
Kritiker beauftragen.

Warum ein Skript und kein Screenshot-Werkzeug: direkte Screenshots des Live-WebGL-
Canvas timeouten, deshalb rendert die Seite die Montage selbst. Warum kein
Browser-MCP als Standardweg: er ist nicht in jeder Umgebung vorhanden. Ist er
verfügbar, läuft derselbe Ablauf (freeze → yaw/clip → drawImage → `fetch /snap`) auch
dort.

## 5. Kritiker beauftragen

Der Kritiker bekommt den PNG-Pfad und den Brief und liefert Gesamturteil,
Teil-Urteile je Linse und eine nach Linse gelabelte Änderungsliste. Maßstab ist
`QUALITY_CRITERIA.md`.

## 6. Iterieren – höchstens drei Runden

Bei `ÜBERARBEITEN` und weniger als drei Runden die gelabelten Punkte an den
passenden Betriebsmodus des Designers geben:

| Label | Bereich | Modus |
|---|---|---|
| `[A]` | Körper, Proportion, Größe, Ruhepose, Palette | 1 |
| `[B]` | Gesicht und Kopf | 2 |
| `[C]` | Animation | 3 |

- **Nacheinander, nie parallel.** Laufen zwei Bearbeitungen gleichzeitig auf
  derselben Datei, ist das ein Lost-Update-Risiko: der später schreibende Lauf kann
  den anderen überschreiben, auch wenn die Scopes disjunkt sind. Passiert es doch,
  hinterher stichprobenartig je Linse verifizieren, dass beide Änderungssets
  tatsächlich in der Datei stehen, bevor die nächste Montage gebaut wird.
- **Jeder Lauf liest die Datei zuerst**, denn ein anderer hat sie zuletzt
  geschrieben.
- **Überarbeitungen gehören zum selben Autor.** Eine Fortsetzung wird an den
  bestehenden Lauf geschickt; ein frisch gestarteter Lauf verliert den Kontext.
- **Niemals in einer isolierten Repo-Kopie arbeiten.** Ein Worktree-Lauf schreibt in
  eine Kopie, die der laufende Dev-Server nie liest – die Änderung kommt in der
  Vorschau nicht an.
- Danach **ein** Server-Neustart und zurück zu Schritt 4. Bei `GUT` oder nach drei
  Runden endet die Schleife; verbleibende Punkte werden dem Nutzer transparent
  genannt.

## 7. Abnahme

- Dem Nutzer die finale Montage zeigen und die Teil-Urteile zusammenfassen.
- **Die echte Abnahme passiert im interaktiven Viewer**, nicht auf Standbildern.
  Beide Wege sind gültig und ergänzen einander:
  - **Live-Viewer:** Server und Client laufen lassen und den direkten Link
    `http://localhost:<clientPort>/?viewer=figures&figure=<cardId>` nennen. Er nutzt
    dieselbe Render- und Animations-Pipeline wie das Schlachtfeld und bietet Idle,
    Einzug, Angriff, Treffer und Tod sowie freie Drehung und Figurenwechsel. Nach
    einem Daten-Neustart lässt sich der Katalog über „Neu laden" aktualisieren.
  - **Standalone-Viewer:** `node tools/figuren-viewer/build-viewer.mjs` neu bauen und
    das Ergebnis bereitstellen.
- **Vor jedem Einzelklip die Figur in einen neutralen Idle-Zustand zurücksetzen.**
  Ein alter `death`-Zustand hält Figur und Schatten unsichtbar oder blockiert den
  nächsten Tod-Klip; nur so bleiben Einzug, Angriff, Treffer und Tod beliebig oft
  reproduzierbar.
- **`localhost` ist gerätebezogen.** Für eine mobile Abnahme die WLAN-IP des PCs
  verwenden, Client und Server auf allen Schnittstellen starten und beide Endpunkte
  über die LAN-Adresse prüfen.
- **Auf Freigabe warten.**

## 8. Erkenntnisse sichern

Nach dem OK des Nutzers reflektieren: Was hat funktioniert, was ging schief oder
brauchte mehrere Runden für dieselbe Ursache?

Die Beförderung folgt `AGENTS.md`:

1. Gibt es etwas zu berichten, einen **Experimentbericht** unter
   `docs/figure-generation/experiments/` nach `_TEMPLATE.md` anlegen – datiert,
   mit Aufbau, Evidenz, Ergebnis, Grenzen und offenen Hypothesen. Gibt es nichts
   Neues, das sagen und den Schritt überspringen.
2. Erst wenn eine Erkenntnis **belegt und wiederverwendbar** ist, wird sie befördert:
   wiederverwendbarer Ablauf in dieses Playbook, Qualitätsmaßstab in
   `QUALITY_CRITERIA.md`, ein besseres Rig-Muster in `PARTS.md`.
3. Unbelegte Ideen bleiben als **offene Hypothese** im Experimentbericht stehen und
   werden nicht in Playbook oder Quality Criteria geschrieben.
4. Eine kontroverse größere Änderung geht als RFC nach `docs/rfcs/`, eine langlebige
   Architekturentscheidung als ADR nach `docs/adr/`.

Vorgeschlagene Beförderungen werden dem Nutzer gezeigt und **erst nach dessen
Freigabe** festgeschrieben. Der Nutzer entscheidet über den Commit.

Widerspricht ein neuer Lauf einem bestehenden Eintrag, wird der Eintrag
**korrigiert**, nicht ein zweiter angelegt.

---

## Rig-Rezepte

Die Fragmente selbst stehen in `PARTS.md`. Hier steht, warum sie so aussehen.

### Gliedmaßen als Gelenk-Kette

Es gibt **kein Skinning und keine IK** – ein Primitiv dreht immer um seinen
**Mittelpunkt**. Ein Arm oder Bein aus einem einzelnen Zylinder wippt beim Animieren
um die Mitte statt um Schulter oder Hüfte und sieht abgekoppelt aus. Jede animierbare
Gliedmaße (Arm, Bein, Flügel, Kiefer) wird deshalb als Kette mit Gelenk-Pivots
gebaut:

- Gelenke sind leere `group`-Bausteine **am Gelenkpunkt** und drehen; Segmente sind
  **versetzte Kinder**:
  `schulterR (group) → oberarmR (cyl) → ellbogenR (group) → unterarmR (cyl) → handR → Requisit`.
- Animiert wird die Gelenk-`group`, nicht das Segment; dann folgen alle Kinder.
- Ruhepose-Beugung liegt auf den Gelenk-`group`s. Das Segment ist reiner Versatz mit
  Ende am Gelenk (Zylinderhöhe `h` → `pos [0,-h/2,0]`), ohne eigenes `rot`.
- **Jeder Ketten-Versatz ist `h/2`, nie die volle Höhe** – auch abwärts: das
  Kindgelenk sitzt `h/2` unter der Segment-**Mitte**.
- Requisiten (Werkzeug, Flasche, Waffe) werden an die Hand geparentet.

**Konnektivität rechnerisch prüfen.** Bibliotheks-Fragmente nicht blind übernehmen:
ein Zahlenfehler in `PARTS.md` – Kindgelenk-Versatz mit voller Segmenthöhe statt
`h/2` – wurde beim `pferd` wörtlich mitkopiert und erzeugte über drei Runden
systematisch eine Lücke an jedem Gelenk. Die Montage ließ das nur erahnen, im
interaktiven Viewer fiel es sofort auf. Vor der Abgabe ein kleines Skript laufen
lassen, das die `CardFigure.ts`-Transformsemantik nachbildet (`pos` relativ zum
Parent, Euler-XYZ) und für jede Kette Segment-Ende gegen Kindgelenk-Weltposition
rechnet; Erwartung: Abstand 0. Zusätzlich Anbauteile wie Mähne, Schweif und Ohren auf
Kontakt zum Trägerteil prüfen. Entpuppt sich ein Fragment als fehlerhaft, `PARTS.md`
**sofort korrigieren**, statt den Fehler weiterzukopieren.

### Wurf und Schuss

- Bewegungsbogen in drei Phasen: **Ausholen** (Schulter zurück und hoch) →
  **Release bei ~40 %** (Schulter und Ellbogen schnell nach vorn) → **Nachschwung**
  zurück in Idle. Animiert werden die Gelenk-`group`s (`schulterR rot.x`,
  `ellbogenR rot.x`), nicht die Segmente – nur so folgen Hand und Requisit.
- **Sichtbar fliegendes Projektil:** eine **separate, an `root` geparentete**
  Wurf-Kopie des Objekts bekommt ab dem Release eine Bogen-Bahn (`pos.x/y/z`-Keys,
  hoch und vorwärts) und danach einen `opacity`-Fade; die in der Hand gehaltene Kopie
  wird beim Release per `opacity` ausgeblendet. So fliegt auch im Viewer etwas – im
  echten Kampf übernimmt zusätzlich das Projektil-Orb den Lane-Flug. Der Player
  stellt die Opacity nach dem Klip selbst wieder her.

---

## Pre-Flight-Selbstcheck des Designers

Vor jeder Abgabe abzuhaken. Jeder Fehler hier kostet sonst eine ganze Kritik-Runde
(Designer → Server-Neustart → Montage → Kritiker):

- [ ] `visual.height` bewusst gesetzt (Mensch ≈ 1, mittelgroßes Tier ~0.6)?
- [ ] Kein `emissive`-Track auf `root`?
- [ ] Kein `rot` auf Segmenten – Beugung nur auf Gelenk-`group`s?
- [ ] Bewegliche Gliedmaßen als Gelenk-Kette, Requisit an die Hand geparentet?
- [ ] Ketten-Konnektivität rechnerisch verifiziert (Segment-Ende gleich Kindgelenk,
      Abstand 0; Kindgelenk-Versatz `h/2`, nie volle Höhe)?
- [ ] Keine schwebenden oder überstehenden Teile?
- [ ] Ruhepose stabil, kein eingefrorener Action-Moment?
- [ ] Wurf oder Schlag: Release-Vorzeichen korrekt – nach vorn (+z) heißt negatives
      `rot.x`; Armschwung und Projektil-Bogen in dieselbe Richtung?
- [ ] Gesicht mehrteilig (Sklera plus Pupille, abgesetzter Kiefer, Ohr-Innenteil),
      Kontrast-Akzente als Helligkeitssprung an der Silhouetten-Kante?
- [ ] `idle` (loop) bewegt mindestens zwei benannte Teile?
- [ ] Angriff bewegt andere Teile oder Achsen als das Idle?
- [ ] Referenz-Steckbrief-Zahlen getroffen, falls vorhanden?
- [ ] `npm test` grün?

---

## Bekannte Werkzeuglücken

Belegte Anforderungen, die das heutige Werkzeug nicht erfüllt. Sie sind keine
Hypothesen – der Bedarf ist belegt, nur die Umsetzung fehlt.

- **Einzugs- und Todesphasen in der Montage.** `QUALITY_CRITERIA.md` verlangt
  mindestens zwei Einzugs- und zwei Todesphasen bei der Abnahme.
  `scripts/snap.mjs` rendert aber nur `vorne`, `seite`, `hinten` und drei feste
  `attack`-Zeitpunkte. Bis das Skript erweitert ist, muss dieses Kriterium über den
  interaktiven Viewer geprüft werden.
- **Chromium-Auflösung.** `scripts/snap.mjs` sucht Chromium über `PW_CHROMIUM`
  beziehungsweise `PLAYWRIGHT_BROWSERS_PATH` und fällt sonst auf die
  Standardauflösung von Playwright zurück. Ist in der Umgebung kein Chromium
  installiert, schlägt der Snapshot fehl und der Ablauf braucht eine manuelle
  Aufnahme.

Offene Hypothesen zur Verbesserung des Ablaufs stehen **nicht hier**, sondern im
Experimentbericht, aus dem sie stammen – siehe
`experiments/2026-07-28-figurenwelle-2-effizienz.md`.
