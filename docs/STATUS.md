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

Offen ist die eigentliche Wirkung: die fünf Reaktionskräfte und die dafür nötige
**serialisierbare Auflösungssteuerung** in der Engine. Heute löst `applyAction`
Kampf und Effekte vollständig in einem Aufruf auf; eine Reaktion auf tödlichen
Schaden braucht einen pausierbaren, persistierbaren Auflösungszustand, der nach
der Spielerwahl exakt an der unterbrochenen Stelle weiterläuft.

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
| `npm test` | 🟢 177 Tests (163 Engine + 14 Server), 6+1 Dateien |
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
