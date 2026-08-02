import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ladeDecks,
  loadGameData,
  wiederholeReplay,
  type PartieReplay
} from '../../packages/engine/src/index.js';

const path = process.argv[2];
if (!path) {
  console.error('Aufruf: npm run balance:replay -- <pfad-zum-replay.json>');
  process.exit(2);
}
const data = loadGameData();
const decks = ladeDecks(data);
const file = JSON.parse(readFileSync(resolve(path), 'utf8')) as {
  deckA: string;
  deckB: string;
  replay: PartieReplay;
};
if (!decks[file.deckA] || !decks[file.deckB]) throw new Error('Replay verweist auf ein unbekanntes Deck.');
const result = wiederholeReplay(data, decks[file.deckA], decks[file.deckB], file.replay);
if (!result.korrekt) {
  console.error(`Replay weicht bei Aktion ${result.fehlerIndex ?? 'Ende'} ab: erwartet ${result.erwartet}, erhalten ${result.erhalten}.`);
  process.exit(1);
}
console.log(`Replay ${file.replay.matchId} korrekt: ${file.replay.aktionen.length} Aktionen, Gewinner ${result.state.winner}.`);
