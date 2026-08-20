import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..', '..');
const dataDir = join(root, 'packages', 'engine', 'src', 'data');
const figuresDir = join(dataDir, 'figures');
const basesDir = join(dataDir, 'figure-bases');

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function allCards() {
  return readdirSync(join(dataDir, 'cards'))
    .filter((file) => file.endsWith('.json'))
    .flatMap((file) => readJson(join(dataDir, 'cards', file)));
}

function allBases() {
  if (!existsSync(basesDir)) return [];
  return readdirSync(basesDir)
    .filter((file) => file.endsWith('.json'))
    .map((file) => readJson(join(basesDir, file)));
}

const args = process.argv.slice(2);
const write = args.includes('--write');
const dryRun = args.includes('--dry-run') || !write;
const unknownFlags = args.filter((arg) => arg.startsWith('--') && !['--write', '--dry-run'].includes(arg));
const cardIds = args.filter((arg) => !arg.startsWith('--')).flatMap((arg) => arg.split(',')).filter(Boolean);

if (unknownFlags.length > 0) throw new Error(`Unbekannte Option: ${unknownFlags.join(', ')}`);
if (write && args.includes('--dry-run')) throw new Error('--write und --dry-run duerfen nicht kombiniert werden.');
if (cardIds.length < 1 || cardIds.length > 8) {
  throw new Error('Genau eine bis acht cardIds angeben.');
}
if (new Set(cardIds).size !== cardIds.length) throw new Error('cardIds duerfen im Batch nicht doppelt vorkommen.');

const cards = new Map(allCards().map((card) => [card.id, card]));
const catalog = readJson(join(dataDir, 'identity-catalog.json'));
const identities = new Map(catalog.cards.map((entry) => [entry.cardId, entry]));
const bases = allBases();
const prepared = [];
const problems = [];

for (const cardId of cardIds) {
  const card = cards.get(cardId);
  const identity = identities.get(cardId);
  if (!card) {
    problems.push(`${cardId}: unbekannte Karte`);
    continue;
  }
  if (card.type !== 'creature') {
    problems.push(`${cardId}: ${card.name} ist keine Kreatur und braucht keine 3D-Variante`);
    continue;
  }
  if (!identity?.rigId) {
    problems.push(`${cardId}: im Identitaetskatalog fehlt das geplante Rig`);
    continue;
  }
  const matchingBases = bases.filter((base) => base.rigId === identity.rigId);
  if (matchingBases.length !== 1) {
    problems.push(
      `${cardId}: fuer Rig ${identity.rigId} wurden ${matchingBases.length} Grundgerueste gefunden (erwartet: genau 1)`
    );
    continue;
  }
  const output = join(figuresDir, `${cardId}.json`);
  prepared.push({
    cardId,
    name: card.name,
    side: identity.side,
    classId: identity.classId,
    form: identity.form,
    rigId: identity.rigId,
    baseId: matchingBases[0].baseId,
    concept: identity.concept,
    variantBrief: identity.variantBrief,
    output,
    existingFigure: existsSync(output)
  });
}

if (problems.length > 0) {
  throw new Error(`Varianten-Vorbereitung fehlgeschlagen:\n- ${problems.join('\n- ')}`);
}

if (write) {
  const existing = prepared.filter((item) => item.existingFigure);
  if (existing.length > 0) {
    throw new Error(`Vorhandene Figuren werden nicht ueberschrieben: ${existing.map((item) => item.cardId).join(', ')}`);
  }
  for (const item of prepared) {
    writeFileSync(
      item.output,
      `${JSON.stringify({ cardId: item.cardId, baseId: item.baseId }, null, 2)}\n`,
      'utf8'
    );
  }
}

console.log(JSON.stringify({ mode: dryRun ? 'dry-run' : 'write', count: prepared.length, cards: prepared }, null, 2));
