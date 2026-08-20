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

export interface DeckStatus {
  active: string[];
  allowCustomDecks: boolean;
  disabledReason: string;
}

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
  const champions = readJson('champions.json', join(dataDir, 'champions.json'));
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

  const validated = validateGameData({ config, factions, champions, topics, cardFiles, animations, figureFiles });
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

/** Zentrale Freischaltung der Alpha-Decks; deaktivierte Dateien bleiben erhalten. */
export function ladeDeckStatus(data: GameData, dataDir: string = DATA_DIR): DeckStatus {
  const decks = ladeDecks(data, dataDir);
  const raw = readJson('deck-status.json', join(dataDir, 'deck-status.json')) as Partial<DeckStatus>;
  const problems: string[] = [];
  const active = Array.isArray(raw.active)
    ? raw.active.filter((id): id is string => typeof id === 'string' && id.length > 0)
    : [];
  if (active.length !== raw.active?.length) {
    problems.push('"active" muss ausschließlich nicht-leere Deck-IDs enthalten.');
  }
  if (new Set(active).size !== active.length) {
    problems.push('Deck-IDs in "active" dürfen nicht doppelt vorkommen.');
  }
  for (const id of active) {
    if (!decks[id]) problems.push(`Aktives Deck "${id}" existiert nicht in data/decks/.`);
  }
  if (active.length !== data.champions.length) {
    problems.push(`Es muss genau ein aktives Starterdeck je Champ geben (aktuell ${active.length}, erwartet ${data.champions.length}).`);
  }
  if (typeof raw.disabledReason !== 'string' || raw.disabledReason.trim().length === 0) {
    problems.push('"disabledReason" muss ein nicht-leerer Text sein.');
  }
  if (typeof raw.allowCustomDecks !== 'boolean') {
    problems.push('"allowCustomDecks" muss true oder false sein.');
  }
  if (problems.length > 0) throw new DataError('deck-status.json', problems);
  return {
    active,
    allowCustomDecks: raw.allowCustomDecks!,
    disabledReason: raw.disabledReason!
  };
}

export function ladeAktiveDecks(data: GameData, dataDir: string = DATA_DIR): Record<string, DeckList> {
  const decks = ladeDecks(data, dataDir);
  const status = ladeDeckStatus(data, dataDir);
  const active = Object.fromEntries(status.active.map((id) => [id, decks[id]]));
  for (const [id, deck] of Object.entries(active)) validateAlphaTestDeck(id, deck, data);
  return active;
}

/** Vertrag der ausgelieferten Champion-Starterdecks. */
export function validateAlphaTestDeck(id: string, deck: DeckList, data: GameData): void {
  const problems: string[] = [];
  if (!deck.championId) problems.push('Das Starterdeck braucht eine championId.');
  if (deck.championId && !data.champions.some((champion) => champion.id === deck.championId)) {
    problems.push(`Unbekannter Champ "${deck.championId}".`);
  }
  const total = deck.cards.reduce((sum, entry) => sum + entry.count, 0);
  if (total !== data.config.deckbuilding.size) problems.push(`Das Starterdeck enthält ${total} statt ${data.config.deckbuilding.size} Karten.`);
  if (problems.length > 0) throw new DataError(`decks/${id}.json`, problems);
}
