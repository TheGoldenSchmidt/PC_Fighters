# Werkstatt-Wissen

Diese Datei wird **vor jeder anderen Werkstattaktion vollständig gelesen**. Sie
enthält nur Regeln, die eine Entscheidung ändern oder einen wiederholt beobachteten
Fehler verhindern. Details für seltene Bauformen stehen in
[`references/technical-recipes.md`](references/technical-recipes.md) und werden nur
bei passendem Brief geladen.

Jede Regel folgt dem Muster *Problem → Vermeidung*. Neue Erkenntnisse werden zuerst
mit bestehenden Regeln zusammengeführt; eine neue Regel entsteht nur, wenn sie nicht
bereits daraus folgt.

## 1. Identität vor Konstruktion

- **Name, Silhouette und Spielrolle müssen dieselbe Figur erzählen.** Technische
  Karten-IDs oder alte Referenznamen dürfen die sichtbare Identität nicht bestimmen.
  → Vor der Rig-Wahl die Dreierkette aus Kartenname, Anatomie und tatsächlicher
  Fähigkeit/Synergie prüfen; konkrete Familienbegriffe müssen im Modell erkennbar
  sein.
- **Ähnliche Figuren brauchen einen Anker, nicht zehn Neuanfänge.** Ohne festes
  Vergleichsmodell werden ganze Familien unnötig neu gebaut oder erneut zu Klonen.
  → Pro Ähnlichkeitsgruppe eine bereits gute Figur behalten und nur die zu ähnlichen
  Vertreter anhand ihrer Rolle überarbeiten.
- **Arterkennung entsteht zuerst in der schwarzen Silhouette.** Palette und kleine
  Accessoires trennen Wolf/Welpe, Spatz/Eule oder Schlange/Kobra nicht zuverlässig.
  → Vor Details mindestens zwei artbestimmende Merkmale festlegen und in Front und
  Seite sichtbar bauen, etwa Körpermasse plus Haltung, Kopfprofil plus Schweif oder
  Haube plus aufgerichteter Hals.
- **Gemeinsames Rig darf nicht wie eine gemeinsame Figur aussehen.** → Skelett und
  Anschlüsse dürfen geteilt werden; Körpermasse, Haltung, Kopf, Schlüsselrequisit
  und Charaktermoment müssen pro Kartenidentität eigenständig sein.

## 2. Modell lesbar bauen

- **Auto-Fit reagiert auf die Bounding-Box, nicht auf gefühlte Größe.** Hohe
  Aufbauten schrumpfen den Körper; lange flache Tiere werden über die Höhe zu breit
  skaliert. → Erst die Bounding-Box prüfen, unnötige Höhenspitzen flach/neigend
  bauen und danach `visual.height` gegen eine gute Figur derselben Bauart einstellen;
  bei flachen Tieren zusätzlich die Bildschirm-Länge vergleichen.
- **Starkes Bühnenlicht macht helle Materialien weiß und `emissive` wäscht Farben
  aus.** → Identitätsfarben dunkler und satter als das Zielbild anlegen, benachbarte
  Großflächen über Helligkeit trennen und `emissive` nicht auf farbtragenden Teilen
  verwenden. Glut über dunkle Grundfarbe, Form und Bewegung statt Dauerleuchten
  darstellen.
- **Details zählen nur, wenn sie im Spielmaßstab lesbar sind.** → Gesicht zuerst als
  klare Masse bauen; dann helle Augenfläche plus dunkle Pupille, abgesetzten Kiefer,
  Ohrinnenteile und wenige kontrastierende Zähne/Strähnen ergänzen. Wichtige Details
  an eine Silhouettenkante setzen statt Ton-in-Ton vor den Körper.
- **Begleiter vor dem Hauptkörper wirken schnell wie Abzeichen.** → Begleitfigur
  ausreichend groß bauen, räumlich und seitlich aus der Hauptkontur versetzen und
  durch einen dunkleren/helleren Hintergrund trennen; mindestens Kopf und ein
  Körperteil müssen eine eigene Silhouettenkante bilden.
- **Flache Teilelisten ergeben starre Bausteinhaufen.** → Anatomie und bewegliche
  Anhänge als sinnvolle Gruppenketten verschachteln; wenige asymmetrische,
  erzählende Details und eine Gegenpose einsetzen. Teilezahl allein ist kein
  Qualitätsmaß.
- **Seltene Konstruktionen nicht neu erraten.** Bei Membranen, Werkzeugen,
  Flüssigkeits-/Effektteilen oder buschigen Anhängen nach diesem Dokument gezielt
  den passenden Abschnitt in `references/technical-recipes.md` lesen.

## 3. Animation erzählt die Rolle

- **Jede Figur braucht einen lebendigen `idle`-Loop.** → Mindestens Körperatmung
  und ein zweites benanntes Teil wie Ohren, Schweif, Flügel oder Kleidung bewegen.
- **Eine vorhandene Bewegung ist noch keine verständliche Aktion.** Unterstützer
  wirkten mit generischem Hieb bedeutungslos; Angreifer mit unbewegtem Requisit
  wirkten wie Jubeln. → Aus der Kartenrolle einen klaren Dreischritt bauen:
  Sammeln/Ausholen → Wirkung/Kontakt → vollständige Rückkehr. Das
  Schlüsselrequisit (auch Banner, Medaillon oder Megafon) muss die Wirkungspose
  sichtbar tragen.
- **Globale Aufnahmeprozente treffen kurze oder asymmetrische Aktionen schlecht.**
  → Für `windup`, `contact` und `return` semantische Zeiten festlegen und genau dort
  rendern; mehrere Frames statt eines Standbilds beurteilen.
- **Frontale Kontaktposen verdecken sich selbst.** → Kopf, Schnabel, Kiefer, Waffe
  oder Requisit leicht aus der Kameraachse drehen und im Kontaktbild gegen freien
  Hintergrund prüfen.
- **Tod darf nicht zum unlesbaren Haufen werden.** → Rotationen auf wenige Ebenen
  verteilen, Beugewinkel klein halten und ein Requisit oder einen Anhang sichtbar
  seitlich fallen lassen.

## 4. Prüfung spart Überarbeitungsrunden

1. **Vor dem Rendern strukturell prüfen:** Palette/Hexwerte, eindeutige Teilnamen,
   Eltern-vor-Kind, Pflichtgrößen und alle Animationstrack-Ziele validieren.
2. **Den gerenderten Datenstand beweisen:** Server nach jeder Datenrunde neu starten,
   einen markanten Wert aus `/info` mit der Datei vergleichen und die Bausteinzahl im
   Viewer strukturiert auslesen. Erst danach kritisieren.
3. **Das Sichtbare prüfen:** Front, beide Seiten/3/4 und Rückseite sowie semantische
   Angriffsphasen rendern; Einzug und Tod zusätzlich in mindestens zwei Phasen
   ansehen. Gesicht, Griff und jede geänderte Problemzone als Ausschnitt prüfen.
4. **Gezielt iterieren:** Bei roter Körperlinse zuerst denselben Basis-Designer
   nacharbeiten lassen; erst verbleibende Gesichts-/Animationsfehler an Spezialisten
   geben. Danach nur betroffene Ansichten neu aufnehmen, vor der finalen Abnahme aber
   wieder eine vollständige Montage erzeugen.

- **Eine auffällige Einzelkachel kann ein Aufnahmefehler sein.** → Mit einem zweiten
  Standard-Snapshot gegenprüfen, bevor eine Überarbeitungsrunde gestartet wird.
- **Der Viewer kann Zustand behalten.** → Vor jedem Einzug-, Angriffs-, Treffer- oder
  Todesvergleich auf neutrales Idle zurücksetzen.
- **`localhost` funktioniert nur auf dem selben Gerät.** → Für mobile Abnahme die
  WLAN-IP verwenden und Client sowie Server über diese Adresse prüfen.

## Pflege

Am Laufende nur nach Nutzerfreigabe ändern. Vor jeder Ergänzung in dieser Reihenfolge
prüfen: bestehende Regel erweitern → widersprechende Regel korrigieren → nur sonst
eine neue Regel anlegen. Einzelfallwerte und lange Rechenwege gehören in eine
bedingte Referenz, nicht in diese Kern-Lessons.
