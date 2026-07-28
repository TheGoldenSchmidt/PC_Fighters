# Figurenwelle 2: Effizienz und Optimierung

## Ergebnis

Für die zweite Welle wurden zehn individuelle Figuren gebaut und in jeweils bis
zu drei Werkstattrunden geprüft:

`ratte`, `baer`, `uralte_schlange`, `spinosaurus`, `velociraptor`, `ritter`,
`feldscherin`, `kranfuehrer`, `schrottsammlerin` und `eule`.

Die Uralte Schlange besitzt zusätzlich einen individuellen Einzug und Tod.

## Gemessene Kostenstellen

| Kostenstelle | Warum tokenintensiv | Eingesetzte Gegenmaßnahme |
|---|---|---|
| Voller Gesprächskontext pro Agent | Alte Arena- und Figurenhistorie ist für eine einzelne Revision irrelevant | Alle Agenten mit `fork_turns=none` und kompaktem, vollständigem Brief gestartet |
| Wiederholte Bildkritik | Jede Montage erzeugt erneut Bildanalyse und ausführliche Begründungen | Drei feste Linsen, höchstens drei konkrete Änderungen und maximal drei Runden |
| Mehrere Spezialisten | Bei roten A-, B- und C-Linsen wird dieselbe Figur mehrfach gelesen | Strikte Zuständigkeit: Design nur Körper, Gesicht nur Kopf-Unterbaum, Animation nur `animations` |
| Server- und Montage-Neustarts | Figurendaten werden nur beim Serverstart geladen | Änderungen mehrerer Figuren gebündelt, danach ein gemeinsamer Neustart und parallele Montagen |
| Unpassende Angriffsschnappschüsse | Globale Prozentwerte treffen nicht immer den tatsächlichen Kontakt oder die Rückkehr | Als Lesson festgehalten: Snap-Zeitpunkte künftig aus semantischen Keyframes ableiten |
| Falsche `0 Bausteine`-Warnung | Viewer trennt Statistiklabel und Wert in verschiedene Elemente | `snap.mjs` liest den strukturierten Statistikwert; Regex bleibt nur Fallback |
| Offene Überarbeitungsschleifen | Wiederholte Kritik kann dieselbe Beanstandung ohne neue Erkenntnis liefern | Nach Runde drei konsequenter Stopp und transparente Restpunktliste zur Nutzerabnahme |

## Rundenübersicht

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

## Weitere Einsparpotenziale

1. Nur die drei Angriffskacheln neu rendern, wenn ausschließlich Linse C geändert
   wurde; Rundumansichten können wiederverwendet werden.
2. Kritikerantworten als kurzes strukturiertes Format mit Linsenstatus und maximal
   drei Änderungen zurückgeben.
3. Bei gleichzeitig roten A/B/C-Linsen zunächst eine integrierte Designrunde
   durchführen und Spezialisten nur für danach verbleibende Probleme einsetzen.
4. Montagezeitpunkte aus markierten Windup-, Kontakt- und Return-Keyframes statt
   aus globalen Animationsprozenten ableiten.
