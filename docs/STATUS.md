# Projektstatus

Zentrale Übersicht über den Arbeitsstand. **Diese Datei ist die einzige Quelle
für „woran wird gerade gearbeitet".** Die Detailpläne beschreiben das *Wie*,
nicht den Fortschritt.

Stand: **2026-08-09** · Basis: `claude/basis-schild-spielmechaniken-rvqbkc` @ `6d53456`

---

## Now – läuft gerade

**Spielgefühl aus dem Playtest nachziehen.** Vier Beobachtungen aus dem
tatsächlichen Spielen, alle umgesetzt und auf dem Branch
`claude/basis-schild-spielmechaniken-rvqbkc`:

- **Schild lädt jetzt in Achteln.** `schild.abschnitte` steht auf 8 statt 7, ein
  Treffer lädt also um 1/8 bis 3/8. Die Mechanik selbst ist unverändert: jeder
  Basistreffer lädt, der Treffer, der den Balken voll macht, wird komplett
  geblockt, der Stand geht auf 0 und ein Cheerleader bezahlt den Block.
- **Bank ohne Lehne und rund 30 % größer.** Die Lehne stand zwischen Kamera und
  Bankfiguren. Ohne sie trägt die Sitzfläche die Bank allein, deshalb ist sie
  dicker, tiefer und heller, mit zwei Kufen darunter. Die Größe kommt wie gehabt
  aus dem DOM-Anker (`.bank-anker`), der Skalierungsdeckel musste von 1.6 auf
  2.1 mit.
- **ATK und Leben zeigen ihre Änderung.** Neuer Hook `useWertAenderung` neben
  `useWertPuls`: grüner Blitz plus aufsteigendes `+N` nach oben, roter Blitz
  plus `−N` nach unten.
- **Kampf ist ruhiger und lesbarer.** Ein Regler `KAMPF_TEMPO = 0.8` in `fx.ts`
  leitet alle Kampfdauern ab. Innerhalb einer Lane schlagen die beiden Seiten
  **nacheinander** statt gleichzeitig – vorher flogen beide Projektile parallel
  und man sah nicht, wer wen traf.

> **Wichtig:** Das „Nacheinander" ist ausschließlich Darstellung. Die Kampfregel
> bleibt simultan – `kampfLane` berechnet beide Angriffswerte, bevor Schaden
> fällt, eine sterbende Kreatur schlägt also weiterhin zurück. Ein echter
> Wechsel auf „Angreifer zuerst, Verteidiger nur wenn er überlebt" wäre eine
> Regeländerung und ist **nicht** passiert.

Offen: Sichtprüfung im Zwei-Browser-Test (3D **und** `?no3d`) steht noch aus –
bisher nur Tests, Typecheck und Build.

---

## Next – direkt danach

1. **Zwei-Browser-Sichtprüfung** der obigen Änderungen, Handy- und
   Desktop-Viewport.
2. **Schild-Zahl bewerten.** Die Umstellung auf 8 Abschnitte macht Blocks
   *seltener* (Messung unten). Falls die Bank dadurch zu selten ins Spiel kommt,
   ist `abschnitte` die Stellschraube in beide Richtungen.
3. **Schild- und Bank-Kennzahlen ins aktuelle Balancing holen** – siehe die
   Messlücke unten.

## Later – bewusst zurückgestellt

- **Modul-Zerlegung, Rest**: Auflösungslogik aus `game.ts`, Raum/Persistenz aus
  `server.ts`, Welt/Teamzonen/Effekte aus `Battlefield3D.tsx`. Client-UI und CSS
  sind erledigt.
- **Figuren-Viewer nicht mehr versionieren**: den 1,17-MB-Standalone lokal bzw.
  in CI aus Template und Daten erzeugen.
- **Figuren-Wissen kanonisieren**: gemeinsame Playbook-, Bauteil-, Qualitäts-
  und Lessons-Dokumente; Claude-/Codex-Dateien nur noch dünne Adapter, eine
  einzige `snap.mjs`-Quelle. Vorarbeit liegt auf
  `archiv/figuren-wissen-kanonisierung` (siehe *Archiv*).
- **Visuals in Wellen**: fehlende Kartenrenders für vorhandene Figuren →
  fehlende Kreaturenfiguren nach Deck-Relevanz → die sechs Aktionskarten.

> Asset-Vollständigkeit blockiert nichts. Golem- und Emoji-Fallback bleiben bis
> zur jeweiligen Welle gültig.

---

## Qualitätsstand

| Prüfung | Stand 2026-08-09 |
|---|---|
| `npm test` | 🟢 234 Tests (202 Engine inkl. 1 übersprungen + 20 Server + 12 Client) |
| `npm run typecheck` | 🟢 alle drei Workspaces fehlerfrei |
| `npm run build` | 🟢 – Startbildschirm 217 kB (72,5 kB gzip); Three.js und die Figuren liegen in eigenen Chunks und werden erst fürs 3D nachgeladen |
| CI | 🟢 [`.github/workflows/ci.yml`](../.github/workflows/ci.yml): `npm ci` → Tests → Typecheck → Build → Backtest-Smoke |

Der Backtest-Smoke in CI läuft bewusst **ohne** `--streng`.

---

## Balancing

### Abgenommener Alpha-Stand (2026-08-02) – gilt weiterhin

Der verbindliche Stand steht in [BALANCING.md](BALANCING.md) und stammt aus
`scripts/balancing/` (6.000 Partien, 500 je Startseite und Paarung, **nur die
vier aktiven Alpha-Decks** aus `deck-status.json`). Alle Zielkorridore werden
eingehalten:

| Kennzahl | Ergebnis | Ziel |
|---|---:|---:|
| Ø Rundenzahl | 9,35 | 7–10 |
| Startspieler | 50,11 % | ≤ 54 % |
| Rundenlimit erreicht | 0,00 % | < 10 % |
| Forschung und Muskelkraft | 48,4 % | 45–55 % |
| Rudeljäger | 49,1 % | 45–55 % |
| Solidarität und Überleben | 49,9 % | 45–55 % |
| Urzeitliche Kolosse | 52,6 % | 45–55 % |

Damit ist die frühere offene Frage „Schild nachjustieren **oder** die
Zielkorridore anpassen?" erledigt – die Korridore werden gehalten.

### Messlücke: die Bank kommt darin nicht vor

Es gibt **zwei** Messsysteme, und nur das ältere sieht den Schild:

| | `scripts/balancing/` (neu, abgenommen) | `scripts/backtest/` (älter) |
|---|---|---|
| Deckfeld | die 4 aktiven Alpha-Decks | alle 11 Deckdateien |
| Schild-Blocks, Cheerleader-Opfer | **nicht erfasst** | erfasst |

Der abgenommene Alpha-Stand sagt also **nichts** über Schild und Bank aus. Wer
die Bank bewerten will, braucht `npm run backtest`.

### Schild und Bank nach der Umstellung auf 8 Abschnitte

A/B gemessen mit `npm run backtest -- --schnell --saat=1` – je 1.100 Partien
über alle 55 Matchups, **gleiche Saat, einziger Unterschied ist `abschnitte`**:

| | 7 Abschnitte | 8 Abschnitte (aktuell) |
|---|---:|---:|
| Blocks gesamt | 1.268 | **892** |
| Blocks pro Spieler und Partie | 0,58 | **0,41** |
| Ø Spieldauer (Runden) | 8,67 | **8,12** |

Acht Abschnitte kosten also rund **30 % der Blocks** und verkürzen die Partie
um eine halbe Runde – weniger Blocks heißt mehr durchkommender Schaden. Beide
Werte bleiben im Korridor 7–10.

Von drei Bankplätzen kommt damit im Schnitt deutlich weniger als einer zum
Einsatz – der Rest der Bank ist Deko. Soll die Bank eine echte Entscheidung
werden, muss `abschnitte` *runter*, nicht rauf. Das ist bewusst so entschieden
und hier nur festgehalten, nicht behoben.

Der früher notierte Wert von 0,64 taugt **nicht** als Vergleichspunkt: er
stammt aus 200 Partien vor der Feldumstellung (3 Bahnen, andere Kartenwerte).
Die Tabelle oben ersetzt ihn.

| Cheerleader | angeboten | geopfert | Wahlquote |
|---|---:|---:|---:|
| PC Principal | 518 | 430 | 83,0 % |
| Alter Wissenschaftler | 679 | 367 | 54,1 % |
| Junger Neffe | 411 | 37 | 9,0 % |
| Randy Marsh | 387 | 24 | 6,2 % |
| PC Babies | 676 | 34 | 5,0 % |

„Sicherer Raum" (PC Babies) bleibt das Schlusslicht: Der Block fällt meist im
Kampf, und der Rundenstart hebt die Immunität sofort wieder auf.

> **Nicht mit dem Alpha-Stand verwechseln.** Dieser Lauf misst das *gesamte*
> Deckfeld inklusive der Alt-Decks, mit nur 10 Partien je Matchup. Die
> Deck-Winraten daraus (`a3_gift_urgewalt` 24,2 %, `solidaritaet_ueberleben`
> 67,5 %) sind **kein** Widerspruch zum abgenommenen Alpha – sie messen etwas
> anderes. Die Alt-Decks sind in `deck-status.json` nicht freigeschaltet.

**Vorbehalt zum Bot-Balancing insgesamt:** Der Backtest-Bot bewertet kartenblind
und heuristisch (`bot.ts`). Er taugt für grobe Regressionsprüfung und
Terminierungsnachweise, aber nicht als Ersatz für menschliches Playtesting.
Wann man opfert, wann man blufft, Lane-Priorisierung bei 5 Bahnen – das kann nur
ein spielender Mensch beurteilen. Bot-Zahlen sind **grobe Einschätzung, kein
Abnahmekriterium**.

---

## Erledigte Meilensteine

- **Cheerleader-Superkräfte** vollständig: datengetriebener Kandidatenpool,
  pausierbare Auflösungssteuerung (`GameState.aufloesung`, reine Daten), alle
  fünf Kräfte in `config.cheerleaders.kraefte`, Reaktionsfenster als
  DOM-Overlay (identisch mit und ohne WebGL), Persistenz mit Migration
  (`rooms_persist.json` Version 2, atomar geschrieben), Backtest-Kennzahlen und
  eigene Client-Testsuite mit Fixtures aus der echten Engine.
- **Die Bank IST der Schild.** Cheerleader lösen ausschließlich beim
  Schild-Block aus, Verzichten gibt es nicht, und ohne Cheerleader existiert
  kein Schild. Die drei zufälligen Schild-Superkräfte sind ersatzlos entfallen.
- **Bot sieht Schild und Immunität** – beides fließt als Basis-Reserve in
  `bewerteZustand` ein, in Basis-Leben umgerechnet.
- **Feld und Tempo:** 5 Bahnen (pro Raum 3–6 wählbar, über `mitLanes()` am Raum
  persistiert), Zermürbung ab Runde 15.
- **Arena-Umbau:** bildschirmfüllende Arena ohne Kopf-/Fußleiste, Karten per
  Ziehen in die Lane, **das CSS-Layout bestimmt die 3D-Positionen**
  (`elementAnchor` projiziert `[data-slot]` und `[data-zone]` auf den Boden).
- **Client aufgeräumt, Startladezeit gedrittelt:** `GameScreen.tsx` von 1.500 auf
  700 Zeilen, `styles.css` als Sammler aus neun `@import`s, Three.js nicht mehr
  im ersten Chunk.
- **Balancing-System und vier Alpha-Decks** integriert, Zielkorridore erreicht
  (siehe oben).
- **UI im Sinne von Gamification:** `button`-Grundform, kuratierte Übergänge
  statt `* { transition: all }`, Druck-Feedback, Wert-Blitze auf Energie-, Deck-
  und Rundenchip, Basis-Lebensbalken mit Farbstufen, Gold-Fokusring,
  `prefers-reduced-motion` durchgehend respektiert.

---

## Assets

| | Stand |
|---|---|
| Karten gesamt | 87 (81 Kreaturen, 6 Aktionen) |
| Kreaturen mit eigener 3D-Figur | 46 / 81 |
| Karten mit 2D-Artwork | 18 / 87 |

**35 Kreaturen ohne Figur**, davon **25 in den Preset-Decks** – diese zuerst:

```
spatz, kraehe, moewe, taubenschwarm, falke, eidechse, gecko, klapperschlange,
koenig_der_kobras, waran, compsognathus, flugblatt_verteiler, basisdemokratie,
gewerkschaftssekretaerin, die_massen, lehrling, fliessbandarbeiter,
werkzeugkiste, schichtwechsel, vorarbeiter, improvisiertes_lager, nachhilfe,
gruppenarbeit, doktorandin, die_fakultaet
```

Ohne Deck-Relevanz (später): `wildkatze`, `der_puma`, `der_schwarm`,
`bannertraeger`, `solidaritaetskasse`, `betriebsrat`, `streuner`,
`suppenkueche`, `ueberlebenskuenstler`, `meute_der_vergessenen`.

Fehlt eine Figur, greift der farb-gehashte Golem; fehlt ein PNG, das
Emoji-Fallback. Beides ist regelkonform, nur optisch schwächer.

---

## Offene Entscheidungen

- **Schild-Abschnitte.** Steht auf 8 (1/8–3/8 pro Treffer). Messung oben: 0,41
  Blocks pro Spieler und Partie. Soll die Bank häufiger ins Spiel kommen, muss
  die Zahl sinken.
- **Zwei offene Pull Requests** warten auf eine Entscheidung:
  - [#9 Vollständige Skript-Partie, Flugphase und Lückentests](https://github.com/TheGoldenSchmidt/PC_Fighters/pull/9) (2026-07-30)
  - [#5 Werkstatt-Lektionen aus dem Stahlgießer-Lauf](https://github.com/TheGoldenSchmidt/PC_Fighters/pull/5) (2026-07-29) – laut Plan inhaltlich überholt, Kandidat zum Schließen.
- **Golden-Master-Abdeckung.** Die Tabelle in `regression.test.ts` zählte bis
  jetzt nur die sieben `a*`/`h*`-Alt-Decks auf, obwohl der Generator längst auch
  die vier Alpha-Decks paart – die liefen also ungeprüft mit. Mit der
  Schild-Umstellung neu erzeugt und damit korrigiert.

---

## Archiv

Reine Aufbewahrungs-Branches, **nicht für einen Merge nach `master` gedacht**:

| Branch | Inhalt |
|---|---|
| `archiv/figuren-wissen-kanonisierung` | TASK-002 aus dem Stash vom 2026-07-29: `docs/figure-generation/`, dünne Werkzeug-Adapter, eine `snap.mjs`, dazu die unversionierte Puma-Figur. |
| `archiv/wildkatze-und-task-001` | TASK-001-Governance-Zweig samt geprüfter `wildkatze`-Figur. Später **nur die Figur** übernehmen, nicht den Zweig. |
