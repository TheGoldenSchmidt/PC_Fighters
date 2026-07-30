# Experiment: Figurenwelle 2 – Effizienz und Optimierung

- Datum: 2026-07-28
- Betroffene Figuren / Bereich: zehn Figuren der zweiten Welle; Werkstatt-Schleife
  und Token-Kosten
- Durchgeführt von: Codex / Figuren-Werkstatt
- Ausgangs-Commit: `bb8e60e`

> Migriert aus `docs/figuren-welle-2-effizienz.md`. Der Bericht bestand bereits als
> belegter Versuch; hier ist er nach der Experimentvorlage strukturiert. Inhalte
> wurden übernommen, nicht ergänzt.

## Hypothese

Keine formale Vorab-Hypothese. Der Lauf war ein Erfahrungsbericht mit dem Ziel, die
Kostenstellen der Werkstatt-Schleife zu identifizieren und gegenzusteuern.

## Aufbau

Zehn individuelle Figuren wurden gebaut und in jeweils bis zu drei Werkstattrunden
geprüft: `ratte`, `baer`, `uralte_schlange`, `spinosaurus`, `velociraptor`, `ritter`,
`feldscherin`, `kranfuehrer`, `schrottsammlerin` und `eule`. Die Uralte Schlange
erhielt zusätzlich einen individuellen Einzug und Tod.

Eingesetzte Gegenmaßnahmen während des Laufs:

| Kostenstelle | Warum tokenintensiv | Gegenmaßnahme |
|---|---|---|
| Voller Gesprächskontext pro Agent | Alte Arena- und Figurenhistorie ist für eine einzelne Revision irrelevant | Alle Agenten mit `fork_turns=none` und kompaktem, vollständigem Brief gestartet |
| Wiederholte Bildkritik | Jede Montage erzeugt erneut Bildanalyse und ausführliche Begründungen | Drei feste Linsen, höchstens drei konkrete Änderungen und maximal drei Runden |
| Mehrere Spezialisten | Bei roten A-, B- und C-Linsen wird dieselbe Figur mehrfach gelesen | Strikte Zuständigkeit: Design nur Körper, Gesicht nur Kopf-Unterbaum, Animation nur `animations` |
| Server- und Montage-Neustarts | Figurendaten werden nur beim Serverstart geladen | Änderungen mehrerer Figuren gebündelt, danach ein gemeinsamer Neustart und parallele Montagen |
| Unpassende Angriffsschnappschüsse | Globale Prozentwerte treffen nicht immer den tatsächlichen Kontakt oder die Rückkehr | Als Erkenntnis festgehalten, nicht umgesetzt |
| Falsche `0 Bausteine`-Warnung | Viewer trennt Statistiklabel und Wert in verschiedene Elemente | `snap.mjs` liest den strukturierten Statistikwert; Regex bleibt nur Fallback |
| Offene Überarbeitungsschleifen | Wiederholte Kritik kann dieselbe Beanstandung ohne neue Erkenntnis liefern | Nach Runde drei konsequenter Stopp und transparente Restpunktliste zur Nutzerabnahme |

## Evidenz

Alle zehn Figuren brauchten die vollen drei Runden. Stand der Kritikerlinsen bei
Abschluss:

| Figur | Runden | Abschluss der Kritikerlinsen |
|---|---:|---|
| Ratte | 3 | A/B gut, C mit Restpunkt |
| Bär | 3 | A/B gut, C mit Restpunkt |
| Uralte Schlange | 3 | A/B/C gut |
| Spinosaurus | 3 | A/B/C gut |
| Velociraptor | 3 | A/B/C gut |
| Ritter | 3 | A/B gut, C mit Restpunkt |
| Feldscherin | 3 | A/B gut, C mit Restpunkt |
| Kranführer | 3 | Restpunkte in A/B/C |
| Schrottsammlerin | 3 | A/B gut, C mit Restpunkt |
| Eule | 3 | B/C gut, A mit Restpunkt |

Linse C blieb am häufigsten offen: bei sechs von zehn Figuren stand am Ende noch ein
Animations-Restpunkt. Die `0 Bausteine`-Fehlwarnung war reproduzierbar auf getrennte
Label- und Wertelemente im Viewer zurückzuführen und wurde im Snapshot-Skript behoben.

## Ergebnis

Der Kostendeckel aus drei Linsen, höchstens drei Änderungen je Runde und maximal drei
Runden hielt die Schleife endlich, ohne dass die Figuren unfertig blieben – acht von
zehn erreichten in A und B ein glattes `GUT`. Der Preis ist eine systematisch höhere
Restpunktquote in Linse C.

## Grenzen

- Stichprobe ist ein einzelner Wellenlauf ohne Kontrollgruppe. Es gibt keinen
  Vergleich zu einem Lauf ohne die Gegenmaßnahmen, also keine Aussage darüber,
  **wie viel** sie tatsächlich gespart haben.
- Alle Figuren liefen die vollen drei Runden. Ob das Rundenlimit der bindende Faktor
  war oder ob die Qualität ohnehin erst dort konvergierte, ist nicht unterscheidbar.
- Der Zusammenhang „Linse C bleibt öfter offen" ist beobachtet, aber nicht auf eine
  Ursache zurückgeführt.
- `fork_turns=none` ist eine produktspezifische Einstellung und nicht auf jede
  Umgebung übertragbar.

## Offene Hypothesen

Nahegelegt, aber in diesem Lauf **nicht belegt** und bis heute **nicht implementiert**.
Sie gehören deshalb nicht ins Playbook.

1. **Kachel-Wiederverwendung.** Nur die drei Angriffskacheln neu rendern, wenn
   ausschließlich Linse C geändert wurde; die Rundumansichten können wiederverwendet
   werden.
2. **Knapperes Kritikerformat.** Kritikerantworten als kurzes strukturiertes Format
   mit Linsenstatus und maximal drei Änderungen zurückgeben.
3. **Integrierte Revision zuerst.** Bei gleichzeitig roten A/B/C-Linsen zunächst eine
   integrierte Designrunde durchführen und Spezialisten nur für danach verbleibende
   Probleme einsetzen.
4. **Semantische Keyframes.** Montagezeitpunkte aus markierten `windup`-, `contact`-
   und `return`-Keyframes ableiten statt aus globalen Animationsprozenten. Auch
   „Animation starten → warten → Screenshot" ist wegen Render- und Screenshot-Latenz
   nicht deterministisch.

Der aktuelle Stand von `scripts/snap.mjs` setzt keine davon um: es rendert `vorne`,
`seite`, `hinten` und drei feste `attack`-Zeitpunkte (110/240/400 ms) und kennt weder
Kachel-Cache noch semantische Marken.

## Beförderungen

- → `PLAYBOOK.md`: Rundenlimit von drei Runden mit transparenter Restpunktliste;
  gebündelte Änderungen mit einem gemeinsamen Server-Neustart; strikte Zuständigkeit
  der drei Betriebsmodi.
- → `QUALITY_CRITERIA.md`: keine – die Qualitätsmaßstäbe dieses Laufs stammen aus den
  Einzelfiguren, nicht aus der Effizienzbetrachtung.
- → `PARTS.md`: keine.
- → `docs/rfcs/`: keine. Die vier offenen Hypothesen betreffen das Snapshot-Werkzeug;
  sollte eine davon umgesetzt werden, ist das eine Werkzeugänderung, keine
  kontroverse Grundsatzentscheidung.
- → `docs/adr/`: keine.
