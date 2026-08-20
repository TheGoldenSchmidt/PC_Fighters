import type {
  CardDef,
  ChampionDef,
  DeckEntry,
  DeckList,
  DeckbuildingConfig,
  Faction
} from '@pcf/engine';

// V2 trennt bewusst von den alten Ein-Fraktions-Decks. Eine automatische
// Übernahme wäre mehrdeutig, weil jedes neue Deck exakt einem Champ gehört.
const STORAGE_KEY = 'pcf.decks.v2';

export interface SavedDeck extends DeckList {
  id: string;
  name: string;
  faction: string;
  championId: string;
  updatedAt: string;
}

interface LibraryFile { version: 2; decks: SavedDeck[] }

export function loadDeckLibrary(): SavedDeck[] {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '') as LibraryFile;
    return value.version === 2 && Array.isArray(value.decks) ? value.decks : [];
  } catch {
    return [];
  }
}

export function saveDeckLibrary(decks: SavedDeck[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, decks } satisfies LibraryFile));
}

export function newDeckId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `deck-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function deckProblems(
  deck: DeckList,
  champion: ChampionDef,
  cards: CardDef[],
  factions: Faction[],
  rules: DeckbuildingConfig
): string[] {
  const byId = Object.fromEntries(cards.map((card) => [card.id, card]));
  const parent = Object.fromEntries(factions.map((faction) => [faction.id, faction.parent]));
  const total = deck.cards.reduce((sum, entry) => sum + entry.count, 0);
  const problems: string[] = [];
  const seen = new Set<string>();
  const usedClasses = new Set<string>();
  if (total !== rules.size) problems.push(`${total}/${rules.size} Karten`);
  if (deck.championId !== champion.id) problems.push('Deck und Champ passen nicht zusammen');

  for (const entry of deck.cards) {
    const card = byId[entry.cardId];
    if (!card) {
      problems.push(`Unbekannte Karte: ${entry.cardId}`);
      continue;
    }
    if (card.deckable === false) problems.push(`${card.name} ist eine Superkraft`);
    const top = parent[card.faction] ?? card.faction;
    if (!isNeutralFaction(top, factions)) {
      if (!champion.classes.includes(card.faction)) problems.push(`${card.name} gehört nicht zu diesem Champ`);
      else usedClasses.add(card.faction);
    }
    if (seen.has(card.id)) problems.push(`${card.name} ist doppelt aufgeführt`);
    seen.add(card.id);
    if (entry.count > rules.maxCopies) problems.push(`${card.name}: maximal ${rules.maxCopies} Kopien`);
  }
  for (const classId of champion.classes) {
    if (!usedClasses.has(classId)) problems.push(`Mindestens eine Karte aus ${classId} erforderlich`);
  }
  if (!deck.name?.trim()) problems.push('Deckname fehlt');
  return [...new Set(problems)];
}

export function maxCopiesOfCard(_card: CardDef, rules: DeckbuildingConfig): number {
  return rules.maxCopies;
}

export function isNeutralFaction(top: string, factions: Faction[]): boolean {
  return factions.some((faction) => faction.id === top && faction.neutral);
}

export function setCardCount(cards: DeckEntry[], cardId: string, count: number): DeckEntry[] {
  const rest = cards.filter((entry) => entry.cardId !== cardId);
  return count > 0 ? [...rest, { cardId, count }] : rest;
}
