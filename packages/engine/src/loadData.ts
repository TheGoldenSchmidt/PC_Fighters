// Lädt config.json, factions.json, topics.json und ALLE Kartendateien aus
// /data/cards automatisch (eine neue Fraktion braucht nur eine neue Datei +
// Eintrag in factions.json). Wird nur in Node (Server, Tests) benutzt –
// der Client bekommt alles über das Netzwerk.

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DataError, validateGameData } from './schema.js';
import type { GameData } from './types.js';

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), 'data');

function readJson(file: string, path: string): unknown {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    throw new DataError(file, ['Datei nicht gefunden oder nicht lesbar.']);
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new DataError(file, [
      `Die Datei ist kein gültiges JSON (${(e as Error).message}). ` +
        'Häufige Ursachen: fehlendes Komma, überzähliges Komma vor ] oder }, fehlende Anführungszeichen.'
    ]);
  }
}

export function loadGameData(dataDir: string = DATA_DIR): GameData {
  const config = readJson('config.json', join(dataDir, 'config.json'));
  const factions = readJson('factions.json', join(dataDir, 'factions.json'));
  const topics = readJson('topics.json', join(dataDir, 'topics.json'));
  const animations = readJson('animations.json', join(dataDir, 'animations.json'));

  const cardsDir = join(dataDir, 'cards');
  const files = readdirSync(cardsDir).filter((f) => f.endsWith('.json'));
  const cardFiles = files.map((file) => ({
    file: `cards/${file}`,
    content: readJson(`cards/${file}`, join(cardsDir, file))
  }));

  const validated = validateGameData({ config, factions, topics, cardFiles, animations });
  return {
    ...validated,
    cardsById: Object.fromEntries(validated.cards.map((c) => [c.id, c]))
  };
}
