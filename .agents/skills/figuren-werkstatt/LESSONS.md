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

- **Überarbeitungen gehören zum selben Autor.** `SendMessage` an die bestehende
  Agent-ID nutzen; ein frischer `Agent`-Aufruf verliert den Kontext. **Niemals
  `isolation: "worktree"`** – ein Worktree-Agent bearbeitet eine isolierte
  Repo-Kopie, die der laufende Dev-Server nie liest; die Änderung kommt in der
  Vorschau nicht an.

- **Browser-MCP ist nicht überall verfügbar.** Der Screenshot-Schritt läuft über
  das committete `scripts/snap.mjs` (Playwright, `executablePath:
  /opt/pw-browsers/chromium`, Import aus dem globalen `playwright`). Browser-MCP
  (`mcp__Claude_Browser`) nur als Alternative, wenn vorhanden.

- **Einzelklips lassen sich nach dem Tod nicht erneut vergleichen.** Ein alter
  `death`-Zustand hält Figur und Schatten unsichtbar oder blockiert den nächsten
  Tod-Klip. → **Vor jedem Live-Viewer-Klip die Figur in einen neutralen Idle-
  Zustand zurücksetzen**, damit Einzug, Angriff, Treffer und Tod beliebig oft
  reproduzierbar bleiben.

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

- **Eine weit ausgestreckte Angriffspfote wirkt schnell wie ein schwebendes
  Einzelteil.** Wird die gesamte Vorderbein-Gruppe von der Schulter wegverschoben,
  reißt die anatomische Verbindung im Render ab. → Den Schulteransatz am Rumpf
  verankert lassen und Reichweite über Ober-/Unterarmrotation mit sichtbar
  durchgehendem Schulter–Ellbogen–Pfoten-Bogen erzeugen.

- **Sehr dunkle Figuren verschmelzen in Seiten- und Rückansicht.** Zu geringe
  Albedo-Abstände lassen Rumpf und Beine trotz korrekter Geometrie zu einer Fläche
  werden. → Dunkle Palettenwerte sichtbar staffeln und Kontrastkanten gezielt an
  Schulter, Flanke und äußeren Läufen platzieren; Glow ist kein Ersatz für
  Albedo-Kontrast.

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

### Mehrfigurige Modelle

- **Begleitfiguren dürfen den Auto-Fit nicht zur gleichrangigen Doppelsilhouette
  aufweiten.** Zwei ähnlich große Körper werden klein gerendert und verlieren ihre
  Rollenlesbarkeit. → Den Begleiter deutlich kleiner an der Flanke der Hauptfigur
  platzieren, mit eigenem Kopf lesbar halten und bei Angriffen geschützt ducken
  lassen.

### Schwanz / Anhänge

- **Verjüngende Kegelkette** (`base → mid → tip` via `parent`) + mehrere
  Fluff-Icos an der Spitze ergeben einen buschigen Schwanz; ein einzelner Kegel
  mit Kugel wirkt wie eine Fahnenstange.

### Animation

- **Immer ein lebendiger `idle`-Loop**, der **≥2 benannte Teile** bewegt
  (Atmen/Wippen + Schwanz/Ohren/Kleidung).
- **`attack` thematisch überschreiben** passend zum Projektil-Emoji (🐾 → Biss/
  Sprung, 🪨 → Wurf, ⚔️ → Hieb). Bewegung, nicht Blitz.
- **Animation aus mehreren Frames beurteilen**, nicht aus einem Standbild – der
  Montage-Streifen (`snap.mjs`) zeigt den Angriff in 3 Phasen (Ausholen, Kontakt,
  Rückkehr). Ein einzelner mittlerer Frame verbirgt Ruckler und Farb-Washes.
- **Kontaktpose leicht aus der Kameraachse drehen.** Frontal in die Kamera
  geführte Waffen, Schnäbel oder Kiefer verdecken sich im entscheidenden Frame
  selbst. → Angriff und Zielteil seitlich versetzen oder leicht eindrehen, bis
  die Silhouette in der Kontaktphase klar lesbar bleibt.
- **Werkzeug selbst muss die Kontaktpose tragen.** Hochgerissene Arme oder starke
  Root-Neigung lesen sich schnell als Jubeln beziehungsweise Verbeugen. → Den
  nicht angreifenden Arm ruhig halten, das Werkzeug seitlich freistellen und
  dessen Kopf oder Klinge sichtbar durch den Kontaktbogen führen.
- **Montagezeitpunkte müssen semantischen Schlüsselbildern folgen.** Globale
  Prozentwerte treffen bei kurzen oder asymmetrischen Angriffen häufig nicht
  Windup, Kontakt und Rückkehr. Auch `Animation starten → warten → Screenshot`
  ist wegen Render- und Screenshot-Latenz nicht deterministisch. → `windup`,
  `contact` und `return` als semantische Aufnahmezeitpunkte markieren und den
  Clip für die Montage exakt an diesen Zeiten auswerten und einfrieren.
- **Kompakte Vögel zuerst über die Ruhe-Silhouette bauen.** Lange sichtbare Läufe
  und ein schmaler Rumpf wirken trotz Eulengesicht humanoid. → Rumpf breit und
  tief bauen, Beinansätze im Gefieder verbergen und fast nur Krallen zeigen.

### Werkstatt-Schleife / Kosten

- **Eine Angriffsmontage prüft keine vollständige Animation.** Individuelle
  Einzüge und Todesanimationen können strukturell vorhanden, aber visuell
  fehlerhaft sein. → Die Standardabnahme zeigt zusätzlich mindestens zwei
  Einzugs- und zwei Todesphasen.
- **Bei gleichzeitig roten A/B/C-Linsen zuerst integriert überarbeiten.** Drei
  sofortige Spezialisten lesen dieselbe Figur mehrfach und können einander
  unnötig nachlaufen. → Zuerst eine kompakte Gesamtrevision beim bestehenden
  Designer; Spezialisten nur für danach verbleibende rote Linsen einsetzen.
- **Unveränderte Ansichten nicht erneut rendern.** Eine reine Animationsänderung
  verändert Körper, Gesicht und Rundumansichten nicht. → Vorhandene Kacheln
  wiederverwenden und nur die betroffenen Clips neu aufnehmen.

### Werkzeug / Viewer

- **Viewer-Statistiken strukturiert auslesen.** Getrennte Label- und
  Wertelemente erzeugen bei einer Fließtext-Suche fälschlich `0 Bausteine`. →
  Zuerst `.figure-stats strong` lesen und den Text-Regex nur als Fallback nutzen.
- **`localhost` ist gerätebezogen.** Ein Desktop-Link mit `localhost` verweist
  auf einem Handy auf das Handy selbst. → Für die mobile Abnahme die WLAN-IP
  des PCs verwenden, Client und Server auf allen Schnittstellen starten und
  beide Endpunkte über die LAN-Adresse prüfen.
