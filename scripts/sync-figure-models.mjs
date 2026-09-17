// Übernimmt freigegebene Viewer-Versionen unter den stabilen Karten-IDs ins Spiel.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = name => JSON.parse(readFileSync(resolve(root, name), 'utf8'));
const mapping = read('tools/figuren-viewer/card-models.json');
const dataDir = 'packages/engine/src/data';
const cards = readdirSync(resolve(root, dataDir, 'cards'))
  .filter(name => name.endsWith('.json'))
  .flatMap(name => read(`${dataDir}/cards/${name}`));
const catalog = read(`${dataDir}/alpha-catalog.json`);
const check = process.argv.includes('--check');
const changes = [];
for (const [cardId, modelId] of Object.entries(mapping)) {
  if (!cards.some(card => card.id === cardId && card.type === 'creature')) {
    throw new Error(`Keine Kreaturenkarte für die Figur-Zuordnung: ${cardId}`);
  }
  const source = read(`tools/figuren-viewer/standalone-figures/${modelId}.json`);
  if (source.cardId !== modelId || !source.visual) throw new Error(`Ungültige Vollfigur: ${modelId}`);
  const { displayName, ...figure } = source;
  figure.cardId = cardId;
  changes.push([`${dataDir}/figures/${cardId}.json`, figure]);
  const entry = catalog.cards.find(card => card.cardId === cardId);
  if (entry) entry.sourceModel = modelId;
}
changes.push([`${dataDir}/alpha-catalog.json`, catalog]);
let stale = false;
for (const [path, value] of changes) {
  let current;
  try { current = read(path); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (JSON.stringify(current) === JSON.stringify(value)) continue;
  if (check) { console.error(`Figur-Zuordnung nicht synchron: ${path}`); stale = true; }
  else writeFileSync(resolve(root, path), JSON.stringify(value, null, 2) + '\n');
}
if (stale) process.exitCode = 1;
else console.log(`${Object.keys(mapping).length} Figur-Zuordnungen ${check ? 'geprüft' : 'synchronisiert'}.`);
