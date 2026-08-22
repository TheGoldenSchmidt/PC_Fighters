// Prueft die semantische Dreierkette einer Karte:
// sichtbarer Name <-> Identitaetskatalog/Figur <-> sichtbare Faehigkeit.
//
// Der Audit bewertet keine kuenstlerische Qualitaet. Er verhindert aber, dass
// migrierte PvZ-Familienbegriffe unbemerkt an einer unpassenden PCF-Identitaet
// haengen bleiben oder eine Variante ein anderes Rig als ihr Brief verwendet.

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');
const DATA = join(ROOT, 'packages', 'engine', 'src', 'data');
const CARDS = join(DATA, 'cards');
const FIGURES = join(DATA, 'figures');
const ART = join(ROOT, 'packages', 'client', 'public', 'assets', 'cards', 'art-manifest.json');

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const cards = readdirSync(CARDS)
  .filter((file) => file.endsWith('.json'))
  .flatMap((file) => readJson(join(CARDS, file)));
const catalog = readJson(join(DATA, 'identity-catalog.json'));
const figures = readdirSync(FIGURES)
  .filter((file) => file.endsWith('.json'))
  .map((file) => readJson(join(FIGURES, file)));
const artManifest = readJson(ART);

const cardsById = new Map(cards.map((card) => [card.id, card]));
const cardsByName = new Map(cards.map((card) => [card.name, card]));
const identitiesById = new Map(catalog.cards.map((entry) => [entry.cardId, entry]));
const figuresById = new Map(figures.map((figure) => [figure.cardId, figure]));
const hardProblems = [];
const semanticProblems = [];

if (cardsById.size !== cards.length) hardProblems.push('Karten-IDs sind nicht eindeutig.');
if (cardsByName.size !== cards.length) hardProblems.push('Sichtbare Kartennamen sind nicht eindeutig.');
if (identitiesById.size !== catalog.cards.length) hardProblems.push('Katalog-IDs sind nicht eindeutig.');
if (figuresById.size !== figures.length) hardProblems.push('Figuren-Zuordnungen sind nicht eindeutig.');
if (catalog.cards.length !== cards.length) {
  hardProblems.push(`Identitaetskatalog hat ${catalog.cards.length} statt ${cards.length} Karten.`);
}

for (const card of cards) {
  const identity = identitiesById.get(card.id);
  if (!identity) {
    hardProblems.push(`${card.id}: Identitaet fehlt.`);
    continue;
  }
  if (!identity.concept.startsWith(`${card.name}:`)) {
    hardProblems.push(`${card.id}: Katalogkonzept beginnt nicht mit dem sichtbaren Namen "${card.name}".`);
  }
  const visibleRole = card.text ?? 'Kein sichtbarer Regeltext.';
  if (!identity.concept.endsWith(`Spielrolle: ${visibleRole}`)) {
    hardProblems.push(`${card.id}: Katalog-Spielrolle ist nicht mit dem sichtbaren Kartentext synchron.`);
  }
  if (identity.cardType !== card.type || identity.classId !== card.faction) {
    hardProblems.push(`${card.id}: Katalogtyp oder -klasse widerspricht der Karte.`);
  }
  if (card.type === 'creature' && !identity.rigId) hardProblems.push(`${card.id}: Kreatur ohne geplantes Rig.`);
  if (card.type !== 'creature' && identity.rigId) hardProblems.push(`${card.id}: Nicht-Kreatur mit Figuren-Rig.`);
  const amphibious = card.keywords?.includes('amphibious') || /\bAmphibious\b/i.test(card.text ?? '');
  const aquaticCue = /wasser|schwimm|tauch|schnorchel|surf|sumpf|hafen|ufer|kanal|boot/i;
  if (amphibious && !aquaticCue.test(`${card.name} ${identity.variantBrief} ${identity.artBrief}`)) {
    semanticProblems.push(`${card.id}: Amphibious ist weder im Namen noch im Figuren-/Art-Brief sichtbar.`);
  }
}

for (const figure of figures) {
  const card = cardsById.get(figure.cardId);
  const identity = identitiesById.get(figure.cardId);
  if (!card) {
    hardProblems.push(`${figure.cardId}: Figur verweist auf keine Karte.`);
    continue;
  }
  if (card.type !== 'creature') hardProblems.push(`${figure.cardId}: Nicht-Kreatur besitzt eine Figur.`);
  if (figure.baseId && identity?.rigId !== figure.baseId) {
    hardProblems.push(`${figure.cardId}: Variante nutzt ${figure.baseId}, Brief plant ${identity?.rigId}.`);
  }
}

for (const [cardId, entry] of Object.entries(artManifest.cards ?? {})) {
  const card = cardsById.get(cardId);
  if (!card) {
    hardProblems.push(`${cardId}: Artwork verweist auf keine Karte.`);
  } else if (entry.source === 'figure-render' && card.type !== 'creature') {
    hardProblems.push(`${cardId}: Nicht-Kreatur ist als Figuren-Render markiert.`);
  } else if (entry.source === 'template' && card.type === 'creature') {
    hardProblems.push(`${cardId}: Kreatur ist als Trick-Template markiert.`);
  }
}

// Diese Begriffe stammen aus der alten PvZ-Stammeslogik. Wo sie absichtlich
// sichtbar bleiben, muss die neue Identitaet sie eindeutig tragen.
const migratedFamilyTerms = [
  'Barrel', 'Berry', 'Gourmet', 'History', 'Leafy', 'Monster', 'Mustache',
  'Pet', 'Pirate', 'Professional', 'Root', 'Science', 'Sports'
];
const intentionalFamilyTerms = new Map([
  ['loco_coco', new Set(['Nut'])],
  ['compsognathus', new Set(['Dino'])],
  ['velociraptor', new Set(['Dino'])],
  ['spinosaurus', new Set(['Dino'])],
  ['tyrannosaurus_rex', new Set(['Dino'])]
]);

// Typische Fragmente aus rohen oder nur halb uebersetzten Referenztexten.
// Die internen referenz-Faehigkeiten bleiben absichtlich originalgetreu;
// geprueft wird ausschliesslich der sichtbare Kartentext.
const invalidVisibleFragments = [
  ['conjured', 'englische Verbform "conjured"'],
  ['Space Cadet', 'rohe PvZ-Identitaet "Space Cadet"'],
  ['Treat', 'roher PvZ-Token "Treat"'],
  ['Galactic', 'rohe PvZ-Setbezeichnung "Galactic"'],
  ['Legendary', 'nicht lokalisierte Seltenheit "Legendary"'],
  ['Event-Karte', 'nicht lokalisierte Kartenart "Event"'],
  ['Trapper Territory', 'rohe PvZ-Identitaet "Trapper Territory"'],
  ['Luchss', 'falscher Plural "Luchss"'],
  ['Botes', 'falscher Plural "Botes"'],
  ['Stinktiers', 'falscher Plural "Stinktiers"'],
  ['Hornisses', 'falscher Plural "Hornisses"'],
  [' Pit', 'nicht lokalisierter Folge-/Samenbegriff "Pit"']
];
const legacySideTerms = [
  [/\bZombies?\b/i, 'alte Seite "Zombie"'],
  [/\bPflanzen?\b/i, 'alte Seite "Pflanze"'],
  [/\bPlants?\b/i, 'alte Seite "Plant"']
];

for (const card of cards) {
  const text = card.text ?? '';
  for (const [fragment, description] of invalidVisibleFragments) {
    if (text.includes(fragment)) {
      semanticProblems.push(`${card.id}: ${description} im sichtbaren Text "${text}".`);
    }
  }
  for (const [pattern, description] of legacySideTerms) {
    if (pattern.test(text)) {
      semanticProblems.push(`${card.id}: ${description} im sichtbaren Text "${text}".`);
    }
  }
  for (const term of migratedFamilyTerms) {
    if (new RegExp(`\\b${term}(?:s|es)?\\b`, 'i').test(text)) {
      semanticProblems.push(`${card.id}: sichtbarer Altbegriff ${term} in "${text}".`);
    }
  }
  for (const term of ['Nut', 'Dino']) {
    if (!new RegExp(`\\b${term}(?:s|s-Roar|-Roar)?\\b`, 'i').test(text)) continue;
    if (!intentionalFamilyTerms.get(card.id)?.has(term)) {
      semanticProblems.push(`${card.id}: ${term} ist fuer diese sichtbare Identitaet nicht freigegeben.`);
    }
  }
}

const creatureCount = cards.filter((card) => card.type === 'creature').length;
const fullFigures = figures.filter((figure) => figure.visual).length;
const variants = figures.filter((figure) => figure.baseId).length;
const summary = {
  cards: cards.length,
  creatures: creatureCount,
  nonCreatures: cards.length - creatureCount,
  figures: figures.length,
  fullFigures,
  variants,
  missingFigures: creatureCount - figures.length,
  hardProblems,
  semanticProblems
};

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(summary, null, 2));
} else {
  console.log(
    `${summary.cards} Karten: ${summary.creatures} Kreaturen, ${summary.nonCreatures} Nicht-Kreaturen; ` +
    `${summary.figures} Figuren (${summary.fullFigures} voll, ${summary.variants} Varianten), ` +
    `${summary.missingFigures} Figuren fehlen.`
  );
  console.log(`Harte Datenfehler: ${hardProblems.length}`);
  for (const problem of hardProblems) console.log(`  FEHLER ${problem}`);
  console.log(`Semantische Konflikte: ${semanticProblems.length}`);
  for (const problem of semanticProblems) console.log(`  PRUEFEN ${problem}`);
}

if (process.argv.includes('--check') && (hardProblems.length > 0 || semanticProblems.length > 0)) {
  process.exitCode = 1;
}
