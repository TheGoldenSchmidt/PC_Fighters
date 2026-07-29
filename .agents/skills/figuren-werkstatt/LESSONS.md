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

- **`emissive` wäscht *jedes* Ziel weiß – auch winzige Werte.** Der
  `AnimationPlayer` setzt `emissive` hart auf **Weiß** (`setRGB(1,1,1)`) und regelt
  nur die Intensität; der Track addiert also Weiß auf die Materialfarbe. Auf `root`
  = komplette Figur cremeweiß. Aber schon **0.15 auf einem einzelnen kleinen Teil**
  hat beim Stahlgießer die glühende Schmelze zu blassrosa Suppe gemacht – der
  Fehler sah wie ein Farbfehler aus, ich habe zweimal vergeblich die Palette
  nachgedunkelt. → **Gar kein `emissive`, wenn das Teil eine Farbidentität hat.**
  Glut/Feuer/Magie über eine **dunkle, satte Grundfarbe** lösen (siehe
  Lichtbudget-Eintrag) und die Bewegung über Pose/Skalierung. `emissive` höchstens
  als kurzer Blitz auf einem Teil, dessen Farbe egal ist.

- **Das Licht ist ~3× – helle Farben clippen zu Weiß.** Bühne und Schlachtfeld
  fahren Key 2.35 + Hemisphere 1.55; eine nach oben zeigende Fläche bekommt also
  rund das Dreifache ihres Albedo, danach ACES-Tonemapping. Alles heller als etwa
  50 % Helligkeit läuft in den Kanälen an und entsättigt Richtung Weiß/Pastell. →
  Farben, die satt lesen sollen, **deutlich dunkler wählen als das gewünschte
  Bildschirmergebnis**: flüssiger Stahl wurde erst als `#6b1602`/`#942603`
  wirklich orangerot, `#ffc247` sah aus wie Vanillepudding.

- **Kleine Kontrast-Teile verschwinden auf ihrem Nachbarn.** Fangzähne in `cream`
  direkt vor `cream`-Wangen sind nicht lesbar. → Detail-Akzente (Zähne, Krallen,
  Augen) brauchen eine **eigene Kontrastfarbe** und Platzierung an einer
  Silhouetten-Kante, wo sie über den Nachbarn hinausragen.

- **Große Materialflächen in derselben Farbfamilie verschmelzen zu einem Klumpen.**
  Beim Stahlgießer waren Schürze, Stiefel und Stielholz alle braun – die untere
  Figurhälfte las sich als eine einzige Masse. → Benachbarte Großflächen brauchen
  **Helligkeitsabstand, nicht nur Farbtonabstand**. Die Hose auf ein kühles
  Blaugrau (`#3b4550`) zu ziehen hat Beine, Schürze und Schuhe sofort getrennt.

- **Was über den Kopf ragt, schrumpft die ganze Figur.** Der Auto-Fit skaliert
  über die Bounding-Box-Höhe, ein hochstehendes Anbauteil (Visier, Antenne,
  Federbusch) frisst also Maßstab vom eigentlichen Körper. → Aufbauten flach
  anlegen oder nach hinten neigen; Höhenprobleme immer erst an der Bounding-Box
  suchen, bevor man an `visual.height` dreht.

- **Ein Arm auf der kameraabgewandten Seite hinter einem großen Requisit ist
  unsichtbar.** Der linke Arm des Stahlgießers steckte komplett hinter der
  Gießpfanne; im 3/4-Bild schwebte nur noch die Schulterplatte frei. → Nach jeder
  Posenänderung **beide 3/4-Ansichten** prüfen (`yaw ≈ +0.5` und `≈ -0.8`) und
  große Requisiten so weit vom Körper wegsetzen, dass die Gliedmaße dazwischen
  frei gegen den Hintergrund steht.

- **Vollbild-Kacheln verbergen genau die Fehler, die zählen.** Griffe, Finger und
  Gesichter sind bei ganzer Figur nur wenige Pixel groß; drei Runden lang sahen
  meine Hände „ungefähr richtig" aus und griffen tatsächlich ins Leere. → Neben
  der Übersichtsmontage **Ausschnitte** rendern (Crop auf Kopf und auf die
  Greifzone), sonst wird an der falschen Stelle optimiert.

- **Regelmäßig gereihte Haarteile lesen als Krone, Borte oder Helm.** Selbst die
  richtige Farbe hilft nicht, wenn runde Loben oder eine waagerechte Platte die
  Silhouette bestimmen. → Haar zuerst als **zusammenhängende Masse mit breitem
  Ansatz** bauen und danach wenige unregelmäßige, klar nach hinten gerichtete
  Strähnen ergänzen.

- **Ein überdimensionierter Kopf wird durch zusätzliche Höhe zum Ei.** Mehr
  Schädelhöhe verstärkt nicht automatisch den Charakter, sondern verschmälert
  die Frontsilhouette. → Zuerst Stirn- und Schläfenbreite sowie die Verjüngung
  zum Kinn festlegen; Überzeichnung hauptsächlich über Breite und den
  Gesamtmaßstab erzeugen.

- **Viele gleichmäßige Zähne erzeugen eine Gitterleiste.** Zwei saubere Reihen
  kleiner Zähne verdrängen die dunkle Mundöffnung und lesen nicht mehr als
  Gesicht. → Wenige unterschiedlich große Zähne mit sichtbaren dunklen Lücken
  und klarer Mundhöhle verwenden.

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

### Was „Charakter" statt „Bausteinhaufen" erzeugt

Der Sprung von den frühen zu den guten Figuren lag nicht am Detailgrad, sondern an
drei Eigenschaften – ein 102-Zeilen-Wolf und eine 155-Zeilen-Figur unterscheiden
sich weniger in der Teilezahl als in diesen Punkten:

- **Tiefe Gruppenketten statt flacher Liste.** Die Uralte Schlange kurvt nur, weil
  `halsBasis → halsMitte → halsOben → nacken → kopf` verschachtelt ist; jede Gruppe
  trägt einen kleinen Winkel und die Summe ergibt die Kurve. Dasselbe gilt für
  Gliedmaßen: `armL → handschuhL` mit je einer aimenden Gruppenrotation ist
  leichter zu posieren *und* zu animieren als absolut gesetzte Einzelteile.
- **Erzählende Details statt Symmetrie.** Was eine Figur zur Person macht, sind
  Dinge mit Vorgeschichte: abgeworfene Haut, Brandflecken und ein Brandloch in der
  Lederschürze, Rußschmierer auf der Wange, nur *ein* Schulterpanzer, Werkzeug im
  Gürtel. Links/rechts bewusst ungleich bauen – auch Beinstellung und Kopfdrehung
  gegen die Rumpfdrehung (Gegenpose).
- **Ein Charaktermoment in der Animation.** Ein Zustandswechsel, der etwas über die
  Figur erzählt, schlägt jede zusätzliche Bewegungsspur: Der Stahlgießer **klappt
  beim Angriff das Schweißschild vors Gesicht und danach wieder hoch**. Solche
  Momente zuerst planen, dann die Pose drumherum bauen.

### Werkzeug in der Hand

- **Das Werkzeug muss *Kind* der Werkzeugkette sein, nie Geschwister.** Als
  Geschwister von Arm/Stiel animiert, driften Werkzeugteile auseinander: Die
  Gießpfanne löste sich mitten im Angriff vom Stiel und flog frei durch die Luft,
  weil Stiel und Schale eigene, nie perfekt synchrone Spuren hatten.
- **Waagerecht bleibendes Werkzeug an schrägem Stiel: Gegenrotation einziehen.**
  Eine Pfanne, Laterne oder ein Eimer an einem 60°-Stiel darf nicht mitkippen.
  Dreistufig lösen: `stielGruppe` (geneigt) → `gegenrotation` (hebt die
  Stielneigung exakt auf) → `kippGruppe` (Ruhewinkel 0, **hier** animieren). Die
  Gegenrotation ist die Euler-Zerlegung von `Rᵀ` der Stielrotation – einmal
  ausrechnen, als feste Zahlen eintragen (beim Stahlgießer `[-0.708, 0.767,
  -0.681]` gegen den Stiel `[0.993, 0, 0.977]`). Die `kippGruppe` gibt danach eine
  saubere Kippachse für Gieß-/Schütt-Animationen.
- **Griffpunkt zuerst, Arm danach.** Den Punkt am Werkzeug festlegen, dann die
  Armkette darauf rechnen: Richtung `d` normieren, `θz = asin(dₓ)`, `θx` aus
  `cos θz · cos θx = d_y`. Kettenlänge ≈ Abstand wählen, sonst greift die Hand
  daneben. „Ungefähr hinstellen und hoffen" kostet mehr Runden als das Rechnen.
- **Eine korrekte Werkzeugkette beweist noch keinen sichtbaren Griff.** Ärmel,
  Hand und Werkzeug können technisch verbunden sein und im Render trotzdem wie
  ein am Arm montiertes Gerät wirken. → In einer Greifzonen-Nahaufnahme
  mindestens Handfläche und zwei hautfarbene Finger auf einem kontrastierenden
  Griff nachweisen.

### Farbe / Material für Glühendes

- **Glut ohne `emissive`:** dunkle satte Grundfarbe + `roughness` ~0.9 +
  `metalness` 0. Aufbau in drei Ringen – dunkler Außenrand, heller Kern, schmaler
  Saum dazwischen – liest sich als flüssiges Metall. Glänzende Werte
  (`roughness` <0.3) blasen unter dem starken Key-Licht sofort aus.

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
- **Schwünge kommen aus dem Rumpf, nicht aus dem Hebel.** `rot.z` auf einer langen
  Werkzeuggruppe wirkt über den Hebelarm: 0.4 rad haben die Gießpfanne einen halben
  Meter hoch vors Gesicht gerissen – es sah aus, als würde er daraus trinken. →
  Waagerechte Schwünge über **`rot.y` der Werkzeuggruppe plus `rot.y` von
  `oberkoerper`/`becken`**; `rot.x`/`rot.z` klein halten, die ändern vor allem die
  Höhe des Werkzeugkopfes.
- **Ströme und Tropfen nicht über `scale` erzeugen.** `scale` wirkt uniform – ein
  auf 5× gezogener Tropfen wird zum Ballon, nicht zum Strahl. → Teil in seiner
  **Zielform** bauen (schlanker Zylinder), im Ruhezustand **in undurchsichtiger
  Geometrie parken** und per `pos` herausfahren lassen. Achtung: `opacity`-Spuren
  *multiplizieren* die Grund-Deckkraft, aus Basis 0 lässt sich also nichts
  einblenden – Verstecken geht nur über Geometrie.
- **Herausgefahrene Teile beim Zurückfahren kleinschrumpfen.** Sonst reist der
  Tropfen sichtbar zurück in die Pfanne. Am Klipende `scale` auf ~0.2 ziehen, den
  Positionssprung in ein 20-ms-Fenster legen, danach auf 1 zurück.
- **Kippt ein Behälter über 90°, drehen sich seine Kindteile mit.** In der
  Todesanimation stand der Guss-Strahl plötzlich senkrecht *über* der Pfanne, weil
  „unten" in deren Frame nach oben zeigte. → Bei starker Rotation des Elternteils
  Positionsspuren der Kinder weglassen und stattdessen ausblenden/schrumpfen.
- **Tod muss lesbar bleiben.** Root-Neigung plus Rumpfbeuge plus einsinkende Beine
  summieren sich schnell zu einem formlosen Haufen, den die erhöhte Kamera von oben
  zeigt. → Beugewinkel einzeln klein halten (Root ~0.18, Rumpf ~0.34) und das
  Werkzeug **seitlich ins Leere fallen lassen**, statt es hinter den Körper zu
  drehen – der umgekippte Gegenstand erzählt den Tod mit.

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
- **Eine leere Montagekachel ist nicht automatisch ein Figurenfehler.** Ein
  Aufnahme-/Canvasfehler kann eine einzelne Ansicht unterschlagen und so eine
  rote Kritikerlinse vortäuschen. → Auffällige Einzelansichten mit dem
  Standard-Snapshot gegenprüfen, bevor dafür eine Überarbeitungsrunde verbraucht
  wird.

### Werkzeug / Viewer

- **Viewer-Statistiken strukturiert auslesen.** Getrennte Label- und
  Wertelemente erzeugen bei einer Fließtext-Suche fälschlich `0 Bausteine`. →
  Zuerst `.figure-stats strong` lesen und den Text-Regex nur als Fallback nutzen.
- **`localhost` ist gerätebezogen.** Ein Desktop-Link mit `localhost` verweist
  auf einem Handy auf das Handy selbst. → Für die mobile Abnahme die WLAN-IP
  des PCs verwenden, Client und Server auf allen Schnittstellen starten und
  beide Endpunkte über die LAN-Adresse prüfen.
