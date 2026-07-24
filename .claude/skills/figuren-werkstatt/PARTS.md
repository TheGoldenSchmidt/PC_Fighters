# Teile-Bibliothek (kopierfertige Rig-Bausteine)

Wiederverwendbare `visual.parts`-Fragmente für die Figuren-Werkstatt. Der
**figuren-designer kopiert** das passende Fragment und **tunt nur die Zahlen**
(Positionen, Größen, Farben) – statt jede Gliedmaße/jedes Gesicht neu herzuleiten.
Das spart Kritik-Runden und hält die bewährte Rig-Struktur (Gelenk-Ketten, keine
Segment-Rotation) automatisch ein.

**Regeln beim Kopieren:**
- `id`s eindeutig halten (Suffixe/Präfixe anpassen, z. B. `schulterR` → `schulterR`).
- Farben auf `visual.palette`-Rollen der jeweiligen Figur umbiegen.
- Positionen an den **Referenz-Steckbrief** (Proportionen) anpassen – die hier
  angegebenen Zahlen sind bewährte Startwerte, kein Dogma.
- Die zitierte **Golden-Referenz-Figur** ist die Quelle der Wahrheit; im Zweifel dort
  nachsehen (`packages/engine/src/data/figures/<ref>.json`).

Jedes Fragment nennt seine Golden-Referenz. Fügt ein Lauf ein besseres Muster hinzu,
**hier ergänzen/korrigieren** (nicht duplizieren) – analog zu `LESSONS.md`.

---

## 1. Gelenk-Arm-Kette (Golden-Referenz: `pfandsammler`)

Für jeden **beweglichen Arm** (Wurf, Hieb, Greifen). Gelenke = leere `group`s am
Gelenkpunkt (die drehen), Segmente = versetzte `cyl`-Kinder **ohne eigene `rot`**
(sonst Lücke). Requisit an `handR` parenten. Animiert werden `schulterR`/`ellbogenR`.

```json
{ "id": "schulterR", "shape": "group", "pos": [0.34, 1.42, 0.05] },
{ "id": "oberarmR", "shape": "cyl", "size": [0.09, 0.08, 0.42], "pos": [0, -0.21, 0], "parent": "schulterR", "color": "main" },
{ "id": "ellbogenR", "shape": "group", "pos": [0, -0.42, 0], "parent": "oberarmR" },
{ "id": "unterarmR", "shape": "cyl", "size": [0.08, 0.07, 0.4], "pos": [0, -0.2, 0], "parent": "ellbogenR", "color": "main" },
{ "id": "handR", "shape": "ico", "size": 0.1, "pos": [0, -0.4, 0], "parent": "unterarmR", "color": "skin" }
```

- **Ruhepose-Beugung** auf die Gelenk-`group`s legen (z. B. `schulterR rot [0.5,0,-0.1]`,
  `ellbogenR rot [0.3,0,0]`), **nie** auf `oberarmR`/`unterarmR`.
- Segment-`pos` = `[0, -h/2, 0]` (halbe Zylinderhöhe nach unten), damit das obere Ende
  genau am Elterngelenk sitzt.
- Linker Arm: `id`→`...L`, `pos.x` spiegeln, `rot.z` vorzeichen-spiegeln.

## 2. Gelenk-Bein-Kette (zweibeinig; Golden-Referenz: `pfandsammler`)

Gleiches Prinzip vertikal. Für Menschen/aufrechte Figuren.

```json
{ "id": "huefteR", "shape": "group", "pos": [0.16, 0.92, 0] },
{ "id": "oberschenkelR", "shape": "cyl", "size": [0.12, 0.1, 0.46], "pos": [0, -0.23, 0], "parent": "huefteR", "color": "pants" },
{ "id": "knieR", "shape": "group", "pos": [0, -0.46, 0], "parent": "oberschenkelR" },
{ "id": "unterschenkelR", "shape": "cyl", "size": [0.1, 0.08, 0.44], "pos": [0, -0.22, 0], "parent": "knieR", "color": "pants" },
{ "id": "fussR", "shape": "box", "size": [0.13, 0.08, 0.24], "pos": [0, -0.4, 0.06], "parent": "unterschenkelR", "color": "shoe" }
```

## 3. Vierbeiner-Grundgerüst (Quadruped; Golden-Referenz: `wolf`)

Rumpf + 4 Beine + Hals. Beine hier bewusst **einfache `cyl`** (kein Gelenk), weil
Vierbeiner-Idle/Angriff meist über `root`-Lunge + Kopf/Schwanz läuft, nicht über
Kniebeugung. Braucht eine Figur echtes Bein-Beugen, die Beine durch Fragment 1/2 ersetzen.
`visual.height` für mittelgroße Tiere ~0.6 (siehe LESSONS).

```json
{ "id": "legFL", "shape": "cyl", "size": [0.085, 0.07, 0.64], "pos": [-0.4, 0.38, 0.62], "color": "dark" },
{ "id": "legFR", "shape": "cyl", "size": [0.085, 0.07, 0.64], "pos": [0.4, 0.38, 0.62], "color": "dark" },
{ "id": "legBL", "shape": "cyl", "size": [0.085, 0.07, 0.64], "pos": [-0.4, 0.38, -0.62], "color": "dark" },
{ "id": "legBR", "shape": "cyl", "size": [0.085, 0.07, 0.64], "pos": [0.4, 0.38, -0.62], "color": "dark" },
{ "id": "pawFL", "shape": "ico", "size": 0.12, "pos": [-0.4, 0.07, 0.68], "scale": [1, 0.5, 1.25], "color": "dark" },
{ "id": "pawFR", "shape": "ico", "size": 0.12, "pos": [0.4, 0.07, 0.68], "scale": [1, 0.5, 1.25], "color": "dark" },
{ "id": "pawBL", "shape": "ico", "size": 0.12, "pos": [-0.4, 0.07, -0.68], "scale": [1, 0.5, 1.25], "color": "dark" },
{ "id": "pawBR", "shape": "ico", "size": 0.12, "pos": [0.4, 0.07, -0.68], "scale": [1, 0.5, 1.25], "color": "dark" },
{ "id": "body", "shape": "ico", "size": 0.62, "pos": [0, 0.86, 0], "scale": [1.3, 0.78, 1.7], "color": "main" },
{ "id": "belly", "shape": "ico", "size": 0.5, "pos": [0, 0.58, 0.05], "scale": [1.05, 0.55, 1.5], "color": "cream" },
{ "id": "neck", "shape": "cyl", "size": [0.28, 0.34, 0.5], "pos": [0, 1.0, 0.95], "rot": [0.35, 0, 0], "color": "main" }
```

- Kopf sitzt am Hals-Ende (~`pos [0, 1.12, 1.28]`), Schwanz am Rumpf-Ende (`-z`).
- **Schlank halten:** `body`-Höhe klein gegen die Beinlänge, sonst wirkt es klobig.

## 4. Verjüngende Schwanzkette (Golden-Referenz: `wolf`)

Nicht ein Kegel + Kugel (= Fahnenstange), sondern `base → mid → tip` per `parent` +
Fluff-Icos. Für schlanke Katzenschwänze `mid`/`tip` länger & dünner ziehen.

```json
{ "id": "tailBase", "shape": "cone", "size": [0.2, 0.55], "pos": [0, 1.05, -1.15], "rot": [-0.3, 0, 0], "color": "main" },
{ "id": "tailMid", "shape": "cone", "size": [0.16, 0.5], "pos": [0, 0.53, 0], "rot": [-0.3, 0, 0], "parent": "tailBase", "color": "main" },
{ "id": "tailTip", "shape": "cone", "size": [0.11, 0.34], "pos": [0, 0.49, 0], "rot": [-0.25, 0, 0], "parent": "tailMid", "color": "cream" },
{ "id": "tailFluffC", "shape": "ico", "size": 0.12, "pos": [0, 0.24, 0.02], "parent": "tailTip", "color": "cream" }
```

- Idle: `tailBase rot.z` links/rechts wedeln lassen (siehe wolf idle) – die Kinder folgen.

## 5. Gesichts-Kit (Golden-Referenz: `wolf`)

Pflicht bei Kreaturen mit Kopf. **Kein Punktauge**, **Kiefer abgesetzt**, **Ohr mit
Innenteil**. Augen/Zähne in **Kontrastfarbe** an einer Silhouetten-Kante (sonst
unsichtbar auf dem Nachbarn – siehe LESSONS).

```json
{ "id": "eyeWhiteL", "shape": "ico", "size": 0.085, "pos": [-0.19, 1.16, 1.5], "color": "eyeWhite" },
{ "id": "eyeWhiteR", "shape": "ico", "size": 0.085, "pos": [0.19, 1.16, 1.5], "color": "eyeWhite" },
{ "id": "pupilL", "shape": "ico", "size": 0.04, "pos": [-0.19, 1.16, 1.56], "color": "eyeDark" },
{ "id": "pupilR", "shape": "ico", "size": 0.04, "pos": [0.19, 1.16, 1.56], "color": "eyeDark" },
{ "id": "browL", "shape": "box", "size": [0.12, 0.045, 0.08], "pos": [-0.16, 1.28, 1.48], "rot": [0, 0, 0.12], "color": "dark" },
{ "id": "browR", "shape": "box", "size": [0.12, 0.045, 0.08], "pos": [0.16, 1.28, 1.48], "rot": [0, 0, -0.12], "color": "dark" },
{ "id": "jawLower", "shape": "ico", "size": 0.13, "pos": [0, 0.9, 1.62], "scale": [1, 0.55, 1.3], "color": "dark" },
{ "id": "noseTip", "shape": "ico", "size": 0.06, "pos": [0, 1.03, 1.97], "color": "nose" },
{ "id": "fangUL", "shape": "cone", "size": [0.03, 0.13], "pos": [-0.09, 0.8, 1.72], "rot": [3.14159, 0, 0], "color": "tooth" },
{ "id": "fangUR", "shape": "cone", "size": [0.03, 0.13], "pos": [0.09, 0.8, 1.72], "rot": [3.14159, 0, 0], "color": "tooth" },
{ "id": "earL", "shape": "cone", "size": [0.14, 0.36], "pos": [-0.22, 1.5, 1.1], "rot": [-0.1, 0, 0.22], "color": "main" },
{ "id": "earR", "shape": "cone", "size": [0.14, 0.36], "pos": [0.22, 1.5, 1.1], "rot": [-0.1, 0, -0.22], "color": "main" },
{ "id": "earInnerL", "shape": "cone", "size": [0.075, 0.22], "pos": [0, 0.03, 0.05], "parent": "earL", "color": "earInner" },
{ "id": "earInnerR", "shape": "cone", "size": [0.075, 0.22], "pos": [0, 0.03, 0.05], "parent": "earR", "color": "earInner" }
```

- **Katzen-Variante:** Augen größer, Pupille als schmaler vertikaler Schlitz (Pupille
  `scale [0.5,1.3,1]`), Ohren kürzer/runder, Schnauze kurz. Whisker als dünne `cyl` an
  der Schnauze.

---

## Referenz-Steckbrief (Format, das der Orchestrator dem Designer liefert)

Der bildfähige Orchestrator liest die Vorlage (Upload/Web) und füllt **Zahlen** aus:

```
Referenz-Steckbrief <cardId>
- Bauart: schlank | kräftig | rundlich   (Breite ≈ <x>× der Länge)
- Kopf:Rumpf-Verhältnis ≈ <n>
- Beinlänge ≈ <n>× Rumpfhöhe;  Stand: <stehend/geduckt/…>
- Schnauze: <kurz/lang>, Ohren: <Form/Größe>, Augen: <Stellung/Form>
- Schwanz: <Länge>× Rumpf, <buschig/schlank>, <Haltung>
- Palette (aus Textur): main <#>, akzent <#>, augen <#>, …
- Charakter-Merkmale: <Streifen/Muster/besondere Silhouette>
```
