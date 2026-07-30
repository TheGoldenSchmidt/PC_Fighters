<!--
Kopfregeln:
- Ein Experiment beschreibt einen abgeschlossenen Versuch, nicht laufende Arbeit.
  Laufende Arbeit gehört in eine Task unter `.ai/tasks/`.
- Dateiname: `JJJJ-MM-TT-kurzer-titel.md`. Das Datum ist der Abschluss des Versuchs.
- Nur belegen, was tatsächlich beobachtet wurde. Nicht Beobachtetes gehört unter
  „Offene Hypothesen", nicht unter „Evidenz".
- Ein Bericht wird nicht chronologisch fortgeschrieben. Ergibt ein späterer Lauf
  neue Erkenntnisse, entsteht ein neuer Bericht.
- Berichte werden nicht gelöscht; sie sind der Beleg hinter Playbook und
  Quality Criteria.
-->

# Experiment: <Titel>

- Datum:
- Betroffene Figuren / Bereich:
- Durchgeführt von:
- Ausgangs-Commit:

## Hypothese

Was wurde vermutet, bevor der Versuch lief? Wenn es keine Vorab-Hypothese gab
(reiner Erfahrungsbericht), das hier ausdrücklich sagen.

## Aufbau

Wie wurde vorgegangen? Welche Rollen, Werkzeuge, Einstellungen und wie viele Runden?
Genug Detail, dass jemand den Versuch wiederholen könnte.

## Evidenz

Was wurde **tatsächlich beobachtet**? Zahlen, Urteile, konkrete Figuren und Teile.
Jede Aussage hier muss auf eine Beobachtung zurückgehen.

## Ergebnis

Was folgt daraus? Kurz und entscheidbar.

## Grenzen

Was deckt dieser Versuch **nicht** ab? Was war Zufall, Stichprobe von eins, oder
umgebungsabhängig? Welche Aussage wäre eine Übergeneralisierung?

## Offene Hypothesen

Ideen, die der Versuch nahegelegt, aber **nicht belegt** hat. Sie bleiben hier stehen,
bis ein späterer Versuch sie belegt oder widerlegt. Sie gehören **nicht** ins Playbook
und **nicht** in die Quality Criteria.

## Beförderungen

Was wurde aus diesem Bericht als belegt herausgezogen und wohin?

- → `PLAYBOOK.md`: <wiederverwendbarer Ablauf>
- → `QUALITY_CRITERIA.md`: <Qualitätsmaßstab>
- → `PARTS.md`: <besseres Rig-Muster>
- → `docs/rfcs/`: <kontroverse größere Änderung>
- → `docs/adr/`: <langlebige Architekturentscheidung>

Nichts befördert? Das ist ein gültiges Ergebnis – dann hier „keine" eintragen.
