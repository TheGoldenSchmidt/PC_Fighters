import type {
  CheerleaderConfig,
  CheerleaderSelection,
  DeckList,
  DeckSelection
} from '@pcf/engine';

const STORAGE_PREFIX = 'pcf.cheerleaders.v1.';

function customId(deck: DeckList): string {
  const id = (deck as DeckList & { id?: unknown }).id;
  if (typeof id === 'string' && id.trim()) return id;
  return deck.cards
    .map((entry) => `${entry.cardId}:${entry.count}`)
    .sort()
    .join('|');
}

export function cheerleaderStorageKey(selection: DeckSelection): string {
  const deckId =
    selection.kind === 'preset' ? `preset:${selection.id}` : `custom:${customId(selection.deck)}`;
  return `${STORAGE_PREFIX}${deckId}`;
}

export function deckContains(deck: DeckList, cardId: string): boolean {
  return deck.cards.some((entry) => entry.cardId === cardId && entry.count > 0);
}

export function isValidCheerleaderSelection(
  value: unknown,
  deck: DeckList,
  rule: CheerleaderConfig
): value is CheerleaderSelection {
  return (
    Array.isArray(value) &&
    value.length === rule.selectionSize &&
    value.every((id): id is string => typeof id === 'string') &&
    new Set(value).size === value.length &&
    value.every(
      (id) => rule.candidates.includes(id) && (rule.allowDeckOverlap || !deckContains(deck, id))
    )
  );
}

export function loadCheerleaderSelection(
  selection: DeckSelection,
  deck: DeckList,
  rule: CheerleaderConfig
): CheerleaderSelection | null {
  const key = cheerleaderStorageKey(selection);
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (isValidCheerleaderSelection(value, deck, rule)) return value;
    localStorage.removeItem(key);
  } catch {
    localStorage.removeItem(key);
  }
  return null;
}

export function saveCheerleaderSelection(
  selection: DeckSelection,
  cheerleaders: CheerleaderSelection
): void {
  localStorage.setItem(cheerleaderStorageKey(selection), JSON.stringify(cheerleaders));
}
