---
name: varianten-werkstatt
description: Erstellt kleine, datengetriebene 3D-Figurenvarianten fuer eine bis acht PC-Fighters-Karten aus vorhandenen Grundgeruesten. Nutze den Skill, wenn neue Kartenfiguren kostenguenstig aus figure-bases abgeleitet, als Batch geprueft oder bestehende Varianten angepasst werden sollen; neue Grundgerueste gehoeren weiterhin in die Figuren-Werkstatt.
---

# Varianten-Werkstatt

Erzeuge pro Karte nur eine kleine Datei unter
`packages/engine/src/data/figures/<cardId>.json`. Lies Grundgeruest und Design-Brief
aus dem Identitaetskatalog. Erzeuge niemals in diesem Skill ein neues Grundgeruest.

Aufruf: `/varianten-werkstatt <cardId> [weitere cardIds, maximal 8] [freier Prompt]`

## Ablauf

1. Wechsle zum Repo-Root und fuehre den Trockenlauf aus:

   `node .agents/skills/varianten-werkstatt/scripts/prepare-variants.mjs --dry-run <cardIds>`

   Stoppe bei mehr als acht Karten, Nicht-Kreaturen, fehlender Identitaet, fehlender
   oder mehrdeutiger Base. Route eine fehlende Base an die `figuren-werkstatt`.

2. Lies bei manuellen Anpassungen zusaetzlich [references/format.md](references/format.md).
   Verwende den vorgeschlagenen `baseId` und den `variantBrief`. Halte jede Datei klein:
   nur `palette`, `height`, `detailLevel`, `addParts`, `patchParts`, `removeParts` und
   noetige `animations`-Overrides. Vollstaendige `visual.parts` sind verboten.

3. Nutze fuer neue, noch figurlose Karten optional
   `prepare-variants.mjs --write <cardIds>`, um sichere Minimaldateien anzulegen.
   Das Skript ueberschreibt nie eine vorhandene Figur. Ergaenze danach nur die
   identitaetspraegenden Unterschiede aus dem Brief.

4. Validiere automatisch:

   - `npm test --workspace @pcf/engine -- --run test/visual.test.ts`
   - `npm run typecheck`
   - `node scripts/render-card-art.mjs --check`

5. Starte Server und Client wie in der `figuren-werkstatt`, starte den Server nach
   Daten-Aenderungen neu und rendere fuer jede Karte die Montage:

   `node .agents/skills/figuren-werkstatt/scripts/snap.mjs <cardId> [clientPort] [serverPort]`

6. Verwende eine Kritiker-Runde nur fuer den ersten Vertreter eines Rigs, bei
   Schema-/Render-/Montageproblemen oder auf ausdruecklichen Nutzerwunsch. Fuehre
   keine vollstaendige Designer-/Kritiker-Schleife fuer jede Variante aus.

7. Zeige dem Nutzer alle finalen Montagen, nenne Base und geaenderte Teile und warte
   auf Freigabe. Committe Varianten-Dateien niemals vor dieser Freigabe.

## Grenzen

- Ein Batch enthaelt eine bis acht Karten.
- Grundgerueste sind einstufig; Varianten duerfen keine Varianten als Base verwenden.
- Lebende und untote Humans teilen `humanoid-standard`; Unterschiede entstehen ueber
  Kopf-, Haut- und Accessoire-Pakete.
- Verwende logische Anschluesse wie `@head`, `@leftHand`, `@rightHand`, `@back`,
  `@weapon` und `@mount`, wenn Accessoires an eine Base gehaengt werden.
- Entferne einen Teilbaum ueber dessen Wurzel. Ueberschreibe betroffene Animationen,
  wenn ein geerbter Track sonst auf ein entferntes Teil zeigen wuerde.
- Veraendere keine Kartenwerte, Regeln, Decks oder den Identitaetskatalog waehrend
  eines Varianten-Laufs.
