import type { CardDef, DeckEntry, DeckList, DeckbuildingConfig, Faction } from '@pcf/engine';

const STORAGE_KEY = 'pcf.decks.v1';

export interface SavedDeck extends DeckList {
  id: string;
  name: string;
  faction: string;
  updatedAt: string;
}

interface LibraryFile { version: 1; decks: SavedDeck[] }

export function loadDeckLibrary(): SavedDeck[] {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '') as LibraryFile;
    return value.version === 1 && Array.isArray(value.decks) ? value.decks : [];
  } catch {
    return [];
  }
}

export function saveDeckLibrary(decks: SavedDeck[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, decks } satisfies LibraryFile));
}

export function newDeckId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `deck-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function deckProblems(
  deck: DeckList,
  faction: string,
  cards: CardDef[],
  factions: Faction[],
  rules: DeckbuildingConfig
): string[] {
  const byId = Object.fromEntries(cards.map((c) => [c.id, c]));
  const parent = Object.fromEntries(factions.map((f) => [f.id, f.parent]));
  const total = deck.cards.reduce((sum, e) => sum + e.count, 0);
  const problems: string[] = [];
  if (total !== rules.size) problems.push(`${total}/${rules.size} Karten`);
  const seen = new Set<string>();
  for (const entry of deck.cards) {
    const card = byId[entry.cardId];
    if (!card) { problems.push(`Unbekannte Karte: ${entry.cardId}`); continue; }
    const top = parent[card.faction] ?? card.faction;
    if (top !== faction) problems.push(`${card.name} gehört nicht zu dieser Oberfraktion`);
    if (seen.has(card.id)) problems.push(`${card.name} ist doppelt aufgeführt`);
    seen.add(card.id);
    const max = card.signature ? (rules.maxCopiesSignature ?? 1) : rules.maxCopies;
    if (entry.count > max) problems.push(`${card.name}: maximal ${max} Kopien`);
  }
  if (!deck.name?.trim()) problems.push('Deckname fehlt');
  return problems;
}

export function setCardCount(cards: DeckEntry[], cardId: string, count: number): DeckEntry[] {
  const rest = cards.filter((e) => e.cardId !== cardId);
  return count > 0 ? [...rest, { cardId, count }] : rest;
}
