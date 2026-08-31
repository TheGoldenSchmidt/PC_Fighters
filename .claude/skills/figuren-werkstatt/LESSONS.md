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
  Silhouetten-Kante, wo sie über den Nachbarn hinausragen. Kontrast heißt dabei
  **Helligkeitssprung**, nicht nur „andere Farbe": weiße Sklera (`#ffffff`) auf
  cremeweißem Fell (`#e8e4dc`) blieb unlesbar (bewiesen am Eisbären) – erst eine
  **dunkle Augenhöhle hinter** der Sklera machte das Auge lesbar. Bei hellen Figuren
  helle Detail-Teile immer mit einem dunklen Gegenstück hinterlegen.

- **Animations-Tracks sind Offsets auf den Ruhewert, keine Absolutwerte.**
  `AnimationPlayer.ts` setzt jeden Frame zuerst auf den `visual.parts`-Basiswert
  zurück und addiert dann den Track-Wert (`addAxis`: `target.x += v`). Ändert ein
  Spezialist den Ruhewert (`rot`/`pos`) eines Teils, das in `animations` vorkommt,
  verschiebt sich der komplette Track mit – die Animation kann unlesbar werden, ohne
  dass jemand `animations` angefasst hat. Bewiesen am Eisbären: der Gesicht-Spezialist
  öffnete `jawLower` im Ruhezustand (0.15→0.38), danach stand das Maul im Standbild
  fast so offen wie im Angriff und Linse C kippte von GUT auf ÜBERARBEITEN. → **Regel:**
  Wer einen Ruhewert ändert, prüft im selben Zug die Tracks desselben Teils (oder
  meldet die Verschiebung explizit an den Animations-Spezialisten weiter).

- **Spezialisten wirklich sequenziell fahren.** Laufen Basis-Designer und ein
  Spezialist (oder zwei Spezialisten) versehentlich **parallel** auf derselben Datei,
  ist das ein Lost-Update-Risiko: der später schreibende Agent kann den anderen
  überschreiben, auch wenn die Scopes disjunkt sind. → Wie in SKILL.md Schritt 6
  beschrieben nacheinander laufen lassen; passiert es doch parallel, hinterher
  **verifizieren**, dass beide Änderungssets tatsächlich in der Datei stehen
  (Stichprobe je Linse), bevor die nächste Montage gebaut wird.

- **Kinder nie direkt an ein nicht-uniform skaliertes Mesh parenten.** Mr. Hat war
  zunächst praktisch unsichtbar, weil die Puppe unter `handL` hing und dessen
  `scale [0.14, 0.17, 0.10]` vollständig erbte. → Zwischen Segment/Mesh und Zubehör
  immer eine **unskalierte `group` als Anker** setzen (`handAnker → handMesh +
  Requisit`). Dasselbe gilt für Manschetten, Waffen, Hüte und Gesichtsteile.

- **Bibliotheks-Fragmente nicht blind übernehmen – Konnektivität rechnerisch
  prüfen.** Ein Zahlenfehler in `PARTS.md` (Kindgelenk-Versatz mit voller
  Segmenthöhe statt `h/2`) wurde beim Pferd wörtlich mitkopiert und erzeugte über
  drei Runden systematisch eine Lücke an jedem Gelenk – die Montage ließ das nur
  erahnen, im interaktiven Viewer fiel es sofort auf („Körperteile hängen nicht
  zusammen"). → Vor Abgabe jede Kette **rechnerisch** prüfen (kleines Skript, das
  die `CardFigure.ts`-Transformsemantik nachbildet und Segment-Ende gegen
  Kindgelenk-Weltposition rechnet; Erwartung: Abstand 0). Entpuppt sich ein
  Fragment als fehlerhaft, `PARTS.md` **sofort korrigieren** statt den Fehler
  weiterzukopieren.

- **Montage-GUT ist noch keine Viewer-Abnahme.** Der Kritiker urteilt aus 6
  Standbildern; der Nutzer inspiziert interaktiv in 3D (drehen, zoomen, Klips).
  Gelenk-Lücken, schwebende Teile und verzerrte Posen, die in den festen
  Kamerawinkeln kaschiert sind, fallen dort sofort auf (bewiesen am Pferd: Montage
  dreimal „freigabereif", Viewer-Urteil „sehr unzufrieden"). → Silhouetten in allen
  drei Ansichten aktiv auf herausragende/abgelöste Teile absuchen (Beispiel
  `backRidge`: Box länger als die Rumpf-Rundung = schwebender Strich) und bei
  Figuren mit Gelenkketten die finale Abnahme immer über den Viewer einholen.

---

## Best Practices (aus Erfolgen gelernt)

### Serienvorlagen / 2,5D-Cutout-Stile

- **Stiltreue beginnt mit vermessener Silhouette, nicht mit mehr Details.** Bei
  Butters, Kenny und Mr. Garrison wurden offizielle freigestellte Referenzen zuerst
  als Zahlenbrief ausgewertet (Alpha-Bounding-Box, Kopfanteil, Zeilen-Breitenprofil,
  Kopf:Rumpf-, Hood:Körper- und Augenverhältnisse). → Vor dem ersten Part die
  charakteristischen Außenkonturen und 5–8 Verhältnisse festschreiben; erst danach
  Kleidungslinien und Accessoires bauen.

- **Bei flachen Zeichentrickserien ist die Frontansicht die Identitäts-Linse.** Ein
  generisch rundes 3D-Modell verliert trotz richtiger Farben den Seriencharakter. →
  Zuerst eine nahezu deckungsgleiche Front-Silhouette aus flachen Layern bauen,
  danach Seite und Rücken ergänzen. Ikonische Konturen als eigene Papierlagen:
  Butters = asymmetrische Haarspitzen + Stirnfransen; Kenny = Hood-Rand + braunes
  Innenfeld + Hautraute; Garrison = Brille + kahle Stirn + flache Seitenhaare.

- **Tiefe als Budget behandeln: weder Rasierklinge noch Plastikfigur.** Große
  Highlight-/Shadow-Meshes machten Kennys Hood zum glänzenden 3D-Donut; vollständiges
  Abflachen macht die Seitenansicht dagegen zu planar. → Frontdetails sehr dünn
  staffeln, aber Kopf/Rumpf mit einer kontrollierten Bas-Relief-Tiefe versehen.
  Lichtflecken nicht als Geometrie modellieren. Nach bestandenem Frontvergleich die
  Tiefe ausschließlich in Seiten-/Rückansicht erhöhen und erneut prüfen, dass die
  Frontsilhouette unverändert bleibt.

- **Serienspezifische Augen nicht durch generische Kugelaugen ersetzen.** South-Park-
  Identität entstand erst durch fast berührende weiße Ovale, sehr kleine Pupillen,
  dünne Lider/Brillenlinien und den korrekten Blick. → Augenbreite/-höhe, Abstand,
  Pupillengröße und Lidüberdeckung separat aus der Referenz messen; Gesichtslinien
  als dünne Frontlayer statt volumetrische Röhren bauen.

- **Statische Identität vor Animation freigeben.** Die beste Runde entstand, als
  Linse C bewusst eingefroren und der `animations`-Block per Hash bytegleich gehalten
  wurde, bis Silhouette, Proportion, Standardpose und Gesicht überzeugten. → Bei
  bekannten Serienfiguren zuerst nur A+B in Front/Seite/Hinten iterieren; Animation
  erst nach Nutzerfreigabe der Ruhefigur beginnen. So überdecken Bewegungen keine
  Formfehler und statische Korrekturen müssen nicht ständig in Tracks nachgezogen
  werden.

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
  Textur bei der Unterscheidbarkeit. **Aber nur stabile Haltungen** (sitzend, kauernd,
  kniend) taugen als Ruhepose – eine **dynamische Aktions-Pose** (aufbäumend,
  springend, mitten im Schlag) als Ruhepose einzufrieren wirkt „komisch", zwingt die
  Gelenkketten in Extremwinkel und nimmt dem Angriff seine Steigerung (bewiesen am
  Pferd: aufbäumende Ruhepose → Nutzer-Ablehnung; ruhiger Stand + Aufbäumen im
  `attack`-Klip → Freigabe).

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
  Segment `pos [0, -h/2, 0]` vom Gelenk, kein `rot`). Dasselbe abwärts: das
  **Kindgelenk** sitzt `h/2` unter der Segment-**Mitte** (nicht die volle Höhe –
  klassische Lückenquelle, siehe Fallstrick „Bibliotheks-Fragmente"). So gibt es
  keine Lücke.
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

### Signature-Merkmal vs. Animations-Lesbarkeit

- Ein Merkmal, das schon im Standbild sichtbar sein soll (z. B. ein brüllendes Maul),
  darf die Animation nicht vorwegnehmen – sonst gibt es im Angriff nichts mehr zu
  steigern und die Aktion wirkt wie eine Fortsetzung der Ruhepose (siehe auch
  „Animation muss andere Bausteine/Achsen bewegen" oben). Balance am Eisbären: Ruhepose
  **leicht** angedeutet (`jawLower` Ruhewinkel 0.12), die volle Ausprägung liefert erst
  der Angriffs-Klip (Öffnung bis ~0.77 beim Kontakt).

### Effizienz (Runden/Token sparen bei gleicher/besserer Qualität)

- **Teile-Bibliothek statt Neuerfindung.** Wiederkehrende Rigs (Gelenk-Arm/-Bein,
  Vierbeiner-Grundgerüst, Schwanzkette, Gesichts-Kit) stehen kopierfertig in
  `PARTS.md`. Der Designer **kopiert + tunt Zahlen**, statt jede Gliedmaße neu
  herzuleiten. Hält die bewährte Gelenk-Struktur automatisch ein (keine Segment-
  Rotation) und spart die typische „Rig kaputt"-Runde. Neue gute Muster dort ergänzen.
- **Referenz-Steckbrief gegen Proportions-Runden.** Proportion ist die häufigste
  Kritik-Ursache. Liegt eine Vorlage vor (Nutzer-Upload oder Web-Bild), liest der
  **bildfähige Orchestrator** sie und gibt dem text-only Designer **Zahlen** (Kopf:Rumpf,
  Beinlänge, Schwanz, Palette-Hex) statt einer Bilddatei. Bei freigestellten
  Serienreferenzen zusätzlich Alpha-Bounding-Box und mehrere horizontale
  Breitenprofile messen: So wurden der zu breite Kenny-Hood und Garrisons zu großer
  Kopf trotz widersprüchlicher Sichtkritik objektiv korrigiert. Wer den Steckbrief
  trifft, spart die „zu groß / falsche Proportion"-Runde. Format in `PARTS.md`.
- **Designer-Pre-Flight vor Abgabe.** Eine kurze Selbstcheck-Liste (visual.height?
  kein root-emissive? kein rot auf Segmenten? Gesicht mehrteilig? idle ≥2 Teile?) fängt
  genau die Trivialfehler ab, die sonst je eine volle Runde kosten. Steht im
  `figuren-designer.md`.
