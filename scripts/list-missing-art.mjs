// Autorenwerkzeug: listet alle Karten ohne 2D-Artwork, mit Kontext zum
// Prompten (z. B. für ChatGPT-Bildgenerierung).
//
// Läuft NICHT im Spiel. Liest nur Daten, schreibt nichts.
//
// Aufruf:  node scripts/list-missing-art.mjs   (oder: npm run list-missing-art)
//
// Sobald ein Bild manuell geliefert wird (gemalt oder KI-generiert), einfach
// als packages/client/public/assets/cards/<id>.png ablegen UND die Id in die
// MANUAL_ART-Liste in scripts/render-card-art.mjs eintragen, damit ein
// erneuter Lauf dieses Skripts das Bild nicht mit einem 3D-Render überschreibt.

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CARDS_DIR = join(ROOT, 'packages', 'engine', 'src', 'data', 'cards');
const ART_DIR = join(ROOT, 'packages', 'client', 'public', 'assets', 'cards');
const FACTIONS_FILE = join(ROOT, 'packages', 'engine', 'src', 'data', 'factions.json');

function loadFactionNames() {
  const factions = JSON.parse(readFileSync(FACTIONS_FILE, 'utf8'));
  const names = new Map();
  for (const f of factions) names.set(f.id, f.name);
  return names;
}

function loadAllCards() {
  const cards = [];
  for (const file of readdirSync(CARDS_DIR)) {
    if (!file.endsWith('.json')) continue;
    const data = JSON.parse(readFileSync(join(CARDS_DIR, file), 'utf8'));
    for (const card of data) cards.push(card);
  }
  return cards;
}

function existingArtIds() {
  return new Set(
    readdirSync(ART_DIR)
      .filter((f) => f.endsWith('.png'))
      .map((f) => f.slice(0, -4))
  );
}

function main() {
  const factionNames = loadFactionNames();
  const cards = loadAllCards();
  const haveArt = existingArtIds();
  const missing = cards.filter((c) => !haveArt.has(c.id));

  const byFaction = new Map();
  for (const card of missing) {
    const factionName = factionNames.get(card.faction) ?? card.faction;
    if (!byFaction.has(factionName)) byFaction.set(factionName, []);
    byFaction.get(factionName).push(card);
  }

  console.log(`${missing.length} von ${cards.length} Karten ohne Artwork:\n`);

  for (const [factionName, factionCards] of [...byFaction.entries()].sort()) {
    console.log(`## ${factionName}`);
    for (const card of factionCards.sort((a, b) => a.name.localeCompare(b.name, 'de'))) {
      console.log(
        `- ${card.id}.png | ${card.name} (${card.type}) ${card.projectile ?? ''} — ${card.text ?? ''}`
      );
    }
    console.log('');
  }
}

main();
