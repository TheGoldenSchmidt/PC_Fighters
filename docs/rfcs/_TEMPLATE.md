<!--
Kopfregeln:
- Ein RFC beschreibt eine kontroverse oder größere Änderung, über die vor der
  Umsetzung entschieden werden soll. Er ist kein Ersatz für eine Task.
- Dateiname: `NNNN-kurzer-titel.md`, fortlaufend nummeriert.
- Ein RFC ohne realistische Alternative ist keiner – dann direkt umsetzen.
- Steht am Ende eine langlebige Architektur- oder Grenzentscheidung, entsteht
  zusätzlich eine ADR unter `docs/adr/`. Der RFC ist die Diskussion, die ADR das
  Ergebnis.
- Status: draft | in_discussion | accepted | rejected | superseded
-->

# RFC-NNNN: <Titel>

- Status:
- Datum:
- Autor:

## Problem

Was funktioniert heute nicht, oder was wird künftig gebraucht? Belegt, nicht vermutet.

## Warum jetzt

Was ändert sich, wenn nichts passiert? Warum reicht der bestehende Weg nicht mehr?

## Optionen

Mindestens zwei realistische. Je Option: wie sie funktioniert, was sie kostet, was
sie riskiert.

### Option A – <Name>

### Option B – <Name>

## Empfehlung

Welche Option, und warum diese gegenüber den anderen.

## Auswirkungen

Welche Bereiche, Dateien, Rollen und Abläufe sind betroffen? Was ändert sich für
Nutzer und Agenten spürbar?

## Migration

Wie kommt das Repository vom heutigen in den neuen Zustand? Was passiert mit
bestehenden Artefakten? Bleibt etwas übergangsweise doppelt?

## Rücknahme

Wie wird die Änderung rückgängig gemacht, wenn sie sich nicht bewährt? Ab wann ist
sie praktisch nicht mehr rücknehmbar?

## Verifikation

Woran wird gemessen, dass die Umsetzung funktioniert hat? Welche Prüfungen laufen?

## Entscheidung

Ergebnis der Diskussion. Bei Ablehnung mit Begründung. Führt der RFC zu einer ADR,
diese hier verlinken.
