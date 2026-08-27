# Technische Figuren-Rezepte

Diese Referenz erst **nach `LESSONS.md`** und nur für die im Design-Brief tatsächlich
vorkommenden Bauformen lesen.

## Spitzen und Membranen

- **Flache Spitze:** Eine `box` läuft nicht spitz zu. Einen `cone` verwenden, für
  eine waagerechte Spitze über `rot.z = -π/2` nach +X drehen und auf der Querachse
  stark abflachen.
- **Membran über mehrere Gelenke:** Einzelpaneele reißen beim Bewegen sichtbar
  auseinander. Eine durchgehende Fläche an die äußerste gemeinsame Elterngruppe
  hängen; die Knochenkette darunter nur leicht knicken und den Rückschwung aus der
  Wurzelgruppe animieren.

## Werkzeuge und Schlüsselrequisiten

1. Werkzeug/Requisit als Kind einer einzigen Werkzeugkette bauen, nie als parallel
   animierte Geschwisterteile.
2. Muss ein Behälter an einem schrägen Stiel waagerecht bleiben, eine feste
   Gegenrotation `C = Rᵀ` zwischen Stiel und Kippgruppe einsetzen. `R · C` gegen die
   Einheitsmatrix prüfen; Restfehler über etwa `1e-3` korrigieren statt schätzen.
3. Zuerst den Griffpunkt am Werkzeug festlegen, dann Armrichtung und Kettenlänge
   darauf ausrichten. In einer Nahaufnahme Handfläche und mindestens zwei sichtbare
   Finger auf kontrastierendem Griff nachweisen.
4. Große waagerechte Schwünge aus `rot.y` von Werkzeuggruppe plus Rumpf/Becken
   erzeugen. Große `rot.x`/`rot.z`-Werte heben lange Werkzeuge meist ungewollt vor
   Gesicht oder Körper.

## Ströme, Tropfen und kurz sichtbare Effektteile

- `scale` ist uniform und `opacity` multipliziert die Grunddeckkraft; aus Basiswert
  0 lässt sich nichts einblenden. Effektteil direkt in seiner schlanken Zielform
  bauen, im Ruhezustand in undurchsichtiger Geometrie parken und per `pos`
  herausfahren.
- Beim Rückweg zuerst auf etwa 0,2 schrumpfen, dann den Positionssprung in ein sehr
  kurzes Zeitfenster legen und anschließend auf 1 zurücksetzen. Sonst reist der
  Effekt sichtbar rückwärts.
- Dreht ein Elternbehälter über 90°, drehen sich seine Kinder mit. Für solche Phasen
  keine ausfahrenden Kind-Positionsspuren verwenden; Effekt stattdessen vorher
  schrumpfen oder in Geometrie verbergen.

## Buschige Schwänze und Anhänge

- Eine verjüngende, verschachtelte Kegelkette (`base → mid → tip`) bauen und nur an
  der Spitze wenige überlappende Volumenkörper für Flaum ergänzen. Ein einzelner
  Kegel mit Kugel liest sich als Fahnenstange und biegt nicht glaubwürdig.
