# Projektstatus

Zentrale Übersicht über den Arbeitsstand. **Diese Datei ist die einzige Quelle
für „woran wird gerade gearbeitet".** Die Detailpläne beschreiben das *Wie*,
nicht den Fortschritt.

Stand: **2026-07-30** · Basis: `master` @ `4c2e524`

---

## Now – läuft gerade

**Cheerleader-Superkräfte vertikal fertigstellen** (siehe
[Arena_Cheerleader_Erweiterung.md](Arena_Cheerleader_Erweiterung.md)).

Fertig ist die Infrastruktur: datengetriebener Kandidatenpool
(`config.cheerleaders`, Auswahlgröße 3, Deckgrenze 2), Validierung, drei stabile
Bankplätze je Spieler, Persistenz mit Migration, `CheerleaderSacrificeEvent` als
Replay-Vertrag, 3D-Teamzonen samt 2D-Fallback und eigene `cheer`/`sacrifice`-Clips.

**Engine fertig** (Branch `cheerleader-reaktionen`): die pausierbare
Auflösungssteuerung steht als Schrittmaschine (`GameState.aufloesung`, reine
Daten), alle fünf Kräfte sind datengetrieben in `config.cheerleaders.kraefte`,
Reaktionsfenster sperren jede andere Aktion, `legaleAktionen` und der Bot
kennen die neue Aktion. 189 Tests grün, 420 Backtest-Partien terminieren.

**Client fertig.** Die Auswahl ist ein DOM-Overlay (kein 3D-Element), damit
Bedienung mit und ohne WebGL identisch ist; der Gegner sieht einen
Wartehinweis, normale Aktionen sind gesperrt. Der Replay-Zweig für
`cheerleaderPower` hält die Reihenfolge Opfer → Kraft-Banner → Wirkung ein.
Im Zwei-Browser-Test verifiziert (3D **und** `?no3d`): Fenster öffnet, Wahl
A/B wirkt unterschiedlich, Bankplatz leert sich, Angebote verschwinden mit
verbrauchten Plätzen.

**Persistenz fertig.** `rooms_persist.json` hat jetzt das Format
`{ version: 2, rooms: [...] }`, wird atomar über eine temporäre Datei
geschrieben und lädt das alte unversionierte Array weiterhin (dabei werden die
Felder der Auflösungssteuerung nachgezogen). Ein Servertest fährt eine echte
Partie bis zu einem offenen Fenster, startet den Server neu, verbindet beide
Spieler per Token wieder und antwortet dann – das Fenster überlebt vollständig.

**Backtest-Kennzahlen fertig.** Der Report hat eine Sektion
*Cheerleader-Reaktionen* mit Angeboten, Opfern, Einlösequote, Verzicht,
verursachtem/verhindertem Schaden und Rettungen je Cheerleader.

**Client-Tests fertig.** Der Client hat jetzt eine eigene Vitest-Suite
(`jsdom`, `@testing-library/react`) – sechs Tests für Besitzer- gegen
Gegneransicht, gesperrte Normalaktionen, Verzicht, Opfer, die A/B-Wahl und die
Replay-Reihenfolge. Die Fixtures kommen aus der **echten Engine**
(`createGame` + `applyAction`), damit die Suite nicht grün bleibt, während sich
der `ClientView`-Vertrag darunter verschiebt.

**Alle fünf Kräfte vermessen.** Der Backtest rotiert die Bank-Auswahl je
Partie (`spielePartie` nimmt jetzt `cheerleaders` entgegen). Vorher hätten
`junger_neffe` und `randy_marsh` in keiner simulierten Partie vorkommen können,
weil die Standardauswahl immer die ersten drei Kandidaten nimmt. Die
Regressionstests nutzen weiterhin die Standardauswahl, der Golden Master bleibt
davon also unberührt.

**Damit ist der Cheerleader-Meilenstein vollständig.**

---

**Arena-Umbau fertig.** Der Spielbildschirm ist jetzt eine bildschirmfüllende
Arena statt eines Stapels aus Leisten: Kopf- und Fußleiste sind weg, das
Lane-Raster sitzt in einem mittleren Band, Cheerleader-Bank und Basis stehen
mittig davor bzw. dahinter, alle Anzeigen schweben als Chips darüber, und das
Kampf-Log ist ein antippbarer Ticker. Handkarten sind kompakt und bildlastig;
**ausgespielt wird per Ziehen in die Lane** (`useKartenZug.ts`, Pointer-Events),
kurzes Antippen zeigt den Karteneffekt. Der `Ausspielen`-Knopf im Detail führt
weiterhin in die Tap-auf-Lane-Auswahl – nötig für Karten ohne Lane-Ziel und für
die Flug-Phase. Neu ist, dass **das CSS-Layout die 3D-Positionen bestimmt**:
`elementAnchor` projiziert `[data-slot]` und `[data-zone]` auf den Boden.
Verifiziert im Zwei-Browser-Test (3D und `?no3d`, Handy- und Desktop-Viewport)
bis in den Kampf hinein; sechs neue Client-Tests in `test/arena.test.tsx`.

> **Offene Designfrage:** Drei der fünf Kandidaten lösen auf *jede* gegnerische
> Kreatur aus. Mit der Standardbank öffnet damit fast jedes Ausspielen ein
> Fenster beim Gegner. Regelkonform, aber sehr gesprächig – vor dem Client-Bau
> zu entscheiden, ob Auslöser seltener greifen sollen.

> **Geklärt:** Die Basis-Schild-Superkraft feuert bereits heute sofort beim
> Aktivieren des Schilds (`schild.ts::basisSchaden` ruft `fuehreSuperkraftAus`
> direkt nach dem Block-Log auf, nicht verzögert). Kein Code-Änderungsbedarf –
> nur hier festgehalten, damit es nicht erneut als offen missverstanden wird.

## Next – direkt danach

1. **Neu vermessen.** Vollständiger sitzplatzgespiegelter Backtest *nach* den
   Cheerleader-Kräften. Erst diese Messung ist die Balancing-Grundlage.
2. **Balancing in getrennten Änderungen.** Zuerst Spieldauer und Zermürbung,
   dann die Deck-Ausreißer `a2_luftangriff` / `a4_urzeitliches_rudel`, zuletzt
   die neuen Cheerleader-Effekte.

## Later – bewusst zurückgestellt

- **Modul-Zerlegung**: Auflösungslogik aus `game.ts`, Raum/Persistenz aus
  `server.ts`, Replay/UI aus `GameScreen.tsx`, Welt/Teamzonen/Effekte aus
  `Battlefield3D.tsx`, CSS nach Bildschirm/Funktion.
- **Bundle-Größe**: Three.js, Spielfeld und Figuren-Viewer dynamisch laden.
  Aktuell lädt der Startbildschirm das komplette Bündel (siehe unten).
  Die Warnschwelle *nicht* hochsetzen, sondern die geladenen Chunks messen.
- **Figuren-Viewer nicht mehr versionieren**: den 1,17-MB-Standalone lokal bzw.
  in CI aus Template und Daten erzeugen.
- **Figuren-Wissen kanonisieren**: gemeinsame Playbook-, Bauteil-, Qualitäts-
  und Lessons-Dokumente; Claude-/Codex-Dateien nur noch dünne Adapter, eine
  einzige `snap.mjs`-Quelle. Vorarbeit liegt auf
  `archiv/figuren-wissen-kanonisierung` (siehe *Archiv*).
- **Visuals in Wellen**: fehlende Kartenrenders für vorhandene Figuren →
  fehlende Kreaturenfiguren nach Deck-Relevanz → die sechs Aktionskarten.

> Asset-Vollständigkeit blockiert den Cheerleader-Meilenstein **nicht**.
> Golem- und Emoji-Fallback bleiben bis zur jeweiligen Welle gültig.

---

## Qualitätsstand

| Prüfung | Stand 2026-07-30 |
|---|---|
| `npm test` | 🟢 198 Tests (176 Engine + 16 Server + 6 Client) |
| `npm run typecheck` | 🟢 alle drei Workspaces fehlerfrei |
| `npm run build` | 🟢 – aber **ein** JS-Chunk mit 796 kB (222 kB gzip) |
| CI | 🟢 [`.github/workflows/ci.yml`](../.github/workflows/ci.yml): `npm ci` → Tests → Typecheck → Build → Backtest-Smoke |

Der Backtest-Smoke in CI läuft bewusst **ohne** `--streng`: die Zielkorridore
sind aktuell nicht eingehalten (siehe nächster Abschnitt). CI prüft nur, dass
die Simulation deterministisch durchläuft (`--schnell --saat=1`, ~20 s,
420 Partien) und legt den Report als Artefakt ab.

---

## Balancing – Ausgangsmessung

Das hier ist eine **dokumentierte Ausgangsmessung, kein fertiges Balancing.**

Letzter Volllauf: **2026-07-30**, 4200 Partien über 21 Matchups,
sitzplatzgespiegelt, Saat 1, Bot-Profil `ausgewogen`.
Reproduzierbar mit:

```
npm run backtest -- --saat=1 --out=backtest-results/mein-lauf
```

| Kennzahl | Korridor (Regelwerk V2 §7) | 2026-07-26 | 2026-07-30 |
|---|---|---|---|
| Ø Spieldauer | 7–10 Runden | 12.56 🔴 | **13.71** 🔴 |
| Partien, die Zermürbung erreichen | ≤ 10 % | 59.0 % 🔴 | **77.7 %** 🔴 |
| Startspieler-Vorteil | ≤ 54 % | 48.2 % 🟢 | **48.7 %** 🟢 |
| Technische Notbremse (`roundLimit`) | 0 % | 0.0 % 🟢 | **0.0 %** 🟢 |
| Winrate animals | 47–53 % | 48.1 % 🟢 | **45.5 %** 🟡 |
| Winrate humans | 47–53 % | 51.9 % 🟢 | **54.5 %** 🟡 |

### Deck-Winraten (Korridor 45–55 %)

| Deck | 2026-07-26 | 2026-07-30 |
|---|---|---|
| `a1_rudeljaeger` | 46.5 % 🟢 | **32.7 %** 🔴 |
| `a2_luftangriff` | 42.5 % 🟡 | **42.8 %** 🟡 |
| `a3_gift_urgewalt` | 49.3 % 🟢 | **50.0 %** 🟢 |
| `a4_urzeitliches_rudel` | 57.8 % 🟡 | **65.1 %** 🔴 |
| `h1_solidaritaet` | 52.9 % 🟢 | **53.3 %** 🟢 |
| `h2_schicht` | 50.2 % 🟢 | **53.3 %** 🟢 |
| `h3_campus` | 50.6 % 🟢 | **53.1 %** 🟢 |

**Der einzige Regeleingriff zwischen beiden Messungen ist das Basis-Schild
(PR #8).** Die Zahlen legen nahe, dass die sieben Schildabschnitte Partien
verlängern (Zermürbung 59 % → 78 %) und die Deck-Spreizung verschärfen:
`a1_rudeljaeger` fällt um 14 Punkte, `a4_urzeitliches_rudel` steigt um 7. Das
ist eine Hypothese aus zwei Messpunkten, kein Beweis – bestätigen ließe sie
sich mit einem Vergleichslauf ohne Schild.

Der Plan sieht das Balancing erst **nach** den Cheerleader-Kräften vor. Diese
Messung ist deshalb bewusst nur festgehalten, nicht behoben.

Mit Cheerleader-Kräften (Engine-Stand, Smoke-Lauf `--schnell`): Ø 14,45 Runden,
83,3 % erreichen Zermürbung – der Trend setzt sich fort. Kein Volllauf, weil
das Balancing ohnehin erst nach der Client-Anbindung ansteht.

### Erste Cheerleader-Zahlen (Kurzlauf, 420 Partien, rotierende Bank)

| Cheerleader | angeboten | Einlösequote |
|---|---|---|
| Junger Neffe | 545 | **92,5 %** |
| Alter Wissenschaftler | 584 | 86,3 % |
| PC Principal | 626 | 80,5 % |
| PC Babies | 1620 | 30,7 % |
| Randy Marsh | 1817 | **22,1 %** |

Die Spreizung ist der interessante Teil: Junger Neffe wird fast immer
eingelöst (die Entscheidung ist also kaum eine), Randy Marsh fast nie – seine
Kraft trifft die eigene Kreatur mit und lohnt den Bankplatz selten. Gemessen
mit dem heuristischen Bot, also nur eine grobe Einschätzung.

**Geplante 5-Lane-Erweiterung.** Der Konsolidierungsplan sieht perspektivisch
mehr Lanes vor (`config.lanes`, aktuell 3 – die Engine ist bereits generisch
darauf ausgelegt, siehe `CLAUDE.md`). Mehr Lanes bedeuten mehr gleichzeitige
Angriffe pro Runde und damit **kürzere**, nicht längere Partien – das dürfte
der Zermürbungs-Häufung entgegenwirken, ist aber unbestätigt.

**Wichtiger Vorbehalt zum Bot-Balancing insgesamt:** Der Backtest-Bot bewertet
kartenblind und heuristisch (`bot.ts`) – er taugt für grobe Regressionsprüfung
und Terminierungsnachweise, aber nicht als Ersatz für menschliches Playtesting.
Zug- und Cheerleader-Entscheidungen, die von echtem taktischem Verständnis
abhängen (wann opfern, wann bluffen, Lane-Priorisierung bei 5 Lanes), kann nur
ein spielender Mensch beurteilen. Bot-Zahlen in diesem Dokument sind daher
**grobe Einschätzung, kein Abnahmekriterium**.

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

- **Cheerleader-Kraftdefinitionen** sind noch nicht in `config.json`. Die
  vorläufigen Effekte werden aus vorhandenen Kartenfähigkeiten kopiert, sollen
  aber austauschbar bleiben.
- **Zwei offene Pull Requests** warten auf eine Entscheidung:
  - [#9 Vollständige Skript-Partie, Flugphase und Lückentests](https://github.com/TheGoldenSchmidt/PC_Fighters/pull/9) (2026-07-30)
  - [#5 Werkstatt-Lektionen aus dem Stahlgießer-Lauf](https://github.com/TheGoldenSchmidt/PC_Fighters/pull/5) (2026-07-29) – laut Plan inhaltlich überholt, Kandidat zum Schließen.
- **Basis-Schild** (PR #8, gemergt am 2026-07-30) ist in keinem Detailplan
  berücksichtigt und verschlechtert laut Messung oben mehrere Kennzahlen.
  Offen: Schild nachjustieren oder die Zielkorridore anpassen?

---

## Archiv

Reine Aufbewahrungs-Branches, **nicht für einen Merge nach `master` gedacht**:

| Branch | Inhalt |
|---|---|
| `archiv/figuren-wissen-kanonisierung` | TASK-002 aus dem Stash vom 2026-07-29: `docs/figure-generation/`, dünne Werkzeug-Adapter, eine `snap.mjs`, dazu die unversionierte Puma-Figur. |
| `archiv/wildkatze-und-task-001` | TASK-001-Governance-Zweig samt geprüfter `wildkatze`-Figur. Später **nur die Figur** übernehmen, nicht den Zweig. |

Alle nachweislich gemergten lokalen und Remote-Branches wurden am 2026-07-30
gelöscht; der Stash ist geleert.
