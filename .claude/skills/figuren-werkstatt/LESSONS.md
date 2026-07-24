# Werkstatt-Wissen (Fallstricke & Best Practices)

Wachsender Wissensspeicher der Figuren-Werkstatt. Die Werkstatt **liest diese
Datei zu Laufbeginn** (SKILL.md, Schritt 0) und speist die relevanten Punkte in
Designer-/Spezialisten-/Kritiker-Briefs ein. Am **Laufende** schlägt sie neue
Einträge vor und schreibt sie erst **nach Freigabe durch den Nutzer** fest
(SKILL.md, Schritt 8).

Jeder Eintrag ist kurz: *Symptom → Ursache → Regel*. Keine Romane. Wenn ein
späterer Lauf einem Eintrag widerspricht, den Eintrag korrigieren statt einen
zweiten anzulegen.

---

## Fallstricke (aus Fehlern gelernt)

### Umgebung / Ablauf

- **Server-Datenstand ≠ Dateisystem-Stand.** `loadGameData` liest alle
  `data/*.json` (inkl. `figures/`) per `readFileSync`/`readdirSync` nur beim
  Prozessstart. Weder Vite-HMR noch `tsx watch` bemerken eine Änderung (kein
  Modul-Import). → **Nach jeder Designer-/Spezialisten-Runde den Server neu
  starten**, sonst bewertet der Kritiker ein veraltetes Bild und eine ganze Runde
  ist verschwendet. Symptom: „leere" Montage (nur Hintergrund + Label,
  `0 Bausteine` oder unveränderte Bausteinzahl).

- **Port 3000 kann von einer früheren Sitzung belegt sein** – meist ohne
  `PCF_SNAP` gestartet, dann fehlt `/snap` und der eigene Start bricht mit
  `EADDRINUSE` ab. → Vor dem ersten Serverstart Port prüfen und Rest-Prozess
  beenden.

- **Server-Start-Kommando im Vordergrund kann mit Exit-Code 143/144 „scheitern",
  obwohl der Server läuft** (Signal-Zustellung an die Shell). → Den Start mit
  `setsid … < /dev/null &` entkoppeln und den Erfolg per `curl :3000` statt am
  Exit-Code prüfen.

- **Der Vite-Client (Port 5173) kann zwischen zwei Snap-Runden sterben.** Symptom:
  `snap.mjs` bricht mit `net::ERR_CONNECTION_REFUSED` ab. → Vor jeder Aufnahme den
  Client-Port prüfen und bei Bedarf neu starten (`ss -ltnp | grep :5173`, sonst
  `vite`-Start wiederholen), nicht nur den Server.

- **Überarbeitungen gehören zum selben Autor.** `SendMessage` an die bestehende
  Agent-ID nutzen; ein frischer `Agent`-Aufruf verliert den Kontext. **Niemals
  `isolation: "worktree"`** – ein Worktree-Agent bearbeitet eine isolierte
  Repo-Kopie, die der laufende Dev-Server nie liest; die Änderung kommt in der
  Vorschau nicht an.

- **Browser-MCP ist nicht überall verfügbar.** Der Screenshot-Schritt läuft über
  das committete `scripts/snap.mjs` (Playwright, `executablePath:
  /opt/pw-browsers/chromium`, Import aus dem globalen `playwright`). Browser-MCP
  (`mcp__Claude_Browser`) nur als Alternative, wenn vorhanden.

### Bauqualität

- **„Zu groß" ist fast nie ein Höhen-, sondern ein Proportions-/`visual.height`-
  Problem.** Der Auto-Fit (`CardFigure.ts`) skaliert die Figur auf
  `1.8 * (visual.height ?? 1)` **anhand der Bounding-Box-Höhe**. Eine breite,
  flache Figur ohne `visual.height` wird also per Höhe hochskaliert und wirkt in
  der Breite riesig. → Größe steuert man über **`visual.height`** (Mensch ≈ 1,
  Wolf 0.62) **und schlanke Proportionen** (sichtbare Beine statt klobigem
  Rumpf), nicht über „alle Teile kleiner".

- **`emissive`-Track auf `root` wäscht die ganze Figur weiß.** Der
  `AnimationPlayer` setzt bei einem `emissive`-Track alle Meshes des Ziel-
  Teilbaums auf weißen Glow; auf `root` = komplette Figur cremeweiß, Farbidentität
  weg – besonders fatal in der Angriffs-Kachel. → **Kein `emissive` auf `root`.**
  Angriff über Pose lösen (Lunge, Schnapp, Hieb). Falls überhaupt ein Glanz
  gewünscht: sehr niedriger Wert (<0.1) auf einem einzelnen kleinen Teil.

- **Kleine Kontrast-Teile verschwinden auf ihrem Nachbarn.** Fangzähne in `cream`
  direkt vor `cream`-Wangen sind nicht lesbar. → Detail-Akzente (Zähne, Krallen,
  Augen) brauchen eine **eigene Kontrastfarbe** und Platzierung an einer
  Silhouetten-Kante, wo sie über den Nachbarn hinausragen.

---

## Best Practices (aus Erfolgen gelernt)

### Gesicht / Kopf (kritischer Bereich)

- **Augen als 2–3 Teile statt Punkt:** helle Sklera + dunkle Pupille davor (ggf.
  Augenbraue darüber) geben Ausdruck. Reine Punktaugen wirken tot.
- **Kiefer absetzen:** separater `jawLower` + Fangzähne in Kontrastfarbe an der
  Kieferkante machen Raubtiere lesbar und ermöglichen eine Biss-Animation.
- **Ohren mit Innenteil:** andersfarbige innere Ohrmuschel gibt Tiefe.

### Körper / Statur

- **`visual.height` bewusst setzen** (siehe Fallstrick oben). Vergleichsanker:
  Mensch ≈ 1, mittelgroßes Tier ~0.6.
- **Beine sichtbar lassen:** Rumpf hoch genug über den Beinen, sonst wirkt das
  Tier klobig/bärenhaft statt schlank.

### Wiedererkennbarkeit / Abgrenzung von anderen Figuren

- **Ähnlichkeit kommt vom geteilten Skelett – Pose differenziert.** Baut man Figur B
  mit Figur A als Struktur-Referenz (z. B. Katze mit dem Wolf-Quadruped als Basis),
  wird die Silhouette schnell „zu ähnlich" (bewiesen: der stehende Getigerte wirkte
  wie ein umgefärbter Wolf). Farbe/Detail-Akzente reichen zur Abgrenzung nicht. →
  Hat die Art eine **ikonische Haltung**, diese bauen statt der generischen Standpose:
  die sitzende Putzhaltung machte den Getigerten sofort unverkennbar zur Katze. Pose >
  Textur bei der Unterscheidbarkeit.

### Schwanz / Anhänge

- **Verjüngende Kegelkette** (`base → mid → tip` via `parent`) + mehrere
  Fluff-Icos an der Spitze ergeben einen buschigen Schwanz; ein einzelner Kegel
  mit Kugel wirkt wie eine Fahnenstange.

### Gliedmaßen als Gelenk-Kette (Pflicht bei beweglichen Gliedmaßen)

Es gibt **kein Skinning/IK** – ein Primitiv dreht immer um seinen **Mittelpunkt**.
Ein Arm/Bein aus einem einzelnen Zylinder wippt daher beim Animieren um seine Mitte
statt um Schulter/Hüfte und sieht abgekoppelt aus (bewiesen am Pfandsammler-Wurf).
Regel für jede animierbare Gliedmaße (Arm, Bein, Flügel, Kiefer):

- **Gelenke = leere `group`-Bausteine am Gelenkpunkt** (die drehen), Segmente als
  **versetzte Kinder** (die drehen sich nicht selbst, sie hängen am Gelenk):
  `schulterR (group @Schulterposition) → oberarmR (cyl, pos nach unten versetzt)
  → ellbogenR (group @Ellbogen) → unterarmR (cyl) → handR → Requisit`.
- Animiert wird die **Gelenk-`group`** (`schulterR rot.x`, `ellbogenR rot.x`), nicht
  das Segment. Dann folgen alle Kinder (Unterarm, Hand, gehaltenes Objekt) korrekt.
- **Requisiten (Werkzeug, Flasche, Waffe) an die Hand parenten**, damit sie mitgehen.
- **Keine `rot` auf den Segmenten selbst.** Ein Segment (`cyl`) dreht um seinen
  eigenen **Mittelpunkt** → sein oberes Ende löst sich vom Gelenk → sichtbare Lücke
  (bewiesen am Pfandsammler-Arm: `oberarmR`/`unterarmR` hatten eigene `rot`). Ruhepose-
  Beugung gehört auf die **Gelenk-`group`s**; das Segment bleibt reiner Versatz, so
  positioniert, dass sein **Ende genau am Elterngelenk** sitzt (Zylinderhöhe `h` →
  Segment `pos [0, -h/2, 0]` vom Gelenk, kein `rot`). So gibt es keine Lücke.
- **Wurf-/Schlagrichtung prüfen:** Die Figur blickt nach **+z**. Ein **positives**
  `rot.x` auf einem hängenden Arm schwenkt ihn nach **hinten (−z)**; für einen Wurf/
  Schlag **nach vorn (+z)** muss der Release **negativ** `rot.x` sein. Immer gegen-
  checken, dass **Armschwung und Projektil-Bogen in dieselbe Richtung (+z)** gehen.

### Wurf/Schuss-Rezept

- Bewegungsbogen in drei Phasen: **Ausholen** (Schulter zurück/hoch) → **Release
  ~40 %** (Schulter + Ellbogen schnell nach vorn) → **Nachschwung** (zurück in Idle).
- **Sichtbar fliegendes Projektil im Viewer:** eine **separate, root-geparentete**
  Wurf-Kopie des Objekts bekommt ab dem Release eine **Bogen-Bahn** (`pos.x/y/z`-Keys,
  hoch+vorwärts) und danach `opacity`-Fade; die **in der Hand gehaltene** Kopie wird
  beim Release ausgeblendet. (Im echten Kampf übernimmt zusätzlich das Projektil-Orb
  den Lane-Flug – der Viewer hat es nicht, daher die eigene Wurf-Kopie.)

### Polygone / Detailgrad

- Der Stil ist bewusst **low-poly + `flatShading`** – höhere Unterteilung bleibt
  facettiert (echt glatt gäbe es nur ohne flatShading = Stilbruch fürs ganze Spiel).
- **Detail über mehr/besser platzierte Teile** (40–80), nicht über feinere
  Unterteilung. Für gezielte Rundungen (Helmkuppel o. ä.) `detail:"high"` **pro Teil**
  setzen statt `visual.detailLevel` global anzuheben. Perf: viele Figuren × Schatten
  auf dem Handy.

### Animation

- **Immer ein lebendiger `idle`-Loop**, der **≥2 benannte Teile** bewegt
  (Atmen/Wippen + Schwanz/Ohren/Kleidung).
- **`attack` thematisch überschreiben** passend zum Projektil-Emoji (🐾 → Biss/
  Sprung, 🪨 → Wurf, ⚔️ → Hieb). Bewegung, nicht Blitz.
- **Angriff muss andere Bausteine/Achsen bewegen als das `idle`.** Bewegt der Angriff
  dieselbe Gliedmaße zur selben Stelle wie das Idle, liest er sich als Fortsetzung des
  Idle statt als Aktion (bewiesen: der Getigerten-Angriff wirkte wie „Weiterputzen",
  weil er dieselbe Pfote zur Schnauze führte). → Angriff über **eigene Pose-Signale**
  codieren: ein Glied, das das Idle nie anfasst; Maul auf / Zähne; Ohren anlegen;
  Schlag/Pfote klar nach vorn (+z) statt zur Ruhepose. Dann ist die Aktion auch als
  Standbild vom Idle unterscheidbar.
- **Animation aus mehreren Frames beurteilen**, nicht aus einem Standbild – der
  Montage-Streifen (`snap.mjs`) zeigt den Angriff in 3 Phasen (Ausholen, Kontakt,
  Rückkehr). Ein einzelner mittlerer Frame verbirgt Ruckler und Farb-Washes.

### Effizienz (Runden/Token sparen bei gleicher/besserer Qualität)

- **Teile-Bibliothek statt Neuerfindung.** Wiederkehrende Rigs (Gelenk-Arm/-Bein,
  Vierbeiner-Grundgerüst, Schwanzkette, Gesichts-Kit) stehen kopierfertig in
  `PARTS.md`. Der Designer **kopiert + tunt Zahlen**, statt jede Gliedmaße neu
  herzuleiten. Hält die bewährte Gelenk-Struktur automatisch ein (keine Segment-
  Rotation) und spart die typische „Rig kaputt"-Runde. Neue gute Muster dort ergänzen.
- **Referenz-Steckbrief gegen Proportions-Runden.** Proportion ist die häufigste
  Kritik-Ursache. Liegt eine Vorlage vor (Nutzer-Upload oder Web-Bild), liest der
  **bildfähige Orchestrator** sie und gibt dem text-only Designer **Zahlen** (Kopf:Rumpf,
  Beinlänge, Schwanz, Palette-Hex) statt einer Bilddatei. Wer den Steckbrief trifft,
  spart die „zu groß / falsche Proportion"-Runde. Format in `PARTS.md`.
- **Designer-Pre-Flight vor Abgabe.** Eine kurze Selbstcheck-Liste (visual.height?
  kein root-emissive? kein rot auf Segmenten? Gesicht mehrteilig? idle ≥2 Teile?) fängt
  genau die Trivialfehler ab, die sonst je eine volle Runde kosten. Steht im
  `figuren-designer.md`.
