// Synchronisiert sichtbaren Namen und Spielrolle im Identitaetskatalog mit den
// aktuellen Kartendaten. Form, Rig und der inhaltliche Brief bleiben erhalten;
// interne referenz-Texte werden nicht angefasst.

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');
const DATA = join(ROOT, 'packages', 'engine', 'src', 'data');
const CARDS = join(DATA, 'cards');
const CATALOG = join(DATA, 'identity-catalog.json');
const write = process.argv.includes('--write');

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const cards = readdirSync(CARDS)
  .filter((file) => file.endsWith('.json'))
  .flatMap((file) => readJson(join(CARDS, file)));
const cardsById = new Map(cards.map((card) => [card.id, card]));
const catalog = readJson(CATALOG);
let changed = 0;

for (const entry of catalog.cards) {
  const card = cardsById.get(entry.cardId);
  if (!card) throw new Error(`${entry.cardId}: Katalogeintrag ohne Karte.`);
  const role = card.text ?? 'Kein sichtbarer Regeltext.';
  const divider = entry.concept.indexOf(':');
  if (divider < 0) throw new Error(`${entry.cardId}: Konzept ohne Namenstrenner.`);
  const catalogName = entry.concept.slice(0, divider);
  const renamedConcept = `${card.name}${entry.concept.slice(divider)}`;
  const renamedVariantBrief = entry.variantBrief.replaceAll(catalogName, card.name);
  const renamedArtBrief = entry.artBrief.replaceAll(catalogName, card.name);
  const nextConcept = renamedConcept.replace(/Spielrolle: .*$/u, `Spielrolle: ${role}`);
  const nextArtBrief = renamedArtBrief.replace(
    /Motiv stellt die Spielrolle „.*?“/u,
    `Motiv stellt die Spielrolle „${role}“`
  );
  if (
    nextConcept !== entry.concept ||
    renamedVariantBrief !== entry.variantBrief ||
    nextArtBrief !== entry.artBrief
  ) changed += 1;
  entry.concept = nextConcept;
  entry.variantBrief = renamedVariantBrief;
  entry.artBrief = nextArtBrief;
  const amphibious = card.keywords?.includes('amphibious') || /\bAmphibious\b/i.test(role);
  const aquaticCue = /wasser|schwimm|tauch|schnorchel|surf|sumpf|hafen|ufer|kanal|boot/i;
  if (amphibious && !aquaticCue.test(`${card.name} ${entry.variantBrief} ${entry.artBrief}`)) {
    entry.variantBrief += ' Amphibious durch Schwimmweste, nasse Kanten oder ein kompaktes Schwimmgeraet sichtbar machen.';
    changed += 1;
  }
}

if (write) writeFileSync(CATALOG, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
console.log(`${changed} Identitaetsrollen ${write ? 'synchronisiert' : 'wuerden synchronisiert'}.`);
