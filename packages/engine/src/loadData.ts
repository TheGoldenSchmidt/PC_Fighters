// Lädt config.json, factions.json, topics.json und ALLE Kartendateien aus
// /data/cards automatisch (eine neue Fraktion braucht nur eine neue Datei +
// Eintrag in factions.json). Wird nur in Node (Server, Tests) benutzt –
// der Client bekommt alles über das Netzwerk.

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DataError, validateDeck, validateGameData } from './schema.js';
import type { DeckList, GameData } from './types.js';

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

  // 3D-Figuren: data/figures/*.json (Ordner darf fehlen → keine Figuren, Golem-Fallback).
  const figuresDir = join(dataDir, 'figures');
  let figureFiles: { file: string; content: unknown }[] = [];
  try {
    figureFiles = readdirSync(figuresDir)
      .filter((f) => f.endsWith('.json'))
      .map((file) => ({
        file: `figures/${file}`,
        content: readJson(`figures/${file}`, join(figuresDir, file))
      }));
  } catch {
    // kein figures-Ordner vorhanden – das ist in Ordnung
  }

  const validated = validateGameData({ config, factions, topics, cardFiles, animations, figureFiles });
  return {
    ...validated,
    cardsById: Object.fromEntries(validated.cards.map((c) => [c.id, c]))
  };
}

/**
 * Lädt und validiert alle Deck-Dateien aus data/decks/*.json (Backtest,
 * künftiger Deck-Editor). Schlüssel im Ergebnis = Dateiname ohne ".json".
 * Der Ordner darf fehlen – dann ein leeres Ergebnis (keine Pflicht-Daten).
 */
export function ladeDecks(data: GameData, dataDir: string = DATA_DIR): Record<string, DeckList> {
  const decksDir = join(dataDir, 'decks');
  let files: string[] = [];
  try {
    files = readdirSync(decksDir).filter((f) => f.endsWith('.json'));
  } catch {
    return {};
  }
  const decks: Record<string, DeckList> = {};
  for (const file of files) {
    const id = file.replace(/\.json$/, '');
    const raw = readJson(`decks/${file}`, join(decksDir, file));
    decks[id] = validateDeck(raw, data); // wirft DeckError bei ungültigem Deck
  }
  return decks;
}
