# Qualitätskriterien für Figuren

Der Maßstab, an dem eine Figur gemessen wird. Der Kritiker urteilt gegen diese Datei,
der Designer erfüllt sie vor der Abgabe.

Jedes Kriterium hier ist **belegt** – aus einem Fehler oder einem Erfolg eines
tatsächlichen Laufs. Wo eine konkrete Figur den Beleg liefert, ist sie genannt.
Unbelegte Ideen gehören nicht hierher, sondern als offene Hypothese in den
Experimentbericht, aus dem sie stammen.

Die Bewertung ist nach drei Linsen getrennt, weil daraus folgt, welcher Betriebsmodus
des Designers übernimmt (siehe `agents/figure-critic.md`).

---

## Harte Verbote

Diese drei Punkte sind keine Geschmacksfrage. Ein Verstoß ist immer `ÜBERARBEITEN`.

- **Kein `emissive`-Track auf `root`.** Der `AnimationPlayer` setzt bei einem
  `emissive`-Track alle Meshes des Ziel-Teilbaums auf weißen Glow. Auf `root` heißt
  das: die komplette Figur wird cremeweiß und verliert ihre Farbidentität, besonders
  fatal in der Angriffskachel. Angriff und Treffer werden über **Pose** gelöst. Ist
  überhaupt ein Glanz gewünscht, dann mit sehr niedrigem Wert (<0.1) auf einem
  einzelnen kleinen Teil.
- **Kein `rot` auf Segmenten einer Gelenk-Kette.** Ein Segment dreht um seinen
  eigenen Mittelpunkt, sein oberes Ende löst sich vom Gelenk, es entsteht eine
  sichtbare Lücke. Ruhepose-Beugung gehört auf die Gelenk-`group`s.
  *Beleg: `pfandsammler`-Arm.*
- **Keine schwebenden oder abgelösten Teile.** Jeder Ketten-Versatz ist `h/2`, nie
  die volle Segmenthöhe – auch abwärts. Volle Höhe erzeugt an jedem Gelenk eine
  h/2-Lücke. *Beleg: `pferd`, über drei Runden.*

---

## Linse A – Körper, Proportion, Größe

**Handler: Designer, Modus 1**

- **Silhouette auf Spielfeldgröße lesbar.** Erkennt man auf einen Blick, was es ist?
- **Größe stimmig.** „Zu groß" ist fast nie ein Höhen-, sondern ein
  Proportionsproblem. Der Auto-Fit skaliert auf `1.8 * (visual.height ?? 1)` anhand
  der **Bounding-Box-Höhe**; eine breite, flache Figur ohne gesetztes
  `visual.height` wird per Höhe hochskaliert und wirkt in der Breite riesig.
  Hebel sind `visual.height` (Mensch ≈ 1, `wolf` 0.62, mittelgroßes Tier ~0.6) und
  schlanke Proportionen – nicht „alle Teile kleiner".
- **Beine sichtbar.** Rumpf hoch genug über den Beinen, sonst wirkt das Tier klobig
  und bärenhaft statt schlank.
- **Konnektivität.** Alle drei Ansichten gezielt nach Gelenk-Lücken, frei
  schwebenden Teilen und Teilen absuchen, die als loser Strich über die Silhouette
  hinausragen. *Beleg: `pferd`, `backRidge` – eine Box länger als die Rumpf-Rundung
  wirkte wie ein abgelöster schwebender Strich.* Der Designer prüft jede Kette vor
  der Abgabe rechnerisch (Segment-Ende gegen Kindgelenk-Weltposition, Erwartung:
  Abstand 0).
- **Ruhepose stabil.** Ein eingefrorener Action-Moment – aufbäumend, springend,
  mitten im Schlag – ist als Ruhepose ein Fehler. Die Ruhepose ist das, was der
  Spieler 95 % der Zeit sieht; sie muss in sich stabil sein (stehend, sitzend,
  kauernd, kniend). Drama gehört in den `attack`-Klip. *Beleg: `pferd` – aufbäumende
  Ruhepose abgelehnt, ruhiger Stand plus Aufbäumen im Angriff freigegeben.*
- **Wiedererkennbarkeit.** Ähnlichkeit entsteht durch ein geteiltes Skelett; Farbe
  und Detail-Akzente reichen zur Abgrenzung nicht. Hat die Art eine **ikonische
  Haltung**, diese bauen statt der generischen Standpose – aber nur stabile
  Haltungen. *Beleg: `getigerter` wirkte stehend wie ein umgefärbter `wolf`; die
  sitzende Putzhaltung machte ihn sofort unverkennbar zur Katze.*
- **Kompakte Körper zuerst über die Ruhe-Silhouette bauen.** Lange sichtbare Läufe
  und ein schmaler Rumpf wirken auch mit passendem Gesicht humanoid. Rumpf breit und
  tief bauen, Beinansätze verbergen, fast nur Krallen zeigen. *Beleg: `eule`.*
- **Begleitfiguren nicht gleichrangig.** Zwei ähnlich große Körper weiten den
  Auto-Fit auf, werden klein gerendert und verlieren ihre Rollenlesbarkeit. Den
  Begleiter deutlich kleiner an der Flanke platzieren, mit eigenem Kopf lesbar
  halten und bei Angriffen geschützt ducken lassen.
- **Palette.** Fraktionsstimmung getroffen (Menschen kühl, Tiere warm), genug
  Kontrast, nicht matschig. Bei sehr dunklen Figuren die Palettenwerte sichtbar
  staffeln und Kontrastkanten gezielt an Schulter, Flanke und äußeren Läufen setzen –
  sonst verschmelzen Rumpf und Beine in Seiten- und Rückansicht trotz korrekter
  Geometrie zu einer Fläche. Glow ist kein Ersatz für Albedo-Kontrast.
- **Detailgrad.** Detail entsteht über mehr und besser platzierte Teile (40–80), nicht
  über feinere Unterteilung. Der Stil ist bewusst low-poly mit `flatShading`. Für
  gezielte Rundungen `detail:"high"` **pro Teil** setzen, statt `visual.detailLevel`
  global anzuheben (Performance: viele Figuren mal Schatten auf dem Handy).

---

## Linse B – Gesicht und Kopf

**Handler: Designer, Modus 2**

- **Augen mehrteilig.** Helle Sklera plus dunkle Pupille davor, optional Braue
  darüber. Reine Punktaugen wirken tot.
- **Kiefer abgesetzt.** Eigener Unterkiefer; bei Raubtieren Fangzähne an der
  Kieferkante, sodass sie über die Silhouette hinausragen. Das macht Raubtiere lesbar
  und ermöglicht eine Biss-Animation.
- **Ohren mit andersfarbigem Innenteil** für Tiefe.
- **Kontrast heißt Helligkeitssprung, nicht nur „andere Farbe".** Kleine
  Detail-Akzente verschwinden auf ihrem Nachbarn: Fangzähne in `cream` direkt vor
  `cream`-Wangen sind unlesbar, und weiße Sklera (`#ffffff`) auf cremeweißem Fell
  (`#e8e4dc`) blieb ebenfalls unlesbar. *Beleg: `eisbaer` – erst eine **dunkle
  Augenhöhle hinter** der Sklera machte das Auge lesbar.* Bei hellen Figuren helle
  Detail-Teile immer mit einem dunklen Gegenstück hinterlegen.
- **Auf Spielfeldgröße lesbar.** Lieber wenige klare Teile als viele winzige, die zu
  einem Fleck verschwimmen.
- **Ausdruck passend zum Thema** (freundlich, grimmig, edel je nach Karte und
  Fraktion).

---

## Linse C – Animation

**Handler: Designer, Modus 3**

- **`idle` (loop) bewegt mindestens zwei benannte Teile** – Atmen oder Wippen plus
  Schwanz, Ohren oder Kleidung. Kein statisches Idle.
- **`attack` thematisch überschrieben**, passend zum Projektil-Emoji der Karte
  (🐾 → Biss oder Sprung, 🪨 → Wurf, ⚔️ → Hieb). Bewegung erzählt die Aktion, nicht
  ein Aufblitzen.
- **Der Angriff bewegt andere Bausteine oder Achsen als das Idle.** Bewegt er
  dieselbe Gliedmaße zur selben Stelle, liest er sich als Fortsetzung des Idle statt
  als Aktion. *Beleg: der `getigerter`-Angriff wirkte wie „Weiterputzen", weil er
  dieselbe Pfote zur Schnauze führte.* Den Angriff über eigene Pose-Signale codieren:
  ein Glied, das das Idle nie anfasst; Maul auf; Ohren anlegen; Schlag klar nach vorn.
- **Richtung stimmt.** Die Figur blickt nach **+z**. Ein **positives** `rot.x` auf
  einem hängenden Arm schwenkt nach **hinten (−z)**; für einen Wurf oder Schlag nach
  vorn muss der Release **negativ** `rot.x` sein. Armschwung und Projektil-Bogen
  gehen in dieselbe Richtung.
- **Kein Farb-Wash.** Verliert die Figur in einer Angriffsphase ihre Farbe, deutet
  das auf einen verbotenen `emissive`-Track.
- **Anatomische Verbindung hält auch in der Extrempose.** Wird eine ganze
  Gliedmaßen-Gruppe von der Schulter wegverschoben, reißt die Verbindung im Render
  ab und die Pfote wirkt wie ein schwebendes Einzelteil. Den Schulteransatz am Rumpf
  verankert lassen und Reichweite über Ober- und Unterarmrotation mit sichtbar
  durchgehendem Schulter-Ellbogen-Pfoten-Bogen erzeugen.
- **Kontaktpose aus der Kameraachse drehen.** Frontal in die Kamera geführte Waffen,
  Schnäbel oder Kiefer verdecken sich im entscheidenden Frame selbst. Angriff und
  Zielteil seitlich versetzen oder leicht eindrehen, bis die Silhouette in der
  Kontaktphase klar lesbar bleibt.
- **Das Werkzeug trägt die Kontaktpose.** Hochgerissene Arme oder starke
  Root-Neigung lesen sich als Jubeln oder Verbeugen. Den nicht angreifenden Arm ruhig
  halten, das Werkzeug seitlich freistellen und dessen Kopf oder Klinge sichtbar
  durch den Kontaktbogen führen.
- **Signature-Merkmal nimmt der Animation nichts vorweg.** Ein Merkmal, das schon im
  Standbild sichtbar sein soll (etwa ein brüllendes Maul), darf im Ruhezustand nur
  angedeutet sein – sonst gibt es im Angriff nichts mehr zu steigern.
  *Beleg: `eisbaer` – `jawLower` im Ruhewinkel 0.12, volle Öffnung bis ~0.77 erst im
  Kontakt des Angriffsklips.*
- **Klips kurz und knackig** (`attack` ~0.5 s) mit klarer Aushol-, Kontakt- und
  Rückkehrphase, damit sie über den Drei-Phasen-Montagestreifen lesbar sind.
- **Tracks sind Offsets auf den Ruhewert.** Ändert jemand den Ruhewert eines
  animierten Teils, verschiebt sich der komplette Track mit, ohne dass `animations`
  angefasst wurde. *Beleg: `eisbaer` – der Gesichtsmodus öffnete `jawLower` im
  Ruhezustand von 0.15 auf 0.38; danach stand das Maul im Standbild fast so offen wie
  im Angriff und Linse C kippte von `GUT` auf `ÜBERARBEITEN`.*

---

## Vollständigkeit der Abnahme

- **Einzug und Tod gehören zur Abnahme.** Eine Angriffsmontage prüft keine
  vollständige Animation: individuelle `entrance`- und `death`-Klips können
  strukturell vorhanden, aber visuell fehlerhaft sein. Die Standardabnahme zeigt
  deshalb zusätzlich **mindestens zwei Einzugs- und zwei Todesphasen**.

  > **Werkzeuglücke:** Die heutige Sechs-Kachel-Montage aus `scripts/snap.mjs`
  > deckt das nicht ab – sie rendert `vorne`, `seite`, `hinten` und drei feste
  > `attack`-Zeitpunkte. Dieses Kriterium ist derzeit **nur über den interaktiven
  > Viewer** erfüllbar. Siehe `PLAYBOOK.md`, Abschnitt „Bekannte Werkzeuglücken".

- **Montage-`GUT` ist keine Viewer-Abnahme.** Der Kritiker urteilt aus sechs
  Standbildern; der Nutzer inspiziert interaktiv in 3D. Gelenk-Lücken, schwebende
  Teile und verzerrte Posen, die in den festen Kamerawinkeln kaschiert sind, fallen
  dort sofort auf. *Beleg: `pferd` – Montage dreimal „freigabereif", Viewer-Urteil
  „sehr unzufrieden".* Bei Figuren mit Gelenkketten wird die finale Abnahme immer
  über den Viewer eingeholt.
